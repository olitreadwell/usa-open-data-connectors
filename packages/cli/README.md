# @usa-open-data-connectors/connectors-cli

Command line tool that prints US public data from the connector registry as JSON.

## What this package does

- Ships the `usdata` command.
- Lists every registered source adapter.
- Probes one source with a live fetch.
- Prints all output as JSON to stdout.
- Writes errors to stderr and sets the exit code.

## Install

```sh
npm install -g @usa-open-data-connectors/connectors-cli
```

## Quick start

```sh
usdata probe bls-unemployment-rate
```

## Commands

| Command | What it does |
| --- | --- |
| `usdata sources` | List every source adapter as JSON. |
| `usdata probe <id>` | Live probe one source and print the result. |
| `usdata help` | Print the help text. |
| `usdata -h` or `usdata --help` | Print the help text. |

## Notes and limits

- Every adapter is keyless. Nothing needs an account or an environment variable.
- Output goes to stdout as JSON. Errors go to stderr.
- The exit code is 0 on success and 1 on failure.
- `usdata probe <id>` exits 1 when the probe reports `ok: false`.
- An unknown command prints the error and the help text, then exits 1.
- `usdata probe` without an id prints `Usage: usdata probe <id>`, then exits 1.
- An unknown source prints `Unknown source: <id>`, then exits 1.
- A probe result carries the probe `id`, `name`, `auth`, an `ok` or `status` line, and a 120-character sample of the live data.
- Piping the output to a tool like `head` closes stdout early. The CLI exits 0 instead of crashing.
- The CLI never accepts keys from callers. Keys come from the environment at process start, server-side.

## Data sources and licences

The CLI reads the same US federal sources as `@usa-open-data-connectors/usa-sources`. That package's
README lists every publisher, source URL, and data licence. The CLI stores no data. Each command returns
whatever the source answers at call time.

## Package licence

MIT. See LICENSE.

## Links

- npm: https://www.npmjs.com/package/@usa-open-data-connectors/connectors-cli
- source: https://github.com/olitreadwell/usa-open-data-connectors/tree/main/packages/cli
- docs: ../usa-sources/README.md
