# USA Open Data Connectors

TypeScript connectors for US public data in `packages/usa-sources`, with an
HTTP API and a CLI on top of them.

The repo was copied from `nz-open-data-connectors`. The TypeScript side has
been converted: the npm scope is `@open-data-connectors`, the NZ packages are
gone, and the API and CLI read the US registry. The Python and Ruby ports in
`python/` and `ruby/` still implement the NZ design.

## Adapters

| Source | Adapter id | Status |
| --- | --- | --- |
| BLS | `bls-unemployment-rate` | live, keyless, fixture committed |
| USGS | `usgs-hawaii-earthquakes` | live, keyless, fixture committed |
| Census Bureau Data API | - | not started |
| api.data.gov | - | not started |
| BEA | - | not started |
| EIA | - | not started |
| EPA | - | not started |
| CDC | - | not started |
| NOAA | - | not started |

## Remaining work

- [ ] Port `python/` and `ruby/` to the US sources, or delete them
- [x] Replace the NZ entries in `docs/CONNECTOR_DISCOVERY.md` with US ones
- [ ] Add the pending adapters above, each verified live before commit
- [ ] Add each new adapter to the registry so the API and CLI pick it up
