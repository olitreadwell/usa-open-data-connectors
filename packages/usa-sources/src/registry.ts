import { blsUnemploymentAdapter } from './blsSeries.js';
import { btsTransportationStatsAdapter } from './btsTransportationStats.js';
import { californiaOpenDataCatalogueAdapter } from './californiaOpenDataCatalogue.js';
import { callookCallsignsAdapter } from './callookCallsigns.js';
import { chicagoOpenDataCatalogueAdapter } from './chicagoOpenDataCatalogue.js';
import { coloradoOpenDataCatalogueAdapter } from './coloradoOpenDataCatalogue.js';
import { collegeScorecardInstitutionsAdapter } from './collegeScorecardInstitutions.js';
import { estimatetaxIncomeTaxAdapter } from './estimatetaxIncomeTax.js';
import { cdcSocrataCatalogueAdapter } from './cdcSocrataCatalogue.js';
import { clinicalTrialsStudiesAdapter } from './clinicalTrialsStudies.js';
import { epaEnvirofactsFacilitiesAdapter } from './epaEnvirofactsFacilities.js';
import { fccSocrataCatalogueAdapter } from './fccSocrataCatalogue.js';
import { federalRegisterDocumentsAdapter } from './federalRegisterDocuments.js';
import { fdicBankDirectoryAdapter } from './fdicBankDirectory.js';
import { healthdataSocrataCatalogueAdapter } from './healthdataSocrataCatalogue.js';
import { illinoisOpenDataCatalogueAdapter } from './illinoisOpenDataCatalogue.js';
import { losAngelesOpenDataCatalogueAdapter } from './losAngelesOpenDataCatalogue.js';
import { michiganOpenDataCatalogueAdapter } from './michiganOpenDataCatalogue.js';
import { ncbiPubmedSearchAdapter } from './ncbiPubmedSearch.js';
import { newJerseyOpenDataCatalogueAdapter } from './newJerseyOpenDataCatalogue.js';
import { nihReporterProjectsAdapter } from './nihReporterProjects.js';
import { nhtsaVehicleModelsAdapter } from './nhtsaVehicleModels.js';
import { nycOpenDataCatalogueAdapter } from './nycOpenDataCatalogue.js';
import { nyStateOpenDataCatalogueAdapter } from './nyStateOpenDataCatalogue.js';
import { oregonOpenDataCatalogueAdapter } from './oregonOpenDataCatalogue.js';
import { pennsylvaniaOpenDataCatalogueAdapter } from './pennsylvaniaOpenDataCatalogue.js';
import { publicDataHubHospitalAdapter } from './publicDataHubHospital.js';
import { nwsPointForecastAdapter } from './nwsPointForecast.js';
import { secEdgarFilingsAdapter } from './secEdgarFilings.js';
import { seattleOpenDataCatalogueAdapter } from './seattleOpenDataCatalogue.js';
import { sanFranciscoOpenDataCatalogueAdapter } from './sanFranciscoOpenDataCatalogue.js';
import { texasOpenDataCatalogueAdapter } from './texasOpenDataCatalogue.js';
import { treasuryDebtToPennyAdapter } from './treasuryDebtToPenny.js';
import { usaspendingAgenciesAdapter } from './usaspendingAgencies.js';
import { cdcCountyObesityAdapter } from './cdcCountyObesity.js';
import { cfpbConsumerComplaintsAdapter } from './cfpbConsumerComplaints.js';
import { cpscProductRecallsAdapter } from './cpscProductRecalls.js';
import { femaDisasterDeclarationsAdapter } from './femaDisasterDeclarations.js';
import { nceiAnnualTemperatureAdapter } from './nceiAnnualTemperature.js';
import { noaaSeaLevelAdapter } from './noaaSeaLevel.js';
import { nextBusTransitVehiclesAdapter } from './nextBusTransitVehicles.js';
import { openFdaFoodRecallsAdapter } from './openFdaFoodRecalls.js';
import { treasuryAvgInterestRateAdapter } from './treasuryAvgInterestRate.js';
import { usgsHawaiiEarthquakesAdapter } from './usgsEarthquakes.js';
import { usgsPeakStreamflowAdapter } from './usgsPeakStreamflow.js';
import { vermontOpenDataCatalogueAdapter } from './vermontOpenDataCatalogue.js';
import { washingtonStateOpenDataCatalogueAdapter } from './washingtonStateOpenDataCatalogue.js';
import { normalizeSourceApiKey } from './apiKey.js';
import type { UsDataAdapter, UsFetchOptions, UsSourceMetadata, UsSourceProbe } from './types.js';

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
  nihReporterProjectsAdapter,
  cdcSocrataCatalogueAdapter,
  healthdataSocrataCatalogueAdapter,
  nycOpenDataCatalogueAdapter,
  btsTransportationStatsAdapter,
  estimatetaxIncomeTaxAdapter,
  callookCallsignsAdapter,
  collegeScorecardInstitutionsAdapter,
  publicDataHubHospitalAdapter,
  nextBusTransitVehiclesAdapter,
  federalRegisterDocumentsAdapter,
  nhtsaVehicleModelsAdapter,
  fccSocrataCatalogueAdapter,
  nyStateOpenDataCatalogueAdapter,
  chicagoOpenDataCatalogueAdapter,
  seattleOpenDataCatalogueAdapter,
  texasOpenDataCatalogueAdapter,
  coloradoOpenDataCatalogueAdapter,
  washingtonStateOpenDataCatalogueAdapter,
  michiganOpenDataCatalogueAdapter,
  oregonOpenDataCatalogueAdapter,
  pennsylvaniaOpenDataCatalogueAdapter,
  illinoisOpenDataCatalogueAdapter,
  newJerseyOpenDataCatalogueAdapter,
  vermontOpenDataCatalogueAdapter,
  losAngelesOpenDataCatalogueAdapter,
  sanFranciscoOpenDataCatalogueAdapter,
  californiaOpenDataCatalogueAdapter,
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
 * Probes the requested sources in parallel, with optional per-source keys.
 *
 * @param options - a shared key, per-source keys, and a fetch stub
 * @returns one probe result per registered source
 */
export async function probeAllUsDataSources(options?: {
  apiKey?: string;
  apiKeys?: Record<string, string>;
  fetchImpl?: typeof globalThis.fetch;
  ids?: string[];
}): Promise<UsSourceProbe[]> {
  const { apiKey, apiKeys, fetchImpl, ids } = options ?? {};
  if (ids !== undefined) {
    const known = new Set(US_DATA_SOURCES.map((source) => source.id));
    const unknown = [...new Set(ids.filter((id) => !known.has(id)))];
    if (unknown.length > 0) {
      const noun = unknown.length === 1 ? 'id' : 'ids';
      const list = unknown.map((id) => `"${id}"`).join(', ');
      throw new Error(`Unknown US source ${noun} ${list}. Call list_sources for the ids.`);
    }
  }
  const wanted = ids === undefined ? undefined : new Set(ids);
  return Promise.all(
    US_DATA_SOURCES.filter((source) => wanted === undefined || wanted.has(source.id)).map(
      (source) => {
        const key = normalizeSourceApiKey(apiKeys?.[source.id] ?? apiKey);
        return probeUsDataSource(source, {
          ...(key === undefined ? {} : { apiKey: key }),
          ...(fetchImpl === undefined ? {} : { fetchImpl }),
        });
      }
    )
  );
}

const FEDERAL_PUBLIC_DOMAIN = 'Public domain in the US (17 U.S.C. 105)';
const PORTAL_ENTRY_TERMS = 'Per-entry portal terms; see licenceUrl on each record';

/**
 * Source-level licence and attribution for every adapter in the registry.
 *
 * Values come from the publisher notes in `docs/CONNECTOR_DISCOVERY.md`. They
 * describe the source as a whole. Catalogue entries and PublicDataHub records
 * still carry their own per-record licence fields when the source supplies
 * them.
 */
export const US_SOURCE_METADATA: Record<string, UsSourceMetadata> = {
  'bls-unemployment-rate': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'Bureau of Labor Statistics',
  },
  'usgs-hawaii-earthquakes': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Geological Survey',
  },
  'cdc-county-obesity': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'Centers for Disease Control and Prevention',
  },
  'ncei-annual-temperature': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'NOAA',
  },
  'noaa-sea-level': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'NOAA',
  },
  'treasury-avg-interest-rate': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Department of the Treasury',
  },
  'fema-disaster-declarations': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'Federal Emergency Management Agency',
  },
  'openfda-food-recalls': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Food and Drug Administration',
  },
  'usgs-peak-streamflow': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Geological Survey',
  },
  'cpsc-product-recalls': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Consumer Product Safety Commission',
  },
  'cfpb-consumer-complaints': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'Consumer Financial Protection Bureau',
  },
  'treasury-debt-to-penny': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Department of the Treasury',
  },
  'sec-edgar-filings': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Securities and Exchange Commission',
  },
  'fdic-bank-directory': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'Federal Deposit Insurance Corporation',
  },
  'clinicaltrials-studies': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US National Library of Medicine',
  },
  'nws-point-forecast': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'National Weather Service',
  },
  'usaspending-agencies': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'USAspending, US Department of the Treasury',
  },
  'epa-envirofacts-facilities': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Environmental Protection Agency',
  },
  'ncbi-pubmed-search': {
    licence: `${FEDERAL_PUBLIC_DOMAIN}, but some NLM content carries its own terms`,
    attribution: 'National Center for Biotechnology Information',
  },
  'nih-reporter-projects': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'National Institutes of Health',
  },
  'cdc-socrata-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'Centers for Disease Control and Prevention',
  },
  'healthdata-socrata-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution:
      'HealthData.gov, US Department of Health and Human Services, plus each portal publisher',
  },
  'nyc-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'City of New York',
  },
  'bts-transportation-stats': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'Bureau of Transportation Statistics',
  },
  'estimatetax-income-tax': {
    licence: 'No open licence stated; the API terms require attribution and the source document',
    attribution: 'EstimateTax',
  },
  'callook-callsigns': {
    licence:
      'FCC licence records are public domain in the US; Callook says the data is free to use',
    attribution: 'Callook.info, from the FCC licence file',
  },
  'college-scorecard-institutions': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'US Department of Education',
  },
  'publicdatahub-hospital-quality': {
    licence: 'U.S. Public Domain',
    attribution: 'PublicDataHub, from the Centers for Medicare & Medicaid Services',
  },
  'nextbus-transit-vehicles': {
    licence:
      'No open licence stated; the feed carries a copyright notice for the agency and Umo IQ',
    attribution: 'Portland Streetcar, served by Umo IQ',
  },
  'federal-register-documents': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'Office of the Federal Register',
  },
  'nhtsa-vehicle-models': {
    licence: FEDERAL_PUBLIC_DOMAIN,
    attribution: 'National Highway Traffic Safety Administration',
  },
  'fcc-socrata-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'Federal Communications Commission',
  },
  'ny-state-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'New York State',
  },
  'chicago-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'City of Chicago',
  },
  'seattle-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'City of Seattle',
  },
  'texas-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of Texas',
  },
  'colorado-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of Colorado',
  },
  'washington-state-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of Washington',
  },
  'michigan-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of Michigan',
  },
  'oregon-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of Oregon',
  },
  'pennsylvania-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'Commonwealth of Pennsylvania',
  },
  'illinois-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of Illinois',
  },
  'new-jersey-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of New Jersey',
  },
  'vermont-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of Vermont',
  },
  'los-angeles-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'City of Los Angeles',
  },
  'san-francisco-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'City and County of San Francisco',
  },
  'california-open-data-catalogue': {
    licence: PORTAL_ENTRY_TERMS,
    attribution: 'State of California',
  },
};

/**
 * Looks up the licence and attribution for one registered source.
 *
 * @param id - the adapter id from the registry
 * @returns the source metadata, or undefined when no adapter has that id
 */
export function getUsSourceMetadata(id: string): UsSourceMetadata | undefined {
  return US_SOURCE_METADATA[id];
}
