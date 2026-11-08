import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildNhtsaVehicleModelsUrl,
  fetchNhtsaVehicleModels,
  NHTSA_DEFAULT_MAKE,
  NHTSA_DEFAULT_MODEL_YEAR,
  NHTSA_MODEL_PAGE_SIZE,
  NHTSA_VEHICLE_MODELS_API_BASE,
  nhtsaVehicleModelsAdapter,
  parseNhtsaVehicleModelsPayload,
} from './nhtsaVehicleModels.js';

const FIXTURE_NAME = 'nhtsa-vehicle-models-2025-honda-2026-11-08.json';

function readFixtureText(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', name), 'utf8');
}

const FIXTURE = readFixtureText(FIXTURE_NAME);

/** A tiny response with the same envelope as the real one. */
const SMALL_PAYLOAD = JSON.stringify({
  meta: {
    status: 200,
    messages: [],
    pagination: {
      count: 2,
      max: 100,
      offset: 0,
      sort: 'id',
      order: null,
      total: 2,
      currentUrl: 'https://api.nhtsa.gov/vehicles/models?modelYear=2025&make=Honda',
      nextUrl: null,
      previousUrl: null,
    },
    filters: null,
    decoder: [],
  },
  results: [
    { modelYear: 2025, make: 'HONDA', vehicleModel: 'ACCORD HYBRID' },
    { modelYear: 2025, make: 'HONDA', vehicleModel: 'CIVIC' },
  ],
});

describe('buildNhtsaVehicleModelsUrl', () => {
  it('asks for the default model year, make, and page size', () => {
    const url = new URL(buildNhtsaVehicleModelsUrl());
    expect(url.origin + url.pathname).toBe(NHTSA_VEHICLE_MODELS_API_BASE);
    expect(url.searchParams.get('modelYear')).toBe(String(NHTSA_DEFAULT_MODEL_YEAR));
    expect(url.searchParams.get('make')).toBe(NHTSA_DEFAULT_MAKE);
    expect(url.searchParams.get('max')).toBe(String(NHTSA_MODEL_PAGE_SIZE));
    expect(url.searchParams.get('offset')).toBe('0');
  });

  it('takes a model year, make, page size, and offset from the caller', () => {
    const url = new URL(
      buildNhtsaVehicleModelsUrl({ modelYear: 2024, make: 'Toyota', max: 25, offset: 50 })
    );
    expect(url.searchParams.get('modelYear')).toBe('2024');
    expect(url.searchParams.get('make')).toBe('Toyota');
    expect(url.searchParams.get('max')).toBe('25');
    expect(url.searchParams.get('offset')).toBe('50');
  });
});

describe('parseNhtsaVehicleModelsPayload', () => {
  it('reads the models and the pagination metadata', () => {
    const page = parseNhtsaVehicleModelsPayload(JSON.parse(SMALL_PAYLOAD));

    expect(page.modelCount).toBe(2);
    expect(page.totalCount).toBe(2);
    expect(page.offset).toBe(0);
    expect(page.max).toBe(100);
    expect(page.nextUrl).toBeNull();
    expect(page.models).toEqual([
      { modelYear: 2025, make: 'HONDA', vehicleModel: 'ACCORD HYBRID' },
      { modelYear: 2025, make: 'HONDA', vehicleModel: 'CIVIC' },
    ]);
  });

  it('accepts an empty model page', () => {
    const payload = JSON.parse(SMALL_PAYLOAD) as {
      meta: { pagination: { count: number; total: number } };
      results: unknown[];
    };
    payload.meta.pagination.count = 0;
    payload.meta.pagination.total = 0;
    payload.results = [];

    const page = parseNhtsaVehicleModelsPayload(payload);
    expect(page.modelCount).toBe(0);
    expect(page.totalCount).toBe(0);
  });

  it('stops on a payload that is not the expected shape', () => {
    expect(() => parseNhtsaVehicleModelsPayload('nope')).toThrow(UsSourceParseError);
    expect(() => parseNhtsaVehicleModelsPayload({})).toThrow(UsSourceParseError);
    expect(() => parseNhtsaVehicleModelsPayload({ meta: { status: 200 }, results: [{}] })).toThrow(
      UsSourceParseError
    );
  });

  it('reports a non-200 service status as an API error', () => {
    expect(() =>
      parseNhtsaVehicleModelsPayload({
        meta: {
          status: 500,
          messages: ['failed'],
          pagination: { count: 0, max: 100, offset: 0, total: 0 },
        },
        results: [],
      })
    ).toThrow(UsSourceApiError);
  });
});

describe('fetchNhtsaVehicleModels', () => {
  it('requests the models and folds the answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    const page = await fetchNhtsaVehicleModels({ modelYear: 2024, make: 'Toyota', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.searchParams.get('modelYear')).toBe('2024');
    expect(url.searchParams.get('make')).toBe('Toyota');
    expect(page.modelCount).toBe(2);
  });

  it('rejects a blank make before fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchNhtsaVehicleModels({ make: '   ', fetchImpl })).rejects.toThrow(
      UsSourceApiError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a model year that is not a four-digit year before fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchNhtsaVehicleModels({ modelYear: 20255, fetchImpl })).rejects.toThrow(
      UsSourceApiError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(fetchNhtsaVehicleModels({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('nhtsaVehicleModelsAdapter', () => {
  it('registers as a keyless source', () => {
    expect(nhtsaVehicleModelsAdapter.id).toBe('nhtsa-vehicle-models');
    expect(nhtsaVehicleModelsAdapter.auth).toBe('none');
    expect(nhtsaVehicleModelsAdapter.description).toContain('NHTSA');
  });

  it('parses a payload through the adapter surface', () => {
    expect(nhtsaVehicleModelsAdapter.parse(JSON.parse(SMALL_PAYLOAD)).modelCount).toBe(2);
  });

  it('reads the committed fixture', () => {
    expect(nhtsaVehicleModelsAdapter.loadFixture().modelCount).toBe(50);
  });

  it('fetches live through a stub', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(SMALL_PAYLOAD, { status: 200 }));
    expect((await nhtsaVehicleModelsAdapter.fetchLive({ fetchImpl })).models[0]?.vehicleModel).toBe(
      'ACCORD HYBRID'
    );
  });
});

// The page the endpoint answers with is pinned here, so a refreshed snapshot
// that moves it fails the suite rather than quietly changing the copy.
describe('the committed NHTSA fixture', () => {
  const page = nhtsaVehicleModelsAdapter.loadFixture();

  it('holds the 2025 Honda model list and its pagination total', () => {
    expect(page.modelCount).toBe(50);
    expect(page.totalCount).toBe(50);
    expect(page.offset).toBe(0);
    expect(page.max).toBe(100);
    expect(page.nextUrl).toBeNull();
    expect(page.models[0]).toEqual({
      modelYear: 2025,
      make: 'HONDA',
      vehicleModel: 'ACCORD HYBRID',
    });
    expect(page.models.at(-1)?.vehicleModel).toBe('XR650L');
  });

  it('matches the raw fixture the registry test answers with', () => {
    const fromText = parseNhtsaVehicleModelsPayload(JSON.parse(FIXTURE));
    expect(fromText.modelCount).toBe(50);
  });
});
