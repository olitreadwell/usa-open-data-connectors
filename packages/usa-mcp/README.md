# @usa-open-data-connectors/usa-mcp

An MCP server over the USA open data connector library. Point Claude
Code, Claude Desktop, or a ChatGPT connector at it and the model can list the
sources, check which ones are answering, and pull real data.

Every source in this library is keyless. Nothing here needs an account.

## Tools

| Tool                          | What it does                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `list_sources`                | Every source, with the id the other tools take.                                       |
| `probe_sources`               | Live fetch against each source, so you know a number is real and not a stale fixture. |
| `fetch_source`                | One source through its adapter.                                                       |
| `us_bls_unemployment`         | Monthly observations for one BLS series.                                              |
| `us_usgs_earthquakes`         | Earthquakes around the main Hawaiian islands.                                         |
| `us_cdc_county_obesity`       | County adult obesity prevalence from CDC PLACES.                                      |
| `us_ncei_annual_temperature`  | Contiguous US annual average temperature.                                             |
| `us_noaa_sea_level`           | Monthly mean sea level at a NOAA tide gauge.                                          |
| `us_treasury_interest_rates`  | Average interest rates on Treasury securities.                                        |
| `us_fema_declarations`        | FEMA disaster declarations, by year, incident, and state.                             |
| `us_openfda_food_recalls`     | openFDA food enforcement report counts.                                               |
| `us_usgs_peak_streamflow`     | Annual peak streamflow at a USGS site.                                                |
| `us_cpsc_product_recalls`     | CPSC product recalls by year, remedy, and country.                                    |
| `us_cfpb_consumer_complaints` | CFPB complaint counts and top products and companies.                                 |

`probe_sources` matters more than it looks. Every adapter falls back to a
committed fixture when the upstream API is slow, so a build never fails on a
flaky government host. That also means a number can be months old without
anyone noticing. Probe first when the freshness of the answer matters.

## Running it

```sh
npm install
npm run build
node dist/stdio.js
```

The bin is `usa-open-data-mcp`, so a global install gives you:

```sh
npx @usa-open-data-connectors/usa-mcp
```

## Wiring it into Claude Code

```sh
claude mcp add usa-open-data -- node /absolute/path/to/packages/usa-mcp/dist/stdio.js
```

Or in `.mcp.json` at the root of whatever project you want it in:

```json
{
  "mcpServers": {
    "usa-open-data": {
      "command": "node",
      "args": ["/absolute/path/to/packages/usa-mcp/dist/stdio.js"]
    }
  }
}
```

## Wiring it into Claude Desktop

Add the same block to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS).

## Wiring it into ChatGPT

ChatGPT connectors take a remote MCP endpoint, so this stdio server needs a
tunnel in front of it:

```sh
npx @modelcontextprotocol/inspector node dist/stdio.js   # inspect and test locally
cloudflared tunnel --url http://localhost:PORT            # then point the connector at it
```

## Adding a tool

Wrap the named function from `@$usa-open-data-connectors/usa-sources`, not the
adapter's `fetchLive()`. `fetchLive()` takes no query parameters, so a tool
built on it can only ever return the adapter's default slice. The named
functions carry the real parameters.

Add one entry to `US_QUERY_TOOLS` in
`src/usaOpenDataMcpServer.ts`, rebuild, and the tool appears.
