import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildSeattleOpenDataCatalogueUrl,
  fetchSeattleOpenDataCatalogue,
  parseSeattleOpenDataCataloguePayload,
  SEATTLE_OPEN_DATA_API_BASE,
  SEATTLE_OPEN_DATA_CATALOGUE_LIMIT,
  seattleOpenDataCatalogueAdapter,
} from './seattleOpenDataCatalogue.js';

const FIXTURE_NAME = 'seattle-open-data-catalogue-2026-11-08.json';

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
          Publisher: 'City of Seattle',
        },
      },
    },
  },
  {
    id: 'bbbb-2222',
    name: 'One federated map',
    assetType: 'federated_href',
    category: null,
    viewType: 'href',
    createdAt: 300,
    viewLastModified: 300,
    viewCount: 2,
    downloadCount: 0,
  },
]);

describe('buildSeattleOpenDataCatalogueUrl', () => {
  it('asks the catalogue for a short page', () => {
    const url = new URL(buildSeattleOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(SEATTLE_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(SEATTLE_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('takes an entry cap from the caller', () => {
    expect(new URL(buildSeattleOpenDataCatalogueUrl({ limit: 25 })).searchParams.get('limit')).toBe(
      '25'
    );
  });
});

describe('parseSeattleOpenDataCataloguePayload', () => {
  it('reads the entry fields out of each row', () => {
    const catalogue = parseSeattleOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
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
      attribution: 'City of Seattle',
    });
  });

  it('counts datasets and names the newest entry', () => {
    const catalogue = parseSeattleOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.datasetCount).toBe(1);
    expect(catalogue.newestEntry.id).toBe('bbbb-2222');
  });

  it('counts a missing category under Uncategorised', () => {
    const catalogue = parseSeattleOpenDataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.categories).toEqual([
      { category: 'Transportation', entryCount: 1 },
      { category: 'Uncategorised', entryCount: 1 },
    ]);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseSeattleOpenDataCataloguePayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseSeattleOpenDataCataloguePayload([])).toThrow(UsSourceParseError);
  });

  it('stops on an entry without an id or creation time', () => {
    expect(() => parseSeattleOpenDataCataloguePayload([{ name: 'No id' }])).toThrow(
      UsSourceParseError
    );
  });
});

describe('fetchSeattleOpenDataCatalogue', () => {
  it('requests the catalogue and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const catalogue = await fetchSeattleOpenDataCatalogue({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(catalogue.entryCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchSeattleOpenDataCatalogue({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('seattleOpenDataCatalogueAdapter', () => {
  it('registers as a keyless source', () => {
    expect(seattleOpenDataCatalogueAdapter.id).toBe('seattle-open-data-catalogue');
    expect(seattleOpenDataCatalogueAdapter.auth).toBe('none');
    expect(seattleOpenDataCatalogueAdapter.description).toContain('Seattle');
  });

  it('parses a payload through the adapter surface', () => {
    expect(seattleOpenDataCatalogueAdapter.parse(JSON.parse(SMALL_PAYLOAD)).entryCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(seattleOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await seattleOpenDataCatalogueAdapter.fetchLive({ fetchImpl })).entries[1]?.id).toBe(
      'bbbb-2222'
    );
  });
});

// The page the catalogue answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed Seattle fixture', () => {
  const catalogue = seattleOpenDataCatalogueAdapter.loadFixture();

  it('holds ten entries and names the newest', () => {
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.newestEntry.id).toBe('evhv-7f58');
  });

  it('counts the entries the fixture carries', () => {
    expect(catalogue.datasetCount).toBe(3);
    expect(catalogue.entries[0]?.licenceUrl).toContain(
      'The City of Seattle makes no representation or warranty'
    );
    expect(catalogue.entries[0]?.attribution).toBe('City of Seattle ArcGIS Online');
    expect(catalogue.categories[0]).toEqual({ category: 'Uncategorised', entryCount: 7 });
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseSeattleOpenDataCataloguePayload(JSON.parse(FIXTURE));
    expect(fromText.entryCount).toBe(10);
  });
});
