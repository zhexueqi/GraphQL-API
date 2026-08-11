# GraphQL API Server

This is a read-only Apollo GraphQL API backed by the JSON files in this directory.

## Run

Requirements: Node.js 22 or newer.

```text
npm ci
npm start
```

The server listens on `http://127.0.0.1:4000/graphql`.

The submission token is:

```text
backend-code-test-token-2026
```

`AUTH_TOKEN`, `HOST`, `PORT`, and `DATA_DIR` can override the defaults. `.env.example` documents the supported environment variables; export them in the shell before starting the server.

## Example

```text
curl -X POST http://127.0.0.1:4000/graphql ^
  -H "Authorization: Bearer backend-code-test-token-2026" ^
  -H "Content-Type: application/json" ^
  --data "{\"query\":\"{ node(nodeId: \\\"6296be3470a0c1052f89cccb\\\") { _id name } }\"}"
```

The endpoint accepts authenticated JSON `POST` requests and authenticated `GET` queries. The Bearer `Authorization` header is registered as Apollo's CSRF preflight signal, so GET clients do not need an additional Apollo-specific header. Missing, malformed, or incorrect credentials return HTTP `401`. Introspection is enabled but also authenticated; the public Apollo landing page is disabled.

## Data mapping notes

- The API follows the provided `_id` field spelling.
- `NodeObject.parentIds` contains the source `parents` composite IDs; `parents` resolves those IDs through `compositeId`.
- `preActions` and `postActions` are exposed as one ordered `actionIds`/`actions` list, with pre-actions first.
- Source `localeGroup` is exposed as `localeGroupId`.
- The provided ResourceTemplate fixtures omit `createdAt` on two records. For those records, the API uses `updatedAt` as a compatibility fallback so the required GraphQL field remains non-null. All other required-field and relationship violations fail startup.
- `functionString` is returned as text and is never executed.
- Fields present in the JSON but absent from the required Schema are intentionally ignored.

## Verify

```text
npm test
npm run check
```
