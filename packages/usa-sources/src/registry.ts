import { blsUnemploymentAdapter } from './blsSeries.js';
import { cdcCountyObesityAdapter } from './cdcCountyObesity.js';
import { usgsHawaiiEarthquakesAdapter } from './usgsEarthquakes.js';
import type { UsDataAdapter, UsFetchOptions, UsSourceProbe } from './types.js';

/** Every US data source behind the uniform adapter interface. */
export const US_DATA_SOURCES: UsDataAdapter<unknown>[] = [
  blsUnemploymentAdapter,
  usgsHawaiiEarthquakesAdapter,
  cdcCountyObesityAdapter,
];

/** Looks up a source adapter by id. */
export function getUsDataSource<T>(id: string): UsDataAdapter<T> | undefined {
  return US_DATA_SOURCES.find((source) => source.id === id) as UsDataAdapter<T> | undefined;
}

/**
 * Probes one source with a live fetch and reports the outcome.
 *
 * @param adapter - the adapter to exercise
 * @param options - an optional API key and fetch stub
 * @returns whether the source answered, plus what it said
 */
export async function probeUsDataSource<T>(
  adapter: UsDataAdapter<T>,
  options?: { apiKey?: string; fetchImpl?: typeof globalThis.fetch }
): Promise<UsSourceProbe> {
  try {
    const fetchOptions: UsFetchOptions = {
      ...(options?.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    };
    const data = await adapter.fetchLive(fetchOptions);
    return {
      id: adapter.id,
      name: adapter.name,
      auth: adapter.auth,
      ok: true,
      status: 'ok',
      sample: JSON.stringify(data).slice(0, 120),
    };
  } catch (error) {
    return {
      id: adapter.id,
      name: adapter.name,
      auth: adapter.auth,
      ok: false,
      status: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Probes every registered source in parallel, with optional per-source keys.
 *
 * @param options - a shared key, per-source keys, and a fetch stub
 * @returns one probe result per registered source
 */
export async function probeAllUsDataSources(options?: {
  apiKey?: string;
  apiKeys?: Record<string, string>;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<UsSourceProbe[]> {
  const { apiKey, apiKeys, fetchImpl } = options ?? {};
  return Promise.all(
    US_DATA_SOURCES.map((source) => {
      const key = apiKeys?.[source.id] ?? apiKey;
      return probeUsDataSource(source, {
        ...(key === undefined ? {} : { apiKey: key }),
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      });
    })
  );
}
