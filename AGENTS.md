# Agent instructions

TypeScript connectors for US public data. npm workspaces, one package per
concern. Read `docs/ARCHITECTURE.md` for the plain-language map,
`docs/GLOSSARY.md` for terms.

## Repo map

- `packages/usa-sources` - one adapter per US data source (BLS unemployment
  rate, USGS earthquakes) behind a uniform interface, plus the registry
- `packages/api` - HTTP wrapper (Hono), OpenAPI spec, Swagger UI
- `packages/cli` - `usdata` command line tool
- `packages/config-eslint`, `packages/config-typescript` - shared config
- `python/` - Python port (`nzdata` on PyPI), still on the NZ design
- `ruby/` - Ruby port (`nzdata` gem), still on the NZ design
- `docs/` - architecture, security, glossary, releasing

## Commands

```sh
npm run check          # format + lint + type-check + tests with coverage
npm run test:smoke     # live tests against real APIs (needs RUN_SMOKE=1)
cd python && .venv/bin/ruff check src tests && .venv/bin/mypy && .venv/bin/pytest
cd ruby && bundle exec rake check
```

`npm run build` compiles `usa-sources` and the CLI, in that order: the API and
CLI type-check against `packages/usa-sources/dist`, so build before
type-checking.

Run `npm run check` before finishing any TypeScript change. Python and
Ruby changes run their own gates.

## Quality gates

- No `console.log` in committed code (warn/error allowed)
- No `any` escape hatches
- Every exported function has an explicit return type
- Every export has a doc comment above it
- 60% coverage threshold per package, enforced by `npm run check`
- Python: `ruff` + `mypy` + pytest coverage gate, deps pinned in `uv.lock`
- Ruby: `rubocop` + SimpleCov gate via `bundle exec rake check`
- Never fabricate a data source, a stat, or a "this worked" claim
- Fixtures are real snapshots from the live APIs. Each one records the window
  it covers, in a note inside the file or in its filename

## Conventions

- Adapters live in `packages/usa-sources`. A new adapter goes in its own
  module, gets registered in `src/registry.ts`, and is exported from
  `src/index.ts`
- The HTTP wrapper is `packages/api`, the CLI is `packages/cli`
- `/api/sources`, `/api/sources/{id}/probe`, and `/api/sources/{id}/data`
  are the generic routes over the registry. Prefer extending those over
  adding a source-specific route
- Keys are read from env only, server-side. The API and CLI never accept
  keys from callers
- Tests never hit the network unless `RUN_SMOKE=1` is set
- Test files sit next to their source file (`registry.test.ts` tests
  `registry.ts`)
- Use 2-3 word, domain-prefixed names for exports
  (`getUsDataSource`, not `get`)
- Pick one spelling per concept and use it everywhere (`seriesId`, not
  `dataset` in one place and `flow` in another)
- When a change touches the adapter contract, update `usa-sources`, the API,
  and the CLI in the same change

## Docs for humans and agents

- `docs/ARCHITECTURE.md` - how the pieces fit together
- `docs/SECURITY.md` - key handling and security checklist
- `docs/GLOSSARY.md` - plain-language terms
- `docs/RELEASING.md` - versioning and tags
- `docs/AGENT_CONTEXT.md` - handoff context for new agent threads
- `CONTRIBUTING.md` - how to contribute, set up, and open a PR

Write docs in plain language. Short sentences. Define acronyms on first
use. The audience includes ESL readers and neurodivergent readers.
