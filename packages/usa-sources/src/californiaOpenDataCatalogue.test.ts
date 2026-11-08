import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildCaliforniaOpenDataCatalogueUrl,
  CALIFORNIA_OPEN_DATA_API_BASE,
  CALIFORNIA_OPEN_DATA_CATALOGUE_LIMIT,
  californiaOpenDataCatalogueAdapter,
  fetchCaliforniaOpenDataCatalogue,
  parseCaliforniaOpenDataCataloguePayload,
} from './californiaOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/california-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('California catalogue adapter', () => {
  it('builds the keyless CKAN search URL', () => {
    const url = new URL(buildCaliforniaOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(CALIFORNIA_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('rows')).toBe(String(CALIFORNIA_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseCaliforniaOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(10);
    expect(catalogue.catalogueCount).toBe(4696);
    expect(catalogue.newestEntry.id).toBe('dfba461d-4f4a-4dae-a31c-bed4f833db18');
    expect(catalogue.categories).toEqual([
      { category: 'Uncategorised', entryCount: 9 },
      { category: 'Health and Human Services', entryCount: 1 },
    ]);
    expect(catalogue.entries[0]).toEqual({
      id: '14aca9b5-d384-43eb-ba8e-81fc94aea432',
      name: 'california-grants-portal-grant-awards-2024-2025',
      title: 'California Grants Portal Grant Awards 2024-2025',
      assetType: 'dataset',
      category: null,
      createdAtEpochSeconds: 1719825799,
      viewLastModifiedEpochSeconds: 1794126938,
      resourceCount: 1,
      licenceUrl: 'License not specified',
      attribution: 'California State Library',
    });
  });

  it('rejects a malformed CKAN envelope', () => {
    expect(() => parseCaliforniaOpenDataCataloguePayload({ success: false })).toThrow(
      UsSourceParseError
    );
    expect(() =>
      parseCaliforniaOpenDataCataloguePayload({ success: true, result: { count: 0, results: [] } })
    ).toThrow(UsSourceParseError);
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(californiaOpenDataCatalogueAdapter.id).toBe('california-open-data-catalogue');
    expect(californiaOpenDataCatalogueAdapter.auth).toBe('none');
    expect(californiaOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchCaliforniaOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe(
      'dfba461d-4f4a-4dae-a31c-bed4f833db18'
    );
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchCaliforniaOpenDataCatalogue({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});
