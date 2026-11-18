# USA Open Data Connectors

TypeScript connectors for US public data in `packages/usa-sources`, with an
HTTP API and a CLI on top of them.

The repo was copied from `nz-open-data-connectors`. The TypeScript side has
been converted: the npm scope is `@usa-open-data-connectors`, the NZ packages
are gone, and the API and CLI read the US registry. The earlier Python and
Ruby copies were removed on 2026-11-05.

## Adapters

Adapters are registered. Every one is keyless and has a committed
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
| NIH RePORTER | `nih-reporter-projects` | live, keyless, fixture committed 2026-11-07 |
| CDC Socrata catalogue | `cdc-socrata-catalogue` | live, keyless, fixture committed 2026-10-05 |
| HealthData.gov | `healthdata-socrata-catalogue` | live, keyless, fixture committed 2026-10-05 |
| Bureau of Transportation Statistics | `bts-transportation-stats` | live, keyless, fixture committed 2026-10-05 |
| EstimateTax | `estimatetax-income-tax` | live, keyless, fixture committed 2026-10-18 |
| Callook.info | `callook-callsigns` | live, keyless, fixture committed 2026-10-21 |
| College Scorecard | `college-scorecard-institutions` | live, keyless, fixture committed 2026-10-15 (sampled) |
| New York City Open Data | `nyc-open-data-catalogue` | live, keyless, fixture committed 2026-10-19 |
| PublicDataHub | `publicdatahub-hospital-quality` | live, keyless, fixture committed 2026-10-21 |
| Portland Streetcar | `nextbus-transit-vehicles` | live, keyless, fixture committed 2026-10-22 |
| Office of the Federal Register | `federal-register-documents` | live, keyless, fixture committed 2026-11-08 |
| NHTSA | `nhtsa-vehicle-models` | live, keyless, fixture committed 2026-11-08 |
| Federal Communications Commission | `fcc-socrata-catalogue` | live, keyless, fixture committed 2026-11-08 |
| New York State Open Data | `ny-state-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Chicago Data Portal | `chicago-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Seattle Open Data | `seattle-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Texas Open Data | `texas-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Colorado Open Data | `colorado-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Washington State Open Data | `washington-state-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Michigan Open Data | `michigan-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Oregon Open Data | `oregon-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Pennsylvania Open Data | `pennsylvania-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Illinois Open Data | `illinois-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| New Jersey Open Data | `new-jersey-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Vermont Open Data | `vermont-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| Los Angeles Open Data | `los-angeles-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| San Francisco Open Data | `san-francisco-open-data-catalogue` | live, keyless, fixture committed 2026-11-08 |
| California Open Data | `california-open-data-catalogue` | live, keyless CKAN, fixture committed 2026-11-08 |
| Census Bureau Data API | - | keyed; not supported (missing-key redirect on 2026-11-17) |
| api.data.gov | - | not a dataset source; shared key and catalogue service |
| BEA | - | not supported; BEA docs require a 36-character UserID; no-key probe was inconclusive (empty HTTP 200 on 2026-11-17) |
| EIA | - | keyed; not supported (403 API_KEY_MISSING on 2026-11-17) |

## Remaining work

- [x] Shared HTTP layer (`httpGet`): one User-Agent, 30 second timeout,
      `retryable` on 429, 5xx and network failures
- [x] Return source-supplied licence and attribution metadata per record: the
      Socrata and CKAN catalogue entries carry `licenceUrl` and `attribution`, and
      `publicdatahub-hospital-quality` carries licence, agency, and dataset
      provenance
- [x] Add licence and attribution metadata to the other adapters: every
      registered adapter now has source-level `licence` and `attribution` in
      `packages/usa-sources/src/registry.ts`, returned by `/api/sources`,
      `usdata sources`, and MCP `list_sources`. The Socrata, CKAN, and
      PublicDataHub adapters still carry per-record values where the source
      supplies them
- [x] Replace the NZ entries in `docs/CONNECTOR_DISCOVERY.md` with US ones
- [x] Add the remaining keyless adapter identified in this pass: California is
      registered as `california-open-data-catalogue` through its keyless CKAN
      search endpoint. The checked Census ACS endpoint, the BEA API, and the
      EIA API v2 stay off the adapter list because they require a key. The
      evidence in `docs/CONNECTOR_DISCOVERY.md` does not cover every endpoint at
      those agencies
- [x] Decide whether to support keyed sources: the library stays keyless-only.
      Every registered adapter declares `auth: 'none'`, a registry test enforces
      that, and no adapter reads the optional `apiKey` seam. The MCP fetch tool
      takes no key. See "Keyed sources" below
- [ ] Resolve and recheck the Census endpoint recorded on 2026-11-08. That note
      has no URL. The later ACS 5-year check on 2026-11-17 is a different check.
      Reason: this is the only Census check that cannot be identified from the
      record. No exhaustive keyless search at Census, BEA, or EIA is planned
- [x] Add each new adapter to the registry so the API and CLI pick it up

## Keyed sources

Decision on 2026-11-19: the registered library stays keyless-only. No keyed
adapter ships, and none is planned. A keyed source needs a separate decision and
a key-handling design before any adapter work starts.

Evidence:

- Every entry in `US_DATA_SOURCES` in
  `packages/usa-sources/src/registry.ts` declares `auth: 'none'`, and
  `packages/usa-sources/src/registry.test.ts` fails if a registered adapter is
  keyed.
- No adapter reads the optional `UsFetchOptions.apiKey`. The registry and the
  API's server-side per-source key options can pass it, but no registered
  adapter consumes it. The MCP `fetch_source` tool does not accept a key.
  `packages/usa-sources/src/apiKey.ts` trims a key that is set but blank, so an
  empty value is treated as unset.
- Census has two checks. The 2026-11-08 check recorded a missing-key redirect
  but no URL. The 2026-11-17 check named the ACS 5-year endpoint and got the
  same redirect.
- The FBI Crime Data Explorer check answered HTTP 403 with `API_KEY_MISSING` on
  2026-11-08.
- The EIA API v2 answered HTTP 403 with `API_KEY_MISSING` on 2026-11-17.
- BEA's API documentation requires a 36-character UserID. The no-key request on
  2026-11-17 returned an empty HTTP 200, which does not show why. The key
  requirement rests on BEA's documentation, not on that probe.
- The checks in `docs/CONNECTOR_DISCOVERY.md` cover the named URLs and terms
  only. They do not cover every endpoint at each agency.

Why this is the decision:

- A keyed adapter needs an environment variable at process start and a secret
  in every deployment that runs it. That is a separate operational change.
- The offline suite can prove that a configured key reaches an adapter by using
  a fake key and a fetch stub. It cannot prove that the live service accepts the
  key without a real secret on the test machine.

What remains:

- Resolve the missing URL in the 2026-11-08 Census note and recheck that endpoint
  without a key. That is source discovery, not a change to the keyed-source
  policy.
