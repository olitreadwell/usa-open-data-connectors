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
/** Treasury debt to the penny, daily public debt outstanding (keyless). */
export {
  buildTreasuryDebtToPennyPage,
  buildTreasuryDebtToPennyUrl,
  fetchTreasuryDebtToPenny,
  parseTreasuryDebtToPennyPayload,
  treasuryDebtToPennyAdapter,
  TREASURY_DEBT_TO_PENNY_API_BASE,
  TREASURY_DEBT_TO_PENNY_PATH,
  TREASURY_DEBT_TO_PENNY_ROW_LIMIT,
  TREASURY_DEBT_TO_PENNY_SOURCE_ID,
} from './treasuryDebtToPenny.js';
/** Treasury debt to the penny types. */
export type { TreasuryDebtToPennyDay, TreasuryDebtToPennyPage } from './treasuryDebtToPenny.js';
/** SEC EDGAR issuer submissions and recent filings (keyless). */
export {
  buildSecEdgarSubmissionsUrl,
  fetchSecEdgarFilings,
  parseSecEdgarFilingsPayload,
  secEdgarFilingsAdapter,
  SEC_EDGAR_APPLE_CIK,
  SEC_EDGAR_FILINGS_SOURCE_ID,
  SEC_EDGAR_SUBMISSIONS_API_BASE,
  SEC_EDGAR_USER_AGENT,
} from './secEdgarFilings.js';
/** SEC EDGAR filings types. */
export type {
  SecEdgarCompanyFilings,
  SecEdgarFiling,
  SecEdgarFormCount,
} from './secEdgarFilings.js';
/** FDIC bank directory (keyless). */
export {
  buildFdicBankDirectoryUrl,
  FDIC_BANK_API_BASE,
  FDIC_BANK_DIRECTORY_SOURCE_ID,
  FDIC_BANK_FIELDS,
  FDIC_BANK_ROW_LIMIT,
  fdicBankDirectoryAdapter,
  fetchFdicBankDirectory,
  parseFdicBankDirectoryPayload,
} from './fdicBankDirectory.js';
/** FDIC bank directory types. */
export type { FdicBank, FdicBankDirectory, FdicBankStateCount } from './fdicBankDirectory.js';
/** ClinicalTrials.gov registered studies (keyless). */
export {
  buildClinicalTrialsStudiesUrl,
  CLINICALTRIALS_STUDIES_API_BASE,
  CLINICALTRIALS_STUDIES_PAGE_SIZE,
  CLINICALTRIALS_STUDIES_SOURCE_ID,
  clinicalTrialsStudiesAdapter,
  fetchClinicalTrialsStudies,
  parseClinicalTrialsStudiesPayload,
} from './clinicalTrialsStudies.js';
/** ClinicalTrials.gov study types. */
export type {
  ClinicalTrialStatusCount,
  ClinicalTrialStudy,
  ClinicalTrialStudyPage,
} from './clinicalTrialsStudies.js';
/** National Weather Service point forecast grid (keyless). */
export {
  buildNwsPointUrl,
  fetchNwsPointForecast,
  NWS_API_BASE,
  NWS_DEFAULT_LATITUDE,
  NWS_DEFAULT_LONGITUDE,
  NWS_POINT_FORECAST_PATH,
  NWS_POINT_FORECAST_SOURCE_ID,
  NWS_USER_AGENT,
  nwsPointForecastAdapter,
  parseNwsPointForecastPayload,
} from './nwsPointForecast.js';
/** National Weather Service point forecast types. */
export type { NwsForecastPoint } from './nwsPointForecast.js';
/** USAspending top-tier federal agencies (keyless). */
export {
  fetchUsaSpendingAgencies,
  parseUsaSpendingAgenciesPayload,
  usaspendingAgenciesAdapter,
  USASPENDING_AGENCIES_SOURCE_ID,
  USASPENDING_API_BASE,
  USASPENDING_TOP_TIER_AGENCIES_PATH,
} from './usaspendingAgencies.js';
/** USAspending agency types. */
export type { UsaSpendingAgency, UsaSpendingAgencyDirectory } from './usaspendingAgencies.js';
/** EPA Envirofacts Toxics Release Inventory facilities (keyless). */
export {
  buildEpaEnvirofactsFacilitiesUrl,
  EPA_ENVIROFACTS_API_BASE,
  EPA_ENVIROFACTS_FACILITIES_SOURCE_ID,
  EPA_ENVIROFACTS_ROW_WINDOW,
  EPA_ENVIROFACTS_STATE_ABBR,
  EPA_ENVIROFACTS_STATE_COLUMN,
  EPA_ENVIROFACTS_TABLE,
  epaEnvirofactsFacilitiesAdapter,
  fetchEpaEnvirofactsFacilities,
  parseEpaEnvirofactsFacilitiesPayload,
} from './epaEnvirofactsFacilities.js';
/** EPA Envirofacts facility types. */
export type {
  EpaEnvirofactsFacility,
  EpaEnvirofactsFacilityPage,
  EpaEnvirofactsCountyCount,
} from './epaEnvirofactsFacilities.js';
/** NCBI PubMed literature search (keyless). */
export {
  buildNcbiPubmedSearchUrl,
  fetchNcbiPubmedSearch,
  NCBI_EUTILS_API_BASE,
  NCBI_PUBMED_DEFAULT_RETMAX,
  NCBI_PUBMED_DEFAULT_TERM,
  NCBI_PUBMED_ESEARCH_PATH,
  NCBI_PUBMED_SEARCH_SOURCE_ID,
  ncbiPubmedSearchAdapter,
  parseNcbiPubmedSearchPayload,
} from './ncbiPubmedSearch.js';
/** NCBI PubMed search types. */
export type { NcbiPubmedSearchResult, NcbiPubmedTranslation } from './ncbiPubmedSearch.js';
/** CDC Socrata catalogue of public health datasets (keyless). */
export {
  buildCdcSocrataCatalogueUrl,
  CDC_SOCRATA_CATALOGUE_API_BASE,
  CDC_SOCRATA_CATALOGUE_LIMIT,
  CDC_SOCRATA_CATALOGUE_SOURCE_ID,
  cdcSocrataCatalogueAdapter,
  fetchCdcSocrataCatalogue,
  parseCdcSocrataCataloguePayload,
} from './cdcSocrataCatalogue.js';
/** CDC Socrata catalogue types. */
export type {
  CdcSocrataCatalogue,
  CdcSocrataCatalogueEntry,
  CdcSocrataCategoryCount,
} from './cdcSocrataCatalogue.js';
/** HealthData.gov Socrata catalogue of health datasets (keyless). */
export {
  buildHealthdataSocrataCatalogueUrl,
  fetchHealthdataSocrataCatalogue,
  HEALTHDATA_SOCRATA_CATALOGUE_API_BASE,
  HEALTHDATA_SOCRATA_CATALOGUE_LIMIT,
  HEALTHDATA_SOCRATA_CATALOGUE_SOURCE_ID,
  healthdataSocrataCatalogueAdapter,
  parseHealthdataSocrataCataloguePayload,
} from './healthdataSocrataCatalogue.js';
/** HealthData.gov Socrata catalogue types. */
export type {
  HealthdataSocrataCatalogue,
  HealthdataSocrataCatalogueEntry,
  HealthdataSocrataCategoryCount,
} from './healthdataSocrataCatalogue.js';
/** Bureau of Transportation Statistics catalogue (keyless). */
export {
  buildBtsTransportationStatsUrl,
  BTS_TRANSPORTATION_STATS_API_BASE,
  BTS_TRANSPORTATION_STATS_LIMIT,
  BTS_TRANSPORTATION_STATS_SOURCE_ID,
  btsTransportationStatsAdapter,
  fetchBtsTransportationStats,
  parseBtsTransportationStatsPayload,
} from './btsTransportationStats.js';
/** Bureau of Transportation Statistics catalogue types. */
export type {
  BtsCatalogueCategoryCount,
  BtsCatalogueEntry,
  BtsTransportationCatalogue,
} from './btsTransportationStats.js';

/** Shared adapter contract types. */
export type { UsDataAdapter, UsFetchOptions, UsSourceAuth, UsSourceProbe } from './types.js';
