import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import {
  buildASTSchema,
  lexicographicSortSchema,
  parse,
  printSchema,
} from "graphql";

import { typeDefs } from "../src/schema.js";

function normalizeSchema(sdl) {
  return printSchema(lexicographicSortSchema(buildASTSchema(parse(sdl))));
}

describe("GraphQL schema contract", () => {
  it("matches the schema supplied with the coding test", async () => {
    const expectedSchema = await fs.readFile(
      new URL("./fixtures/expected-schema.graphql", import.meta.url),
      "utf8",
    );

    assert.equal(normalizeSchema(typeDefs), normalizeSchema(expectedSchema));
  });
});
