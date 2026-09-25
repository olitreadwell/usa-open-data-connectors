import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { blsUnemploymentAdapter } from './blsSeries.js';
import { cdcCountyObesityAdapter } from './cdcCountyObesity.js';
import { usgsHawaiiEarthquakesAdapter } from './usgsEarthquakes.js';
import {
  getUsDataSource,
  probeAllUsDataSources,
  probeUsDataSource,
  US_DATA_SOURCES,
} from './registry.js';

// Each adapter parses its own response shape, so the stubs answer with the
// raw fixture for the host being asked rather than with a parsed value.
const RAW_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/bls-unemployment-rate.json'),
  'utf8'
);
const RAW_USGS_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/usgs-hawaii-earthquakes.json'),
  'utf8'
);
const RAW_CDC_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/cdc-county-obesity-2026-09-25.json'),
  'utf8'
);

/**
 * Pick the fixture that answers a request, by exact host.
 *
 * Parsing the URL and comparing `hostname` keeps the match on the real host, so
 * a URL that merely mentions `data.cdc.gov` elsewhere cannot select the wrong
 * fixture (`js/incomplete-url-substring-sanitization`).
 */
function rawFixtureForUrl(url: string): string {
  const { hostname } = new URL(url);
  if (hostname === 'earthquake.usgs.gov') {
    return RAW_USGS_FIXTURE;
  }
  return hostname === 'data.cdc.gov' ? RAW_CDC_FIXTURE : RAW_FIXTURE;
}

/** A fetch stub that answers each source with its own fixture. */
const FIXTURE_FETCH = (async (input: string | URL) =>
  new Response(rawFixtureForUrl(String(input)), {
    status: 200,
  })) as unknown as typeof globalThis.fetch;

describe('US_DATA_SOURCES', () => {
  it('registers the unemployment adapter with a unique id', () => {
    const ids = US_DATA_SOURCES.map((source) => source.id);
    expect(ids).toContain('bls-unemployment-rate');
    expect(ids).toContain('usgs-hawaii-earthquakes');
    expect(ids).toContain('cdc-county-obesity');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks every source as keyless or keyed', () => {
    for (const source of US_DATA_SOURCES) {
      expect(['none', 'key']).toContain(source.auth);
    }
  });

  it('gives every source a fixture it can load', () => {
    for (const source of US_DATA_SOURCES) {
      expect(() => source.loadFixture()).not.toThrow();
    }
  });
});

describe('getUsDataSource', () => {
  it('finds a source by id', () => {
    expect(getUsDataSource('bls-unemployment-rate')).toBe(blsUnemploymentAdapter);
    expect(getUsDataSource('usgs-hawaii-earthquakes')).toBe(usgsHawaiiEarthquakesAdapter);
    expect(getUsDataSource('cdc-county-obesity')).toBe(cdcCountyObesityAdapter);
  });

  it('returns undefined for an unknown id', () => {
    expect(getUsDataSource('nope')).toBeUndefined();
  });
});

describe('probeUsDataSource', () => {
  it('reports ok when the source answers', async () => {
    const fetchImpl = (async () =>
      new Response(RAW_FIXTURE, { status: 200 })) as unknown as typeof globalThis.fetch;
    const probe = await probeUsDataSource(blsUnemploymentAdapter, { fetchImpl });
    expect(probe.ok).toBe(true);
    expect(probe.status).toBe('ok');
    expect(probe.sample).toContain('LNS14000000');
  });

  it('reports the failure message when the source throws', async () => {
    const fetchImpl = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    const probe = await probeUsDataSource(blsUnemploymentAdapter, { fetchImpl });
    expect(probe.ok).toBe(false);
    expect(probe.status).toContain('500');
  });
});

describe('probeAllUsDataSources', () => {
  it('probes every registered source', async () => {
    const probes = await probeAllUsDataSources({ fetchImpl: FIXTURE_FETCH });
    expect(probes).toHaveLength(US_DATA_SOURCES.length);
    expect(probes.every((probe) => probe.ok)).toBe(true);
  });
});
