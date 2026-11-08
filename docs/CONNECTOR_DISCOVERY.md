# Connector discovery notes (US)

Findings from the US source passes. Thirty-three keyless adapters are built and
verified against live APIs, and each has a fixture committed from the same
endpoint.

Eleven adapters were added on 2026-10-05. Those eleven were probed live that
day with `curl`, and their fixtures were captured then. The earlier eleven
were captured between 2026-09-23 and 2026-10-03. Six more adapters were added
after those, through 2026-10-22. NIH RePORTER was added on 2026-11-07. Four
adapters were added on 2026-11-08: Federal Register documents, NHTSA vehicle
models, the FCC Socrata catalogue, and the New York State Open Data catalogue.

## Adapters built

| Adapter | Source | Endpoint | Fixture |
| --- | --- | --- | --- |
| `bls-unemployment-rate` | Bureau of Labor Statistics | `https://api.bls.gov/publicAPI/v2/timeseries/data` | `bls-unemployment-rate.json` |
| `callook-callsigns` | Callook.info | `https://callook.info/[callsign]/json` | `callook-callsigns-2026-10-21.json` |
| `college-scorecard-institutions` | College Scorecard | `https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip` | `college-scorecard-institutions-2026-10-15-sampled.csv` |
| `usgs-hawaii-earthquakes` | US Geological Survey | `https://earthquake.usgs.gov/fdsnws/event/1/query` | `usgs-hawaii-earthquakes.json` |
| `cdc-county-obesity` | CDC PLACES | `https://data.cdc.gov/resource/swc5-untb.json` | `cdc-county-obesity-2026-09-25.json` |
| `ncei-annual-temperature` | NOAA NCEI | `https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance` | `ncei-annual-temperature-2026-09-26.csv` |
| `noaa-sea-level` | NOAA CO-OPS | `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` | `noaa-sea-level-2026-09-27.json` |
| `treasury-avg-interest-rate` | US Treasury | `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates` | `treasury-avg-interest-rate-2026-09-28.json` |
| `fema-disaster-declarations` | FEMA | `https://www.fema.gov/api/open/v1/FemaWebDisasterDeclarations` | `fema-disaster-declarations-2026-09-29.json` |
| `openfda-food-recalls` | openFDA | `https://api.fda.gov/food/enforcement.json` | `openfda-food-recalls-2026-09-30.json` |
| `usgs-peak-streamflow` | USGS Water Data | `https://api.waterdata.usgs.gov/ogcapi/v0/collections/peak/items` | `usgs-peak-streamflow-2026-10-01.json` |
| `cpsc-product-recalls` | CPSC | `https://www.saferproducts.gov/RestWebServices/Recall` | `cpsc-product-recalls-2026-10-02.json` |
| `cfpb-consumer-complaints` | CFPB | `https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/` | `cfpb-consumer-complaints-2026-10-03.json` |
| `treasury-debt-to-penny` | US Treasury | `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny` | `treasury-debt-to-penny-2026-10-05.json` |
| `sec-edgar-filings` | SEC EDGAR | `https://data.sec.gov/submissions/CIK0000320193.json` | `sec-edgar-filings-2026-10-05.json` |
| `fdic-bank-directory` | FDIC | `https://banks.data.fdic.gov/api/institutions` | `fdic-bank-directory-2026-10-05.json` |
| `clinicaltrials-studies` | ClinicalTrials.gov | `https://clinicaltrials.gov/api/v2/studies` | `clinicaltrials-studies-2026-10-05.json` |
| `nws-point-forecast` | National Weather Service | `https://api.weather.gov/points/38.8894,-77.0352` | `nws-point-forecast-2026-10-05.json` |
| `usaspending-agencies` | USAspending | `https://api.usaspending.gov/api/v2/references/toptier_agencies/` | `usaspending-agencies-2026-10-05.json` |
| `epa-envirofacts-facilities` | EPA Envirofacts | `https://data.epa.gov/efservice/TRI_FACILITY/STATE_ABBR/RI/rows/0:9/JSON` | `epa-envirofacts-facilities-2026-10-05.json` |
| `ncbi-pubmed-search` | NCBI PubMed | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` | `ncbi-pubmed-search-2026-10-05.json` |
| `nih-reporter-projects` | NIH RePORTER | `https://api.reporter.nih.gov/v2/projects/search` | `nih-reporter-projects-fy2025-2026-11-07.json` |
| `cdc-socrata-catalogue` | CDC Socrata | `https://data.cdc.gov/api/views.json` | `cdc-socrata-catalogue-2026-10-05.json` |
| `healthdata-socrata-catalogue` | HealthData.gov | `https://healthdata.gov/api/views.json` | `healthdata-socrata-catalogue-2026-10-05.json` |
| `bts-transportation-stats` | Bureau of Transportation Statistics | `https://data.bts.gov/api/views.json` | `bts-transportation-stats-2026-10-05.json` |
| `estimatetax-income-tax` | EstimateTax | `https://estimatetax.net/api/v1/calculate` | `estimatetax-income-tax-2026-10-18.json` |
| `nyc-open-data-catalogue` | New York City Open Data | `https://data.cityofnewyork.us/api/views.json` | `nyc-open-data-catalogue-2026-10-19.json` |
| `publicdatahub-hospital-quality` | PublicDataHub | `https://publicdatahub.org/api/export/hospital/{slug}.json` | `publicdatahub-hospital-quality-2026-10-21.json` |
| `nextbus-transit-vehicles` | Portland Streetcar, through the NextBus XML feed | `https://retro.umoiq.com/service/publicXMLFeed?command=vehicleLocations&a=portland-sc&r=193&t=0` | `nextbus-portland-streetcar-vehicles-2026-10-22.xml` |
| `federal-register-documents` | Office of the Federal Register | `https://www.federalregister.gov/api/v1/documents.json` | `federal-register-documents-2026-11-08.json` |
| `nhtsa-vehicle-models` | NHTSA | `https://api.nhtsa.gov/vehicles/models` | `nhtsa-vehicle-models-2025-honda-2026-11-08.json` |
| `fcc-socrata-catalogue` | Federal Communications Commission | `https://opendata.fcc.gov/api/views.json` | `fcc-socrata-catalogue-2026-11-08.json` |
| `ny-state-open-data-catalogue` | New York State Open Data | `https://data.ny.gov/api/views.json` | `ny-state-open-data-catalogue-2026-11-08.json` |

## Exact curl commands for the 2026-10-05 additions

Each command answers HTTP 200 JSON without a key. `$UA_BROWSER` is a desktop
browser User-Agent. The SEC and National Weather Service commands use a
descriptive User-Agent with a contact address instead, because both services
ask callers to identify themselves.

```sh
UA_BROWSER='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
UA_POLITE='usa-open-data-connectors/0.1.3 (contact@example.com)'

# US Treasury debt to the penny, first ten rows
curl -sS -A "$UA_POLITE" 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?page%5Bsize%5D=10'

# SEC EDGAR submissions for Apple (requires a descriptive User-Agent)
curl -sS -A "$UA_POLITE" 'https://data.sec.gov/submissions/CIK0000320193.json'

# FDIC institution directory, ten banks (the host redirects to api.fdic.gov)
curl -sSL -A "$UA_BROWSER" 'https://banks.data.fdic.gov/api/institutions?limit=10&fields=NAME,CITY,STALP'

# ClinicalTrials.gov studies, first ten
curl -sS -A "$UA_BROWSER" 'https://clinicaltrials.gov/api/v2/studies?pageSize=10'

# National Weather Service point lookup (requires a descriptive User-Agent)
curl -sS -A "$UA_POLITE" 'https://api.weather.gov/points/38.8894,-77.0352'

# USAspending top-tier agencies
curl -sS -A "$UA_BROWSER" 'https://api.usaspending.gov/api/v2/references/toptier_agencies/'

# EPA Envirofacts Toxics Release Inventory facilities in Rhode Island, first ten rows
curl -sS -A "$UA_BROWSER" 'https://data.epa.gov/efservice/TRI_FACILITY/STATE_ABBR/RI/rows/0:9/JSON'

# NCBI PubMed search for asthma, ten ids
curl -sS -A "$UA_BROWSER" 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=asthma&retmode=json&retmax=10'

# Socrata catalogues, ten entries each
curl -sS -A "$UA_BROWSER" 'https://data.cdc.gov/api/views.json?limit=10'
curl -sS -A "$UA_BROWSER" 'https://healthdata.gov/api/views.json?limit=10'
curl -sS -A "$UA_BROWSER" 'https://data.bts.gov/api/views.json?limit=10'
curl -sS -A "$UA_BROWSER" 'https://data.cityofnewyork.us/api/views.json?limit=50'
```

## Findings table

| Source | Status | Notes |
| --- | --- | --- |
| Treasury `api.fiscaldata.treasury.gov` debt to the penny | LIVE | Keyless. Every field arrives as a string, and a value the agency could not report arrives as the literal text `"null"`. The endpoint defaults to oldest first, so the ten-row page is April 1993. |
| SEC `data.sec.gov` | LIVE | Keyless, but the SEC blocks a request that does not identify its operator. The adapter sends `usa-open-data-connectors contact@example.com` as its User-Agent. The submissions file sends the recent filings as parallel arrays, one array per column, not one object per row. |
| FDIC `banks.data.fdic.gov` | LIVE | Keyless. The `banks.data.fdic.gov` host answers with a redirect to `api.fdic.gov`, which fetch follows. The `fields` parameter trims each row to the columns asked for, and the service also returns an `ID` column. |
| ClinicalTrials.gov `clinicaltrials.gov` | LIVE | Keyless. One study carries a deep protocol record. A start date can be day-precision or month-precision, such as `2000-10`, and observational studies carry no phase list. |
| National Weather Service `api.weather.gov` | LIVE | Keyless, but the service asks callers to identify themselves. The adapter sends `usa-open-data-connectors contact@example.com` as its User-Agent. The point lookup returns a GeoJSON feature with the forecast URLs, not the forecast itself. |
| USAspending `api.usaspending.gov` | LIVE | Keyless. Returns 111 top-tier agencies for fiscal 2026 quarter 4. Some agencies have no congressional justification URL, which arrives as null. |
| EPA Envirofacts `data.epa.gov` | LIVE | Keyless. The filter segment takes the value on its own, directly after the column: `TRI_FACILITY/STATE_ABBR/RI/rows/0:9/JSON` answers ten Rhode Island facilities. The service also accepts an `equals` operator in that position without complaining, but then returns the table's first rows regardless, so the adapter's URL builder does not emit one. |
| NCBI `eutils.ncbi.nlm.nih.gov` | LIVE | Keyless. Every count arrives as a string. A rejected query answers HTTP 200 with an `error` key inside `esearchresult`, which the parser turns into an API error. |
| NIH RePORTER `api.reporter.nih.gov` | LIVE | Keyless. The project search is a JSON POST. The response carries `meta` with the total match count and `results` with snake-case project rows. Sorting by `award_amount` descending works; sorting by `project_num` returned an unexpected-error body on 2026-11-07, so the adapter does not use it. |
| CDC `data.cdc.gov` Socrata catalogue | LIVE | Keyless. The discovery API answers a bare JSON array of catalogue entries, not dataset rows. An entry can arrive without a category, which the adapter counts under `Uncategorised`. |
| HealthData.gov `healthdata.gov` Socrata catalogue | LIVE | Keyless. Same shape as the CDC catalogue. The page captured on 2026-10-05 held no `dataset` entries: all ten were `href` records. |
| BTS `data.bts.gov` Socrata catalogue | LIVE | Keyless. Same shape as the other two Socrata catalogues. The page mixes datasets, charts, and stories. |
| NYC `data.cityofnewyork.us` Socrata catalogue | LIVE | Keyless. Same discovery shape as the other Socrata catalogues. The 50-entry page captured on 2026-10-19 mixes datasets and maps, and three entries arrive without a category. |
| EstimateTax `estimatetax.net` | LIVE | Keyless, with a 60 request per minute limit per address. One request returns federal, state, and local income tax for one salary. The response cites the IRS or state document behind each layer and the date it was checked. The default fixture is the $85,000 single filer in New York City for tax year 2026. |
| Federal Register `www.federalregister.gov` | LIVE | Keyless. The newest-documents page answered HTTP 200 with ten documents, a reported `count` of 10,000, and `total_pages` 50 on 2026-11-08. The adapter keeps both service values as `reportedCount` and `totalPages` rather than treating either as the page size. |
| NHTSA `api.nhtsa.gov` | LIVE | Keyless. The 2025 Honda query answered HTTP 200 with `pagination.total` 50 and 50 rows. The service echoes the make in upper case (`HONDA`) even when the request sends `Honda`, so the adapter keeps the response value. |
| FCC `opendata.fcc.gov` Socrata catalogue | LIVE | Keyless. The ten-entry page answered HTTP 200 and mixed one story with nine datasets. The captured page supplied no Common Core `License` or `Publisher` value, so both adapter fields are empty. |
| New York State `data.ny.gov` Socrata catalogue | LIVE | Keyless. The ten-entry page answered HTTP 200 and mixed nine datasets with one file. The captured page supplied no Common Core `License` or `Publisher` value, so both adapter fields are empty. |

## Exact curl command for the 2026-10-18 addition

```sh
curl -sS 'https://estimatetax.net/api/v1/calculate?income=85000&state=NY&city=new-york-city&filingStatus=single'
```

## Exact curl command for the 2026-11-07 addition

```sh
curl -sS -X POST 'https://api.reporter.nih.gov/v2/projects/search' \
  -H 'Content-Type: application/json' \
  --data '{"criteria":{"fiscal_years":[2025],"agencies":["NIH"]},"include_fields":["ProjectNum","CoreProjectNum","ProjectTitle","FiscalYear","AwardAmount","Organization","PrincipalInvestigators","ProjectStartDate","ProjectEndDate","AgencyIcAdmin","ProjectDetailUrl"],"offset":0,"limit":10,"sort_field":"award_amount","sort_order":"desc"}'
```

## Exact curl commands for the 2026-11-08 additions

Each command answered HTTP 200 without a key on 2026-11-08. The Federal
Register and NHTSA commands are the default queries the adapters send. The
Socrata commands ask for the ten-entry pages saved as fixtures.

```sh
UA='usa-open-data-connectors (Language=TypeScript)'

# Federal Register, ten newest documents
curl -sS -A "$UA" 'https://www.federalregister.gov/api/v1/documents.json?per_page=10&order=newest'

# NHTSA, the 2025 Honda model list
curl -sS -A "$UA" 'https://api.nhtsa.gov/vehicles/models?modelYear=2025&make=Honda&max=100'

# FCC Open Data catalogue, ten entries
curl -sS -A "$UA" 'https://opendata.fcc.gov/api/views.json?limit=10'

# New York State Open Data catalogue, ten entries
curl -sS -A "$UA" 'https://data.ny.gov/api/views.json?limit=10'
```

## Live adapter probes on 2026-11-08

The four adapters were also probed through the built registry, not just with
`curl`. Run this from `packages/usa-sources` after `npm run build`:

```sh
node --input-type=module -e "import { probeAllUsDataSources } from './dist/index.js'; const ids=['federal-register-documents','nhtsa-vehicle-models','fcc-socrata-catalogue','ny-state-open-data-catalogue']; const probes=await probeAllUsDataSources({ids}); console.log(JSON.stringify(probes,null,2));"
```

Observed result: all four probes returned `"ok": true` and `"status": "ok"` with
`"auth": "none"`. The returned samples began with:

| Adapter | First record in the probe sample |
| --- | --- |
| `federal-register-documents` | Document `2026-22789`, "The American Declaration of Freedom in Space", type `Presidential Document` |
| `nhtsa-vehicle-models` | Model year 2025, make `HONDA`, model `ACCORD HYBRID` |
| `fcc-socrata-catalogue` | Entry `wgq8-eb5c`, "Pirate Radio Broadcasting Database", asset type `story` |
| `ny-state-open-data-catalogue` | Entry `sa8q-nq2h`, "SPARCS Ambulatory Surgery Encounters by Facility: Beginning 2018", asset type `dataset` |

## Candidates checked and skipped on 2026-11-08

These were checked live before writing any adapter. None was added because the
service requires a key or the endpoint is not a usable public API.

| Source | Result |
| --- | --- |
| Census Bureau Data API | HTTP 302 to `https://api.census.gov/data/missing_key.html` with `x-datawebapi-keyerror: 1`. Keyed; skipped. |
| FBI Crime Data Explorer API | HTTP 403 with `{"error":{"code":"API_KEY_MISSING","message":"An API key was not provided. Please get one at https://api.data.gov/signup/"}}`. Keyed; skipped. |
| Data.gov CKAN API | `https://catalog.data.gov/api/3/action/package_search?rows=3` answered HTTP 404 on 2026-11-08. No adapter added. |
| CMS Provider Data catalogue | The metastore API answered HTTP 403 Access Denied on 2026-11-08. No adapter added. |
| California Open Data catalogue | `https://data.ca.gov/api/views.json?limit=2` answered HTTP 404 on 2026-11-08. No adapter added. |

## Candidates not yet probed

These sit on the backlog in `COUNTRY.md`. Census was checked on 2026-11-08
and answered with a missing-key redirect; the rest are still unprobed. EPA,
CDC, and NOAA already have adapters, so they are not on this list.

| Source | What it would cover |
| --- | --- |
| api.data.gov | Shared key and catalogue across several federal APIs |
| Bureau of Economic Analysis | GDP and regional accounts |
| Energy Information Administration | Energy production and prices |

## Licences and attribution

The MIT licence in this repo covers the code, not the data.

Most of this data comes from US federal agencies. Works of the US federal
government are generally not subject to copyright in the United States
(17 U.S.C. 105), so the data is effectively public domain there. That is a
statement about US law: public domain in the US is not public domain
everywhere, and a few services attach their own terms on top.

| Adapter | Publisher | Licence note |
| --- | --- | --- |
| `bls-unemployment-rate` | Bureau of Labor Statistics | US federal work, public domain in the US |
| `usgs-hawaii-earthquakes`, `usgs-peak-streamflow` | US Geological Survey | US federal work, public domain in the US |
| `cdc-county-obesity` | Centers for Disease Control and Prevention | US federal work, public domain in the US |
| `cdc-socrata-catalogue` | Centers for Disease Control and Prevention | Portal entry terms. The adapter returns `licenceUrl` and `attribution`; on the captured page no entry named a licence URL and six named a publisher |
| `ncei-annual-temperature`, `noaa-sea-level` | NOAA | US federal work, public domain in the US |
| `treasury-avg-interest-rate`, `treasury-debt-to-penny` | US Treasury | US federal work, public domain in the US |
| `fema-disaster-declarations` | FEMA | US federal work, public domain in the US |
| `openfda-food-recalls` | US Food and Drug Administration | US federal work, public domain in the US |
| `cpsc-product-recalls` | Consumer Product Safety Commission | US federal work, public domain in the US |
| `cfpb-consumer-complaints` | Consumer Financial Protection Bureau | US federal work, public domain in the US |
| `sec-edgar-filings` | US Securities and Exchange Commission | US federal work, public domain in the US |
| `fdic-bank-directory` | Federal Deposit Insurance Corporation | US federal work, public domain in the US |
| `clinicaltrials-studies` | National Library of Medicine | US federal work, public domain in the US |
| `nws-point-forecast` | National Weather Service | US federal work, public domain in the US |
| `usaspending-agencies` | USAspending, US Treasury | US federal work, public domain in the US |
| `epa-envirofacts-facilities` | Environmental Protection Agency | US federal work, public domain in the US |
| `ncbi-pubmed-search` | National Center for Biotechnology Information | US federal work, but NLM attaches its own terms to some content. Check the NLM terms before bulk reuse |
| `nih-reporter-projects` | National Institutes of Health | US federal work, public domain in the US |
| `healthdata-socrata-catalogue` | HealthData.gov, US Department of Health and Human Services, plus each portal publisher | Portal entry terms. The adapter returns `licenceUrl` and `attribution`; the captured page carries the USA.gov government-works label, ODbL, and PDDL |
| `bts-transportation-stats` | Bureau of Transportation Statistics | Portal entry terms. The adapter returns `licenceUrl` and `attribution`; every entry on the captured page names the USA.gov public-domain label and the bureau |
| `nyc-open-data-catalogue` | New York City Open Data | City of New York public data, published under the portal's terms. The adapter returns `licenceUrl` and `attribution`, but the captured page supplied neither |
| `estimatetax-income-tax` | EstimateTax | Private publisher, not a federal agency. The API terms ask for attribution and the source document alongside any displayed figure. No open licence is stated for the API output. |
| `college-scorecard-institutions` | College Scorecard, US Department of Education | US federal work, public domain in the US |
| `publicdatahub-hospital-quality` | PublicDataHub, from the Centers for Medicare & Medicaid Services | CMS provider data is US federal work, public domain in the US. The response provenance names the licence as U.S. Public Domain. |
| `callook-callsigns` | Callook.info, from the FCC licence file | FCC licence records are US federal work, public domain in the US. Callook.info serves the records and calculates the coordinates and grid square. Its API reference says the data is free to use. |
| `nextbus-transit-vehicles` | Portland Streetcar, served by Umo IQ | Transit agency data. The feed carries a copyright notice for the agency and Umo IQ, and states no open licence. Check the agency's terms before republishing. |
| `federal-register-documents` | Office of the Federal Register | US federal work, public domain in the US |
| `nhtsa-vehicle-models` | National Highway Traffic Safety Administration | US federal work, public domain in the US |
| `fcc-socrata-catalogue` | Federal Communications Commission, through its Socrata portal | Portal entry terms. The adapter returns `licenceUrl` and `attribution`; the captured page supplied neither |
| `ny-state-open-data-catalogue` | New York State, through its Socrata portal | State portal terms. The adapter returns `licenceUrl` and `attribution`; the captured page supplied neither |

The Socrata catalogue adapters return `licenceUrl` and `attribution` on each
entry, and `publicdatahub-hospital-quality` returns licence, agency, and
dataset provenance. An empty value means the source supplied none. The other
adapters' committed responses carry no per-record licence field; most
publishers state terms for the whole service. That is the narrowed open item in
`COUNTRY.md`. The metadata covers the record it comes with, not every dataset a
publisher offers. Read the publisher's page before you republish, and credit
the publisher rather than this library.
