import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { createApp, isAuthorized } from "../src/app.js";
import { getConfig } from "../src/config.js";
import { loadData } from "../src/data.js";

const TOKEN = "backend-code-test-token-2026";
let httpServer;
let apolloServer;
let endpoint;

before(async () => {
  const store = await loadData();
  httpServer = http.createServer();
  const appResult = await createApp({ store, token: TOKEN });
  apolloServer = appResult.apolloServer;
  httpServer.on("request", appResult.app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  endpoint = `http://127.0.0.1:${address.port}/graphql`;
});

after(async () => {
  await apolloServer.stop();
  await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
});

async function request(body, authorization = `Bearer ${TOKEN}`) {
  const headers = { "content-type": "application/json" };
  if (authorization !== null) {
    headers.authorization = authorization;
  }
  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("authorization", () => {
  it("accepts case-insensitive Bearer schemes with an exact token", () => {
    assert.equal(isAuthorized(`Bearer ${TOKEN}`, TOKEN), true);
    assert.equal(isAuthorized(`bearer ${TOKEN}`, TOKEN), true);
    assert.equal(isAuthorized(`BEARER ${TOKEN}`, TOKEN), true);
    assert.equal(isAuthorized(`Basic ${TOKEN}`, TOKEN), false);
    assert.equal(isAuthorized("Bearer", TOKEN), false);
    assert.equal(isAuthorized(`Bearer ${TOKEN} extra`, TOKEN), false);
    assert.equal(isAuthorized(undefined, TOKEN), false);
  });

  it("rejects missing and incorrect credentials with HTTP 401", async () => {
    const missing = await request({ query: "{ node { _id } }" }, null);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: "Unauthorized" });

    const incorrect = await request({ query: "{ node { _id } }" }, "Bearer wrong-token");
    assert.equal(incorrect.status, 401);
  });

  it("allows unauthenticated CORS preflight only", async () => {
    const response = await fetch(endpoint, { method: "OPTIONS" });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");
  });
});

describe("request errors", () => {
  it("returns sanitized JSON for malformed and oversized bodies", async () => {
    const malformed = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.match(malformed.headers.get("content-type"), /^application\/json/);
    const malformedText = await malformed.text();
    assert.deepEqual(JSON.parse(malformedText), { error: "Invalid JSON body" });
    assert.doesNotMatch(malformedText, /node_modules|Backend_Coding_Test|SyntaxError/);

    const oversized = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "x".repeat(101 * 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "Request body too large" });
  });
});

describe("GraphQL query", () => {
  it("returns a node and resolves composite parent and resource relationships", async () => {
    const response = await request({
      query: `query($nodeId: ID!) {
        node(nodeId: $nodeId) {
          _id name description parentIds
          parents { _id name }
          trigger { _id name resourceTemplate { _id createdAt updatedAt } }
          triggerId
          responses { _id name platforms { integrationId build localeGroups { localeGroupId variations { name responses } } } }
          responseIds
          actions { _id name resourceTemplate { _id createdAt updatedAt } }
          actionIds
        }
      }`,
      variables: { nodeId: "6297172e70a0c165b989cd10" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.errors, undefined);
    const node = body.data.node;
    assert.equal(node._id, "6297172e70a0c165b989cd10");
    assert.equal(node.description, "");
    assert.deepEqual(node.parentIds, ["rCMUtmL3aOULyqBL"]);
    assert.equal(node.parents[0]._id, "6297164810f52524ba1a9300");
    assert.equal(node.actions[0]._id, "6530933e6a1690d2f0c78a92");
    assert.equal(node.trigger._id, "6297176c10f525b8a81a9304");
    assert.equal(node.trigger.resourceTemplate.createdAt, node.trigger.resourceTemplate.updatedAt);
  });

  it("returns null for absent and unknown node IDs", async () => {
    const absent = await request({ query: "{ node { _id } }" });
    assert.deepEqual((await absent.json()).data, { node: null });

    const unknown = await request({ query: "{ node(nodeId: \"missing\") { _id } }" });
    assert.deepEqual((await unknown.json()).data, { node: null });
  });

  it("supports authenticated GET and preserves GraphQL validation errors", async () => {
    const query = encodeURIComponent("{ node(nodeId: \"6296be3470a0c1052f89cccb\") { _id } }");
    const getResponse = await fetch(`${endpoint}?query=${query}`, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
      },
    });
    const getBody = await getResponse.json();
    assert.equal(getResponse.status, 200, JSON.stringify(getBody));
    assert.equal(getBody.data.node._id, "6296be3470a0c1052f89cccb");

    const invalid = await request({ query: "{ node { missingField } }" });
    assert.equal(invalid.status, 400);
    const invalidBody = await invalid.json();
    assert.equal(invalidBody.errors[0].extensions.code, "GRAPHQL_VALIDATION_FAILED");
  });
});

async function copyDataset(destination) {
  const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const fileName of ["action.json", "trigger.json", "response.json", "resourceTemplate.json", "node.json"]) {
    await fs.copyFile(path.join(projectDirectory, fileName), path.join(destination, fileName));
  }
}

async function withTemporaryDataset(run) {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "graphql-data-"));
  try {
    await copyDataset(temporaryDirectory);
    await run(temporaryDirectory);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

describe("data validation", () => {
  it("rejects duplicate IDs and Parent cycles", async () => {
    await withTemporaryDataset(async (temporaryDirectory) => {
      const actionsPath = path.join(temporaryDirectory, "action.json");
      const actions = JSON.parse(await fs.readFile(actionsPath, "utf8"));
      actions.push({ ...actions[0] });
      await fs.writeFile(actionsPath, JSON.stringify(actions));
      await assert.rejects(loadData({ dataDir: temporaryDirectory }), /duplicate action _id/);
    });

    await withTemporaryDataset(async (temporaryDirectory) => {
      const nodesPath = path.join(temporaryDirectory, "node.json");
      const nodes = JSON.parse(await fs.readFile(nodesPath, "utf8"));
      nodes[0].parents = [nodes[2].compositeId];
      nodes[2].parents = [nodes[0].compositeId];
      await fs.writeFile(nodesPath, JSON.stringify(nodes));
      await assert.rejects(loadData({ dataDir: temporaryDirectory }), /Parent cycle detected/);
    });
  });

  it("rejects dangling references", async () => {
    await withTemporaryDataset(async (temporaryDirectory) => {
      const nodesPath = path.join(temporaryDirectory, "node.json");
      const nodes = JSON.parse(await fs.readFile(nodesPath, "utf8"));
      nodes[0].responses = ["missing-response"];
      await fs.writeFile(nodesPath, JSON.stringify(nodes));
      await assert.rejects(loadData({ dataDir: temporaryDirectory }), /references unknown ID missing-response/);
    });
  });

  it("rejects response arrays with the wrong type", async () => {
    const cases = [
      {
        mutate: (responses) => { responses[0].platforms = {}; },
        expected: /responses\[0\]\.platforms must be an array or null/,
      },
      {
        mutate: (responses) => { responses[0].platforms[0].localeGroups = {}; },
        expected: /responses\[0\]\.platforms\[0\]\.localeGroups must be an array or null/,
      },
      {
        mutate: (responses) => { responses[0].platforms[0].localeGroups[0].variations = {}; },
        expected: /variations must be an array or null/,
      },
    ];

    for (const testCase of cases) {
      await withTemporaryDataset(async (temporaryDirectory) => {
        const responsesPath = path.join(temporaryDirectory, "response.json");
        const responses = JSON.parse(await fs.readFile(responsesPath, "utf8"));
        testCase.mutate(responses);
        await fs.writeFile(responsesPath, JSON.stringify(responses));
        await assert.rejects(loadData({ dataDir: temporaryDirectory }), testCase.expected);
      });
    }
  });

  it("rejects build values outside the GraphQL Int range", async () => {
    await withTemporaryDataset(async (temporaryDirectory) => {
      const responsesPath = path.join(temporaryDirectory, "response.json");
      const responses = JSON.parse(await fs.readFile(responsesPath, "utf8"));
      responses[0].platforms[0].build = 2 ** 31;
      await fs.writeFile(responsesPath, JSON.stringify(responses));
      await assert.rejects(loadData({ dataDir: temporaryDirectory }), /build must be a 32-bit signed integer/);
    });
  });
});

describe("configuration", () => {
  it("rejects invalid ports and empty tokens", () => {
    assert.throws(() => getConfig({ PORT: "70000" }), /PORT must be an integer/);
    assert.throws(() => getConfig({ AUTH_TOKEN: "" }), /AUTH_TOKEN must not be empty/);
  });
});
