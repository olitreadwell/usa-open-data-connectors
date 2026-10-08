# USA Open Data Connectors

TypeScript connectors for US public data in `packages/usa-sources`, with an
HTTP API and a CLI on top of them.

The repo was copied from `nz-open-data-connectors`. The TypeScript side has
been converted: the npm scope is `@usa-open-data-connectors`, the NZ packages are
gone, and the API and CLI read the US registry. The Python and Ruby ports in
`python/` and `ruby/` still implement the NZ design.

## Adapters

Twenty-two adapters are registered. Every one is keyless and has a committed
fixture captured from the live service.

| Source | Adapter id | Status |
| --- | --- | --- |
| BLS | `bls-unemployment-rate` | live, keyless, fixture committed |
| USGS earthquakes | `usgs-hawaii-earthquakes` | live, keyless, fixture committed |
| CDC PLACES | `cdc-county-obesity` | live, keyless, fixture committed |
| NOAA NCEI | `ncei-annual-temperature` | live, keyless, fixture committed |
| NOAA CO-OPS | `noaa-sea-level` | live, keyless, fixture committed |
| US Treasury | `treasury-avg-interest-rate` | live, keyless, fixture committed |
| FEMA | `fema-disaster-declarations` | live, keyless, fixture committed |
| openFDA | `openfda-food-recalls` | live, keyless, fixture committed |
| USGS streamflow | `usgs-peak-streamflow` | live, keyless, fixture committed |
| CPSC | `cpsc-product-recalls` | live, keyless, fixture committed |
| CFPB | `cfpb-consumer-complaints` | live, keyless, fixture committed |
| US Treasury | `treasury-debt-to-penny` | live, keyless, fixture committed 2026-10-05 |
| SEC EDGAR | `sec-edgar-filings` | live, keyless (User-Agent header), fixture committed 2026-10-05 |
| FDIC | `fdic-bank-directory` | live, keyless, fixture committed 2026-10-05 |
| ClinicalTrials.gov | `clinicaltrials-studies` | live, keyless, fixture committed 2026-10-05 |
| National Weather Service | `nws-point-forecast` | live, keyless (User-Agent header), fixture committed 2026-10-05 |
| USAspending | `usaspending-agencies` | live, keyless, fixture committed 2026-10-05 |
| EPA Envirofacts | `epa-envirofacts-facilities` | live, keyless, fixture committed 2026-10-05 |
| NCBI PubMed | `ncbi-pubmed-search` | live, keyless, fixture committed 2026-10-05 |
| CDC Socrata catalogue | `cdc-socrata-catalogue` | live, keyless, fixture committed 2026-10-05 |
| HealthData.gov | `healthdata-socrata-catalogue` | live, keyless, fixture committed 2026-10-05 |
| Bureau of Transportation Statistics | `bts-transportation-stats` | live, keyless, fixture committed 2026-10-05 |
| Census Bureau Data API | - | not started |
| api.data.gov | - | not started |
| BEA | - | not started |
| EIA | - | not started |

## Remaining work

- [x] Shared HTTP layer (`httpGet`): one User-Agent, 30 second timeout,
      `retryable` on 429, 5xx and network failures
- [ ] Return licence and attribution metadata per record, instead of leaving
      the publisher's page as the only source
- [ ] Port `python/` and `ruby/` to the US sources, or delete them
- [x] Replace the NZ entries in `docs/CONNECTOR_DISCOVERY.md` with US ones
- [ ] Add the remaining pending adapters (Census, api.data.gov, BEA, EIA), each verified live before commit
- [x] Add each new adapter to the registry so the API and CLI pick it up
