import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildWashingtonStateOpenDataCatalogueUrl,
  fetchWashingtonStateOpenDataCatalogue,
  parseWashingtonStateOpenDataCataloguePayload,
  WASHINGTON_STATE_OPEN_DATA_API_BASE,
  WASHINGTON_STATE_OPEN_DATA_CATALOGUE_LIMIT,
  washingtonStateOpenDataCatalogueAdapter,
} from './washingtonStateOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/washington-state-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('Washington State catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildWashingtonStateOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(WASHINGTON_STATE_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(WASHINGTON_STATE_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseWashingtonStateOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(7);
    expect(catalogue.newestEntry.id).toBe('jgjp-9nhw');
    expect(catalogue.categories[0]).toEqual({ category: 'education', entryCount: 6 });
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(washingtonStateOpenDataCatalogueAdapter.id).toBe('washington-state-open-data-catalogue');
    expect(washingtonStateOpenDataCatalogueAdapter.auth).toBe('none');
    expect(washingtonStateOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchWashingtonStateOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe(
      'jgjp-9nhw'
    );
  });
});
