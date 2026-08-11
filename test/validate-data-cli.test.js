import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATE_DATA_SCRIPT = path.join(PROJECT_DIR, "scripts", "validate-data.js");

function runValidation(dataDir) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (dataDir === undefined) {
      delete env.DATA_DIR;
    } else {
      env.DATA_DIR = dataDir;
    }

    const child = spawn(process.execPath, [VALIDATE_DATA_SCRIPT], {
      cwd: PROJECT_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("data validation command", () => {
  it("reports validated entity counts for the bundled dataset", async () => {
    const result = await runValidation();

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, [
      "Data validation passed",
      "nodes=7 actions=1 triggers=5 responses=5 resourceTemplates=3",
      "relationships=valid parentGraph=acyclic",
      "",
    ].join("\n"));
  });

  it("fails clearly when DATA_DIR cannot be loaded", async () => {
    const missingDirectory = path.join(os.tmpdir(), `missing-graphql-data-${process.pid}`);
    const result = await runValidation(missingDirectory);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^Data validation failed: unable to read .+action\.json:/);
  });
});
