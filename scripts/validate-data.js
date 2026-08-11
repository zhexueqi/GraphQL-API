import path from "node:path";

import { DEFAULT_DATA_DIR, loadData } from "../src/data.js";

async function main() {
  const dataDir = process.env.DATA_DIR === undefined || process.env.DATA_DIR === ""
    ? DEFAULT_DATA_DIR
    : path.resolve(process.env.DATA_DIR);
  const store = await loadData({ dataDir });

  console.log("Data validation passed");
  console.log([
    `nodes=${store.nodes.length}`,
    `actions=${store.actions.length}`,
    `triggers=${store.triggers.length}`,
    `responses=${store.responses.length}`,
    `resourceTemplates=${store.resourceTemplates.length}`,
  ].join(" "));
  console.log("relationships=valid parentGraph=acyclic");
}

try {
  await main();
} catch (error) {
  console.error(`Data validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
