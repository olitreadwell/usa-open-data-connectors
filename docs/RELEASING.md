# Releasing

Plain steps for publishing a new version. All publishing happens on git
tags; there is no separate release machine.

## Before any release

1. Update `CHANGELOG.md` under "Unreleased". Write one line per change,
   in plain language.
2. Run the full check for the port you are shipping:
   - TypeScript: `npm run check`
   - Python: `cd python && .venv/bin/ruff check src tests && .venv/bin/mypy && .venv/bin/pytest`
   - Ruby: `cd ruby && bundle exec rake check`
3. Commit the version bump and changelog together.

## TypeScript / HTTP API

The TypeScript packages carry their own versions in `packages/*/package.json`.
Bump the package you are shipping, update the lockfile, and tag:

```sh
git tag v0.1.1
git push origin v0.1.1
```

The `v*` tag triggers two workflows:

- `.github/workflows/release.yml` creates a GitHub Release with notes.
- `.github/workflows/publish-npm.yml` runs `npm stage publish --workspaces`,
  which stages every public workspace but publishes nothing on its own.

### Approving a staged publish

`npm stage publish` needs npm 11.15 or later, so the workflow installs npm 11
first. A maintainer then approves each staged version. Open the `Staged
Packages` tab on npmjs.com, or work from a terminal:

```sh
npm stage list
npm stage view <stage-id>
npm stage approve <stage-id> --otp 123456
```

Approving needs an interactive 2FA code. The `NPM_TOKEN` secret must be a
granular access token with `Read and write (stage only)` access, which cannot
put a version live on its own.

## Python (`python/`)

1. Bump `version` in `python/pyproject.toml`
2. Commit
3. Tag and push:

```sh
git tag python-v0.2.0
git push origin python-v0.2.0
```

`.github/workflows/publish-python.yml` publishes to PyPI.

## Ruby (`ruby/`)

1. Bump `version` in `ruby/nzdata.gemspec`
2. Commit
3. Tag and push:

```sh
git tag ruby-v0.2.0
git push origin ruby-v0.2.0
```

`.github/workflows/publish-ruby.yml` publishes the gem.

## Keeping tags unique

Each port uses its own tag prefix:
- TypeScript: `v*`
- Python: `python-v*`
- Ruby: `ruby-v*`

`git tag` does not warn when a tag already exists. Check with
`git tag --list "python-v*"` before pushing.
