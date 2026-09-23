# Contributing

Thanks for contributing to USA Open Data Connectors.

This guide explains how to set up the repo, run the checks, and open a
pull request (PR). It is written in plain language. If anything is
unclear, open an issue and ask.

## Repo map

One design, three languages.

- `packages/` - the TypeScript source of truth. This is where the source
  adapters, the HTTP API, and the CLI live.
- `python/` - a Python port (package name `nzdata`), still on the New
  Zealand connector design.
- `ruby/` - a Ruby port (gem name `nzdata`), still on the New Zealand
  connector design.

A new US source starts in `packages/usa-sources` and is then exposed through
the API and the CLI. See `docs/ARCHITECTURE.md` for the full map and
`docs/GLOSSARY.md` for terms.

## Set up your machine

### TypeScript

1. Install Node.js. The repo pins the version in `.nvmrc`. If you use
   `nvm`, run `nvm use` first.
2. Run `npm ci` to install dependencies. This installs the exact
   versions from `package-lock.json`.

### Python

1. Install [uv](https://docs.astral.sh/uv/).
2. Run `cd python && uv sync`. This creates `.venv/` and installs the
   pinned dependencies from `uv.lock`.

### Ruby

1. Install Ruby and [Bundler](https://bundler.io/).
2. Run `cd ruby && bundle install`. This installs the pinned
   dependencies from `Gemfile.lock`.

## Quality gates

Run the checks before you finish any change. The checks must pass on
your machine and in CI (continuous integration).

### TypeScript

```sh
npm run check
```

`npm run check` runs format, lint, type-check, and tests with coverage.

### Python

```sh
cd python && .venv/bin/ruff check src tests && .venv/bin/mypy && .venv/bin/pytest
```

### Ruby

```sh
cd ruby && bundle exec rake check
```

### Rules that apply everywhere

- Coverage stays at or above 60%. Coverage is the share of code that
  tests exercise.
- No `console.log` in committed code. Use `warn` or `error` instead.
- No `any` escape hatches. Use precise types. `any` is a TypeScript type
  that turns off type checking.
- Every exported function has an explicit return type.
- Every export has a doc comment above it.
- Fixtures are real snapshots from the live APIs. Each one records the
  window it covers, either in a note inside the file or in its filename.
- Tests never hit the network unless `RUN_SMOKE=1` is set.
- Never fabricate a data source, a stat, or a "this worked" claim.

## Branch naming

Create a branch before you start. Use this pattern:

```
<type>/<domain>/<snake_case_description>/<issue_id>
```

- `<type>` - a Conventional Commits type: `feat`, `fix`, `chore`,
  `refactor`, `docs`, `test`, `perf`, `build`, `ci`, or `style`.
- `<domain>` - the app or area you are changing.
- `<snake_case_description>` - a short description in snake_case.
- `<issue_id>` - the issue or ticket number, when one exists.

Example: `docs/contributing_guide/8`.

## Pull requests

- Keep PRs small. Aim for 100 to 300 lines of change.
- Commit early and often. Keep each commit atomic: one logical change
  per commit.
- Use Conventional Commits for messages. Examples: `feat:`, `fix:`,
  `docs:`, `chore:`.
- When a change affects the shared design, update the adapters, the API, and
  the CLI together.
- Run the quality gates above before you push.
- Open the PR with `gh pr create`. Describe what changed and why.

## Smoke tests

Unit tests use committed fixtures, so they run offline. Smoke tests hit
the real APIs. They are opt-in.

TypeScript:

```sh
npm run test:smoke
```

Python:

```sh
cd python && RUN_SMOKE=1 .venv/bin/pytest tests/test_smoke.py
```

Ruby:

```sh
cd ruby && RUN_SMOKE=1 bundle exec rake check
```

The registered connectors are keyless, so the TypeScript smoke tests need no
environment variable. Keys, when a source needs one, are read from the
environment at process start. See `README.md` for the current list.
