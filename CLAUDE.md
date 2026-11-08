Read `CODING_STANDARDS.md` and `AGENTS.md` before changing behaviour.

# CLAUDE.md

Stack notes for this repo. `AGENTS.md` holds the conventions and quality
gates; this file covers the toolchain.

- Node 24.21.0. `.nvmrc` is the source of truth.
- npm workspaces with a committed `package-lock.json`. CI and the Docker
  build run `npm ci`.
- TypeScript 6.0.3, ESM only. `packages/config-typescript` turns on `strict`
  and `noUncheckedIndexedAccess`.
- `packages/usa-sources`, `packages/usa-mcp`, and `packages/cli` build with
  `tsc -p tsconfig.build.json`. `packages/api` runs from source under `tsx`
  and has no build step.
- Tests run on Vitest 5.0.5. Coverage gates live in each package's
  `vitest.config.ts` (v8, 60% for lines, functions, branches, and
  statements).
- The HTTP layer is Hono. The OpenAPI document is
  `packages/api/src/openapi.ts`, served at `/openapi.json`, with Swagger UI
  at `/docs`.
- The Dockerfile copies the workspace, runs `npm ci`, starts the API on port
  8787, and checks `/health`.
- `python/` and `ruby/` hold the earlier ports. They are not npm workspaces
  and do not take part in `npm run check`.
- This repo has no Next.js app, Tailwind, or Playwright suite. It is a
  TypeScript connector workspace.
