import { blsUnemploymentAdapter } from './blsSeries.js';
import { btsTransportationStatsAdapter } from './btsTransportationStats.js';
import { cdcSocrataCatalogueAdapter } from './cdcSocrataCatalogue.js';
import { clinicalTrialsStudiesAdapter } from './clinicalTrialsStudies.js';
import { epaEnvirofactsFacilitiesAdapter } from './epaEnvirofactsFacilities.js';
import { fdicBankDirectoryAdapter } from './fdicBankDirectory.js';
import { healthdataSocrataCatalogueAdapter } from './healthdataSocrataCatalogue.js';
import { ncbiPubmedSearchAdapter } from './ncbiPubmedSearch.js';
import { nwsPointForecastAdapter } from './nwsPointForecast.js';
import { secEdgarFilingsAdapter } from './secEdgarFilings.js';
import { treasuryDebtToPennyAdapter } from './treasuryDebtToPenny.js';
import { usaspendingAgenciesAdapter } from './usaspendingAgencies.js';
import { cdcCountyObesityAdapter } from './cdcCountyObesity.js';
import { cfpbConsumerComplaintsAdapter } from './cfpbConsumerComplaints.js';
import { cpscProductRecallsAdapter } from './cpscProductRecalls.js';
import { femaDisasterDeclarationsAdapter } from './femaDisasterDeclarations.js';
import { nceiAnnualTemperatureAdapter } from './nceiAnnualTemperature.js';
import { noaaSeaLevelAdapter } from './noaaSeaLevel.js';
import { openFdaFoodRecallsAdapter } from './openFdaFoodRecalls.js';
import { treasuryAvgInterestRateAdapter } from './treasuryAvgInterestRate.js';
import { usgsHawaiiEarthquakesAdapter } from './usgsEarthquakes.js';
import { usgsPeakStreamflowAdapter } from './usgsPeakStreamflow.js';
import { normalizeSourceApiKey } from './apiKey.js';
import type { UsDataAdapter, UsFetchOptions, UsSourceProbe } from './types.js';

/** Every US data source behind the uniform adapter interface. */
export const US_DATA_SOURCES: UsDataAdapter<unknown>[] = [
  blsUnemploymentAdapter,
  usgsHawaiiEarthquakesAdapter,
  cdcCountyObesityAdapter,
  nceiAnnualTemperatureAdapter,
  noaaSeaLevelAdapter,
  treasuryAvgInterestRateAdapter,
  femaDisasterDeclarationsAdapter,
  openFdaFoodRecallsAdapter,
  usgsPeakStreamflowAdapter,
  cpscProductRecallsAdapter,
  cfpbConsumerComplaintsAdapter,
  treasuryDebtToPennyAdapter,
  secEdgarFilingsAdapter,
  fdicBankDirectoryAdapter,
  clinicalTrialsStudiesAdapter,
  nwsPointForecastAdapter,
  usaspendingAgenciesAdapter,
  epaEnvirofactsFacilitiesAdapter,
  ncbiPubmedSearchAdapter,
  cdcSocrataCatalogueAdapter,
  healthdataSocrataCatalogueAdapter,
  btsTransportationStatsAdapter,
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
  const apiKey = normalizeSourceApiKey(options?.apiKey);
  try {
    const fetchOptions: UsFetchOptions = {
      ...(apiKey === undefined ? {} : { apiKey }),
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
      const key = normalizeSourceApiKey(apiKeys?.[source.id] ?? apiKey);
      return probeUsDataSource(source, {
        ...(key === undefined ? {} : { apiKey: key }),
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      });
    })
  );
}
