import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildBtsTransportationStatsUrl,
  fetchBtsTransportationStats,
  BTS_TRANSPORTATION_STATS_API_BASE,
  btsTransportationStatsAdapter,
  parseBtsTransportationStatsPayload,
} from './btsTransportationStats.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('bts-transportation-stats-2026-10-05.json');

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify([
  {
    id: 'aaaa-1111',
    name: 'One dataset',
    assetType: 'dataset',
    category: 'Alpha',
    viewType: 'tabular',
    createdAt: 100,
    viewLastModified: 200,
    viewCount: 5,
    downloadCount: 1,
  },
  {
    id: 'bbbb-2222',
    name: 'One chart',
    assetType: 'chart',
    category: null,
    viewType: 'chart',
    createdAt: 300,
    viewLastModified: 300,
    viewCount: 2,
    downloadCount: 0,
  },
]);

describe('buildBtsTransportationStatsUrl', () => {
  it('asks the catalogue for a short page', () => {
    const url = new URL(buildBtsTransportationStatsUrl());
    expect(url.origin + url.pathname).toBe(BTS_TRANSPORTATION_STATS_API_BASE);
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('takes an entry cap from the caller', () => {
    expect(new URL(buildBtsTransportationStatsUrl({ limit: 25 })).searchParams.get('limit')).toBe(
      '25'
    );
  });
});

describe('parseBtsTransportationStatsPayload', () => {
  it('reads the entry fields out of each row', () => {
    const catalogue = parseBtsTransportationStatsPayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.entryCount).toBe(2);
    expect(catalogue.entries[0]).toEqual({
      id: 'aaaa-1111',
      name: 'One dataset',
      assetType: 'dataset',
      category: 'Alpha',
      viewType: 'tabular',
      createdAtEpochSeconds: 100,
      viewLastModifiedEpochSeconds: 200,
      viewCount: 5,
      downloadCount: 1,
    });
  });

  it('counts datasets and names the newest entry', () => {
    const catalogue = parseBtsTransportationStatsPayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.datasetCount).toBe(1);
    expect(catalogue.newestEntry.id).toBe('bbbb-2222');
  });

  it('counts a missing category under Uncategorised', () => {
    const catalogue = parseBtsTransportationStatsPayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.categories).toEqual([
      { category: 'Alpha', entryCount: 1 },
      { category: 'Uncategorised', entryCount: 1 },
    ]);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseBtsTransportationStatsPayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseBtsTransportationStatsPayload([])).toThrow(UsSourceParseError);
  });

  it('stops on an entry without an id or creation time', () => {
    expect(() => parseBtsTransportationStatsPayload([{ name: 'No id' }])).toThrow(
      UsSourceParseError
    );
  });
});

describe('fetchBtsTransportationStats', () => {
  it('requests the catalogue and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const catalogue = await fetchBtsTransportationStats({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(catalogue.entryCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchBtsTransportationStats({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('btsTransportationStatsAdapter', () => {
  it('registers as a keyless source', () => {
    expect(btsTransportationStatsAdapter.id).toBe('bts-transportation-stats');
    expect(btsTransportationStatsAdapter.auth).toBe('none');
    expect(btsTransportationStatsAdapter.description).toContain(
      'Bureau of Transportation Statistics'
    );
  });

  it('parses a payload through the adapter surface', () => {
    expect(btsTransportationStatsAdapter.parse(JSON.parse(SMALL_PAYLOAD)).entryCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(btsTransportationStatsAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await btsTransportationStatsAdapter.fetchLive({ fetchImpl })).entries[1]?.id).toBe(
      'bbbb-2222'
    );
  });
});

// The page the catalogue answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed BTS fixture', () => {
  const catalogue = btsTransportationStatsAdapter.loadFixture();

  it('holds ten entries and names the newest', () => {
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.newestEntry.id).toBe('p8sk-eeaq');
  });

  it('counts the entries the fixture carries', () => {
    expect(catalogue.datasetCount).toBe(4);
    expect(catalogue.categories[0]).toEqual({ category: 'Aviation', entryCount: 5 });
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseBtsTransportationStatsPayload(JSON.parse(FIXTURE));
    expect(fromText.entryCount).toBe(10);
  });
});
