import {
  fetchBlsSeries,
  fetchCdcCountyObesity,
  fetchCfpConsumerComplaints,
  fetchCpscProductRecalls,
  fetchFemaDeclarations,
  fetchNceiAnnualTemperature,
  fetchNoaaSeaLevel,
  fetchOpenFdaFoodRecalls,
  fetchTreasuryAvgInterestRates,
  fetchUsgsEarthquakes,
  fetchUsgsPeakStreamflow,
  getUsDataSource,
  probeAllUsDataSources,
  US_DATA_SOURCES,
  US_UNEMPLOYMENT_SERIES_ID,
  usgsHawaiiRollingWindow,
} from '@usa-open-data-connectors/usa-sources';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createSourceMcpServer, type SourceQueryTool } from './createSourceMcpServer.js';

/** What this server calls itself in the MCP handshake. */
export const USA_MCP_SERVER_NAME = 'usa-open-data';

/** Version reported in the MCP handshake. Kept in step with package.json. */
export const USA_MCP_SERVER_VERSION = '0.1.0';

/** Reads a numeric tool argument, leaving it out when the model did not send one. */
function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Reads a string tool argument, leaving it out when the model did not send one. */
function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
];

/**
 * Builds the US MCP server: the 11 keyless US sources, plus one tool per named
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
      const probes = await probeAllUsDataSources();
      const wanted = ids === undefined || ids.length === 0 ? undefined : new Set(ids);
      return probes
        .filter((probe) => wanted === undefined || wanted.has(probe.id))
        .map((probe) => ({
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
