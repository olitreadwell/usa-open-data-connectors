import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildIllinoisOpenDataCatalogueUrl,
  fetchIllinoisOpenDataCatalogue,
  ILLINOIS_OPEN_DATA_API_BASE,
  ILLINOIS_OPEN_DATA_CATALOGUE_LIMIT,
  illinoisOpenDataCatalogueAdapter,
  parseIllinoisOpenDataCataloguePayload,
} from './illinoisOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/illinois-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('Illinois catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildIllinoisOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(ILLINOIS_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(ILLINOIS_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseIllinoisOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(3);
    expect(catalogue.newestEntry.id).toBe('hswm-jvu8');
    expect(catalogue.categories[0]).toEqual({
      category: 'Government and Public Employees',
      entryCount: 6,
    });
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(illinoisOpenDataCatalogueAdapter.id).toBe('illinois-open-data-catalogue');
    expect(illinoisOpenDataCatalogueAdapter.auth).toBe('none');
    expect(illinoisOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchIllinoisOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe('hswm-jvu8');
  });
});
