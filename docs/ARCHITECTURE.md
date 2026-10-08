# Architecture

Plain-language map of this repo. If you are new here, start with
`README.md`, then read this file.

## What this repo is

TypeScript connectors for US public data, with an HTTP API and a CLI on top
of them.

- TypeScript: the source of truth. Adapters, HTTP API, CLI.
- Python: a port (`python/`, package name `nzdata`), still on the New
  Zealand connector design.
- Ruby: a port (`ruby/`, gem name `nzdata`), still on the New Zealand
  connector design.

The TypeScript packages are what the repo is for right now. The two ports
predate the move to US sources and are queued for the same treatment.

## The pieces

| Piece | Location | What it does |
| ----- | -------- | ------------ |
| Source adapters | `packages/usa-sources` | One adapter per US public data source, plus the registry |
| HTTP API | `packages/api` | Exposes the registry over HTTP, with an OpenAPI spec |
| CLI | `packages/cli` | Exposes the registry on the command line as `usdata` |
| Config packages | `packages/config-eslint`, `packages/config-typescript` | Shared lint and TypeScript settings |
| Python port | `python/` | The NZ adapters and client in Python |
| Ruby port | `ruby/` | The NZ adapters and client in Ruby |

## How a request flows

Every adapter speaks one interface (`UsDataAdapter`). It knows how to:
1. describe itself (`id`, `name`, `auth`, `description`)
2. fetch live data
3. parse a response into plain objects
4. load a committed fixture when there is no network

The HTTP API and the CLI both go through `US_DATA_SOURCES` in
`packages/usa-sources/src/registry.ts`. They never call an agency endpoint
directly. That is what "one design" means.

The API exposes three generic routes over the registry:

- `GET /api/sources` lists every adapter
- `GET /api/sources/{id}/probe` runs a live fetch and reports whether it
  answered and parsed
- `GET /api/sources/{id}/data` returns the parsed live payload

Adding an adapter to the registry is enough to expose it on all three routes.

Live fetches go through the shared helper in
`packages/usa-sources/src/http.ts`. It sets one `User-Agent`
(`usa-open-data-connectors (Language=TypeScript)`), aborts after 30 seconds, and
marks HTTP 429, HTTP 5xx and network failures as `retryable` on the thrown
`UsSourceApiError`, with the HTTP status attached. The SEC EDGAR, National
Weather Service and CFPB adapters pass a `User-Agent` of their own and that
replaces the default; other headers merge over it.

## Keyless first

Every registered source works without an API key:

No adapter needs a key today, and none reads an environment variable. The one
published limit is BLS: 25 series queries a day keyless, 500 with a registered
key, and the adapter does not send a key.

When a keyed source lands, the key is read from the environment at process
start, the API and the CLI never accept keys from callers, and keys are never
committed to the repo. `normalizeSourceApiKey` in
`packages/usa-sources/src/apiKey.ts` trims a key that is set but blank, so it
is treated as unset.

## Fixtures instead of the live network

Tests never touch the network unless you set `RUN_SMOKE=1`.

Each adapter has committed fixtures in `src/fixtures/`. A fixture is a real
snapshot of a live API response. Each fixture records the window it covers,
either in a note inside the file or in its filename.

Why: tests run fast, offline, and give the same answer on every machine.

## Testing strategy

| Kind | Where | When it runs |
| --- | --- | --- |
| Unit tests | `src/*.test.ts` next to each source file | `npm run check` |
| Integration tests | `packages/api/src/app.test.ts`, `packages/api/src/routes/sources.test.ts` | `npm run check` |
| E2E tests | `packages/api/src/e2e.test.ts` | `npm run check` |
| Contract test | `packages/api/src/openapi.contract.test.ts` | `npm run check` |
| Live smoke tests | `*.test.ts` gated on `RUN_SMOKE=1` | opt-in, or nightly CI |

The OpenAPI contract test keeps the documented paths and the registered
routes in step. Change one without the other and it fails.

## Where quality gates live

- Coverage threshold 60% per package: `vitest.config.ts` (TypeScript),
  `pyproject.toml` (Python), `spec_helper.rb` (Ruby)
- Lint: ESLint (TypeScript), `ruff` (Python), `rubocop` (Ruby)
- Type check: `tsc` (TypeScript), `mypy` (Python)
- CI: `.github/workflows/ci.yml`, `.github/workflows/smoke.yml`

`npm run build` compiles `usa-sources` before the CLI, because the API and CLI
type-check against the built package.

## Documentation index

- `README.md` - quickstart and commands
- `docs/ARCHITECTURE.md` - this file
- `docs/CONNECTOR_DISCOVERY.md` - what has been checked live, and what is left to probe
- `docs/SECURITY.md` - keys, audits, and the security checklist
- `docs/GLOSSARY.md` - plain-language terms
- `docs/RELEASING.md` - how versions and tags work
- `docs/AGENT_CONTEXT.md` - handoff context for an agent working in this repo
- `COUNTRY.md` - adapter status and what is left
