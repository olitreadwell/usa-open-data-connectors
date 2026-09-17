USA open data connectors (scaffold). Derived from nz-open-data-connectors; adapters being ported to USA sources. See COUNTRY.md.

# NZ Open Data Connectors

TypeScript connectors for New Zealand public data, with language-agnostic wrappers so you can use them from any language (Python, R, Julia, curl, whatever you like).

Keyless-first: every connector works without an API key. Optional keys unlock more, and keys stay server-side - they are read from the environment and never exposed over the API or committed to the repo.

## Packages

| Package | What it is |
| ------- | ---------- |
| `@nzlab/nz-sources` | Uniform adapters for 8 NZ data sources (GeoNet, data.govt.nz, LINZ, DigitalNZ, Trade Me, NZOR, ADE search, MSB benefits datastore) with live probes and offline fixtures |
| `@nzlab/stats-nz` | Client for the Aotearoa Data Explorer (ADE) API: dataflow catalogue, data pulls, codelists, CSV parsing and serialization |
| `@nzlab/connectors-api` | HTTP wrapper with an OpenAPI spec and Swagger UI, so any language can call the connectors over HTTP |
| `@nzlab/connectors-cli` | `nzdata` command line tool that prints JSON or CSV to stdout, so any language can shell out to it |
| `python/` (`nzdata` on PyPI) | Python port of the connectors, one dependency (`httpx`) |
| `ruby/` (`nzdata` gem) | Ruby port of the connectors, one dependency (`rexml`) |

## Connectors

Thirteen source adapters, all in `@nzlab/nz-sources`. Every one works
keyless. Two accept an optional key from the environment to unlock more:
DigitalNZ with `DIGITAL_NZ_API_KEY` and LINZ with `LINZ_API_KEY`.

| id | Source | Keyless? | Key env var | Example command |
| --- | --- | --- | --- | --- |
| `geonet` | GeoNet (GNS Science) | Yes | - | `npx tsx packages/cli/src/cli.ts probe geonet` |
| `data-govt-nz` | data.govt.nz catalogue | Yes | - | `npx tsx packages/cli/src/cli.ts probe data-govt-nz` |
| `data-govt-datastore` | data.govt.nz datastore (MSD benefits) | Yes | - | `npx tsx packages/cli/src/cli.ts probe data-govt-datastore` |
| `ade-search` | Aotearoa Data Explorer search index | Yes | - | `npx tsx packages/cli/src/cli.ts probe ade-search` |
| `digitalnz` | DigitalNZ (National Library) | Yes | `DIGITAL_NZ_API_KEY` | `npx tsx packages/cli/src/cli.ts probe digitalnz` |
| `trademe` | Trade Me categories | Yes | - | `npx tsx packages/cli/src/cli.ts probe trademe` |
| `nzor` | NZ Organisms Register | Yes | - | `npx tsx packages/cli/src/cli.ts probe nzor` |
| `linz` | LINZ Data Service catalogue | Yes | `LINZ_API_KEY` | `npx tsx packages/cli/src/cli.ts probe linz` |
| `arcgis` | ArcGIS Hub open data (Auckland, Wellington, Canterbury, NZTA) | Yes | - | `npx tsx packages/cli/src/cli.ts probe arcgis` |
| `lawa` | LAWA river quality monitoring sites | Yes | - | `npx tsx packages/cli/src/cli.ts probe lawa` |
| `mfe` | MfE Data Service layer catalogue | Yes | - | `npx tsx packages/cli/src/cli.ts probe mfe` |
| `lris` | LRIS land and soil layer search (Landcare Research) | Yes | - | `npx tsx packages/cli/src/cli.ts probe lris` |
| `nzta` | Waka Kotahi holiday journey hotspots | Yes | - | `npx tsx packages/cli/src/cli.ts probe nzta` |

### Adapter examples

Each probe prints a JSON summary with the probe `id`, `name`, `auth`, an
`ok` or `status` line, and a `sample` of the live data.

```sh
# GeoNet - recent felt earthquakes (magnitude 3+)
npx tsx packages/cli/src/cli.ts probe geonet
```

```sh
# data.govt.nz - datasets matching "sheep" from the national catalogue
npx tsx packages/cli/src/cli.ts probe data-govt-nz
```

```sh
# data.govt.nz datastore - national MSD benefit rows
npx tsx packages/cli/src/cli.ts probe data-govt-datastore
```

```sh
# ADE search - tables matching "median annual earnings"
npx tsx packages/cli/src/cli.ts probe ade-search
```

```sh
# DigitalNZ - digitised records matching "sheep"
npx tsx packages/cli/src/cli.ts probe digitalnz
```

```sh
# Trade Me - the public category tree
npx tsx packages/cli/src/cli.ts probe trademe
```

```sh
# NZOR - organism names matching "kiwi"
npx tsx packages/cli/src/cli.ts probe nzor
```

```sh
# LINZ - layers matching "property" (property titles, parcels, boundaries)
npx tsx packages/cli/src/cli.ts probe linz
```

```sh
# ArcGIS Hub - open data collections from Auckland Council (default host)
npx tsx packages/cli/src/cli.ts probe arcgis
```

```sh
# LAWA - river quality monitoring sites across New Zealand
npx tsx packages/cli/src/cli.ts probe lawa
```

```sh
# MfE Data Service - layers matching "water" from the Ministry for the Environment
npx tsx packages/cli/src/cli.ts probe mfe
```

```sh
# LRIS - land and soil layers matching "soil" from Landcare Research
npx tsx packages/cli/src/cli.ts probe lris
```

```sh
# Waka Kotahi - predicted busy holiday journey hotspots
npx tsx packages/cli/src/cli.ts probe nzta
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
- `GET /api/digitalnz/media?q=kiwi&type=images` - DigitalNZ media search (images, newspapers, videos, audio, literature, artwork)
- `GET /api/stats-nz/catalogue` - every ADE dataflow
- `GET /api/stats-nz/data?dataflowId=AGR_AGR_003` - data rows as JSON
- `GET /api/stats-nz/data?dataflowId=AGR_AGR_003&format=csv` - data rows as CSV
- `GET /api/stats-nz/codelist?codelistId=CL_LIVESTOCK_AGR_AGR_003` - dimension codes to labels (needs a key)

```sh
curl 'http://localhost:8787/api/stats-nz/data?dataflowId=AGR_AGR_003'
```

### CLI

```sh
npx tsx packages/cli/src/cli.ts sources
npx tsx packages/cli/src/cli.ts probe linz
npx tsx packages/cli/src/cli.ts media --query kiwi --type images
npx tsx packages/cli/src/cli.ts catalogue
npx tsx packages/cli/src/cli.ts data --dataflow AGR_AGR_003 --format csv
npx tsx packages/cli/src/cli.ts codelist --codelist CL_LIVESTOCK_AGR_AGR_003
```

Output goes to stdout as JSON (or CSV), errors go to stderr, and the exit code is 0 on success.

## Quick start (TypeScript)

```sh
npm install
cp .env.example .env   # optional keys, see below
npm run check
```

```ts
import { probeAllNzDataSources } from '@nzlab/nz-sources';
import { createStatsNzClient } from '@nzlab/stats-nz';

const probes = await probeAllNzDataSources({});
console.log(probes.map((p) => `${p.id}: ${p.ok ? 'ok' : p.status}`).join('\n'));

const client = createStatsNzClient({});
const dataflows = await client.getDataflowCatalogue();
console.log(dataflows.length); // 911
```

## Environment variables

| Variable | Needed for | Where to get it |
| -------- | ---------- | --------------- |
| `STATS_NZ_SUBSCRIPTION_KEY` | Stats NZ codelists and non-agriculture tables | Free signup at portal.apis.stats.govt.nz |
| `LINZ_API_KEY` | LINZ layer search (optional) | data.linz.govt.nz |
| `DIGITAL_NZ_API_KEY` | DigitalNZ search (optional) | digitalnz.org |
| `SENTRY_DSN` | Error tracking (optional, off by default) | sentry.io |

Copy `.env.example` to `.env` and fill in your own keys. Real keys are gitignored and never committed.

## Testing

```sh
npm run check          # lint + type-check + unit tests (fixtures only, no network)
npm run test:smoke     # live smoke tests against the real APIs (needs keys in env)
```

Unit tests use committed fixture snapshots pulled from the live APIs, so they run offline. Smoke tests are opt-in via `RUN_SMOKE=1` and hit the real endpoints.

## Language ports

- `python/` - Python package, publishable to PyPI as `nzdata` (tag `python-v*`).
- `ruby/` - Ruby gem, publishable to RubyGems as `nzdata` (tag `ruby-v*`).

Both ports mirror the TypeScript surface: the same 8 adapters, the same Stats NZ client, the same fixture-based tests, and opt-in live smoke tests. Each port has its own quality gates (`ruff` + `mypy` + coverage for Python, `rubocop` + coverage for Ruby) enforced in CI. See each directory's README for quickstarts and publishing steps.

## Run the API in Docker

The `Dockerfile` at the repo root runs the HTTP API on port `8787` with a non-root user and a health check.

```sh
docker build -t nz-connectors .
docker run -p 8787:8787 --env-file .env nz-connectors
```

Optional keys come from the environment only. Without a `.env` file every keyless endpoint still works.

## Documentation

- `docs/ARCHITECTURE.md` - how the pieces fit together, in plain language
- `docs/SECURITY.md` - key handling and the security checklist
- `docs/GLOSSARY.md` - plain-language definitions of every term
- `docs/RELEASING.md` - how versions, tags, and publishing work

## Contributing

See `CONTRIBUTING.md` for how to set up the repo, run the checks, and
open a pull request.

## License

MIT
