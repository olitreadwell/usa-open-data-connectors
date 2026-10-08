# USA Open Data Connectors

TypeScript connectors for US public data, with language-agnostic wrappers so you
can use them from any language (Python, R, Julia, curl, whatever you like).

Keyless-first: every connector works without an API key. Keys, when a source
needs one, are read from the environment and stay server-side. They are never
exposed over the API or committed to the repo.

## Packages

| Package | What it is |
| ------- | ---------- |
| [`@usa-open-data-connectors/usa-sources`](https://www.npmjs.com/package/@usa-open-data-connectors/usa-sources) | Uniform adapters for 22 US public data sources, with live probes and offline fixtures |
| [`@usa-open-data-connectors/usa-mcp`](https://www.npmjs.com/package/@usa-open-data-connectors/usa-mcp) | MCP server that exposes the connectors to Claude, ChatGPT, and other MCP clients |
| [`@usa-open-data-connectors/connectors-cli`](https://www.npmjs.com/package/@usa-open-data-connectors/connectors-cli) | `usdata` command line tool that prints JSON to stdout, so any language can shell out to it |
| `@usa-open-data-connectors/connectors-api` | Private. HTTP wrapper with an OpenAPI spec and Swagger UI, so any language can call the connectors over HTTP |
| `@usa-open-data-connectors/config-eslint` | Private. Shared ESLint flat configuration |
| `@usa-open-data-connectors/config-typescript` | Private. Shared TypeScript compiler settings |
| `python/` (`nzdata` on PyPI) | Python port, still on the New Zealand sources. See "Language ports" |
| `ruby/` (`nzdata` gem) | Ruby port, still on the New Zealand sources. See "Language ports" |

## Connectors

Twenty-two adapters, all in `@usa-open-data-connectors/usa-sources`. All are
keyless and need no environment variable.

Most of this data comes from US federal agencies, and works of the US federal
government are generally not subject to copyright in the United States, so it
is effectively public domain there. The NCBI and NLM services attach their own
terms to some content, and public domain in the US is not public domain
everywhere. Check the publisher's terms before you republish: the connectors
fetch the data, they do not relicense it. `docs/CONNECTOR_DISCOVERY.md` lists
where each source's terms live.

Three sources ask callers to identify themselves. The SEC EDGAR, National
Weather Service and CFPB adapters send their own descriptive `User-Agent`
header from inside the adapter, which replaces the default one, so callers send
nothing extra. Every other adapter sends the shared `User-Agent`
(`usa-open-data-connectors (Language=TypeScript)`), waits at most 30 seconds
for a response, and marks rate-limited (HTTP 429), server-error (HTTP 5xx) and
network failures as `retryable` on the thrown `UsSourceApiError`. The shared
`httpGet` helper in `packages/usa-sources/src/http.ts` does this for all 22
adapters.

| id | Source | Keyless? | Example command |
| --- | --- | --- | --- |
| `bls-unemployment-rate` | Bureau of Labor Statistics, national unemployment rate | Yes | `npx tsx packages/cli/src/cli.ts probe bls-unemployment-rate` |
| `usgs-hawaii-earthquakes` | US Geological Survey, earthquakes near Hawaii | Yes | `npx tsx packages/cli/src/cli.ts probe usgs-hawaii-earthquakes` |
| `cdc-county-obesity` | CDC PLACES county obesity estimates | Yes | `npx tsx packages/cli/src/cli.ts probe cdc-county-obesity` |
| `ncei-annual-temperature` | NOAA NCEI contiguous US annual average temperature | Yes | `npx tsx packages/cli/src/cli.ts probe ncei-annual-temperature` |
| `noaa-sea-level` | NOAA CO-OPS monthly mean sea level | Yes | `npx tsx packages/cli/src/cli.ts probe noaa-sea-level` |
| `treasury-avg-interest-rate` | US Treasury average interest rate on the debt | Yes | `npx tsx packages/cli/src/cli.ts probe treasury-avg-interest-rate` |
| `fema-disaster-declarations` | FEMA disaster declarations | Yes | `npx tsx packages/cli/src/cli.ts probe fema-disaster-declarations` |
| `openfda-food-recalls` | openFDA food enforcement reports | Yes | `npx tsx packages/cli/src/cli.ts probe openfda-food-recalls` |
| `usgs-peak-streamflow` | USGS annual peak streamflow at St. Louis | Yes | `npx tsx packages/cli/src/cli.ts probe usgs-peak-streamflow` |
| `cpsc-product-recalls` | CPSC consumer product recalls | Yes | `npx tsx packages/cli/src/cli.ts probe cpsc-product-recalls` |
| `cfpb-consumer-complaints` | CFPB Consumer Complaint Database | Yes | `npx tsx packages/cli/src/cli.ts probe cfpb-consumer-complaints` |
| `treasury-debt-to-penny` | US Treasury debt to the penny | Yes | `npx tsx packages/cli/src/cli.ts probe treasury-debt-to-penny` |
| `sec-edgar-filings` | SEC EDGAR issuer submissions and recent filings | Yes | `npx tsx packages/cli/src/cli.ts probe sec-edgar-filings` |
| `fdic-bank-directory` | FDIC bank directory | Yes | `npx tsx packages/cli/src/cli.ts probe fdic-bank-directory` |
| `clinicaltrials-studies` | ClinicalTrials.gov registered studies | Yes | `npx tsx packages/cli/src/cli.ts probe clinicaltrials-studies` |
| `nws-point-forecast` | National Weather Service forecast grid point | Yes | `npx tsx packages/cli/src/cli.ts probe nws-point-forecast` |
| `usaspending-agencies` | USAspending top-tier federal agencies | Yes | `npx tsx packages/cli/src/cli.ts probe usaspending-agencies` |
| `epa-envirofacts-facilities` | EPA Envirofacts Toxics Release Inventory facilities | Yes | `npx tsx packages/cli/src/cli.ts probe epa-envirofacts-facilities` |
| `ncbi-pubmed-search` | NCBI PubMed literature search | Yes | `npx tsx packages/cli/src/cli.ts probe ncbi-pubmed-search` |
| `cdc-socrata-catalogue` | CDC Socrata catalogue | Yes | `npx tsx packages/cli/src/cli.ts probe cdc-socrata-catalogue` |
| `healthdata-socrata-catalogue` | HealthData.gov Socrata catalogue | Yes | `npx tsx packages/cli/src/cli.ts probe healthdata-socrata-catalogue` |
| `bts-transportation-stats` | Bureau of Transportation Statistics catalogue | Yes | `npx tsx packages/cli/src/cli.ts probe bts-transportation-stats` |

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
import { probeAllUsDataSources } from '@usa-open-data-connectors/usa-sources';

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
- `docs/CONNECTOR_DISCOVERY.md` - every adapter, the live check behind it, and the sources not yet probed
- `docs/SECURITY.md` - key handling and the security checklist
- `docs/GLOSSARY.md` - plain-language definitions of every term
- `docs/RELEASING.md` - how versions, tags, and publishing work
- `docs/AGENT_CONTEXT.md` - handoff context for an agent working in this repo
- `docs/faq.md` - keys, licences, fixtures, and how to add a source
- `docs/contact.md` - how to report a bug, a dead source, or a security problem
- `COUNTRY.md` - adapter status table and the sources still to come

The other files under `docs/` come from the shared project template
(`olitreadwell/template`) and describe the template's own gates. For this repo,
the API contract lives at `GET /openapi.json` and `/docs`.

## Contributing

See `CONTRIBUTING.md` for how to set up the repo, run the checks, and
open a pull request.

## License

MIT
