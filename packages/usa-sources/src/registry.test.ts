import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { blsUnemploymentAdapter } from './blsSeries.js';
import {
  getUsDataSource,
  probeAllUsDataSources,
  probeUsDataSource,
  US_DATA_SOURCES,
} from './registry.js';

// The live fetch parses a BLS response, so the stubs answer with the raw
// fixture rather than with the parsed series.
const RAW_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/fixtures/bls-unemployment-rate.json'),
  'utf8'
);

describe('US_DATA_SOURCES', () => {
  it('registers the unemployment adapter with a unique id', () => {
    const ids = US_DATA_SOURCES.map((source) => source.id);
    expect(ids).toContain('bls-unemployment-rate');
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
    const fetchImpl = (async () =>
      new Response(RAW_FIXTURE, { status: 200 })) as unknown as typeof globalThis.fetch;
    const probes = await probeAllUsDataSources({ fetchImpl });
    expect(probes).toHaveLength(US_DATA_SOURCES.length);
    expect(probes.every((probe) => probe.ok)).toBe(true);
  });
});
