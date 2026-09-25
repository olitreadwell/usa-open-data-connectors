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

## Checks

```sh
npm run test --workspace @nzlab/usa-sources
npm run test:smoke --workspace @nzlab/usa-sources   # hits the live API
```
