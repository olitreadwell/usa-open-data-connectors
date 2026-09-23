# @nzlab/usa-sources

Uniform TypeScript adapters for US public data sources. Keyless first, with a
strict parser and a committed fixture behind every adapter so a build never
depends on a live API.

The package scope is still `@nzlab` because the rest of this repo is a
workspace under that scope already. Renaming the scope is a separate change.

## Sources

| id                      | publisher                  | auth | what it reads                                                |
| ----------------------- | -------------------------- | ---- | ------------------------------------------------------------ |
| `bls-unemployment-rate` | Bureau of Labor Statistics | none | The national unemployment rate, monthly, seasonally adjusted |

## Usage

```ts
import { fetchBlsSeries, US_UNEMPLOYMENT_SERIES_ID } from '@nzlab/usa-sources';

const rate = await fetchBlsSeries(US_UNEMPLOYMENT_SERIES_ID, {
  startYear: 2006,
  endYear: 2025,
});
console.log(rate.latest.year, rate.latest.period, rate.latest.value);
```

## Notes on the BLS API

- The public API refuses a request spanning more than ten years, so
  `fetchBlsSeries` splits a longer range into windows. Twenty years costs two
  calls.
- Keyless access allows 25 series queries a day. A registered key raises that
  to 500, and the adapter takes `apiKey` for the day that matters.
- The agency uses `-` for a month it could not publish, and `M13` for an
  annual average. Both are dropped, so one year holds twelve monthly values.

## Checks

```sh
npm run test --workspace @nzlab/usa-sources
npm run test:smoke --workspace @nzlab/usa-sources   # hits the live API
```
