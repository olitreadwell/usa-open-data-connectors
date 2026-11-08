import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMichiganOpenDataCatalogueUrl,
  fetchMichiganOpenDataCatalogue,
  MICHIGAN_OPEN_DATA_API_BASE,
  MICHIGAN_OPEN_DATA_CATALOGUE_LIMIT,
  michiganOpenDataCatalogueAdapter,
  parseMichiganOpenDataCataloguePayload,
} from './michiganOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/michigan-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('Michigan catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildMichiganOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(MICHIGAN_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(MICHIGAN_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseMichiganOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(3);
    expect(catalogue.newestEntry.id).toBe('4qfe-hfck');
    expect(catalogue.categories[0]).toEqual({ category: 'Uncategorised', entryCount: 9 });
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(michiganOpenDataCatalogueAdapter.id).toBe('michigan-open-data-catalogue');
    expect(michiganOpenDataCatalogueAdapter.auth).toBe('none');
    expect(michiganOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchMichiganOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe('4qfe-hfck');
  });
});
