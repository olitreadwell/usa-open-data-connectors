# nzdata (Ruby)

Keyless-first connectors for NZ public data, ported from the original NZ
TypeScript connector design. One runtime dependency:
`rexml` (bundled with Ruby).

## Install

```sh
bundle install
```

## Quick start

```ruby
require 'nzdata'

# Live probe every source, with optional keys.
probes = Nzdata.probe_all_nz_data_sources(
  'linz' => 'your-linz-key',          # optional
  'digitalnz' => 'your-digitalnz-key'  # optional
)
probes.each { |probe| puts "#{probe.id}: #{probe.ok ? 'ok' : probe.status}" }

# Stats NZ: catalogue, data, codelists.
client = Nzdata.create_stats_nz_client(subscription_key: 'your-stats-nz-key')  # key optional
dataflows = client.get_dataflow_catalogue  # 911 dataflows, keyless
rows = client.get_data('AGR_AGR_003')       # keyless for AGR_* tables
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

## Check

```sh
bundle exec rake check    # rubocop lint + tests with a 60% coverage gate
```

## Tests

```sh
bundle exec rake test            # unit tests, fixtures only, no network
RUN_SMOKE=1 bundle exec rake test TEST=spec/smoke_spec.rb   # live smoke tests
```

Fixtures in `lib/nzdata/fixtures/` are real snapshots from the live APIs.
Smoke tests are skipped by default and must be run explicitly.

## License

MIT

## Publishing to RubyGems

The name `nzdata` is free on RubyGems. To publish:

1. Bump `spec.version` in `nzdata.gemspec` and add a CHANGELOG entry.
2. Tag the release: `git tag ruby-v0.1.0 && git push origin ruby-v0.1.0`
3. The `Publish Ruby gem to RubyGems` workflow builds and pushes the gem (needs the `RUBYGEMS_API_KEY` secret).

Or publish manually:

```sh
cd ruby
gem build nzdata.gemspec
gem push nzdata-0.1.0.gem
```
