# @usa-open-data-connectors/usa-sources

Uniform TypeScript adapters for US public data sources, with live probes and offline fixtures.

## What this package does

- Exposes 22 source adapters behind one interface.
- Fetches live data from each source and parses it into plain objects.
- Loads a committed fixture when the network is unavailable.
- Publishes the `US_DATA_SOURCES` registry for the API and the CLI.
- Exports named functions for each source, with that source's query parameters.

## Install

```sh
npm install @usa-open-data-connectors/usa-sources
```

## Quick start

```ts
import { probeAllUsDataSources } from '@usa-open-data-connectors/usa-sources';

const probes = await probeAllUsDataSources();
console.log(probes.map((probe) => `${probe.id}: ${probe.ok ? 'ok' : probe.status}`).join('\n'));
```

## Adapters

| Adapter | Publisher | What it reads |
| --- | --- | --- |
| `bls-unemployment-rate` | Bureau of Labor Statistics | Monthly national unemployment rate, seasonally adjusted, from the Current Population Survey. |
| `usgs-hawaii-earthquakes` | US Geological Survey | Earthquakes of magnitude 2.5 and above near the Hawaiian islands. |
| `cdc-county-obesity` | Centers for Disease Control and Prevention | Model-based share of adults with obesity in each US county, from CDC PLACES. |
| `ncei-annual-temperature` | NOAA National Centers for Environmental Information | Calendar-year average temperature for the contiguous United States since 1895. |
| `noaa-sea-level` | NOAA Center for Operational Oceanographic Products and Services | Monthly mean sea level at a tide gauge, folded into calendar-year averages with a fitted trend. |
| `treasury-avg-interest-rate` | US Department of the Treasury | Average interest rate on the interest-bearing federal debt outstanding, monthly since 2001. |
| `fema-disaster-declarations` | Federal Emergency Management Agency | Every disaster declaration FEMA has published, from 1953 to the newest. |
| `openfda-food-recalls` | US Food and Drug Administration | Every food recall the FDA publishes as an enforcement report, from June 2012. |
| `usgs-peak-streamflow` | US Geological Survey | Annual peak-flow record at a USGS stream gauge, from 1844 at the Mississippi River at St. Louis. |
| `cpsc-product-recalls` | US Consumer Product Safety Commission | Every consumer product recall CPSC has published, from 2014 to the newest. |
| `cfpb-consumer-complaints` | Consumer Financial Protection Bureau | Every consumer complaint sent to a company, counted by year, with the top products and companies. |
| `treasury-debt-to-penny` | US Department of the Treasury | Daily total public debt outstanding, in dollars, from the debt to the penny file. |
| `sec-edgar-filings` | US Securities and Exchange Commission | An issuer's recent filing history from SEC EDGAR, with the form type and the newest date. |
| `fdic-bank-directory` | Federal Deposit Insurance Corporation | Insured banks in the FDIC institution directory, with the city and state of each main office. |
| `clinicaltrials-studies` | ClinicalTrials.gov | Registered clinical studies, with the status, phase, lead sponsor, and enrollment. |
| `nws-point-forecast` | National Weather Service | The forecast grid point for a latitude and longitude, with the URLs for the daily and hourly forecast. |
| `usaspending-agencies` | USAspending | Top-tier federal agencies, with budget authority, obligations, and outlays for the active quarter. |
| `epa-envirofacts-facilities` | Environmental Protection Agency | Toxics Release Inventory facilities, with county, address, and open or closed status. |
| `ncbi-pubmed-search` | National Center for Biotechnology Information | PubMed literature search results, with the match count and a page of PubMed ids. |
| `cdc-socrata-catalogue` | Centers for Disease Control and Prevention | The CDC Socrata catalogue, one row per dataset, chart, or story. |
| `healthdata-socrata-catalogue` | HealthData.gov | The HealthData.gov Socrata catalogue, one row per dataset, chart, or story. |
| `bts-transportation-stats` | Bureau of Transportation Statistics | The BTS Socrata catalogue, one row per dataset, chart, or story. |

The HTTP API and the CLI read this package's registry. A new adapter is exposed on
`/api/sources`, `/api/sources/{id}/probe`, and `/api/sources/{id}/data` as soon as it is registered.

### Usage examples

The examples below hit the live sources and need no key. Each one uses the exported functions for that adapter.

`bls-unemployment-rate`:

```ts
import { fetchBlsSeries, US_UNEMPLOYMENT_SERIES_ID } from '@usa-open-data-connectors/usa-sources';

const rate = await fetchBlsSeries(US_UNEMPLOYMENT_SERIES_ID, {
  startYear: 2006,
  endYear: 2025,
});
console.log(rate.latest.year, rate.latest.period, rate.latest.value);
```

`usgs-hawaii-earthquakes`:

```ts
import {
  buildUsgsEarthquakeCatalogue,
  fetchUsgsEarthquakes,
  USGS_HAWAII_BOUNDS,
  USGS_HAWAII_MIN_MAGNITUDE,
} from '@usa-open-data-connectors/usa-sources';

const earthquakes = await fetchUsgsEarthquakes({
  startDate: '2025-01-01',
  endDate: '2026-01-01',
  minMagnitude: USGS_HAWAII_MIN_MAGNITUDE,
  bounds: USGS_HAWAII_BOUNDS,
});
const catalogue = buildUsgsEarthquakeCatalogue(earthquakes);
console.log(catalogue.count, catalogue.strongest.place, catalogue.strongest.magnitude);
```

`cdc-county-obesity`:

```ts
import {
  buildCdcCountyObesitySet,
  fetchCdcCountyObesity,
} from '@usa-open-data-connectors/usa-sources';

const set = buildCdcCountyObesitySet(await fetchCdcCountyObesity());
console.log(set.countyCount, set.lowest.countyName, set.highest.percent, set.national.percent);
```

`ncei-annual-temperature`:

```ts
import {
  buildNceiAnnualTemperatureSeries,
  fetchNceiAnnualTemperature,
} from '@usa-open-data-connectors/usa-sources';

const series = await fetchNceiAnnualTemperature({
  startYear: 1895,
  endYear: new Date().getFullYear(),
});
console.log(series.yearCount, series.warmest.year, series.coldest.valueFahrenheit);
```

`noaa-sea-level`:

```ts
import { buildNoaaSeaLevelSeries, fetchNoaaSeaLevel } from '@usa-open-data-connectors/usa-sources';

const seaLevel = buildNoaaSeaLevelSeries(await fetchNoaaSeaLevel());
console.log(
  seaLevel.station.name,
  seaLevel.yearCount,
  seaLevel.highest.year,
  seaLevel.trendMillimetresPerYear
);
```

`treasury-avg-interest-rate`:

```ts
import { fetchTreasuryAvgInterestRates } from '@usa-open-data-connectors/usa-sources';

const rates = await fetchTreasuryAvgInterestRates();
console.log(rates.monthCount, rates.lastMonth.averageInterestRatePercent, rates.lowest.recordDate);
```

`fema-disaster-declarations`:

```ts
import { fetchFemaDeclarations } from '@usa-open-data-connectors/usa-sources';

const declarations = await fetchFemaDeclarations();
console.log(
  declarations.declarationCount,
  declarations.busiestYear.year,
  declarations.incidentTypes[0]?.name
);
```

`usgs-peak-streamflow`:

```ts
import {
  buildUsgsPeakStreamflowSeries,
  fetchUsgsPeakStreamflow,
} from '@usa-open-data-connectors/usa-sources';

const record = await fetchUsgsPeakStreamflow();
console.log(
  record.yearCount,
  record.highest.waterYear,
  record.highest.peakDischargeCubicFeetPerSecond,
  record.highestToLowestRatio
);
```

`cpsc-product-recalls`:

```ts
import { fetchCpscProductRecalls } from '@usa-open-data-connectors/usa-sources';

const recalls = await fetchCpscProductRecalls();
console.log(
  recalls.totalRecalls,
  recalls.busiestCompleteYear.year,
  recalls.remedyOptions[0]?.option,
  recalls.manufacturerCountries[0]?.country
);
```

`cfpb-consumer-complaints`:

```ts
import { fetchCfpConsumerComplaints } from '@usa-open-data-connectors/usa-sources';

const complaints = await fetchCfpConsumerComplaints();
console.log(
  complaints.totalComplaints,
  complaints.busiestCompleteYear.year,
  complaints.newestReceivedDate,
  complaints.topCompanies[0]?.company
);
```

## Notes and limits

- `bls-unemployment-rate`: the public API refuses a window longer than ten years. `fetchBlsSeries` splits a longer range into windows, so two decades cost three calls once the range reaches the current year.
- `bls-unemployment-rate`: keyless access allows 25 series queries a day. A registered key allows 500, and the adapter takes `apiKey` for the day that matters.
- `bls-unemployment-rate`: the agency uses `-` for a month it could not publish and `M13` for an annual average. The parser drops both, so one year holds twelve monthly values.
- `usgs-hawaii-earthquakes`: the event query answers a window of any length, one request per window. The caller sets the box, the magnitude floor, and the dates.
- `usgs-hawaii-earthquakes`: the feed mixes tectonic earthquakes with quarry blasts, explosions, and ice quakes. A row can arrive without a magnitude. The parser keeps only tectonic earthquakes that carry a magnitude and a depth.
- `usgs-hawaii-earthquakes`: the catalogue answers newest first. `parseUsgsEarthquakes` returns oldest first, so a caller reading index 0 gets the start of the window.
- `cdc-county-obesity`: the resource id is per release. This adapter reads the 2025 release. Its estimates come from the 2023 Behavioral Risk Factor Surveillance System (BRFSS) and the Census Bureau 2023 county population estimates. A new release gets a new id, so a caller pinned to this one keeps reading the numbers it was written against.
- `cdc-county-obesity`: every row is a model-based estimate, not a count. The release publishes each measure as crude prevalence and as age-adjusted prevalence. The adapter reads the crude rows, because age-adjusted rows answer a different question.
- `cdc-county-obesity`: a county the model could not estimate arrives with no value. The release carries no obesity rows for Kentucky and Pennsylvania. The parser drops rows without a value and keeps the national row apart from the counties.
- `ncei-annual-temperature`: the download is a CSV, not JSON. It holds two comment lines, a header, then one row per year as `YYYYMM,value` in degrees Fahrenheit. `parseNceiAnnualTemperatureCsv` skips the comments and the header, and stops on any other line shape rather than dropping it.
- `ncei-annual-temperature`: the URL carries a window length and a window end month. Twelve months ending in December is the calendar year. The parser refuses a file with more than one row per year.
- `ncei-annual-temperature`: the current year joins the file only after December closes it, so the newest row is the last complete calendar year. The 2026 download is dated 2026-09-26 and ends at 2025.
- `noaa-sea-level`: one request covers the whole window. The `monthly_mean` product answers one row per month rather than one row per reading, so 170 years cost one call and about 460 KB. The endpoint is keyless.
- `noaa-sea-level`: values are metres against the station Mean Sea Level (MSL) datum, the average of hourly heights over the 1983-2001 National Tidal Datum Epoch. Reading the whole record against one fixed epoch is what makes two years comparable.
- `noaa-sea-level`: the API answers a row for every month in the window and leaves the value blank when it has none. Blank rows are dropped. A year's average is taken over the months it has, so `monthCount` says how much of the year a value covers.
- `noaa-sea-level`: errors come back in the body with HTTP 200, as `{"error":{"message":"..."}}`. The parser checks for that before reading the data. A wrong product name answers with plain text instead, which fails the shape check.
- `treasury-avg-interest-rate`: one keyless request covers the whole run. The dataset answers a row per month per security type. The filter pins the response to `security_type_desc:eq:Interest-bearing Debt`. That is the portfolio total the bureau's monthly statement is built from. The other rows never reach the parser. They hold the rates on bills, notes, bonds, and non-marketable debt.
- `treasury-avg-interest-rate`: the rate is the average across everything outstanding, not the rate on anything issued today. That is why it moves slowly. A new bill reprices a fraction of the portfolio, and a bond issued in 2019 still pays its own coupon.
- `treasury-avg-interest-rate`: a page holds at most 10,000 rows and the run is around 300. The adapter asks for the whole series in one request and does not page. The row limit is a named constant.
- `treasury-avg-interest-rate`: each row is dated to the last day of its month. A month the agency could not compute arrives without a value, and the parser drops those rows.
- `treasury-avg-interest-rate`: a request the API rejects answers with an HTTP error and a body of `{"error":"Invalid Query Param","message":"..."}`. The parser reports an API error rather than a shape error.
- `usgs-peak-streamflow`: the adapter reads the `peaks` collection on the USGS Water Data OGC API. It does not read the older `waterservices.usgs.gov` endpoints. The older statistics service answers `503 Service unavailable` to about half of scripted requests, which is enough to fail a build. The daily-values service on the older host still works when a daily series is what a story needs.
- `usgs-peak-streamflow`: every number in a row arrives as a string, including the peak itself. The parser converts once and keeps the number. A blank `value` means the agency filed no peak for that year. The parser drops that row.
- `usgs-peak-streamflow`: the rows are dated by water year, which starts on 1 October. A peak on 1955-10-08 is filed under water year 1956, so `waterYear` and `calendarYear` are separate fields and are not always the same number.
- `usgs-peak-streamflow`: the record has holes. At the default gauge there is no row for the 17 water years from 1845 to 1861. The series lists them in `missingWaterYears` rather than drawing them as zero.
- `usgs-peak-streamflow`: a gauge with several peaks in one water year is filed once, with the largest. The adapter does not de-duplicate, so two rows for one water year would be a change in the source worth seeing.
- `usgs-peak-streamflow`: rows carry the agency's qualifiers, for example `UNKNOWNREGULATION` or `MAXDAILYMEAN`. The parser keeps them on each year.
- `usgs-peak-streamflow`: one keyless request covers the whole record. The default gauge answers 165 water years in one page of about 126 KB.
- `cpsc-product-recalls`: the adapter reads the same service behind the public SaferProducts.gov search. It is keyless.
- `cpsc-product-recalls`: one request covers one calendar year, and a wider range fails. The service answers HTTP 200 with a single row. Its title reads `Error retrieving Recalls: The underlying provider failed on Open.` The adapter reads a year at a time for that reason. The parser throws on that row rather than counting it as a recall.
- `cpsc-product-recalls`: a year of rows is heavy as JSON. 2025 is 420 recalls in about 1.3 MB, so the default window of 2014 to the current year costs about 11 MB across 13 requests. A year with no recall keeps a zero row in `years`.
- `cpsc-product-recalls`: the newest year is the year the agency is still filling, so `busiestCompleteYear` and `quietestCompleteYear` are picked from the years before it. `completeYearCount` says how many those were.
- `cpsc-product-recalls`: `ManufacturerCountries` names every country a recall touches, so a recall can list several countries. The country counts add to more than the recall count. In the 2014 to 2026 window China appears on 2,312 of 3,986 recalls. The United States appears on 753, and 122 countries appear at least once.
- `cpsc-product-recalls`: `RemedyOptions` is nearly an enum (Refund, Repair, Replace, Dispose, New Instructions, Label, Inspect) with two junk rows. One carries `R` and one carries a whole paragraph of consumer instructions. The adapter keeps whatever the agency sends and sorts the counts.
- `cpsc-product-recalls`: the service holds recalls from the 1970s. The adapter starts at 2014, which keeps the window to 13 requests.
- `cfpb-consumer-complaints`: the adapter reads the search endpoint behind the public Consumer Complaint Database. It is keyless. The bureau answers a scripted request with 403 and a request with a declared user agent with 200.
- `cfpb-consumer-complaints`: the search API computes its term aggregations on every request, which takes the body from about fifteen kilobytes to about four hundred. The adapter asks for `size=0&no_aggs=true` and reads `hits.total.value` when it only needs a count. It makes one extra request without `no_aggs` for the product and company tallies.
- `cfpb-consumer-complaints`: the API answers one question per request and has no date sort. The window costs one request per year plus one for the tallies plus one or two to find the newest day. `findNewestCfpComplaintDate` walks back from today. It stops at the first day with a complaint.
- `cfpb-consumer-complaints`: the first year in the window, 2011, holds only December. The bureau published its first complaints on 1 December 2011. The adapter keeps the year, and the page's data note says the first bar covers one month.
- `cfpb-consumer-complaints`: the product tally splits credit reporting across more than one label because the bureau changed its product taxonomy over the years. The adapter keeps whatever the API sends, so the labels in `topProducts` are not stable.
- `cfpb-consumer-complaints`: the committed snapshot holds the folded counts, not the eighteen million raw rows.
- Unit tests use the committed fixtures and run offline. Run them with `npm run test --workspace @usa-open-data-connectors/usa-sources`.
- Smoke tests hit the live APIs and need `RUN_SMOKE=1`. Run them with `npm run test:smoke --workspace @usa-open-data-connectors/usa-sources`.

## Data sources and licences

The data comes from US federal agencies and the open data catalogue services they publish on.

| Publisher | Source URL |
| --- | --- |
| Bureau of Labor Statistics | `https://api.bls.gov/publicAPI/v2/timeseries/data` |
| US Geological Survey | `https://earthquake.usgs.gov/fdsnws/event/1/query` and `https://api.waterdata.usgs.gov/ogcapi/v0/collections/peak/items` |
| Centers for Disease Control and Prevention | `https://data.cdc.gov/resource/swc5-untb.json` and `https://data.cdc.gov/api/views.json` |
| NOAA National Centers for Environmental Information | `https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance` |
| NOAA Center for Operational Oceanographic Products and Services | `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` |
| US Department of the Treasury | `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates` and `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny` |
| Federal Emergency Management Agency | `https://www.fema.gov/api/open/v1/FemaWebDisasterDeclarations` |
| US Food and Drug Administration | `https://api.fda.gov/food/enforcement.json` |
| US Consumer Product Safety Commission | `https://www.saferproducts.gov/RestWebServices/Recall` |
| Consumer Financial Protection Bureau | `https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/` |
| US Securities and Exchange Commission | `https://data.sec.gov/submissions/CIK0000320193.json` |
| Federal Deposit Insurance Corporation | `https://banks.data.fdic.gov/api/institutions` |
| ClinicalTrials.gov | `https://clinicaltrials.gov/api/v2/studies` |
| National Weather Service | `https://api.weather.gov/points/38.8894,-77.0352` |
| USAspending | `https://api.usaspending.gov/api/v2/references/toptier_agencies/` |
| Environmental Protection Agency | `https://data.epa.gov/efservice/TRI_FACILITY/STATE_ABBR/RI/rows/0:9/JSON` |
| National Center for Biotechnology Information | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` |
| Bureau of Transportation Statistics | `https://data.bts.gov/api/views.json` |
| HealthData.gov | `https://healthdata.gov/api/views.json` |

Each publisher sets its own terms for its data. The adapters read the publisher's own source page or
licence field. For example, the Socrata catalogue adapters (CDC, HealthData.gov, and BTS) return each
entry's `license` field. The fixtures in this repo record entries under these terms:

- USA.gov public-domain label: `http://www.usa.gov/publicdomain/label/1.0/`
- USA.gov government works: `https://www.usa.gov/government-works`
- Open Database License (ODbL): `http://opendefinition.org/licenses/odc-odbl/`
- Public Domain Dedication and License (PDDL): `http://opendatacommons.org/licenses/pddl/1.0/`

Check the licence field on each entry before you reuse it. This section is not legal advice. The package
licence covers the code, not the data.

## Package licence

MIT. See LICENSE.

## Links

- npm: https://www.npmjs.com/package/@usa-open-data-connectors/usa-sources
- source: https://github.com/olitreadwell/usa-open-data-connectors/tree/main/packages/usa-sources
- docs: ../../docs/CONNECTOR_DISCOVERY.md
