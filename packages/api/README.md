# @usa-open-data-connectors/connectors-api

Internal package. It is not published to npm.

HTTP wrapper that exposes the US data connector registry over HTTP for any language.

## What this package does

- Serves the connector registry over HTTP with Hono.
- Publishes an OpenAPI 3.1 document at `/openapi.json`.
- Serves Swagger UI at `/docs`.
- Reports request counts in Prometheus format at `/metrics`.
- Adds request logging, CORS, rate limiting, and optional error tracking.

## Install

This package is private and is consumed as a workspace package. It never installs from npm.
Run these commands from the repo root.

```sh
npm install
npm run dev:api
```

## Quick start

```sh
npm run dev:api
curl 'http://localhost:8787/api/sources/bls-unemployment-rate/data'
```

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/health` | Health check. Answers 200 with `{ "ok": true, "name": "usa-open-data-connectors" }`. |
| GET | `/metrics` | Request counts in Prometheus text format. |
| GET | `/openapi.json` | The OpenAPI 3.1 document, ready for client generation. |
| GET | `/docs` | Swagger UI for the OpenAPI document. |
| GET | `/api/sources` | List every registered adapter, without its fetch function. |
| GET | `/api/sources/{id}/probe` | Live probe one source and report whether it answered. |
| GET | `/api/sources/{id}/data` | Fetch and parse the live payload for one source. |

## Notes and limits

- The server listens on port 8787 by default. Set `PORT` to change it.
- Keys come from the server options at process start. The API never accepts keys from callers, and no key is committed to the repo.
- The `/api` routes allow every origin by default. Set `CORS_ORIGIN` to restrict browser access to one origin.
- The `/api` routes allow 60 requests per minute per IP by default. Set `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` to change that.
- The rate limiter keeps its counters in memory. Multi-instance deploys must limit at a proxy instead.
- Error tracking is off unless you set `SENTRY_DSN`.
- An unknown source answers 404. A malformed source id answers 400. An upstream failure answers 502 with `error: "upstream_failure"`.
- An unknown route answers 404 with `error: "not_found"`. An unhandled error answers 500 with `error: "internal_error"`.
- A contract test keeps the OpenAPI document and the registered routes in step. Add a route without documenting it and the check fails.
- The package ships TypeScript source. Its `exports` field points at `./src/index.ts`, and the app factory is `createConnectorsApp`.

## Data sources and licences

The API reads the same US federal sources as `@usa-open-data-connectors/usa-sources`. That package's
README lists every publisher, source URL, and data licence. The API stores no data. Each request returns
whatever the source answers at call time.

## Package licence

MIT. See LICENSE.

## Links

- source: https://github.com/olitreadwell/usa-open-data-connectors/tree/main/packages/api
- docs: ../../README.md
