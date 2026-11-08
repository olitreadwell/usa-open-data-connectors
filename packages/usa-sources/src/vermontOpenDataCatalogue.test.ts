import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildVermontOpenDataCatalogueUrl,
  fetchVermontOpenDataCatalogue,
  parseVermontOpenDataCataloguePayload,
  VERMONT_OPEN_DATA_API_BASE,
  VERMONT_OPEN_DATA_CATALOGUE_LIMIT,
  vermontOpenDataCatalogueAdapter,
} from './vermontOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/vermont-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('Vermont catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildVermontOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(VERMONT_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(VERMONT_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseVermontOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(6);
    expect(catalogue.newestEntry.id).toBe('6h48-n97g');
    expect(catalogue.categories[0]).toEqual({ category: 'Education', entryCount: 5 });
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(vermontOpenDataCatalogueAdapter.id).toBe('vermont-open-data-catalogue');
    expect(vermontOpenDataCatalogueAdapter.auth).toBe('none');
    expect(vermontOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchVermontOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe('6h48-n97g');
  });
});
