# @usa-open-data-connectors/usa-mcp

Model Context Protocol (MCP) server that exposes the USA open data connectors to Claude, ChatGPT, and other MCP clients.

## What this package does

- Runs an MCP server over stdio.
- Lists every US data source in the connector registry.
- Probes sources with a live fetch.
- Fetches one source through its adapter.
- Adds one query tool per named function in the connector library.

## Install

```sh
npm install @usa-open-data-connectors/usa-mcp
```

## Quick start

```sh
npm install
npm run build
claude mcp add usa-open-data -- node "$(pwd)/dist/stdio.js"
```

## Tools

| Tool | What it does |
| --- | --- |
| `list_sources` | Every source, with the id the other tools take. |
| `probe_sources` | Live fetch against each source, so you know a number is real and not a stale fixture. |
| `fetch_source` | One source through its adapter. |
| `us_bls_unemployment` | Monthly observations for one Bureau of Labor Statistics series. |
| `us_usgs_earthquakes` | Earthquakes around the main Hawaiian islands. |
| `us_cdc_county_obesity` | County adult obesity prevalence from CDC PLACES. |
| `us_ncei_annual_temperature` | Contiguous US annual average temperature. |
| `us_noaa_sea_level` | Monthly mean sea level at a NOAA tide gauge. |
| `us_treasury_interest_rates` | Average interest rates on Treasury securities. |
| `us_fema_declarations` | FEMA disaster declarations, by year, incident, and state. |
| `us_openfda_food_recalls` | openFDA food enforcement report counts. |
| `us_usgs_peak_streamflow` | Annual peak streamflow at a USGS site. |
| `us_cpsc_product_recalls` | CPSC product recalls by year, remedy, and country. |
| `us_cfpb_consumer_complaints` | CFPB complaint counts and top products and companies. |

## Notes and limits

- `probe_sources` matters more than it looks. Every adapter falls back to a committed fixture when the upstream API is slow, so a build never fails on a flaky government host. A number can be months old without anyone noticing. Probe first when the freshness of the answer matters.
- Every source in this library is keyless. No tool needs an account.
- Claude Desktop reads the same server block from `claude_desktop_config.json`. On macOS that file is at `~/Library/Application Support/Claude/claude_desktop_config.json`.
- ChatGPT connectors take a remote MCP endpoint. Put a tunnel in front of the stdio server, for example `cloudflared tunnel --url http://localhost:PORT`, then point the connector at the tunnel URL.
- Test the server locally with the MCP inspector before you wire it into a client.
- To add a tool, wrap the named function from `@usa-open-data-connectors/usa-sources`, not the adapter's `fetchLive()`. `fetchLive()` takes no query parameters, so a tool built on it can only return the adapter's default slice. Add one entry to `US_QUERY_TOOLS` in `src/usaOpenDataMcpServer.ts`, then rebuild.

## Data sources and licences

The tools read the same US federal sources as `@usa-open-data-connectors/usa-sources`. That package's
README lists every publisher, source URL, and data licence. The server stores no data. Each tool returns
whatever the source answers at call time.

## Package licence

MIT. See LICENSE.

## Links

- npm: https://www.npmjs.com/package/@usa-open-data-connectors/usa-mcp
- source: https://github.com/olitreadwell/usa-open-data-connectors/tree/main/packages/usa-mcp
- docs: ../usa-sources/README.md
