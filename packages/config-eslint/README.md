# @usa-open-data-connectors/config-eslint

Internal package. It is not published to npm.

Shared ESLint flat configuration for the TypeScript packages in this repo.

## What this package does

- Exports one base flat config for a TypeScript package.
- Turns on the typescript-eslint strict and stylistic rule sets.
- Sets the repo rules: no `console.log`, no `any`, explicit return types, and JSDoc on exports.
- Adds plugins for JSDoc, unused imports, and import order.
- Ignores build output, dependencies, and coverage directories.

## Install

This package is consumed as a workspace dependency. It never installs from npm. Add it to a package's
`devDependencies`, then import the config from that package's `eslint.config.mjs`.

```js
import config from '@usa-open-data-connectors/config-eslint/base';

export default [...config];
```

## Quick start

```sh
npx eslint .
```

## Exports

| Export | What it holds |
| --- | --- |
| `./base` | The base flat config. `base.js` applies the shared rules to TypeScript source. |

## Notes and limits

- `base.js` uses the typescript-eslint typed rules, so it needs a tsconfig that covers the linted files.
- The base config ignores `node_modules/`, `dist/`, `.next/`, `.turbo/`, `coverage/`, and `storybook-static/`.
- `no-console` is an error, with `console.warn` and `console.error` allowed.
- `@typescript-eslint/no-explicit-any` is an error. `@typescript-eslint/explicit-function-return-type` is an error for named functions.
- `jsdoc/require-jsdoc`, `jsdoc/require-param`, and `jsdoc/require-returns` are warnings for exported functions.
- The `package.json` exports field also declares `./nextjs` and `./react-library`. Neither file is in this repo, so those entries do not resolve. Do not depend on them.

## Data sources and licences

None. This package ships no data.

## Package licence

MIT. See LICENSE.

## Links

- source: https://github.com/olitreadwell/usa-open-data-connectors/tree/main/packages/config-eslint
- docs: ../../README.md
