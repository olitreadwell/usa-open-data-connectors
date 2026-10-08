# Connector discovery notes (US)

Findings from the US source passes. Twenty-two keyless adapters are built and
verified against live APIs, and each has a fixture committed from the same
endpoint.

Eleven adapters were added on 2026-10-05. Those eleven were probed live that
day with `curl`, and their fixtures were captured then. The earlier eleven
were captured between 2026-09-23 and 2026-10-03.

## Adapters built

| Adapter | Source | Endpoint | Fixture |
| --- | --- | --- | --- |
| `bls-unemployment-rate` | Bureau of Labor Statistics | `https://api.bls.gov/publicAPI/v2/timeseries/data` | `bls-unemployment-rate.json` |
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
| `cdc-socrata-catalogue` | CDC Socrata | `https://data.cdc.gov/api/views.json` | `cdc-socrata-catalogue-2026-10-05.json` |
| `healthdata-socrata-catalogue` | HealthData.gov | `https://healthdata.gov/api/views.json` | `healthdata-socrata-catalogue-2026-10-05.json` |
| `bts-transportation-stats` | Bureau of Transportation Statistics | `https://data.bts.gov/api/views.json` | `bts-transportation-stats-2026-10-05.json` |

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
| CDC `data.cdc.gov` Socrata catalogue | LIVE | Keyless. The discovery API answers a bare JSON array of catalogue entries, not dataset rows. An entry can arrive without a category, which the adapter counts under `Uncategorised`. |
| HealthData.gov `healthdata.gov` Socrata catalogue | LIVE | Keyless. Same shape as the CDC catalogue. The page captured on 2026-10-05 held no `dataset` entries: all ten were `href` records. |
| BTS `data.bts.gov` Socrata catalogue | LIVE | Keyless. Same shape as the other two Socrata catalogues. The page mixes datasets, charts, and stories. |

## Candidates not yet probed

These sit on the backlog in `COUNTRY.md`. None has been checked live, so no
status is claimed here. EPA, CDC, and NOAA now have adapters, so they are no
longer on this list.

| Source | What it would cover |
| --- | --- |
| Census Bureau Data API | Population, housing, and business statistics |
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
| `cdc-county-obesity`, `cdc-socrata-catalogue` | Centers for Disease Control and Prevention | US federal work, public domain in the US |
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
| `healthdata-socrata-catalogue` | HealthData.gov, US Department of Health and Human Services | US federal work, public domain in the US |
| `bts-transportation-stats` | Bureau of Transportation Statistics | US federal work, public domain in the US |

No adapter returns licence metadata today, and no adapter can tell you whether a
particular dataset has terms on top. Read the publisher's page before you
republish, and credit the publisher rather than this library.
