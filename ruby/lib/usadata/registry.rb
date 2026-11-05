# frozen_string_literal: true

module Usadata
  US_DATA_SOURCES = [
    BLS_UNEMPLOYMENT_ADAPTER,
    USGS_HAWAII_EARTHQUAKES_ADAPTER,
    CDC_COUNTY_OBESITY_ADAPTER,
    NCEI_ANNUAL_TEMPERATURE_ADAPTER,
    NOAA_SEA_LEVEL_ADAPTER,
    TREASURY_AVG_INTEREST_RATE_ADAPTER,
    FEMA_DISASTER_DECLARATIONS_ADAPTER,
    OPENFDA_FOOD_RECALLS_ADAPTER,
    USGS_PEAK_STREAMFLOW_ADAPTER,
    CPSC_PRODUCT_RECALLS_ADAPTER,
    CFPB_CONSUMER_COMPLAINTS_ADAPTER,
    TREASURY_DEBT_TO_PENNY_ADAPTER,
    SEC_EDGAR_FILINGS_ADAPTER,
    FDIC_BANK_DIRECTORY_ADAPTER,
    CLINICALTRIALS_STUDIES_ADAPTER,
    NWS_POINT_FORECAST_ADAPTER,
    USASPENDING_AGENCIES_ADAPTER,
    EPA_ENVIROFACTS_FACILITIES_ADAPTER,
    NCBI_PUBMED_SEARCH_ADAPTER,
    CDC_SOCRATA_CATALOGUE_ADAPTER,
    HEALTHDATA_SOCRATA_CATALOGUE_ADAPTER,
    NYC_OPEN_DATA_CATALOGUE_ADAPTER,
    BTS_TRANSPORTATION_STATS_ADAPTER,
    ESTIMATETAX_INCOME_TAX_ADAPTER,
    CALLOOK_CALLSIGNS_ADAPTER,
    COLLEGE_SCORECARD_INSTITUTIONS_ADAPTER,
    PUBLICDATAHUB_HOSPITAL_ADAPTER,
    NEXTBUS_TRANSIT_VEHICLES_ADAPTER
  ].freeze

  module_function

  def get_us_data_source(source_id)
    US_DATA_SOURCES.find { |source| source.id == source_id }
  end

  def probe_all_us_data_sources(options = nil)
    ids = options.is_a?(Hash) ? options[:ids] || options['ids'] : nil
    unless ids.nil?
      known = US_DATA_SOURCES.map(&:id)
      unknown = ids.reject { |source_id| known.include?(source_id) }.uniq.sort
      raise ArgumentError, "Unknown US source ids #{unknown.join(', ')}" unless unknown.empty?
    end
    selected = if ids.nil?
                 US_DATA_SOURCES
               else
                 US_DATA_SOURCES.select do |source|
                   ids.include?(source.id)
                 end
               end
    selected.map do |source|
      data = source.fetch_live.call(options)
      {
        'id' => source.id, 'name' => source.name, 'auth' => source.auth,
        'ok' => true, 'status' => 'ok', 'sample' => JSON.generate(data)[0, 120]
      }
    rescue StandardError => e
      { 'id' => source.id, 'name' => source.name, 'auth' => source.auth, 'ok' => false,
        'status' => e.message }
    end
  end
end
