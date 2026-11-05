# frozen_string_literal: true

require_relative 'spec_helper'

class SourcesSpec < Minitest::Test
  EXPECTED_IDS = %w[
    bls-unemployment-rate
    usgs-hawaii-earthquakes
    cdc-county-obesity
    ncei-annual-temperature
    noaa-sea-level
    treasury-avg-interest-rate
    fema-disaster-declarations
    openfda-food-recalls
    usgs-peak-streamflow
    cpsc-product-recalls
    cfpb-consumer-complaints
    treasury-debt-to-penny
    sec-edgar-filings
    fdic-bank-directory
    clinicaltrials-studies
    nws-point-forecast
    usaspending-agencies
    epa-envirofacts-facilities
    ncbi-pubmed-search
    cdc-socrata-catalogue
    healthdata-socrata-catalogue
    nyc-open-data-catalogue
    bts-transportation-stats
    estimatetax-income-tax
    callook-callsigns
    college-scorecard-institutions
    publicdatahub-hospital-quality
    nextbus-transit-vehicles
  ].freeze

  EXPECTED_FIXTURE_VALUES = {
    'bls-unemployment-rate' => ['points', 247],
    'usgs-hawaii-earthquakes' => ['count', 264],
    'cdc-county-obesity' => ['countyCount', 2956],
    'ncei-annual-temperature' => ['yearCount', 131],
    'noaa-sea-level' => ['yearCount', 155],
    'treasury-avg-interest-rate' => ['monthCount', 308],
    'fema-disaster-declarations' => ['declarationCount', 5272],
    'openfda-food-recalls' => ['recallCount', 29_463],
    'usgs-peak-streamflow' => ['yearCount', 165],
    'cpsc-product-recalls' => ['totalRecalls', 3986],
    'cfpb-consumer-complaints' => ['totalComplaints', 18_145_013],
    'treasury-debt-to-penny' => ['dayCount', 10],
    'sec-edgar-filings' => ['filingCount', 1001],
    'fdic-bank-directory' => ['bankCount', 10],
    'clinicaltrials-studies' => ['studyCount', 10],
    'nws-point-forecast' => ['gridId', 'LWX'],
    'usaspending-agencies' => ['agencyCount', 111],
    'epa-envirofacts-facilities' => ['facilityCount', 10],
    'ncbi-pubmed-search' => ['returnedCount', 10],
    'cdc-socrata-catalogue' => ['entryCount', 10],
    'healthdata-socrata-catalogue' => ['entryCount', 10],
    'nyc-open-data-catalogue' => ['entryCount', 50],
    'bts-transportation-stats' => ['entryCount', 10],
    'estimatetax-income-tax' => ['taxYear', 2026],
    'callook-callsigns' => ['callsignCount', 10],
    'college-scorecard-institutions' => ['institutionCount', 6],
    'publicdatahub-hospital-quality' => ['measureCount', 7],
    'nextbus-transit-vehicles' => ['vehicleCount', 5]
  }.freeze

  def test_registry_matches_typescript_adapter_ids
    assert_equal EXPECTED_IDS, Usadata::US_DATA_SOURCES.map(&:id)
  end

  def test_registry_lookup_and_metadata
    refute_nil Usadata.get_us_data_source('bls-unemployment-rate')
    assert_nil Usadata.get_us_data_source('does-not-exist')
    Usadata::US_DATA_SOURCES.each do |source|
      refute_empty source.name
      assert_equal 'none', source.auth
      refute_empty source.description
    end
  end

  EXPECTED_FIXTURE_VALUES.each do |source_id, (key, expected)|
    define_method("test_#{source_id.tr('-', '_')}_parses_its_committed_fixture") do
      source = Usadata.get_us_data_source(source_id)
      refute_nil source, source_id
      parsed = source.load_fixture.call
      actual = parsed.fetch(key)
      assert_equal(expected, actual.is_a?(Array) ? actual.length : actual, source_id)
      assert_respond_to source.fetch_live, :call
      assert_raises(Usadata::UsSourceParseError) { source.parse.call(nil) }
    end
  end
end
