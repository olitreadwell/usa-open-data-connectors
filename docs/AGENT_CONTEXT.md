# Agent context

Handoff context for a fresh agent thread working in this repo. Read
`AGENTS.md` first, then this file, then `docs/ARCHITECTURE.md` if you need
the full map.

## What this repo is

TypeScript connectors for US public data, with an HTTP API and a CLI. npm
workspaces, one package per concern. The Python and Ruby ports in
`python/` and `ruby/` still implement the New Zealand connector design.

The repo was copied from `nz-open-data-connectors` and is being turned into
a US connectors repo. The npm scope is now `@open-data-connectors`. The NZ
TypeScript packages (`nz-sources`, `stats-nz`) are gone.

## Current state

- `main` holds the merged USGS and BLS adapters plus the retired NZOR smoke
  fix (PRs 14, 15, and 16)
- `packages/usa-sources` holds both adapters, the registry, and fixtures
- The API and the CLI serve `usa-sources` through the registry. The NZ-only
  routes and CLI commands were removed rather than re-pointed
- Working tree clean; `npm run check` green

## What is left

1. `python/` and `ruby/` still implement the NZ design. Port or delete them.
2. `docs/CONNECTOR_DISCOVERY.md` and the backlog table in `COUNTRY.md` still
   list NZ candidates; replace them with US candidates.
3. Backlog of US sources to add: Census Bureau, BEA, EIA, EPA, CDC, NOAA,
   and api.data.gov.
4. `scripts/sync-connectors.mjs` in the sibling `uk-data-lab` and
   `usa-data-lab` repos vendors one package by name and renames its scope as
   it copies. That script matches the old scope, so it needs updating before
   the rename lands there.

## Commands

```sh
npm run check          # format + lint + type-check + tests with coverage
npm run test:smoke     # live tests against real APIs (needs RUN_SMOKE=1)
cd python && .venv/bin/ruff check src tests && .venv/bin/mypy && .venv/bin/pytest
cd ruby && bundle exec rake check
```

`npm run build` compiles `usa-sources` before the CLI. The API and CLI
type-check against `packages/usa-sources/dist`, so build before type-checking.

## Quality gates

- No `console.log` in committed code (warn/error allowed)
- No `any` escape hatches
- Every exported function has an explicit return type
- Every export has a doc comment above it
- 60% coverage threshold per package, enforced by `npm run check`
- Python: `ruff` + `mypy` + pytest coverage gate, deps pinned in `uv.lock`
- Ruby: `rubocop` + SimpleCov gate via `bundle exec rake check`
- Never fabricate a data source, a stat, or a "this worked" claim
- Fixtures are real snapshots from the live APIs

## Conventions

- Adapters live in `packages/usa-sources`; register a new one in
  `src/registry.ts` and export it from `src/index.ts`
- HTTP wrapper is `packages/api`, CLI is `packages/cli`
- `/api/sources`, `/api/sources/{id}/probe`, and `/api/sources/{id}/data`
  are the generic routes. Prefer extending those to adding a source-specific
  route
- Keys are read from env only, server-side. API and CLI never accept keys
  from callers
- Tests never hit the network unless `RUN_SMOKE=1` is set
- Test files sit next to their source file (`registry.test.ts` tests
  `registry.ts`)
- Use 2-3 word, domain-prefixed names for exports
- Pick one spelling per concept and use it everywhere

## Docs index

- `AGENTS.md` - agent instructions and repo map
- `docs/ARCHITECTURE.md` - how the pieces fit together
- `docs/SECURITY.md` - key handling and security checklist
- `docs/GLOSSARY.md` - plain-language terms
- `docs/RELEASING.md` - versioning and tags
- `docs/AGENT_CONTEXT.md` - this file
