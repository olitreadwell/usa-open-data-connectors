# @nzlab/usa-sources

Uniform TypeScript adapters for US public data sources. Keyless first, with a
strict parser and a committed fixture behind every adapter so a build never
depends on a live API.

The package scope is still `@nzlab` because the rest of this repo is a
workspace under that scope already. Renaming the scope is a separate change.

## Sources

| id                        | publisher                  | auth | what it reads                                                       |
| ------------------------- | -------------------------- | ---- | ------------------------------------------------------------------- |
| `bls-unemployment-rate`   | Bureau of Labor Statistics | none | The national unemployment rate, monthly, seasonally adjusted        |
| `usgs-hawaii-earthquakes` | US Geological Survey       | none | Earthquakes of magnitude 2.5 and above near the Hawaiian islands    |
| `cdc-county-obesity`      | Centers for Disease Control (CDC) | none | The share of adults with obesity in each US county, from CDC PLACES |
| `ncei-annual-temperature` | NOAA National Centers for Environmental Information | none | Calendar-year average temperature for the contiguous United States, since 1895 |
| `noaa-sea-level` | NOAA Center for Operational Oceanographic Products and Services | none | Monthly mean sea level at a tide gauge, folded into calendar-year averages, since 1856 at The Battery |

## Usage

```ts
import { fetchBlsSeries, US_UNEMPLOYMENT_SERIES_ID } from '@nzlab/usa-sources';

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
} from '@nzlab/usa-sources';

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
} from '@nzlab/usa-sources';

const set = buildCdcCountyObesitySet(await fetchCdcCountyObesity());
console.log(set.countyCount, set.lowest.countyName, set.highest.percent, set.national.percent);
```

```ts
import {
  buildNceiAnnualTemperatureSeries,
  fetchNceiAnnualTemperature,
} from '@nzlab/usa-sources';

const series = await fetchNceiAnnualTemperature({ startYear: 1895, endYear: new Date().getFullYear() });
console.log(series.yearCount, series.warmest.year, series.coldest.valueFahrenheit);
```

```ts
import {
  buildNoaaSeaLevelSeries,
  fetchNoaaSeaLevel,
} from '@nzlab/usa-sources';

const seaLevel = buildNoaaSeaLevelSeries(await fetchNoaaSeaLevel());
console.log(
  seaLevel.station.name,
  seaLevel.yearCount,
  seaLevel.highest.year,
  seaLevel.trendMillimetresPerYear
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

## Checks

```sh
npm run test --workspace @nzlab/usa-sources
npm run test:smoke --workspace @nzlab/usa-sources   # hits the live API
```
