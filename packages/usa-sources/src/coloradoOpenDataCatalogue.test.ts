import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildColoradoOpenDataCatalogueUrl,
  COLORADO_OPEN_DATA_API_BASE,
  COLORADO_OPEN_DATA_CATALOGUE_LIMIT,
  coloradoOpenDataCatalogueAdapter,
  fetchColoradoOpenDataCatalogue,
  parseColoradoOpenDataCataloguePayload,
} from './coloradoOpenDataCatalogue.js';

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'src/fixtures/colorado-open-data-catalogue-2026-11-08.json'),
    'utf8'
  )
) as unknown;

describe('Colorado catalogue adapter', () => {
  it('builds the live endpoint URL', () => {
    const url = new URL(buildColoradoOpenDataCatalogueUrl());
    expect(url.origin + url.pathname).toBe(COLORADO_OPEN_DATA_API_BASE);
    expect(url.searchParams.get('limit')).toBe(String(COLORADO_OPEN_DATA_CATALOGUE_LIMIT));
  });

  it('parses the committed live snapshot', () => {
    const catalogue = parseColoradoOpenDataCataloguePayload(FIXTURE);
    expect(catalogue.entryCount).toBe(10);
    expect(catalogue.datasetCount).toBe(0);
    expect(catalogue.newestEntry.id).toBe('kmes-av87');
    expect(catalogue.categories).toEqual([{ category: 'Uncategorised', entryCount: 10 }]);
    expect(catalogue.entries[0]?.attribution).toBe('State of Colorado');
    expect(catalogue.entries[0]?.licenceUrl).toContain('State of Colorado');
  });

  it('exposes a keyless adapter with the live fixture', () => {
    expect(coloradoOpenDataCatalogueAdapter.id).toBe('colorado-open-data-catalogue');
    expect(coloradoOpenDataCatalogueAdapter.auth).toBe('none');
    expect(coloradoOpenDataCatalogueAdapter.loadFixture().entryCount).toBe(10);
  });

  it('fetches through the injected fetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    expect((await fetchColoradoOpenDataCatalogue({ fetchImpl })).newestEntry.id).toBe('kmes-av87');
  });
});
