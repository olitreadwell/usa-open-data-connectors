import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildPennsylvaniaOpenDataCatalogueUrl,
  fetchPennsylvaniaOpenDataCatalogue,
  parsePennsylvaniaOpenDataCataloguePayload,
  PENNSYLVANIA_OPEN_DATA_API_BASE,
  PENNSYLVANIA_OPEN_DATA_CATALOGUE_LIMIT,
  pennsylvaniaOpenDataCatalogueAdapter,
} from './pennsylvaniaOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/pennsylvania-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('Pennsylvania catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildPennsylvaniaOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(PENNSYLVANIA_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(PENNSYLVANIA_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parsePennsylvaniaOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(2);
    expect(catalogue.newestEntry.id).toBe('85a7-fr6c');
    expect(catalogue.categories[0]).toEqual({
      category: 'Energy and the Environment',
      entryCount: 5,
    });
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(pennsylvaniaOpenDataCatalogueAdapter.id).toBe('pennsylvania-open-data-catalogue');
    expect(pennsylvaniaOpenDataCatalogueAdapter.auth).toBe('none');
    expect(pennsylvaniaOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchPennsylvaniaOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe(
      '85a7-fr6c'
    );
  });
});
