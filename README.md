# USA Open Data Connectors

TypeScript connectors for US public data, with language-agnostic wrappers so you
can use them from any language (Python, R, Julia, curl, whatever you like).

Keyless-first: every connector works without an API key. Keys, when a source
needs one, are read from the environment and stay server-side. They are never
exposed over the API or committed to the repo.

## Packages

| Package | What it is |
| ------- | ---------- |
| `@open-data-connectors/usa-sources` | Uniform adapters for US public data sources (BLS unemployment rate, USGS earthquakes) with live probes and offline fixtures |
| `@open-data-connectors/connectors-api` | HTTP wrapper with an OpenAPI spec and Swagger UI, so any language can call the connectors over HTTP |
| `@open-data-connectors/connectors-cli` | `usdata` command line tool that prints JSON to stdout, so any language can shell out to it |
| `@open-data-connectors/config-eslint`, `@open-data-connectors/config-typescript` | Shared lint and TypeScript settings |
| `python/` (`nzdata` on PyPI) | Python port, still on the New Zealand sources. See "Language ports" |
| `ruby/` (`nzdata` gem) | Ruby port, still on the New Zealand sources. See "Language ports" |

## Connectors

Two adapters, both in `@open-data-connectors/usa-sources`. Both are keyless and
need no environment variable.

| id | Source | Keyless? | Example command |
| --- | --- | --- | --- |
| `bls-unemployment-rate` | Bureau of Labor Statistics, national unemployment rate | Yes | `npx tsx packages/cli/src/cli.ts probe bls-unemployment-rate` |
| `usgs-hawaii-earthquakes` | US Geological Survey, earthquakes near Hawaii | Yes | `npx tsx packages/cli/src/cli.ts probe usgs-hawaii-earthquakes` |

Each adapter knows how to fetch live data, parse the response, and load a
committed fixture, so a build never depends on a live API.

### Adapter examples

A probe prints a JSON summary with the probe `id`, `name`, `auth`, an `ok` or
`status` line, and a `sample` of the live data.

```sh
# BLS - the national unemployment rate, monthly, seasonally adjusted
npx tsx packages/cli/src/cli.ts probe bls-unemployment-rate
```

```sh
# USGS - earthquakes of magnitude 2.5 and above near the Hawaiian islands
npx tsx packages/cli/src/cli.ts probe usgs-hawaii-earthquakes
```

## Language-agnostic access

### HTTP API

```sh
npm install
npm run dev:api        # http://localhost:8787
```

- `GET /health` - health check
- `GET /metrics` - request counts in Prometheus format
- `GET /openapi.json` - machine-readable OpenAPI spec (generate clients in any language from this)
- `GET /docs` - Swagger UI
- `GET /api/sources` - list every adapter
- `GET /api/sources/:id/probe` - live probe one source
- `GET /api/sources/:id/data` - fetch and parse the live payload for one source

```sh
curl 'http://localhost:8787/api/sources/bls-unemployment-rate/data'
```

### CLI

```sh
npx tsx packages/cli/src/cli.ts sources
npx tsx packages/cli/src/cli.ts probe bls-unemployment-rate
```

Output goes to stdout as JSON, errors go to stderr, and the exit code is 0 on
success.

## Quick start (TypeScript)

```sh
npm install
npm run check
```

```ts
import { probeAllUsDataSources } from '@open-data-connectors/usa-sources';

const probes = await probeAllUsDataSources();
console.log(probes.map((probe) => `${probe.id}: ${probe.ok ? 'ok' : probe.status}`).join('\n'));
```

## Environment variables

| Variable | Needed for | Where to get it |
| -------- | ---------- | --------------- |
| `SENTRY_DSN` | Error tracking (optional, off by default) | sentry.io |

No registered connector needs a key. A future keyed adapter reads its key from
an environment variable read at process start, server-side.

## Testing

```sh
npm run check          # format, lint, type-check, and unit tests with coverage
npm run test:smoke     # live smoke tests against the real APIs (needs RUN_SMOKE=1)
```

Unit tests use committed fixture snapshots pulled from the live APIs, so they
run offline. Smoke tests are opt-in via `RUN_SMOKE=1` and hit the real
endpoints. They need no key.

## Language ports

- `python/` - Python package, publishable to PyPI as `nzdata` (tag `python-v*`).
- `ruby/` - Ruby gem, publishable to RubyGems as `nzdata` (tag `ruby-v*`).

Both ports still implement the New Zealand connector design that this repo
started from. Porting them to the US sources is follow-up work, tracked in
`COUNTRY.md`. Each port has its own quality gates (`ruff` + `mypy` + coverage
for Python, `rubocop` + coverage for Ruby) enforced in CI.

## Run the API in Docker

The `Dockerfile` at the repo root runs the HTTP API on port `8787` with a
non-root user and a health check.

```sh
docker build -t usa-connectors .
docker run -p 8787:8787 --env-file .env usa-connectors
```

Any keys come from the environment only. Every registered endpoint works
keyless.

## Documentation

- `docs/ARCHITECTURE.md` - how the pieces fit together, in plain language
- `docs/SECURITY.md` - key handling and the security checklist
- `docs/GLOSSARY.md` - plain-language definitions of every term
- `docs/CONNECTOR_DISCOVERY.md` - the US adapters and the sources not yet probed
- `docs/RELEASING.md` - how versions, tags, and publishing work
- `docs/dependency-updates.md` - how Renovate opens and groups dependency bumps

## Contributing

See `CONTRIBUTING.md` for how to set up the repo, run the checks, and
open a pull request.

## License

MIT
