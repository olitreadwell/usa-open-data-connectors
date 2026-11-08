import { z } from 'zod';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the NHTSA vehicle models source. */
export const NHTSA_VEHICLE_MODELS_SOURCE_ID = 'nhtsa-vehicle-models';

/** Base URL for the NHTSA vehicle models API. */
export const NHTSA_VEHICLE_MODELS_API_BASE = 'https://api.nhtsa.gov/vehicles/models';

/** Model year the default request reads. */
export const NHTSA_DEFAULT_MODEL_YEAR = 2025;

/** Make the default request reads. */
export const NHTSA_DEFAULT_MAKE = 'Honda';

/** Largest page one request asks for. */
export const NHTSA_MODEL_PAGE_SIZE = 100;

/** Earliest model year the adapter accepts. */
export const NHTSA_MIN_MODEL_YEAR = 1900;

/** Latest model year the adapter accepts. */
export const NHTSA_MAX_MODEL_YEAR = 2100;

/** One vehicle model NHTSA lists for a model year and make. */
export interface NhtsaVehicleModel {
  modelYear: number;
  make: string;
  vehicleModel: string;
}

/** One page of NHTSA vehicle models, with the service's pagination metadata. */
export interface NhtsaVehicleModelPage {
  models: NhtsaVehicleModel[];
  modelCount: number;
  /** How many models the service says the query matches. */
  totalCount: number;
  offset: number;
  max: number;
  nextUrl: string | null;
}

/** Caller-selected filters for one model list. */
export interface NhtsaVehicleModelsQuery {
  modelYear?: number;
  make?: string;
  max?: number;
  offset?: number;
}

/** Committed snapshot, so a build works when the NHTSA host is unreachable. */
const NHTSA_VEHICLE_MODELS_FIXTURE_FILENAME = 'nhtsa-vehicle-models-2025-honda-2026-11-08.json';

const NHTSA_MODEL_SCHEMA = z.object({
  modelYear: z.number().int(),
  make: z.string().min(1),
  vehicleModel: z.string().min(1),
});

const NHTSA_PAGINATION_SCHEMA = z.object({
  count: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  nextUrl: z.string().nullable().optional(),
});

const NHTSA_PAYLOAD_SCHEMA = z.object({
  meta: z.object({
    status: z.number().int(),
    messages: z.array(z.unknown()).optional(),
    pagination: NHTSA_PAGINATION_SCHEMA,
  }),
  results: z.array(NHTSA_MODEL_SCHEMA),
});

/** Throws when a model year or page value cannot be sent to the service. */
function validateNhtsaQuery(query: NhtsaVehicleModelsQuery): void {
  const modelYear = query.modelYear ?? NHTSA_DEFAULT_MODEL_YEAR;
  if (
    !Number.isInteger(modelYear) ||
    modelYear < NHTSA_MIN_MODEL_YEAR ||
    modelYear > NHTSA_MAX_MODEL_YEAR
  ) {
    throw new UsSourceApiError(
      NHTSA_VEHICLE_MODELS_SOURCE_ID,
      `modelYear must be a whole number from ${NHTSA_MIN_MODEL_YEAR} to ${NHTSA_MAX_MODEL_YEAR}.`
    );
  }
  const make = query.make ?? NHTSA_DEFAULT_MAKE;
  if (make.trim() === '') {
    throw new UsSourceApiError(NHTSA_VEHICLE_MODELS_SOURCE_ID, 'make must not be blank.');
  }
  const max = query.max ?? NHTSA_MODEL_PAGE_SIZE;
  if (!Number.isInteger(max) || max < 1) {
    throw new UsSourceApiError(
      NHTSA_VEHICLE_MODELS_SOURCE_ID,
      'max must be a whole number of at least 1.'
    );
  }
  const offset = query.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new UsSourceApiError(
      NHTSA_VEHICLE_MODELS_SOURCE_ID,
      'offset must be a whole number of at least 0.'
    );
  }
}

/**
 * Builds the request URL for one page of vehicle models.
 *
 * The endpoint is keyless. The default query is the 2025 Honda model list,
 * which is the page the committed fixture captured.
 *
 * @param query - an optional model year, make, page size, and offset
 * @returns the full request URL
 */
export function buildNhtsaVehicleModelsUrl(query: NhtsaVehicleModelsQuery = {}): string {
  validateNhtsaQuery(query);
  const params = new URLSearchParams({
    modelYear: String(query.modelYear ?? NHTSA_DEFAULT_MODEL_YEAR),
    make: (query.make ?? NHTSA_DEFAULT_MAKE).trim(),
    max: String(query.max ?? NHTSA_MODEL_PAGE_SIZE),
    offset: String(query.offset ?? 0),
  });
  return `${NHTSA_VEHICLE_MODELS_API_BASE}?${params.toString()}`;
}

/**
 * Parses one page of vehicle models.
 *
 * A response whose service status is not 200 is an API error even when the
 * host answers HTTP 200. A model without its year, make, or name is a changed
 * shape and stops the parse. An empty page is valid.
 *
 * @param payload - the JSON body from the NHTSA vehicle models API
 * @returns the models on the page and the service's pagination metadata
 */
export function parseNhtsaVehicleModelsPayload(payload: unknown): NhtsaVehicleModelPage {
  const parsed = NHTSA_PAYLOAD_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(NHTSA_VEHICLE_MODELS_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.meta.status !== 200) {
    throw new UsSourceApiError(
      NHTSA_VEHICLE_MODELS_SOURCE_ID,
      `NHTSA reported status ${parsed.data.meta.status}`
    );
  }

  const pagination = parsed.data.meta.pagination;
  return {
    models: parsed.data.results,
    modelCount: parsed.data.results.length,
    totalCount: pagination.total,
    offset: pagination.offset,
    max: pagination.max,
    nextUrl: pagination.nextUrl ?? null,
  };
}

/**
 * Reads one page of NHTSA vehicle models.
 *
 * One keyless request returns the models for one model year and make, plus
 * the service's total and next-page URL.
 *
 * @param query - an optional model year, make, page window, and fetch stub
 * @returns the models on the page and the service's pagination metadata
 */
export async function fetchNhtsaVehicleModels(
  query: NhtsaVehicleModelsQuery & { fetchImpl?: typeof globalThis.fetch } = {}
): Promise<NhtsaVehicleModelPage> {
  const fetchImpl = query.fetchImpl ?? globalThis.fetch;
  const url = buildNhtsaVehicleModelsUrl({
    ...(query.modelYear === undefined ? {} : { modelYear: query.modelYear }),
    ...(query.make === undefined ? {} : { make: query.make }),
    ...(query.max === undefined ? {} : { max: query.max }),
    ...(query.offset === undefined ? {} : { offset: query.offset }),
  });
  const response = await httpGet(NHTSA_VEHICLE_MODELS_SOURCE_ID, url, { fetchImpl });
  return parseNhtsaVehicleModelsPayload(await response.json());
}

/** NHTSA vehicle models for one model year and make, keyless. */
export const nhtsaVehicleModelsAdapter: UsDataAdapter<NhtsaVehicleModelPage> = {
  id: NHTSA_VEHICLE_MODELS_SOURCE_ID,
  name: 'NHTSA vehicle models',
  auth: 'none',
  description:
    'Vehicle models NHTSA lists for one model year and make, one row per model, with the service total and next-page URL.',
  fetchLive: async (options) =>
    fetchNhtsaVehicleModels(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parseNhtsaVehicleModelsPayload(payload),
  loadFixture: () =>
    parseNhtsaVehicleModelsPayload(readFixtureJson(NHTSA_VEHICLE_MODELS_FIXTURE_FILENAME)),
};
