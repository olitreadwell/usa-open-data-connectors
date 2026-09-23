# @open-data-connectors/usa-sources

Uniform TypeScript adapters for US public data sources. Keyless first, with a
strict parser and a committed fixture behind every adapter so a build never
depends on a live API.

The HTTP API and the CLI read this package's registry (`US_DATA_SOURCES`), so a
new adapter is exposed on `/api/sources`, `/api/sources/{id}/probe`, and
`/api/sources/{id}/data` as soon as it is registered.

## Sources

| id                        | publisher                  | auth | what it reads                                                    |
| ------------------------- | -------------------------- | ---- | ---------------------------------------------------------------- |
| `bls-unemployment-rate`   | Bureau of Labor Statistics | none | The national unemployment rate, monthly, seasonally adjusted     |
| `usgs-hawaii-earthquakes` | US Geological Survey       | none | Earthquakes of magnitude 2.5 and above near the Hawaiian islands |

## Usage

```ts
import { fetchBlsSeries, US_UNEMPLOYMENT_SERIES_ID } from '@open-data-connectors/usa-sources';

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
} from '@open-data-connectors/usa-sources';

const earthquakes = await fetchUsgsEarthquakes({
  startDate: '2025-01-01',
  endDate: '2026-01-01',
  minMagnitude: USGS_HAWAII_MIN_MAGNITUDE,
  bounds: USGS_HAWAII_BOUNDS,
});
const catalogue = buildUsgsEarthquakeCatalogue(earthquakes);
console.log(catalogue.count, catalogue.strongest.place, catalogue.strongest.magnitude);
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

## Checks

```sh
npm run test --workspace @open-data-connectors/usa-sources
npm run test:smoke --workspace @open-data-connectors/usa-sources   # hits the live API
```
