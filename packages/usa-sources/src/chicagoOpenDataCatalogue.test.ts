import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildChicagoOpenDataCatalogueUrl,
  CHICAGO_OPEN_DATA_API_BASE,
  CHICAGO_OPEN_DATA_CATALOGUE_LIMIT,
  chicagoOpenDataCatalogueAdapter,
  fetchChicagoOpenDataCatalogue,
  parseChicagoOpenDataCataloguePayload,
} from './chicagoOpenDataCatalogue.js';

const FIXTURE_NAME = 'chicago-open-data-catalogue-2026-11-08.json';

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
    category: 'Administration & Finance',
    viewType: 'tabular',
    createdAt: 100,
    viewLastModified: 200,
    viewCount: 5,
    downloadCount: 1,
    metadata: {
      custom_fields: {
        'Common Core': {
          License: 'http://www.usa.gov/publicdomain/label/1.0/',
          Publisher: 'City of Chicago',
        },
      },
    },
  },
  {
    id: 'bbbb-2222',
    name: 'One story',
    assetType: 'story',
    category: null,
    viewType: 'story',
    createdAt: 300,
    viewLastModified: 300,
    viewCount: 2,
    downloadCount: 0,
  },
]);

describe('buildChicagoOpenDataCatalogueUrl', () => {
  it('asks the catalogue for a short page', () => {
    const url = new URL(buildChicagoOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(CHICAGO_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(CHICAGO_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('takes an entry cap from the caller', () => {
    expect(new URL(buildChicagoOpenDataCatalogueUrl({ limit: 25 })).searchParams.get('limit')).toBe(
      '25'
    );
  });
});

describe('parseChicagoOpenDataCataloguePayload', () => {
  it('reads the entry fields out of each row', () => {
    const catalogue = parseChicagoOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.entryCount).toBe(2);
    expect(catalogue.entries[0]).toEqual({
      id: 'aaaa-1111',
      name: 'One dataset',
      assetType: 'dataset',
      category: 'Administration & Finance',
      viewType: 'tabular',
      createdAtEpochSeconds: 100,
      viewLastModifiedEpochSeconds: 200,
      viewCount: 5,
      downloadCount: 1,
      licenceUrl: 'http://www.usa.gov/publicdomain/label/1.0/',
      attribution: 'City of Chicago',
    });
  });

  it('counts datasets and names the newest entry', () => {
    const catalogue = parseChicagoOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.datasetCount).toBe(1);
    expect(catalogue.newestEntry.id).toBe('bbbb-2222');
  });

  it('counts a missing category under Uncategorised', () => {
    const catalogue = parseChicagoOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.categories).toEqual([
      { category: 'Administration & Finance', entryCount: 1 },
      { category: 'Uncategorised', entryCount: 1 },
    ]);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseChicagoOpenDataCataloguePayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseChicagoOpenDataCataloguePayload([])).toThrow(UsSourceParseError);
  });

  it('stops on an entry without an id or creation time', () => {
    expect(() => parseChicagoOpenDataCataloguePayload([{ name: 'No id' }])).toThrow(
      UsSourceParseError
    );
  });
});

describe('fetchChicagoOpenDataCatalogue', () => {
  it('requests the catalogue and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const catalogue = await fetchChicagoOpenDataCatalogue({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(catalogue.entryCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchChicagoOpenDataCatalogue({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('chicagoOpenDataCatalogueAdapter', () => {
  it('registers as a keyless source', () => {
    expect(chicagoOpenDataCatalogueAdapter.id).toBe('chicago-open-data-catalogue');
    expect(chicagoOpenDataCatalogueAdapter.auth).toBe('none');
    expect(chicagoOpenDataCatalogueAdapter.description).toContain('Chicago');
  });

  it('parses a payload through the adapter surface', () => {
    expect(chicagoOpenDataCatalogueAdapter.parse(JSON.parse(SMALL_PAYLOAD)).entryCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(chicagoOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await chicagoOpenDataCatalogueAdapter.fetchLive({ fetchImpl })).entries[1]?.id).toBe(
      'bbbb-2222'
    );
  });
});

// The page the catalogue answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed Chicago fixture', () => {
  const catalogue = chicagoOpenDataCatalogueAdapter.loadFixture();

  it('holds ten entries and names the newest', () => {
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.newestEntry.id).toBe('at9p-zwgd');
  });

  it('counts the entries the fixture carries', () => {
    expect(catalogue.datasetCount).toBe(5);
    expect(catalogue.entries[0]?.licenceUrl).toBe('');
    expect(catalogue.entries[0]?.attribution).toBe('');
    expect(catalogue.categories[0]).toEqual({
      category: 'Administration & Finance',
      entryCount: 5,
    });
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseChicagoOpenDataCataloguePayload(JSON.parse(FIXTURE));
    expect(fromText.entryCount).toBe(10);
  });
});
