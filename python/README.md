# nzdata (Python)

Keyless-first connectors for NZ public data, ported from the original NZ
TypeScript connector design. One runtime dependency:
`httpx` (urllib is blocked by Cloudflare on some NZ data endpoints).

## Install

```sh
pip install -e '.[dev]'
```

## Quick start

```python
from nzdata import create_stats_nz_client, probe_all_nz_data_sources

# Live probe every source, with optional keys.
probes = probe_all_nz_data_sources({
    "linz": "your-linz-key",          # optional
    "digitalnz": "your-digitalnz-key",  # optional
})
for probe in probes:
    print(probe.id, "ok" if probe.ok else probe.status)

# Stats NZ: catalogue, data, codelists.
client = create_stats_nz_client(subscription_key="your-stats-nz-key")  # key optional
dataflows = client.get_dataflow_catalogue()  # 911 dataflows, keyless
rows = client.get_data("AGR_AGR_003")         # keyless for AGR_* tables
```

## Sources

| id | Source | Auth | What it does |
| --- | --- | --- | --- |
| `geonet` | GeoNet | none | Felt earthquake reports |
| `data-govt-nz` | data.govt.nz search | none | Dataset search |
| `data-govt-datastore` | data.govt.nz datastore | none | Row pulls (e.g. MSD benefits) |
| `ade-search` | Aotearoa Data Explorer search | none | Dataflow search |
| `digitalnz` | DigitalNZ | key | Record search (key optional) |
| `trademe` | Trade Me | none | Category tree |
| `nzor` | NZ Organisms Register | none | Species name search |
| `linz` | LINZ Data Service | key | Layer search (key optional) |

## Tests

```sh
pytest tests            # unit tests, fixtures only, no network
RUN_SMOKE=1 pytest tests/test_smoke.py   # live smoke tests against the real APIs
```

Fixtures in `src/nzdata/fixtures/` are real snapshots from the live APIs.
Smoke tests are skipped by default and must be run explicitly.

## Check

```sh
ruff check src tests   # lint
mypy                   # type check
pytest                 # tests + 60% coverage gate
```

Dependencies are pinned and locked (`uv.lock`). Install the locked dev
environment with `uv sync --locked --extra dev`, or `pip install -e '.[dev]'`
for the pinned versions from `pyproject.toml`.

## License

MIT

## Publishing to PyPI

The name `nzdata` is free on PyPI. To publish:

1. Bump `version` in `pyproject.toml` and add a CHANGELOG entry.
2. Tag the release: `git tag python-v0.1.0 && git push origin python-v0.1.0`
3. The `Publish Python to PyPI` workflow builds and publishes with trusted publishing (enable it for this repo in PyPI settings).

Or publish manually:

```sh
cd python
python -m build
twine upload dist/*
```
