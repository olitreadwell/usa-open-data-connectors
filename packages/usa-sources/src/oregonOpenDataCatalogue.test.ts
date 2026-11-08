import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildOregonOpenDataCatalogueUrl,
  fetchOregonOpenDataCatalogue,
  OREGON_OPEN_DATA_API_BASE,
  OREGON_OPEN_DATA_CATALOGUE_LIMIT,
  oregonOpenDataCatalogueAdapter,
  parseOregonOpenDataCataloguePayload,
} from './oregonOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/oregon-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('Oregon catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildOregonOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(OREGON_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(OREGON_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseOregonOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(8);
    expect(catalogue.newestEntry.id).toBe('w7g5-zeds');
    expect(catalogue.categories[0]).toEqual({ category: 'Revenue & Expense', entryCount: 5 });
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(oregonOpenDataCatalogueAdapter.id).toBe('oregon-open-data-catalogue');
    expect(oregonOpenDataCatalogueAdapter.auth).toBe('none');
    expect(oregonOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchOregonOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe('w7g5-zeds');
  });
});
