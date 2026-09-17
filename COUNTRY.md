# USA Open Data Connectors

Scaffold repo derived from `nz-open-data-connectors`. The multi-language
design (TypeScript source of truth, Python + Ruby ports) carries over; the
source adapters are being ported from NZ sources to USA sources.

## Target adapters (port in progress)

| Source | Adapter package | Status |
| --- | --- | --- |
| Census Bureau Data API | `packages/*` | pending |
| api.data.gov | `packages/*` | pending |
| BLS | `packages/*` | pending |
| BEA | `packages/*` | pending |
| EIA | `packages/*` | pending |
| USGS | `packages/*` | pending |
| EPA | `packages/*` | pending |
| CDC | `packages/*` | pending |
| NOAA | `packages/*` | pending |

## Port checklist

- [ ] Rename adapter interfaces (NzDataAdapter -> USADataAdapter)
- [ ] Port source adapters above, verified live (HTTP 200) before commit
- [ ] Port the API and CLI exposure
- [ ] Port Python and Ruby packages with matching tests

See ARCHITECTURE.md in the NZ origin for the one-design contract.
