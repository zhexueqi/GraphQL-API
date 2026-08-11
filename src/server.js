import http from "node:http";

import { getConfig } from "./config.js";
import { createApp } from "./app.js";
import { loadData } from "./data.js";

async function main() {
  const config = getConfig();
  const dataStore = await loadData({ dataDir: config.dataDir });
  const httpServer = http.createServer();
  const { app, apolloServer } = await createApp({
    store: dataStore,
    token: config.token,
    httpServer,
  });

  httpServer.on("request", app);

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, config.host, resolve);
  });

  console.log(`GraphQL API listening at http://${config.host}:${config.port}/graphql`);

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down`);
    try {
      await apolloServer.stop();
      if (httpServer.listening) {
        await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
      }
    } catch (error) {
      console.error(`Shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
