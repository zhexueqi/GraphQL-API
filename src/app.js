import crypto from "node:crypto";

import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";

import { DEFAULT_AUTH_TOKEN } from "./config.js";
import { resolvers, typeDefs } from "./schema.js";

const CSRF_REQUEST_HEADERS = [
  "authorization",
  "apollo-require-preflight",
  "x-apollo-operation-name",
];

function tokenMatches(candidate, expected) {
  const candidateBuffer = Buffer.from(candidate, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return candidateBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function isAuthorized(authorization, expectedToken) {
  if (typeof authorization !== "string") {
    return false;
  }
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match !== null && tokenMatches(match[1], expectedToken);
}

function authenticationMiddleware(expectedToken) {
  return (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,apollo-require-preflight");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    if (!isAuthorized(req.headers.authorization, expectedToken)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}

function requestErrorMiddleware(error, _req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large" });
    return;
  }

  const clientError = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500;
  if (!clientError) {
    console.error(`Unhandled request error: ${error instanceof Error ? error.message : String(error)}`);
  }
  res.status(clientError ? error.status : 500).json({
    error: clientError ? "Bad request" : "Internal server error",
  });
}

export async function createApp({ store, token = DEFAULT_AUTH_TOKEN, httpServer } = {}) {
  if (!store) {
    throw new Error("A loaded data store is required");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("AUTH_TOKEN must not be empty");
  }

  const plugins = [ApolloServerPluginLandingPageDisabled()];
  if (httpServer) {
    plugins.push(ApolloServerPluginDrainHttpServer({ httpServer }));
  }

  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    csrfPrevention: { requestHeaders: CSRF_REQUEST_HEADERS },
    plugins,
    formatError(formattedError) {
      if (formattedError.extensions?.code === "INTERNAL_SERVER_ERROR") {
        return { message: "Internal server error", extensions: { code: "INTERNAL_SERVER_ERROR" } };
      }
      return formattedError;
    },
  });
  await apolloServer.start();

  const app = express();
  app.disable("x-powered-by");
  app.use(
    "/graphql",
    authenticationMiddleware(token),
    express.json({ limit: "100kb" }),
    expressMiddleware(apolloServer, {
      context: async () => ({ store }),
    }),
  );
  app.use(requestErrorMiddleware);

  return { app, apolloServer };
}
