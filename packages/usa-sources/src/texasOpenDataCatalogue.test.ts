import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildTexasOpenDataCatalogueUrl,
  fetchTexasOpenDataCatalogue,
  parseTexasOpenDataCataloguePayload,
  TEXAS_OPEN_DATA_API_BASE,
  TEXAS_OPEN_DATA_CATALOGUE_LIMIT,
  texasOpenDataCatalogueAdapter,
} from './texasOpenDataCatalogue.js';

const FIXTURE_NAME = 'texas-open-data-catalogue-2026-11-08.json';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText(FIXTURE_NAME);

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
    metadata: {
      custom_fields: {
        'Common Core': {
          License: 'http://www.usa.gov/publicdomain/label/1.0/',
          Publisher: 'State of Texas',
        },
      },
    },
  },
  {
    id: 'bbbb-2222',
    name: 'One linked map',
    assetType: 'href',
    category: null,
    viewType: 'href',
    createdAt: 300,
    viewLastModified: 300,
    viewCount: 2,
    downloadCount: 0,
  },
]);

describe('buildTexasOpenDataCatalogueUrl', () => {
  it('asks the catalogue for a short page', () => {
    const url = new URL(buildTexasOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(TEXAS_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(TEXAS_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('takes an entry cap from the caller', () => {
    expect(new URL(buildTexasOpenDataCatalogueUrl({ limit: 25 })).searchParams.get('limit')).toBe(
      '25'
    );
  });
});

describe('parseTexasOpenDataCataloguePayload', () => {
  it('reads the entry fields out of each row', () => {
    const catalogue = parseTexasOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.entryCount).toBe(2);
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
      licenceUrl: 'http://www.usa.gov/publicdomain/label/1.0/',
      attribution: 'State of Texas',
    });
  });

  it('counts datasets and names the newest entry', () => {
    const catalogue = parseTexasOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.datasetCount).toBe(1);
    expect(catalogue.newestEntry.id).toBe('bbbb-2222');
  });

  it('counts a missing category under Uncategorised', () => {
    const catalogue = parseTexasOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.categories).toEqual([
      { category: 'Transportation', entryCount: 1 },
      { category: 'Uncategorised', entryCount: 1 },
    ]);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseTexasOpenDataCataloguePayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseTexasOpenDataCataloguePayload([])).toThrow(UsSourceParseError);
  });

  it('stops on an entry without an id or creation time', () => {
    expect(() => parseTexasOpenDataCataloguePayload([{ name: 'No id' }])).toThrow(
      UsSourceParseError
    );
  });
});

describe('fetchTexasOpenDataCatalogue', () => {
  it('requests the catalogue and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const catalogue = await fetchTexasOpenDataCatalogue({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(catalogue.entryCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchTexasOpenDataCatalogue({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('texasOpenDataCatalogueAdapter', () => {
  it('registers as a keyless source', () => {
    expect(texasOpenDataCatalogueAdapter.id).toBe('texas-open-data-catalogue');
    expect(texasOpenDataCatalogueAdapter.auth).toBe('none');
    expect(texasOpenDataCatalogueAdapter.description).toContain('Texas');
  });

  it('parses a payload through the adapter surface', () => {
    expect(texasOpenDataCatalogueAdapter.parse(JSON.parse(SMALL_PAYLOAD)).entryCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(texasOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await texasOpenDataCatalogueAdapter.fetchLive({ fetchImpl })).entries[1]?.id).toBe(
      'bbbb-2222'
    );
  });
});

// The page the catalogue answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed Texas fixture', () => {
  const catalogue = texasOpenDataCatalogueAdapter.loadFixture();

  it('holds ten entries and names the newest', () => {
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.newestEntry.id).toBe('nqfs-mwbh');
  });

  it('counts the entries the fixture carries', () => {
    expect(catalogue.datasetCount).toBe(5);
    expect(catalogue.entries[0]?.licenceUrl).toBe('');
    expect(catalogue.entries[0]?.attribution).toBe('');
    expect(catalogue.categories[0]).toEqual({ category: 'Uncategorised', entryCount: 9 });
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseTexasOpenDataCataloguePayload(JSON.parse(FIXTURE));
    expect(fromText.entryCount).toBe(10);
  });
});
