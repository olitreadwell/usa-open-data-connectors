import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildCdcSocrataCatalogueUrl,
  fetchCdcSocrataCatalogue,
  CDC_SOCRATA_CATALOGUE_API_BASE,
  cdcSocrataCatalogueAdapter,
  parseCdcSocrataCataloguePayload,
} from './cdcSocrataCatalogue.js';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText('cdc-socrata-catalogue-2026-10-05.json');

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

describe('buildCdcSocrataCatalogueUrl', () => {
  it('asks the catalogue for a short page', () => {
    const url = new URL(buildCdcSocrataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(CDC_SOCRATA_CATALOGUE_API_BASE);
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('takes an entry cap from the caller', () => {
    expect(new URL(buildCdcSocrataCatalogueUrl({ limit: 25 })).searchParams.get('limit')).toBe(
      '25'
    );
  });
});

describe('parseCdcSocrataCataloguePayload', () => {
  it('reads the entry fields out of each row', () => {
    const catalogue = parseCdcSocrataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
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
    const catalogue = parseCdcSocrataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.datasetCount).toBe(1);
    expect(catalogue.newestEntry.id).toBe('bbbb-2222');
  });

  it('counts a missing category under Uncategorised', () => {
    const catalogue = parseCdcSocrataCataloguePayload(JSON.parse(SMALL_PAYLOAD));
    expect(catalogue.categories).toEqual([
      { category: 'Alpha', entryCount: 1 },
      { category: 'Uncategorised', entryCount: 1 },
    ]);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseCdcSocrataCataloguePayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseCdcSocrataCataloguePayload([])).toThrow(UsSourceParseError);
  });

  it('stops on an entry without an id or creation time', () => {
    expect(() => parseCdcSocrataCataloguePayload([{ name: 'No id' }])).toThrow(UsSourceParseError);
  });
});

describe('fetchCdcSocrataCatalogue', () => {
  it('requests the catalogue and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const catalogue = await fetchCdcSocrataCatalogue({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(catalogue.entryCount).toBe(2);
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchCdcSocrataCatalogue({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('cdcSocrataCatalogueAdapter', () => {
  it('registers as a keyless source', () => {
    expect(cdcSocrataCatalogueAdapter.id).toBe('cdc-socrata-catalogue');
    expect(cdcSocrataCatalogueAdapter.auth).toBe('none');
    expect(cdcSocrataCatalogueAdapter.description).toContain('Socrata catalogue');
  });

  it('parses a payload through the adapter surface', () => {
    expect(cdcSocrataCatalogueAdapter.parse(JSON.parse(SMALL_PAYLOAD)).entryCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(cdcSocrataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await cdcSocrataCatalogueAdapter.fetchLive({ fetchImpl })).entries[1]?.id).toBe(
      'bbbb-2222'
    );
  });
});

// The page the catalogue answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed CDC fixture', () => {
  const catalogue = cdcSocrataCatalogueAdapter.loadFixture();

  it('holds ten entries and names the newest', () => {
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.newestEntry.id).toBe('ahfs-x44r');
  });

  it('counts the entries the fixture carries', () => {
    expect(catalogue.datasetCount).toBe(9);
    expect(catalogue.categories[0]).toEqual({
      category: 'National Center for Environmental Health',
      entryCount: 4,
    });
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseCdcSocrataCataloguePayload(JSON.parse(FIXTURE));
    expect(fromText.entryCount).toBe(10);
  });
});
