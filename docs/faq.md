# FAQ

Questions that come up about this repo.

## Do I need an API key?

No. All 22 adapters work keyless and need no environment variable. Three
sources ask callers to identify themselves: the SEC EDGAR, National Weather
Service and CFPB adapters send their own descriptive `User-Agent` header from
inside the adapter, replacing the default one, so callers send nothing extra.

## Can I reuse the data?

The MIT licence here covers the code, not the data. Most of this data comes
from US federal agencies, and works of the US federal government are generally
not subject to copyright in the United States, so it is effectively public
domain there. Two caveats. The NCBI and NLM services attach their own terms to
some content. And public domain in the US is not the same as public domain
everywhere, so check your own jurisdiction before republishing. Credit the
publisher rather than this library.

## Why do the tests use fixtures instead of the live APIs?

Fixtures make the suite fast, offline, and the same on every machine. Each
fixture is a real snapshot of a live response, stored in
`packages/usa-sources/src/fixtures/`. Live calls are opt-in through
`npm run test:smoke` with `RUN_SMOKE=1`. If a source changes shape, the live
smoke run is what catches it.

## Will calling the API get me blocked?

Every adapter sends a descriptive `User-Agent`
(`usa-open-data-connectors (Language=TypeScript)`), waits at most 30 seconds,
and marks HTTP 429, HTTP 5xx and network failures as `retryable` on the thrown
`UsSourceApiError`. Nothing retries automatically, so the caller decides the
backoff. BLS is the one source with a published limit: 25 series queries a day
keyless, 500 with a registered key.

## Can I use this from Python, R, or Julia?

Yes, two ways. Run the HTTP API (`npm run dev:api`) and call
`GET /api/sources/:id/data`, or run the CLI and read JSON from stdout. There
is also a Python port and a Ruby port in `python/` and `ruby/`, neither
published yet, and both still implement the New Zealand connectors rather
than the US ones.

## How do I add a source?

Write one adapter in `packages/usa-sources/src`, give it a live fetch through
`httpGet`, a strict parse, and a committed fixture, then register it in
`packages/usa-sources/src/registry.ts` and export it from
`packages/usa-sources/src/index.ts`. The API and the CLI pick it up from the
registry. `docs/ARCHITECTURE.md` describes the interface.

## A source has moved or died. How do I report it?

Open an issue with the adapter id, the command you ran, and the response you
saw. Dead sources are worth knowing about even when we cannot fix them; see
the "Remaining work" section in `COUNTRY.md`.

## Who maintains this?

Oli Treadwell (`@olitreadwell`). Careful issues and pull requests are welcome.
The open work is listed in `COUNTRY.md` and `docs/AGENT_CONTEXT.md`.
