import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildSanFranciscoOpenDataCatalogueUrl,
  fetchSanFranciscoOpenDataCatalogue,
  parseSanFranciscoOpenDataCataloguePayload,
  SAN_FRANCISCO_OPEN_DATA_API_BASE,
  SAN_FRANCISCO_OPEN_DATA_CATALOGUE_LIMIT,
  sanFranciscoOpenDataCatalogueAdapter,
} from './sanFranciscoOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/san-francisco-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('San Francisco catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildSanFranciscoOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(SAN_FRANCISCO_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(SAN_FRANCISCO_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseSanFranciscoOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(6);
    expect(catalogue.newestEntry.id).toBe('xdae-a7y7');
    expect(catalogue.categories[0]).toEqual({
      category: 'Geographic Locations and Boundaries',
      entryCount: 4,
    });
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(sanFranciscoOpenDataCatalogueAdapter.id).toBe('san-francisco-open-data-catalogue');
    expect(sanFranciscoOpenDataCatalogueAdapter.auth).toBe('none');
    expect(sanFranciscoOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchSanFranciscoOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe(
      'xdae-a7y7'
    );
  });
});
