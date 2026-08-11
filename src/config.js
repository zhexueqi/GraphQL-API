import path from "node:path";

import { DEFAULT_DATA_DIR } from "./data.js";

export const DEFAULT_AUTH_TOKEN = "backend-code-test-token-2026";
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4000;

function parsePort(value) {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

export function getConfig(env = process.env) {
  const host = env.HOST === undefined || env.HOST === "" ? DEFAULT_HOST : env.HOST;
  const token = env.AUTH_TOKEN === undefined ? DEFAULT_AUTH_TOKEN : env.AUTH_TOKEN;

  if (typeof token !== "string" || token.length === 0) {
    throw new Error("AUTH_TOKEN must not be empty");
  }

  const dataDir = env.DATA_DIR === undefined || env.DATA_DIR === ""
    ? DEFAULT_DATA_DIR
    : path.resolve(env.DATA_DIR);

  return {
    dataDir,
    host,
    port: parsePort(env.PORT),
    token,
  };
}
