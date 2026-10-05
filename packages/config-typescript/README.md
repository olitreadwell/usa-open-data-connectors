# @usa-open-data-connectors/config-typescript

Internal package. It is not published to npm.

Shared TypeScript compiler settings for the packages in this repo.

## What this package does

- Exports a base tsconfig for every package.
- Exports a library tsconfig that extends the base config.
- Turns on strict mode, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Sets the library build to write declarations and source maps into `dist`.

## Install

This package is consumed as a workspace dependency. It never installs from npm. Add it to a package's
`devDependencies`, then extend the config from that package's `tsconfig.json`.

```json
{
  "extends": "@usa-open-data-connectors/config-typescript/library.json"
}
```

## Quick start

```sh
npx tsc --noEmit
```

## Exports

| Export | What it holds |
| --- | --- |
| `base.json` | Strict shared compiler options for every package. |
| `library.json` | Extends `base.json`, sets the source root and `dist` output, and turns on declarations and source maps. |

## Notes and limits

- `base.json` targets ES2022, uses `module: "esnext"` and `moduleResolution: "bundler"`.
- `base.json` sets `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`.
- `base.json` excludes `node_modules`, `dist`, `.next`, and `.turbo`.
- `library.json` includes `src/**/*.ts` and `src/**/*.tsx`. It excludes tests, specs, and stories.
- `library.json` sets `rootDir` to `./src` and `outDir` to `./dist`.
- The package declares its files as `*.json`. It has no `exports` field.

## Data sources and licences

None. This package ships no data.

## Package licence

MIT. See LICENSE.

## Links

- source: https://github.com/olitreadwell/usa-open-data-connectors/tree/main/packages/config-typescript
- docs: ../../README.md
