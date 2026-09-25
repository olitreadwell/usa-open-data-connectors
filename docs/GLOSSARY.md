# Glossary

Plain-language definitions. Terms used in this repo, in alphabetical order.

## A

- **Adapter** - one piece of code that talks to one data source and
  returns plain objects. For example, `blsUnemploymentAdapter`.

- **API** - a way for one program to ask another program for data.

- **Audit** - a tool that checks dependencies for known problems.

## B

- **BLS (Bureau of Labor Statistics)** - the US agency that publishes the
  unemployment rate. The BLS public data API serves one series per request.

## C

- **CORS (Cross-Origin Resource Sharing)** - a browser rule that decides
  whether a page from one site may call an API on another site.

- **Coverage** - the share of code exercised by tests. A 60% threshold means
  at least 60% of lines run during tests.

## E

- **E2E (end-to-end)** - a test that runs the real app over a real
  connection, like booting the HTTP server and calling it.

- **Endpoint** - one address that an API answers. For example, `/health`.

## F

- **Fixture** - a real snapshot of a live API response, stored in the repo
  and used by offline tests.

## I

- **Integration test** - a test that checks how pieces work together, such
  as the API routes wired to the adapter registry.

## J

- **JSON** - JavaScript Object Notation. A text format for data.

## K

- **Key** - a secret string that unlocks more of an API. Optional for the
  sources registered today.

## L

- **Lint** - a tool that reads code and flags style and safety problems.

## O

- **Observation** - one point in a time series, for example one month of the
  unemployment rate.

- **OpenAPI** - a machine-readable description of an API's endpoints.

## P

- **Port** - a copy of the same design in another language. `python/` and
  `ruby/` are ports of the original connector design.

- **Probe** - a live fetch that checks whether a source answers and parses.

## R

- **Rate limit** - the maximum number of requests an API allows in a time
  window.

- **Registry** - the list of source adapters (`US_DATA_SOURCES`) that the API
  and CLI read from.

## S

- **Series id** - the identifier a publisher uses for one time series, for
  example `LNS14000000` (the US unemployment rate).

- **Smoke test** - a quick live test against the real service, opt-in via
  `RUN_SMOKE=1`.

## T

- **Type-check** - a tool that proves code uses values of the right type.

## U

- **Unit test** - a test of one small piece of logic in isolation.

- **USGS (US Geological Survey)** - the agency that publishes the earthquake
  catalogue used by the `usgs-hawaii-earthquakes` adapter.

## Z

- **Zod** - a library that checks data against a schema and rejects bad
  input.
