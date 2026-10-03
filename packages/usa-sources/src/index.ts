/** Errors shared by every US source adapter. */
export { UsSourceApiError, UsSourceError, UsSourceParseError } from './errors.js';
/** Bureau of Labor Statistics time series (keyless). */
export {
  BLS_API_BASE,
  BLS_MAX_YEARS_PER_REQUEST,
  blsUnemploymentAdapter,
  buildBlsSeries,
  fetchBlsSeries,
  parseBlsObservations,
  US_UNEMPLOYMENT_SERIES_ID,
  US_UNEMPLOYMENT_SERIES_LABEL,
} from './blsSeries.js';
/** BLS series types. */
export type { BlsObservation, BlsSeries } from './blsSeries.js';
/** USGS earthquake catalogue (keyless). */
export {
  buildUsgsEarthquakeCatalogue,
  buildUsgsEarthquakeUrl,
  fetchUsgsEarthquakes,
  parseUsgsEarthquakes,
  sortEarthquakesOldestFirst,
  USGS_EARTHQUAKE_API_BASE,
  USGS_HAWAII_BOUNDS,
  USGS_HAWAII_MIN_MAGNITUDE,
  USGS_ROLLING_WINDOW_DAYS,
  usgsHawaiiEarthquakesAdapter,
  usgsHawaiiRollingWindow,
} from './usgsEarthquakes.js';
/** USGS earthquake types. */
export type {
  UsgsEarthquake,
  UsgsEarthquakeBounds,
  UsgsEarthquakeCatalogue,
  UsgsEarthquakeQuery,
} from './usgsEarthquakes.js';
/** CDC PLACES county obesity estimates (keyless). */
export {
  buildCdcCountyObesitySet,
  buildCdcCountyObesityUrl,
  cdcCountyObesityAdapter,
  CDC_PLACES_COUNTY_API_BASE,
  CDC_PLACES_COUNTY_ROW_LIMIT,
  CDC_PLACES_CRUDE_PREVALENCE_ID,
  CDC_PLACES_NATIONAL_STATE_CODE,
  CDC_PLACES_OBESITY_MEASURE_ID,
  fetchCdcCountyObesity,
  parseCdcCountyObesityPayload,
  sortCdcCountiesByPercent,
} from './cdcCountyObesity.js';
/** CDC PLACES county obesity types. */
export type {
  CdcCountyObesityEstimate,
  CdcCountyObesityPayload,
  CdcCountyObesitySet,
  CdcNationalObesityEstimate,
} from './cdcCountyObesity.js';
/** NOAA NCEI contiguous US annual average temperature (keyless). */
export {
  buildNceiAnnualTemperatureSeries,
  buildNceiAnnualTemperatureUrl,
  fetchNceiAnnualTemperature,
  NCEI_ANNUAL_WINDOW_MONTHS,
  NCEI_AVERAGE_TEMPERATURE_PARAMETER_ID,
  NCEI_CLIMATE_AT_A_GLANCE_BASE,
  NCEI_CONTIGUOUS_US_REGION_ID,
  NCEI_FIRST_RECORD_YEAR,
  nceiAnnualTemperatureAdapter,
  parseNceiAnnualTemperatureCsv,
} from './nceiAnnualTemperature.js';
/** NOAA NCEI temperature types. */
export type {
  NceiTemperatureQuery,
  NceiTemperatureSeries,
  NceiTemperatureYear,
} from './nceiAnnualTemperature.js';
/** NOAA CO-OPS monthly mean sea level at a tide gauge (keyless). */
export {
  buildNoaaSeaLevelSeries,
  buildNoaaSeaLevelUrl,
  fetchNoaaSeaLevel,
  noaaSeaLevelAdapter,
  noaaSeaLevelTrendMillimetresPerYear,
  NOAA_BATTERY_STATION_ID,
  NOAA_BATTERY_STATION_NAME,
  NOAA_COOPS_API_BASE,
  NOAA_SEA_LEVEL_APPLICATION_ID,
  NOAA_SEA_LEVEL_DATUM,
  NOAA_SEA_LEVEL_FIRST_YEAR,
  NOAA_SEA_LEVEL_PRODUCT,
  NOAA_SEA_LEVEL_UNITS,
  parseNoaaSeaLevelPayload,
} from './noaaSeaLevel.js';
/** NOAA CO-OPS sea level types. */
export type {
  NoaaSeaLevelMonth,
  NoaaSeaLevelPayload,
  NoaaSeaLevelQuery,
  NoaaSeaLevelSeries,
  NoaaSeaLevelStation,
  NoaaSeaLevelYear,
} from './noaaSeaLevel.js';
/** The uniform adapter registry and probe helpers. */
export {
  US_DATA_SOURCES,
  getUsDataSource,
  probeAllUsDataSources,
  probeUsDataSource,
} from './registry.js';
/** US Treasury average interest rate on the debt outstanding (keyless). */
export {
  buildTreasuryAvgInterestRateSeries,
  buildTreasuryAvgInterestRateUrl,
  fetchTreasuryAvgInterestRates,
  parseTreasuryAvgInterestRatePayload,
  treasuryAvgInterestRateAdapter,
  TREASURY_AVG_INTEREST_RATE_FIRST_YEAR,
  TREASURY_AVG_INTEREST_RATE_PATH,
  TREASURY_AVG_INTEREST_RATE_ROW_LIMIT,
  TREASURY_AVG_INTEREST_RATE_SECURITY_DESCRIPTION,
  TREASURY_AVG_INTEREST_RATE_SECURITY_TYPE,
  TREASURY_FISCAL_DATA_API_BASE,
} from './treasuryAvgInterestRate.js';
/** Treasury interest rate types. */
export type {
  TreasuryInterestRateMonth,
  TreasuryInterestRateSeries,
} from './treasuryAvgInterestRate.js';
/** FEMA disaster declarations (keyless). */
export {
  buildFemaDeclarationCatalogue,
  buildFemaDeclarationUrl,
  femaDisasterDeclarationsAdapter,
  fetchFemaDeclarations,
  FEMA_DECLARATION_PATH,
  FEMA_DECLARATION_ROW_LIMIT,
  FEMA_FIRE_INCIDENT_TYPE,
  FEMA_OPEN_DATA_API_BASE,
  parseFemaDeclarationPayload,
} from './femaDisasterDeclarations.js';
/** FEMA declaration types. */
export type {
  FemaDeclaration,
  FemaDeclarationCatalogue,
  FemaDeclarationCount,
  FemaDeclarationYear,
} from './femaDisasterDeclarations.js';
/** openFDA food enforcement reports (keyless). */
export {
  buildOpenFdaFoodRecallCountUrl,
  buildOpenFdaFoodRecallSummary,
  buildOpenFdaFoodRecallTotalUrl,
  fetchOpenFdaFoodRecalls,
  openFdaFoodRecallsAdapter,
  openFdaReportDateLabel,
  OPENFDA_CLASSIFICATION_COUNT_FIELD,
  OPENFDA_CLASS_ONE,
  OPENFDA_FOOD_ENFORCEMENT_BASE,
  OPENFDA_MANDATED_TERM,
  OPENFDA_REPORT_DATE_FIELD,
  OPENFDA_VOLUNTARY_COUNT_FIELD,
  OPENFDA_VOLUNTARY_TERM,
  parseOpenFdaFoodRecallSnapshot,
  parseOpenFdaRecallCounts,
  parseOpenFdaRecallDateCounts,
  parseOpenFdaRecallTotal,
} from './openFdaFoodRecalls.js';
/** openFDA food recall types. */
export type {
  OpenFdaFoodRecallSnapshot,
  OpenFdaFoodRecallSummary,
  OpenFdaFoodRecallYear,
  OpenFdaRecallCount,
  OpenFdaRecallDateCount,
} from './openFdaFoodRecalls.js';
/** USGS annual peak streamflow at a gauge (keyless). */
export {
  buildUsgsPeakStreamflowSeries,
  buildUsgsPeakStreamflowUrl,
  fetchUsgsPeakStreamflow,
  parseUsgsPeakStreamflowPayload,
  USGS_DISCHARGE_PARAMETER_CODE,
  USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
  USGS_MISSISSIPPI_ST_LOUIS_LOCATION_NAME,
  USGS_PEAK_STREAMFLOW_COLLECTION,
  USGS_PEAK_STREAMFLOW_FIRST_WATER_YEAR,
  USGS_PEAK_STREAMFLOW_ROW_LIMIT,
  USGS_WATER_DATA_API_BASE,
  usgsPeakStreamflowAdapter,
} from './usgsPeakStreamflow.js';
/** USGS peak-streamflow types. */
export type { UsgsPeakStreamflowSeries, UsgsPeakStreamflowYear } from './usgsPeakStreamflow.js';
/** CPSC consumer product recalls (keyless). */
export {
  buildCpscProductRecallSeries,
  buildCpscRecallUrl,
  CPSC_ERROR_RECALL_ID,
  CPSC_RECALL_API_BASE,
  CPSC_RECALL_FIRST_YEAR,
  cpscProductRecallsAdapter,
  fetchCpscProductRecalls,
  parseCpscRecallPayload,
  parseCpscRecallSnapshot,
} from './cpscProductRecalls.js';
/** CPSC product recall types. */
export type {
  CpscManufacturerCountryCount,
  CpscProductRecall,
  CpscProductRecallSeries,
  CpscRemedyOptionCount,
  CpscRecallWindow,
  CpscRecallYearCount,
} from './cpscProductRecalls.js';
/** CFPB Consumer Complaint Database (keyless). */
export {
  buildCfpComplaintAggregationUrl,
  buildCfpComplaintCountUrl,
  buildCfpComplaintDayUrl,
  buildCfpConsumerComplaintSeries,
  CFPB_COMPLAINT_FIRST_YEAR,
  CFPB_COMPLAINT_SEARCH_API_BASE,
  CFPB_NEWEST_DATE_PROBE_DAYS,
  CFPB_TOP_LIST_LIMIT,
  cfpbConsumerComplaintsAdapter,
  fetchCfpConsumerComplaints,
  findNewestCfpComplaintDate,
  parseCfpComplaintAggregations,
  parseCfpComplaintSnapshot,
  parseCfpComplaintTotal,
} from './cfpbConsumerComplaints.js';
/** CFPB complaint types. */
export type {
  CfpComplaintCompanyCount,
  CfpComplaintProductCount,
  CfpComplaintYearCount,
  CfpConsumerComplaintSeries,
} from './cfpbConsumerComplaints.js';
/** Shared adapter contract types. */
export type { UsDataAdapter, UsFetchOptions, UsSourceAuth, UsSourceProbe } from './types.js';
