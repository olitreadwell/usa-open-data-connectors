# Changelog

## Unreleased

- Repo: renamed the npm scope to `@open-data-connectors` across package names, imports, scripts, and docs
- Repo: deleted `packages/nz-sources` and `packages/stats-nz`; the API and CLI now read `packages/usa-sources`
- API: dropped `/api/digitalnz/media` and the three `/api/stats-nz` routes. `GET /api/sources/{id}/data` serves the parsed live payload for any registered adapter
- CLI: `usdata` replaces `nzdata`. Commands with no US equivalent (`media`, `catalogue`, `data`, `codelist`) are gone; `sources` and `probe` read the US registry
- Scripts: `build` compiles `usa-sources` and the CLI. The root `typecheck` script is gone; pre-commit runs `type-check`
- API: the Prometheus counter is now `usdata_http_requests_total`
- Ports: `python/` and `ruby/` still implement the NZ design; porting them to US sources is follow-up work
- DigitalNZ media search: `nzdata media --query <q> --type <type>` and
  `GET /api/digitalnz/media?q=<q>&type=<type>` for images, newspapers,
  videos, audio, literature, and artwork, with preview image URLs. Mirrored
  in the Python and Ruby ports (`search_digital_nz_media`)
- Template sync: `scripts/sync-from-template.mjs` + local
  `template-manifest.json` pull relevant quality-gate files from
  `olitreadwell/template` (issue templates, security checks, code review,
  audit docs) without importing the Next.js/pnpm stack
- CI: smoke tests probe DigitalNZ keyless (the stored key is rejected with
  HTTP 403); code review job runs only when an LLM key is configured
- TS: publishable npm build pipeline (`npm run build`, `tsconfig.build.json`,
  `publish-npm.yml`) - merged from `chore/ts/npm_build_pipeline/5`
- Ruby: CI matrix across Ruby 3.0 and 3.3 with gem build validation -
  merged from `chore/ruby/ci_matrix/7`
- Renovate: `renovate.json` with `config:recommended`
- Connectors: five new keyless adapters - ArcGIS Hub open data (Auckland, Wellington, Canterbury, NZTA), LAWA river quality sites, MfE Data Service, LRIS land and soil layers, Waka Kotahi holiday hotspots
- API: CORS enabled by default (`CORS_ORIGIN` override), per-IP rate limiting (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`), zod validation on the probe route, and an OpenAPI contract test that keeps routes and the spec in sync
- Ops: `CONTRIBUTING.md`, per-source connector reference in the README, `npm run audit`, and an advisory dependency audit job in CI
- CI: scheduled nightly live smoke workflow (`smoke.yml`) against the real NZ APIs, plus manual `workflow_dispatch`
- Dockerfile: containerized API with non-root user, health check, and run steps in the README
- API: structured JSON request logs, `/metrics` in Prometheus format, and optional Sentry error tracking (`SENTRY_DSN`, off by default)
- API: e2e test boots the real server over HTTP; error responses are clean JSON
- Docs: plain-language architecture, security, glossary, and releasing guides; `AGENTS.md` rewritten for LLM agents; JSDoc added to every public export
- CI: `v*` tags now create a GitHub Release with auto-generated notes
- Dependencies pinned to exact versions in every `package.json`; `npm run check` now enforces the coverage gate locally
- Python port: pinned deps + `uv.lock`, `ruff` lint, `mypy` type check, coverage gate in CI
- Ruby port: `rubocop` lint, SimpleCov coverage gate in CI (`bundle exec rake check`)
- `npm run check` now includes `format:check`; CI gained a format check job

## 0.1.0 (2026-08-24)

- Initial release: TypeScript connectors with HTTP API and CLI wrappers
- Python port (`nzdata` on PyPI) and Ruby port (`nzdata` gem)
