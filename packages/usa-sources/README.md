# @usa-open-data-connectors/usa-sources

Uniform TypeScript adapters for US public data sources. Keyless first, with a
strict parser and a committed fixture behind every adapter so a build never
depends on a live API.

The HTTP API and the CLI read this package's registry (`US_DATA_SOURCES`), so a
new adapter is exposed on `/api/sources`, `/api/sources/{id}/probe`, and
`/api/sources/{id}/data` as soon as it is registered.

## Sources

| id                           | publisher                                                       | auth | what it reads                                                                                                                |
| ---------------------------- | --------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| `bls-unemployment-rate`      | Bureau of Labor Statistics                                      | none | The national unemployment rate, monthly, seasonally adjusted                                                                 |
| `usgs-hawaii-earthquakes`    | US Geological Survey                                            | none | Earthquakes of magnitude 2.5 and above near the Hawaiian islands                                                             |
| `cdc-county-obesity`         | Centers for Disease Control (CDC)                               | none | The share of adults with obesity in each US county, from CDC PLACES                                                          |
| `ncei-annual-temperature`    | NOAA National Centers for Environmental Information             | none | Calendar-year average temperature for the contiguous United States, since 1895                                               |
| `noaa-sea-level`             | NOAA Center for Operational Oceanographic Products and Services | none | Monthly mean sea level at a tide gauge, folded into calendar-year averages, since 1856 at The Battery                        |
| `treasury-avg-interest-rate` | US Department of the Treasury                                   | none | Average interest rate on the interest-bearing federal debt outstanding, monthly since 2001                                   |
| `fema-disaster-declarations` | Federal Emergency Management Agency                             | none | Every disaster declaration FEMA has published, one row per declaration, from 1953 to the newest one                          |
| `openfda-food-recalls`       | US Food and Drug Administration                                 | none | Every food recall FDA has published as an enforcement report, from June 2012 to the newest publication date                  |
| `usgs-peak-streamflow`       | US Geological Survey                                            | none | The annual peak-flow record at a USGS stream gauge, one row per water year, since 1844 at the Mississippi River at St. Louis |
| `cpsc-product-recalls`       | US Consumer Product Safety Commission                           | none | Every consumer product recall CPSC has published, one row per recall, from 2014 to the newest one                            |
| `cfpb-consumer-complaints`   | Consumer Financial Protection Bureau                            | none | Every consumer complaint sent to a company since December 2011, counted by year, with the products and companies named most |

## Usage

```ts
import { fetchBlsSeries, US_UNEMPLOYMENT_SERIES_ID } from '@usa-open-data-connectors/usa-sources';

const rate = await fetchBlsSeries(US_UNEMPLOYMENT_SERIES_ID, {
  startYear: 2006,
  endYear: 2025,
});
console.log(rate.latest.year, rate.latest.period, rate.latest.value);
```

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

```ts
import {
  buildCdcCountyObesitySet,
  fetchCdcCountyObesity,
} from '@usa-open-data-connectors/usa-sources';

const set = buildCdcCountyObesitySet(await fetchCdcCountyObesity());
console.log(set.countyCount, set.lowest.countyName, set.highest.percent, set.national.percent);
```

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

```ts
import { fetchTreasuryAvgInterestRates } from '@usa-open-data-connectors/usa-sources';

const rates = await fetchTreasuryAvgInterestRates();
console.log(rates.monthCount, rates.lastMonth.averageInterestRatePercent, rates.lowest.recordDate);
```

```ts
import { fetchFemaDeclarations } from '@usa-open-data-connectors/usa-sources';

const declarations = await fetchFemaDeclarations();
console.log(
  declarations.declarationCount,
  declarations.busiestYear.year,
  declarations.incidentTypes[0]?.name
);
```

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

## Notes on the BLS API

- The public API refuses a request spanning more than ten years, so
  `fetchBlsSeries` splits a longer range into windows: two decades cost three
  calls once the range runs into the current year.
- Keyless access allows 25 series queries a day. A registered key raises that
  to 500, and the adapter takes `apiKey` for the day that matters.
- The agency uses `-` for a month it could not publish, and `M13` for an
  annual average. Both are dropped, so one year holds twelve monthly values.

## Notes on the USGS earthquake catalogue

- The event query answers a window of any length, one request per window. The
  box, the magnitude floor, and the dates come from the caller.
- The feed mixes tectonic earthquakes with quarry blasts, explosions, and ice
  quakes, and a row can arrive without a magnitude. The parser keeps only
  tectonic earthquakes that carry a magnitude and a depth.
- The catalogue answers newest first. `parseUsgsEarthquakes` returns oldest
  first, so a caller reading index 0 gets the start of the window.

## Notes on the CDC PLACES county release

- The resource id is per release. `cdc-county-obesity` reads the 2025
  release, whose estimates come from the 2023 Behavioral Risk Factor
  Surveillance System (BRFSS) and the Census Bureau's 2023 county population
  estimates. A new release gets a new id, so a caller pinned to this one
  keeps reading the numbers it was written against.
- Every row is a model-based estimate, not a count. The release publishes
  each measure twice, as crude and as age-adjusted prevalence; the adapter
  reads the crude rows, because age-adjusted ones answer a different question.
- A county the model could not estimate arrives with no value, and the
  release carries no obesity rows at all for Kentucky and Pennsylvania. Rows
  without a value are dropped, and the national row is kept apart from the
  counties rather than counted as one.

## Notes on the Climate at a Glance download

- The download is a CSV, not JSON: two comment lines, a header, then one row
  per year as `YYYYMM,value` in degrees Fahrenheit. `parseNceiAnnualTemperatureCsv`
  skips the comments and the header, and stops on any other line shape rather
  than dropping it.
- The URL carries a window length and a window end month. Twelve months ending
  in December is the calendar year, which is the number a story about a year
  can compare. A shorter window ending in December would be that month alone,
  and the parser refuses a file with more than one row per year.
- The current year joins the file only once December has closed it, so the
  newest row is the last complete calendar year. The 2026 download is dated
  2026-09-26 and ends at 2025.

## Notes on the CO-OPS sea level record

- One request covers the whole window: the `monthly_mean` product answers one
  row per month rather than one row per reading, so 170 years cost one call
  and about 460 KB. The endpoint is keyless.
- Values are metres against the station's MSL datum, the average of hourly
  heights over the 1983-2001 National Tidal Datum Epoch. Reading the whole
  record against one fixed epoch is what makes two years comparable.
- The API answers a row for every month in the window and leaves the value
  blank when it has none, which is how the early gaps arrive (1920 holds
  seven months, 1861 and 1879-1892 hold none). Blank rows are dropped, and a
  year's average is taken over the months it does have, so `monthCount` says
  how much of the year a value covers.
- Errors come back in the body with HTTP 200, as
  `{"error":{"message":"..."}}`, so the parser checks for that before reading
  the data. A wrong product name answers with plain text instead, which fails
  the shape check.

## Notes on the Treasury average interest rate

- One keyless request covers the whole run. The dataset answers a row per
  month per security type, and the filter pins the response to
  `security_type_desc:eq:Interest-bearing Debt`, which is the portfolio total
  the bureau's own monthly statement is built from. The other rows, the rates
  on bills, notes, bonds, and non-marketable debt, never reach the parser.
- The rate is the average across everything outstanding, not the rate on
  anything issued today. That is why it moves slowly: a new bill reprices a
  fraction of the portfolio, and a bond issued in 2019 still pays its own
  coupon.
- A page holds at most 10,000 rows and the run is around 300, so the adapter
  asks for the whole series in one request and does not page. A run longer
  than the cap would be a change worth making here rather than a silent
  truncation, so the row limit is a named constant.
- Each row is dated to the last day of its month. A month the agency could
  not compute would arrive without a value, and those rows are dropped.
- A request the API rejects answers with an HTTP error and a body of
  `{"error":"Invalid Query Param","message":"..."}`, which the parser reports
  as an API error rather than a shape error.

## Notes on the USGS peak-flow record

- The adapter reads the `peaks` collection on the USGS Water Data OGC API
  (`https://api.waterdata.usgs.gov/ogcapi/v0`), not the older
  `waterservices.usgs.gov` endpoints. The older statistics service answers
  `503 Service unavailable` to roughly half of scripted requests, which is
  enough to fail a build; the OGC API answered every request in the same
  window. The daily-values service on the older host still works and is worth
  using when a daily series is what a story needs.
- Every number in a row arrives as a string, including the peak itself, so
  the parser converts once and keeps the number. `value` blank means the
  agency filed no peak for that year, and the row is dropped rather than
  read as zero.
- The rows are dated by **water year**, which starts on 1 October. A peak on
  1955-10-08 is filed under water year 1956, so `waterYear` and
  `calendarYear` are separate fields and are not always the same number. The
  record is sorted and charted by water year, because that is the unit the
  agency files and the unit a flood season belongs to.
- The record has holes. At the default gauge there is no row for the 17
  water years from 1845 to 1861, and the series lists them in
  `missingWaterYears` rather than drawing them as zero, because a year with
  no filing is not a year the river ran dry.
- A gauge with several peaks in one water year is filed once, with the
  largest. The adapter does not de-duplicate, so a response carrying two rows
  for one water year would be a change in the source worth seeing.
- Rows carry the agency's qualifiers, for example `UNKNOWNREGULATION` where
  the agency could not tell whether works upstream changed the flow, or
  `MAXDAILYMEAN` where the peak is a daily mean rather than an instantaneous
  reading. They are kept on each year rather than dropped, so the copy can be
  honest about them.
- One keyless request covers the whole record. The default gauge answers 165
  water years in one page of about 126 KB.

## Notes on the CPSC recall service

- The adapter reads
  `https://www.saferproducts.gov/RestWebServices/Recall`, the same service
  behind the public SaferProducts.gov search. It is keyless.
- One request covers one calendar year. A range wider than a year fails: the
  service answers HTTP 200 with a single row whose title reads
  `Error retrieving Recalls: The underlying provider failed on Open.` The
  adapter reads a year at a time for that reason, and the parser throws on
  that row rather than counting it as a recall.
- A year of rows is heavy as JSON. 2025 is 420 recalls in about 1.3 MB, so the
  default window of 2014 to the current year costs about 11 MB across 13
  requests. A year with no recall keeps a zero row in `years` rather than
  disappearing from the chart.
- The newest year in the window is the year the agency is still filling, so
  `busiestCompleteYear` and `quietestCompleteYear` are picked from the years
  before it. `completeYearCount` says how many those were.
- `ManufacturerCountries` names every country a recall touches, so a recall
  can list several and the country counts add to more than the recall count.
  In the 2014 to 2026 window China appears on 2,312 of 3,986 recalls, the
  United States on 753, and 122 countries appear at least once.
- `RemedyOptions` is nearly an enum (Refund, Repair, Replace, Dispose, New
  Instructions, Label, Inspect) with two junk rows in it: one carries `R` and
  one carries a whole paragraph of consumer instructions. The adapter keeps
  whatever the agency sends and sorts the counts, so the tail of the list
  shows the mess rather than hiding it.
- The service holds recalls from the 1970s. The adapter starts at 2014, which
  keeps the window to 13 requests and to the years a reading of the current
  trend needs.
- The committed snapshot (`cpsc-product-recalls-2026-10-02.json`) holds the
  folded counts, not the raw years, because a year of raw rows is about a
  megabyte and the counts are a few kilobytes. The second fixture
  (`cpsc-recall-rows-2014-2026-sampled-2026-10-02.json`) holds the first three
  recalls of every year in the window, which is what the registry test answers
  each per-year request with.

## Notes on the Consumer Complaint Database

- The adapter reads
  `https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/`,
  the search endpoint behind the public Consumer Complaint Database. It is
  keyless. The bureau answers a scripted request with 403 and a request with a
  declared user agent with 200.
- The search API computes its term aggregations on every request, which takes
  the body from about fifteen kilobytes to about four hundred. Adding
  `no_aggs=true` drops them, so the adapter asks for `size=0&no_aggs=true` and
  reads `hits.total.value` when it only needs a count, and makes one extra
  request without `no_aggs` for the product and company tallies.
- The API answers one question per request and has no date sort, so the window
  costs one request per year plus one for the tallies plus one or two to find
  the newest day. `findNewestCfpComplaintDate` walks back from today and stops
  at the first day with a complaint.
- The first year in the window, 2011, holds only December: the bureau
  published its first complaints on 1 December 2011. It is kept rather than
  dropped, and the page's data note says the first bar covers one month.
- The product tally splits credit reporting across more than one label because
  the bureau changed its product taxonomy over the years. The adapter keeps
  whatever the API sends rather than merging labels, so a reader of
  `topProducts` should not assume the labels are stable.
- The committed snapshot (`cfpb-consumer-complaints-2026-10-03.json`) holds
  the folded counts, not the eighteen million raw rows. The registry test
  answers each per-year request, the newest-day probe, and the tally request
  from that one fixture.

## Checks

```sh
npm run test --workspace @usa-open-data-connectors/usa-sources
npm run test:smoke --workspace @usa-open-data-connectors/usa-sources   # hits the live API
```
