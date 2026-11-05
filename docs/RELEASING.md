# Releasing

Plain steps for publishing a new version. All publishing happens on git
tags; there is no separate release machine.

## Before any release

1. Update `CHANGELOG.md` under "Unreleased". Write one line per change,
   in plain language.
2. Run the full check: `npm run check`.
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
- `.github/workflows/publish-npm.yml` stages each public workspace whose
  version is not on npm yet. It publishes nothing on its own.

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

## Keeping tags unique

TypeScript releases use the `v*` tag prefix. `git tag` does not warn when a
tag already exists, so check `git tag --list "v*"` before pushing.
