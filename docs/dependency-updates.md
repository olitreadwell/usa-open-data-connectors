# Dependency updates

Renovate opens the pull requests that bump dependencies. It reads its
settings from `renovate.json` at the repo root and runs against `main`.

Dependabot is not enabled. Two bots would open competing pull requests for
the same package, and Renovate already covers every ecosystem in this repo.

## What Renovate watches

- npm workspaces: the root `package.json`, `packages/*`, and the shared
  config packages
- GitHub Actions: every file under `.github/workflows/`, pinned to a commit
  SHA so a moved tag cannot change what CI runs
- Python port: `python/pyproject.toml` and `python/uv.lock`
- Docker: the `node` base image in `Dockerfile`
- Node version: `.nvmrc`, which is what `actions/setup-node` reads in CI

One gap. Renovate's Bundler support reads `Gemfile` lines only, and this
repo declares its gems in `ruby/nzdata.gemspec`. So `csv`, `rexml`,
`minitest`, `rake`, `rubocop`, and `simplecov` get no update pull requests.
Listing them in `ruby/Gemfile` as well would fix it, at the cost of
declaring each gem twice.

## When it runs

Updates open once a week, Monday before 06:00 Pacific/Auckland time.
Related bumps arrive as one pull request rather than one per package:

- `github actions` collects every action bump
- `node version` keeps `.nvmrc`, `engines`, and the Docker base image together
- `npm dependencies` and `npm dev dependencies` collect runtime and tooling bumps
- `python dependencies` collects the port's pins
- `docker base image` covers Dockerfile entries that are not the Node image

A major version bump never shares a pull request with a smaller one, and it
carries the `major update` label so it stays visible until someone reads it.
A security advisory skips the weekly window, opens straight away, and
carries the `security` label.

Renovate also runs lock file maintenance on the first day of each month.
That refreshes `package-lock.json` and `uv.lock` without changing a declared
version.

## Merging them

Nothing is set to auto-merge. `main` has no branch protection, so a bot
could merge a bump before any check ran. Every pull request is merged by
hand, after `npm run check` and the language gates pass.

To turn on auto-merge for low-risk bumps, add required status checks on
`main` first. After that the config can allow it for patch and minor
updates.

When a pull request conflicts because another one merged first, Renovate
rebases it on the next run. The `rebaseWhen: behind-base-branch` setting
keeps that automatic.

## Working the queue

Renovate opens one issue titled "Dependency Dashboard". It lists every
pending update so you can see the whole queue without reading PR by PR,
and you can tick a box there to open a single update straight away.

## Checking a config change

`renovate.json` is the source of truth. After editing it, run the validator
before pushing:

```sh
npx --yes --package renovate renovate-config-validator --strict renovate.json
```

To see what Renovate would do without touching GitHub, run a dry run
against a scratch clone:

```sh
git clone --local . /tmp/renovate-check
cd /tmp/renovate-check
LOG_LEVEL=debug npx --yes --package renovate renovate --platform=local --dry-run=full
```

The log lists every detected dependency and the branch name it would open,
which is how the grouping rules above were checked.
