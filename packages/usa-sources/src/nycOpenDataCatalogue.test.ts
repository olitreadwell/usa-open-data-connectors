import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildNycOpenDataCatalogueUrl,
  fetchNycOpenDataCatalogue,
  NYC_OPEN_DATA_API_BASE,
  NYC_OPEN_DATA_CATALOGUE_LIMIT,
  nycOpenDataCatalogueAdapter,
  parseNycOpenDataCataloguePayload,
} from './nycOpenDataCatalogue.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('nyc-open-data-catalogue-2026-10-19.json');

/** A tiny response with the same shape as the real one. */
const SMALL_PAYLOAD = JSON.stringify([
  {
    id: 'aaaa-1111',
    name: 'One dataset',
    assetType: 'dataset',
    category: 'Transportation',
    viewType: 'tabular',
    createdAt: 100,
    viewLastModified: 200,
    viewCount: 5,
    downloadCount: 1,
  },
  {
    id: 'bbbb-2222',
    name: 'One map',
    assetType: 'map',
    category: null,
    viewType: 'map',
    createdAt: 300,
    viewLastModified: 300,
    viewCount: 12,
    downloadCount: 0,
  },
  {
    id: 'cccc-3333',
    name: 'Another dataset',
    assetType: 'dataset',
    category: 'Transportation',
    viewType: 'tabular',
    createdAt: 200,
    viewLastModified: 250,
    viewCount: 4,
    downloadCount: 7,
  },
]);

describe('buildNycOpenDataCatalogueUrl', () => {
  it('asks the catalogue for a page of entries', () => {
    const url = new URL(buildNycOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(NYC_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(NYC_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('takes an entry cap from the caller', () => {
    expect(new URL(buildNycOpenDataCatalogueUrl({ limit: 5 })).searchParams.get('limit')).toBe('5');
  });
});

describe('parseNycOpenDataCataloguePayload', () => {
  it('reads the entry fields out of each row', () => {
    const catalogue = parseNycOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.entryCount).toBe(3);
    expect(catalogue.entries[0]).toEqual({
      id: 'aaaa-1111',
      name: 'One dataset',
      assetType: 'dataset',
      category: 'Transportation',
      viewType: 'tabular',
      createdAtEpochSeconds: 100,
      viewLastModifiedEpochSeconds: 200,
      viewCount: 5,
      downloadCount: 1,
    });
  });

  it('counts datasets, maps, and the totals', () => {
    const catalogue = parseNycOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.datasetCount).toBe(2);
    expect(catalogue.mapCount).toBe(1);
    expect(catalogue.totalViewCount).toBe(21);
    expect(catalogue.totalDownloadCount).toBe(8);
  });

  it('names the newest, most viewed, and most downloaded entries', () => {
    const catalogue = parseNycOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.newestEntry.id).toBe('bbbb-2222');
    expect(catalogue.mostViewedEntry.id).toBe('bbbb-2222');
    expect(catalogue.mostDownloadedEntry.id).toBe('cccc-3333');
  });

  it('counts a missing category under Uncategorised', () => {
    const catalogue = parseNycOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.categories).toEqual([
      { category: 'Transportation', entryCount: 2 },
      { category: 'Uncategorised', entryCount: 1 },
    ]);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseNycOpenDataCataloguePayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseNycOpenDataCataloguePayload({})).toThrow(UsSourceParseError);
    expect(() => parseNycOpenDataCataloguePayload([])).toThrow(UsSourceParseError);
  });

  it('stops on an entry without an id, name, or creation time', () => {
    expect(() => parseNycOpenDataCataloguePayload([{ name: 'No id' }])).toThrow(UsSourceParseError);
  });
});

describe('fetchNycOpenDataCatalogue', () => {
  it('requests the catalogue and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const catalogue = await fetchNycOpenDataCatalogue({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(catalogue.entryCount).toBe(3);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchNycOpenDataCatalogue({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('nycOpenDataCatalogueAdapter', () => {
  it('registers as a keyless source', () => {
    expect(nycOpenDataCatalogueAdapter.id).toBe('nyc-open-data-catalogue');
    expect(nycOpenDataCatalogueAdapter.auth).toBe('none');
    expect(nycOpenDataCatalogueAdapter.description).toContain('New York City');
  });

  it('parses a payload through the adapter surface', () => {
    expect(nycOpenDataCatalogueAdapter.parse(JSON.parse(SMALL_PAYLOAD)).entryCount).toBe(3);
  });

  it('reads the committed fixture', () => {
    expect(nycOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(50);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await nycOpenDataCatalogueAdapter.fetchLive({ fetchImpl })).entries[1]?.id).toBe(
      'bbbb-2222'
    );
  });
});

// The page the catalogue answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed NYC fixture', () => {
  const catalogue = nycOpenDataCatalogueAdapter.loadFixture();

  it('holds fifty entries and names the newest', () => {
    expect(catalogue.entryCount).toBe(50);
    expect(catalogue.newestEntry.id).toBe('irx2-vgm4');
  });

  it('counts the entries the fixture carries', () => {
    expect(catalogue.datasetCount).toBe(45);
    expect(catalogue.mapCount).toBe(5);
    expect(catalogue.totalViewCount).toBe(251_594);
    expect(catalogue.totalDownloadCount).toBe(64_174);
    expect(catalogue.categories[0]).toEqual({ category: 'Transportation', entryCount: 17 });
  });

  it('names the entries readers look at and download most', () => {
    expect(catalogue.mostViewedEntry.id).toBe('5ucz-vwe8');
    expect(catalogue.mostDownloadedEntry.id).toBe('5ucz-vwe8');
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseNycOpenDataCataloguePayload(JSON.parse(FIXTURE));
    expect(fromText.entryCount).toBe(50);
  });
});
