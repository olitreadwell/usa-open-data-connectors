# Connector discovery notes (US)

Findings from the US source pass. Two keyless adapters are built and verified
against live APIs, and each has a fixture committed from the same endpoint on
2026-09-23.

## Adapters built

| Adapter | Source | Endpoint | Fixture |
| --- | --- | --- | --- |
| `bls-unemployment-rate` | Bureau of Labor Statistics | `https://api.bls.gov/publicAPI/v2/timeseries/data` | `bls-unemployment-rate.json` |
| `usgs-hawaii-earthquakes` | US Geological Survey | `https://earthquake.usgs.gov/fdsnws/event/1/query` | `usgs-hawaii-earthquakes.json` |

Both are keyless and return JSON. The BLS adapter reads the national
unemployment rate (`LNS14000000`), monthly and seasonally adjusted. The USGS
adapter reads the Hawaiian islands box at magnitude 2.5 and above, oldest
first.

## Exact curl commands

```sh
# BLS unemployment rate, one request per ten-year window
curl -sS "https://api.bls.gov/publicAPI/v2/timeseries/data/LNS14000000?startyear=2016&endyear=2025"

# USGS earthquakes near Hawaii, oldest first
curl -sS "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2025-01-01&endtime=2026-01-01&minmagnitude=2.5&minlatitude=18.5&maxlatitude=22.5&minlongitude=-161&maxlongitude=-154&orderby=time"
```

## Findings table

| Source | Status | Notes |
| --- | --- | --- |
| BLS `api.bls.gov` | LIVE | Keyless. One request covers at most ten years, so `fetchBlsSeries` splits a longer range into windows. Keyless access allows 25 series queries a day, and a registered key raises that to 500. A day past the quota answers `REQUEST_NOT_PROCESSED` with an empty `Results` object rather than an HTTP error, which the parser rejects as a malformed payload. |
| USGS `earthquake.usgs.gov` | LIVE | Keyless. The FDSN event query answers a window of any length. The feed mixes tectonic earthquakes with quarry blasts, explosions, and ice quakes, and a row can arrive without a magnitude, so the parser keeps tectonic rows that carry both a magnitude and a depth. |

## Candidates not yet probed

These sit on the backlog in `COUNTRY.md`. None has been checked live, so no
status is claimed here.

| Source | What it would cover |
| --- | --- |
| Census Bureau Data API | Population, housing, and business statistics |
| api.data.gov | Shared key and catalogue across several federal APIs |
| Bureau of Economic Analysis | GDP and regional accounts |
| Energy Information Administration | Energy production and prices |
| EPA | Air, water, and facility data |
| CDC | Public health statistics |
| NOAA | Weather, climate, and ocean data |
