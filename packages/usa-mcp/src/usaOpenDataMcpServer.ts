import {
  fetchBlsSeries,
  fetchBtsTransportationStats,
  fetchCallookCallsigns,
  fetchCdcCountyObesity,
  fetchCdcSocrataCatalogue,
  fetchCfpConsumerComplaints,
  fetchClinicalTrialsStudies,
  fetchCollegeScorecardInstitutions,
  fetchCpscProductRecalls,
  fetchEpaEnvirofactsFacilities,
  fetchEstimateTaxCalculation,
  EPA_ENVIROFACTS_STATE_ABBR,
  ESTIMATETAX_DEFAULT_QUERY,
  fetchFemaDeclarations,
  fetchFdicBankDirectory,
  fetchHealthdataSocrataCatalogue,
  fetchNceiAnnualTemperature,
  fetchNcbiPubmedSearch,
  fetchNextBusVehicles,
  fetchNoaaSeaLevel,
  fetchNwsPointForecast,
  fetchNycOpenDataCatalogue,
  fetchOpenFdaFoodRecalls,
  fetchPublicDataHubHospital,
  fetchSecEdgarFilings,
  fetchTreasuryAvgInterestRates,
  fetchTreasuryDebtToPenny,
  fetchUsgsEarthquakes,
  fetchUsgsPeakStreamflow,
  fetchUsaSpendingAgencies,
  getUsDataSource,
  probeAllUsDataSources,
  US_DATA_SOURCES,
  US_UNEMPLOYMENT_SERIES_ID,
  usgsHawaiiRollingWindow,
} from '@usa-open-data-connectors/usa-sources';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createSourceMcpServer, type SourceQueryTool } from './createSourceMcpServer.js';
import { readPackageVersion } from './packageVersion.js';

/** What this server calls itself in the MCP handshake. */
export const USA_MCP_SERVER_NAME = 'usa-open-data';

/** Version reported in the MCP handshake, read from package.json. */
export const USA_MCP_SERVER_VERSION = readPackageVersion();

/** Reads a numeric tool argument, leaving it out when the model did not send one. */
function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Reads a string tool argument, leaving it out when the model did not send one. */
function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Reads a nullable string argument, preserving an explicit null. */
function nullableStringOrUndefined(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Highest entry cap the Socrata catalogue tools accept. */
const CATALOGUE_LIMIT_MAX = 10_000;

/** The filing statuses the EstimateTax API accepts. */
const FILING_STATUSES = [
  'single',
  'married_jointly',
  'married_separately',
  'head_of_household',
] as const;

/** One filing status the EstimateTax API accepts. */
type FilingStatus = (typeof FILING_STATUSES)[number];

/** Reads a filing status argument, leaving it out when it is not one of the accepted values. */
function filingStatusOrUndefined(value: unknown): FilingStatus | undefined {
  return typeof value === 'string' && FILING_STATUSES.some((status) => status === value)
    ? (value as FilingStatus)
    : undefined;
}

/** The named-function tools the US library can answer. */
const US_QUERY_TOOLS: SourceQueryTool[] = [
  {
    name: 'us_bls_unemployment',
    title: 'BLS unemployment series',
    description:
      'Monthly observations for one Bureau of Labor Statistics series. Keyless. Defaults to the headline national unemployment rate, LNS14000000.',
    inputSchema: {
      seriesId: z.string().optional().describe('BLS series id. Defaults to LNS14000000.'),
      startYear: z.number().int().min(1900).optional().describe('First year to read.'),
      endYear: z.number().int().min(1900).optional().describe('Last year to read.'),
    },
    run: async (args) => {
      const startYear = numberOrUndefined(args.startYear) ?? 2015;
      const endYear = numberOrUndefined(args.endYear) ?? new Date().getFullYear();
      return fetchBlsSeries(stringOrUndefined(args.seriesId) ?? US_UNEMPLOYMENT_SERIES_ID, {
        startYear,
        endYear,
      });
    },
  },
  {
    name: 'us_usgs_earthquakes',
    title: 'USGS earthquakes around Hawaii',
    description:
      'Earthquakes in the USGS catalogue for the box around the main Hawaiian islands. Keyless. Defaults to the last 365 days at magnitude 2.5 and above.',
    inputSchema: {
      startDate: z.string().optional().describe('Window start, YYYY-MM-DD.'),
      endDate: z.string().optional().describe('Window end, YYYY-MM-DD. The catalogue excludes it.'),
      minMagnitude: z.number().min(0).max(10).optional().describe('Minimum magnitude.'),
    },
    run: async (args) => {
      const window = usgsHawaiiRollingWindow();
      const startDate = stringOrUndefined(args.startDate);
      const endDate = stringOrUndefined(args.endDate);
      const minMagnitude = numberOrUndefined(args.minMagnitude);
      return fetchUsgsEarthquakes({
        ...window,
        ...(startDate === undefined ? {} : { startDate }),
        ...(endDate === undefined ? {} : { endDate }),
        ...(minMagnitude === undefined ? {} : { minMagnitude }),
      });
    },
  },
  {
    name: 'us_cdc_county_obesity',
    title: 'CDC county adult obesity',
    description:
      'County-level adult obesity prevalence from the CDC PLACES dataset, with state and national rows. Keyless.',
    inputSchema: {},
    run: async () => fetchCdcCountyObesity(),
  },
  {
    name: 'us_ncei_annual_temperature',
    title: 'Contiguous US annual temperature',
    description:
      'Annual average temperature for the contiguous United States, from the NOAA NCEI Climate at a Glance record. Keyless.',
    inputSchema: {
      startYear: z.number().int().min(1850).optional().describe('First year. Defaults to 1895.'),
      endYear: z.number().int().min(1850).optional().describe('Last year. Defaults to this year.'),
    },
    run: async (args) => {
      const startYear = numberOrUndefined(args.startYear);
      const endYear = numberOrUndefined(args.endYear);
      return fetchNceiAnnualTemperature({
        ...(startYear === undefined ? {} : { startYear }),
        ...(endYear === undefined ? {} : { endYear }),
      });
    },
  },
  {
    name: 'us_noaa_sea_level',
    title: 'NOAA monthly mean sea level',
    description:
      'Monthly mean sea level at a NOAA CO-OPS tide gauge. Keyless. Defaults to the Battery, New York.',
    inputSchema: {
      stationId: z.string().optional().describe('CO-OPS station id. Defaults to 8518750.'),
      startYear: z.number().int().min(1850).optional().describe('First year.'),
      endYear: z.number().int().min(1850).optional().describe('Last year.'),
    },
    run: async (args) => {
      const stationId = stringOrUndefined(args.stationId);
      const startYear = numberOrUndefined(args.startYear);
      const endYear = numberOrUndefined(args.endYear);
      return fetchNoaaSeaLevel({
        ...(stationId === undefined ? {} : { stationId }),
        ...(startYear === undefined ? {} : { startYear }),
        ...(endYear === undefined ? {} : { endYear }),
      });
    },
  },
  {
    name: 'us_treasury_interest_rates',
    title: 'US Treasury average interest rates',
    description:
      'Average interest rates on US Treasury securities, from the Treasury Fiscal Data API. Keyless.',
    inputSchema: {
      securityType: z
        .string()
        .optional()
        .describe('Security type. Defaults to "Interest-bearing Debt".'),
    },
    run: async (args) => {
      const securityType = stringOrUndefined(args.securityType);
      return fetchTreasuryAvgInterestRates(securityType === undefined ? {} : { securityType });
    },
  },
  {
    name: 'us_fema_declarations',
    title: 'FEMA disaster declarations',
    description:
      'Every FEMA disaster declaration, with counts by year, by incident type, and by state. Keyless.',
    inputSchema: {
      rowLimit: z
        .number()
        .int()
        .min(1)
        .max(100_000)
        .optional()
        .describe('Row cap for the API read.'),
    },
    run: async (args) => {
      const rowLimit = numberOrUndefined(args.rowLimit);
      return fetchFemaDeclarations(rowLimit === undefined ? {} : { rowLimit });
    },
  },
  {
    name: 'us_openfda_food_recalls',
    title: 'openFDA food recalls',
    description:
      'Food enforcement report counts from openFDA, split by classification, by report date, and by whether the recall was voluntary. Keyless.',
    inputSchema: {},
    run: async () => fetchOpenFdaFoodRecalls(),
  },
  {
    name: 'us_usgs_peak_streamflow',
    title: 'USGS annual peak streamflow',
    description:
      'Annual peak streamflow for one USGS monitoring location. Keyless. Defaults to the Mississippi at St. Louis.',
    inputSchema: {
      monitoringLocationId: z.string().optional().describe('USGS site id. Defaults to 07010000.'),
    },
    run: async (args) => {
      const monitoringLocationId = stringOrUndefined(args.monitoringLocationId);
      return fetchUsgsPeakStreamflow(
        monitoringLocationId === undefined ? {} : { monitoringLocationId }
      );
    },
  },
  {
    name: 'us_cpsc_product_recalls',
    title: 'CPSC product recalls',
    description:
      'Product recalls from the Consumer Product Safety Commission, with counts by year, remedy, and manufacturer country. Keyless.',
    inputSchema: {
      firstYear: z.number().int().min(1900).optional().describe('First year to cover.'),
      newestYear: z.number().int().min(1900).optional().describe('Last year to cover.'),
    },
    run: async (args) => {
      const firstYear = numberOrUndefined(args.firstYear);
      const newestYear = numberOrUndefined(args.newestYear);
      return fetchCpscProductRecalls({
        ...(firstYear === undefined ? {} : { firstYear }),
        ...(newestYear === undefined ? {} : { newestYear }),
      });
    },
  },
  {
    name: 'us_cfpb_consumer_complaints',
    title: 'CFPB consumer complaints',
    description:
      'Consumer complaint counts from the CFPB, with the busiest and quietest complete years and the top products and companies. Keyless.',
    inputSchema: {
      firstYear: z.number().int().min(1900).optional().describe('First year to cover.'),
      newestYear: z.number().int().min(1900).optional().describe('Last year to cover.'),
    },
    run: async (args) => {
      const firstYear = numberOrUndefined(args.firstYear);
      const newestYear = numberOrUndefined(args.newestYear);
      return fetchCfpConsumerComplaints({
        ...(firstYear === undefined ? {} : { firstYear }),
        ...(newestYear === undefined ? {} : { newestYear }),
      });
    },
  },
  {
    name: 'us_sec_edgar',
    title: 'SEC EDGAR filings',
    description:
      'Recent company filings from SEC EDGAR for one CIK, including form type and filing date. Keyless. Defaults to Apple.',
    inputSchema: {
      cik: z.string().optional().describe('SEC CIK, zero-padded or plain. Defaults to Apple.'),
    },
    run: async (args) => {
      const cik = stringOrUndefined(args.cik);
      return fetchSecEdgarFilings(cik === undefined ? {} : { cik });
    },
  },
  {
    name: 'us_fdic_banks',
    title: 'FDIC bank directory',
    description:
      'One row per insured institution from the FDIC bank directory. Not a branch count. Keyless.',
    inputSchema: {
      rowLimit: z.number().int().min(1).max(100_000).optional().describe('Row cap.'),
    },
    run: async (args) => {
      const rowLimit = numberOrUndefined(args.rowLimit);
      return fetchFdicBankDirectory(rowLimit === undefined ? {} : { rowLimit });
    },
  },
  {
    name: 'us_clinicaltrials',
    title: 'ClinicalTrials.gov studies',
    description: 'Registered clinical studies from ClinicalTrials.gov. Keyless.',
    inputSchema: {
      pageSize: z.number().int().min(1).max(1000).optional().describe('Study cap.'),
    },
    run: async (args) => {
      const pageSize = numberOrUndefined(args.pageSize);
      return fetchClinicalTrialsStudies(pageSize === undefined ? {} : { pageSize });
    },
  },
  {
    name: 'us_nws_forecast',
    title: 'National Weather Service forecast',
    description:
      'The NWS grid point and forecast URLs for a latitude and longitude. Keyless. Defaults to Washington, DC.',
    inputSchema: {
      latitude: z.number().min(-90).max(90).optional().describe('Latitude.'),
      longitude: z.number().min(-180).max(180).optional().describe('Longitude.'),
    },
    run: async (args) => {
      const latitude = numberOrUndefined(args.latitude);
      const longitude = numberOrUndefined(args.longitude);
      if ((latitude === undefined) !== (longitude === undefined)) {
        throw new Error('Pass both latitude and longitude, or neither.');
      }
      return fetchNwsPointForecast({
        ...(latitude === undefined ? {} : { latitude }),
        ...(longitude === undefined ? {} : { longitude }),
      });
    },
  },
  {
    name: 'us_pubmed_search',
    title: 'PubMed search',
    description: 'Searches PubMed and returns matching article ids and metadata. Keyless.',
    inputSchema: {
      term: z.string().optional().describe('PubMed query. Defaults to a broad health query.'),
      retmax: z
        .number()
        .int()
        .min(0)
        .max(1000)
        .optional()
        .describe('Result cap. 0 returns the count only.'),
    },
    run: async (args) => {
      const term = stringOrUndefined(args.term);
      const retmax = numberOrUndefined(args.retmax);
      return fetchNcbiPubmedSearch({
        ...(term === undefined ? {} : { term }),
        ...(retmax === undefined ? {} : { retmax }),
      });
    },
  },
  {
    name: 'us_nyc_open_data',
    title: 'NYC Open Data catalogue',
    description: 'Datasets and maps in the New York City Open Data catalogue. Keyless.',
    inputSchema: {
      limit: z.number().int().min(1).max(CATALOGUE_LIMIT_MAX).optional().describe('Entry cap.'),
    },
    run: async (args) => {
      const limit = numberOrUndefined(args.limit);
      return fetchNycOpenDataCatalogue(limit === undefined ? {} : { limit });
    },
  },
  {
    name: 'us_bts_stats',
    title: 'Bureau of Transportation Statistics catalogue',
    description: 'Datasets, charts, and stories from the BTS catalogue. Keyless.',
    inputSchema: {
      limit: z.number().int().min(1).max(CATALOGUE_LIMIT_MAX).optional().describe('Entry cap.'),
    },
    run: async (args) => {
      const limit = numberOrUndefined(args.limit);
      return fetchBtsTransportationStats(limit === undefined ? {} : { limit });
    },
  },
  {
    name: 'us_college_scorecard',
    title: 'College Scorecard institutions',
    description:
      'Institution-level outcomes from the College Scorecard bulk download. Keyless. Large response.',
    inputSchema: {},
    run: async () => fetchCollegeScorecardInstitutions(),
  },
  {
    name: 'us_publicdatahub_hospital',
    title: 'PublicDataHub hospital quality',
    description:
      'Hospital quality measures from PublicDataHub for one hospital slug. Keyless. Defaults to a documented hospital.',
    inputSchema: {
      slug: z.string().optional().describe('PublicDataHub hospital slug.'),
    },
    run: async (args) => {
      const slug = stringOrUndefined(args.slug);
      return fetchPublicDataHubHospital(slug === undefined ? {} : { slug });
    },
  },
  {
    name: 'us_nextbus_vehicles',
    title: 'NextBus vehicle positions',
    description:
      'Live vehicle positions for one NextBus agency and route. Keyless. Defaults to the Portland Streetcar.',
    inputSchema: {
      agencyTag: z.string().optional().describe('NextBus agency tag.'),
      routeTag: z.string().optional().describe('NextBus route tag.'),
    },
    run: async (args) => {
      const agencyTag = stringOrUndefined(args.agencyTag);
      const routeTag = stringOrUndefined(args.routeTag);
      if ((agencyTag === undefined) !== (routeTag === undefined)) {
        throw new Error('Pass both agencyTag and routeTag, or neither.');
      }
      return fetchNextBusVehicles({
        ...(agencyTag === undefined ? {} : { agencyTag }),
        ...(routeTag === undefined ? {} : { routeTag }),
      });
    },
  },
  {
    name: 'us_epa_facilities',
    title: 'EPA Envirofacts facilities',
    description: `Toxics Release Inventory facilities from EPA Envirofacts, optionally filtered to one state. Keyless. Defaults to ${EPA_ENVIROFACTS_STATE_ABBR} (Rhode Island).`,
    inputSchema: {
      stateAbbr: z
        .string()
        .regex(/^[A-Za-z]{2}$/)
        .transform((value) => value.toUpperCase())
        .optional()
        .describe('Two-letter state code, for example CA. Defaults to RI (Rhode Island).'),
    },
    run: async (args) => {
      const stateAbbr = stringOrUndefined(args.stateAbbr);
      return fetchEpaEnvirofactsFacilities(stateAbbr === undefined ? {} : { stateAbbr });
    },
  },
  {
    name: 'us_usaspending_agencies',
    title: 'USAspending agencies',
    description: 'Top-tier federal agencies from USAspending. Keyless.',
    inputSchema: {},
    run: async () => fetchUsaSpendingAgencies(),
  },
  {
    name: 'us_treasury_debt',
    title: 'Treasury debt to the penny',
    description: 'US Treasury total public debt outstanding, one row per business day. Keyless.',
    inputSchema: {
      rowLimit: z.number().int().min(1).max(100_000).optional().describe('Row cap.'),
    },
    run: async (args) => {
      const rowLimit = numberOrUndefined(args.rowLimit);
      return fetchTreasuryDebtToPenny(rowLimit === undefined ? {} : { rowLimit });
    },
  },
  {
    name: 'us_cdc_socrata',
    title: 'CDC Socrata catalogue',
    description: 'Datasets, charts, and stories in the CDC Socrata catalogue. Keyless.',
    inputSchema: {
      limit: z.number().int().min(1).max(CATALOGUE_LIMIT_MAX).optional().describe('Entry cap.'),
    },
    run: async (args) => {
      const limit = numberOrUndefined(args.limit);
      return fetchCdcSocrataCatalogue(limit === undefined ? {} : { limit });
    },
  },
  {
    name: 'us_healthdata_socrata',
    title: 'HealthData.gov Socrata catalogue',
    description: 'Datasets, charts, and stories in the HealthData.gov catalogue. Keyless.',
    inputSchema: {
      limit: z.number().int().min(1).max(CATALOGUE_LIMIT_MAX).optional().describe('Entry cap.'),
    },
    run: async (args) => {
      const limit = numberOrUndefined(args.limit);
      return fetchHealthdataSocrataCatalogue(limit === undefined ? {} : { limit });
    },
  },
  {
    name: 'us_estimate_tax',
    title: 'EstimateTax income tax',
    description:
      'US federal, state, and local income tax for one salary, with the official document behind every figure. Keyless. Defaults to a single filer in New York City.',
    inputSchema: {
      income: z.number().min(0).describe('Gross annual employment income in US dollars.'),
      filingStatus: z
        .enum(['single', 'married_jointly', 'married_separately', 'head_of_household'])
        .optional()
        .describe('Filing status. Defaults to single.'),
      state: z.string().length(2).nullable().optional().describe('Two-letter state code.'),
      city: z
        .string()
        .nullable()
        .optional()
        .describe('Local jurisdiction slug, where one applies.'),
      preTaxDeductions: z.number().min(0).optional().describe('Pre-tax deductions in dollars.'),
      selfEmploymentIncome: z
        .number()
        .min(0)
        .optional()
        .describe('Net self-employment income in dollars.'),
    },
    run: async (args) => {
      const filingStatus = filingStatusOrUndefined(args.filingStatus);
      const state = nullableStringOrUndefined(args.state);
      const city = nullableStringOrUndefined(args.city);
      const preTaxDeductions = numberOrUndefined(args.preTaxDeductions);
      const selfEmploymentIncome = numberOrUndefined(args.selfEmploymentIncome);
      return fetchEstimateTaxCalculation({
        query: {
          ...ESTIMATETAX_DEFAULT_QUERY,
          income: typeof args.income === 'number' ? args.income : ESTIMATETAX_DEFAULT_QUERY.income,
          ...(filingStatus === undefined ? {} : { filingStatus }),
          ...(state === undefined ? {} : { state }),
          ...(city === undefined ? {} : { city }),
          ...(preTaxDeductions === undefined ? {} : { preTaxDeductions }),
          ...(selfEmploymentIncome === undefined ? {} : { selfEmploymentIncome }),
        },
      });
    },
  },
  {
    name: 'us_callook_callsigns',
    title: 'FCC amateur callsign lookups',
    description:
      'Looks up US amateur radio callsigns in the FCC licence database through Callook. Keyless. Defaults to a ten-district sample.',
    inputSchema: {
      callsigns: z
        .array(z.string())
        .min(1)
        .max(20)
        .optional()
        .describe('Callsigns to look up. Defaults to a ten-district sample.'),
    },
    run: async (args) => {
      const callsigns = Array.isArray(args.callsigns)
        ? args.callsigns.filter((value): value is string => typeof value === 'string')
        : undefined;
      return fetchCallookCallsigns(callsigns === undefined ? {} : { callsigns });
    },
  },
];

/**
 * Builds the US MCP server: every keyless US source in the registry, plus one tool per named
 * function in the connector library.
 *
 * @returns an MCP server ready to connect to a transport
 */
export function createUsaOpenDataMcpServer(): McpServer {
  return createSourceMcpServer({
    serverName: USA_MCP_SERVER_NAME,
    serverVersion: USA_MCP_SERVER_VERSION,
    listSources: () =>
      US_DATA_SOURCES.map((source) => ({
        id: source.id,
        name: source.name,
        auth: source.auth,
        description: source.description,
      })),
    probeSources: async (ids) => {
      const probes = await probeAllUsDataSources(ids === undefined ? {} : { ids });
      return probes.map((probe) => ({
        id: probe.id,
        name: probe.name,
        auth: probe.auth,
        ok: probe.ok,
        status: probe.status,
        ...(probe.sample === undefined ? {} : { sample: probe.sample }),
      }));
    },
    fetchSource: async (id, options) => {
      const adapter = getUsDataSource(id);
      if (adapter === undefined) {
        throw new Error(`No US source with id "${id}". Call list_sources for the ids.`);
      }
      return adapter.fetchLive(options?.apiKey === undefined ? {} : { apiKey: options.apiKey });
    },
    queryTools: US_QUERY_TOOLS,
  });
}
