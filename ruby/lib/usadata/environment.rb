# frozen_string_literal: true

require 'date'
require 'uri'

module Usadata
  BLS_API_BASE = 'https://api.bls.gov/publicAPI/v2/timeseries/data'
  US_UNEMPLOYMENT_SERIES_ID = 'LNS14000000'
  CDC_PLACES_COUNTY_API_BASE = 'https://data.cdc.gov/resource/swc5-untb.json'
  NCEI_CLIMATE_AT_A_GLANCE_BASE = 'https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance'
  NOAA_COOPS_API_BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
  NWS_API_BASE = 'https://api.weather.gov'

  module_function

  def parse_bls_observations(payload)
    parsed = require_hash(payload, 'bls')
    results = parsed['Results']
    unless results.is_a?(Hash) && results['series'].is_a?(Array)
      raise UsSourceParseError.new('bls', 'invalid BLS response')
    end
    unless parsed['status'] == 'REQUEST_SUCCEEDED'
      raise UsSourceApiError.new('bls',
                                 parsed['status'].to_s)
    end

    observations = []
    results['series'].each do |series|
      next unless series.is_a?(Hash) && series['data'].is_a?(Array)

      series['seriesID'].to_s
      series['data'].each do |row|
        next unless row.is_a?(Hash)
        next unless row['period'].to_s.match?(/\AM(0[1-9]|1[0-2])\z/)

        year = number(row['year'])
        value = number(row['value'])
        next if year.nil? || value.nil?

        observations << {
          'seriesId' => series['seriesID'].to_s,
          'year' => year,
          'period' => row['period'].to_s,
          'periodName' => row['periodName'].to_s,
          'value' => value
        }
      end
    end
    observations.sort_by { |row| [row['year'], row['period']] }
  end

  def build_bls_series(payload)
    points = parse_bls_observations(payload).select do |row|
      row['seriesId'] == US_UNEMPLOYMENT_SERIES_ID
    end
    if points.empty?
      raise UsSourceParseError.new('bls',
                                   "No observations for series #{US_UNEMPLOYMENT_SERIES_ID}")
    end

    first = points.first
    latest = points.last
    peak = points.max_by { |row| row['value'] }
    lowest = points.min_by { |row| row['value'] }
    {
      'seriesId' => US_UNEMPLOYMENT_SERIES_ID,
      'points' => points,
      'first' => first,
      'latest' => latest,
      'peak' => peak,
      'lowest' => lowest,
      'changeFromPeak' => latest['value'] - peak['value'],
      'changeFromFirst' => latest['value'] - first['value']
    }
  end

  def parse_cdc_county_obesity_payload(payload)
    rows = require_array(payload, 'cdc')
    counties = []
    national = nil
    data_year = nil
    rows.each do |row|
      next unless row.is_a?(Hash)

      percent = number(row['data_value'])
      population = number(row['totalpopulation'])
      year = number(row['year'])
      data_year = data_year.nil? ? year : [data_year, year].max unless year.nil?
      next if percent.nil? || population.nil?

      if row['stateabbr'] == 'US'
        national = { 'percent' => percent, 'population' => population }
        next
      end
      next if row['locationname'].nil? || row['stateabbr'].nil?

      counties << {
        'countyName' => row['locationname'],
        'stateAbbr' => row['stateabbr'],
        'percent' => percent,
        'population' => population
      }
    end
    counties.sort_by! { |row| [row['percent'], row['stateAbbr'], row['countyName']] }
    { 'counties' => counties, 'national' => national, 'dataYear' => data_year }
  end

  def build_cdc_county_obesity_set(payload)
    parsed = parse_cdc_county_obesity_payload(payload)
    counties = parsed['counties']
    raise UsSourceParseError.new('cdc', 'No county estimates in the response') if counties.empty?
    if parsed['national'].nil?
      raise UsSourceParseError.new('cdc',
                                   'The response carried no national row')
    end
    if parsed['dataYear'].nil?
      raise UsSourceParseError.new('cdc',
                                   'The response carried no survey year')
    end

    {
      'counties' => counties,
      'countyCount' => counties.length,
      'lowest' => counties.first,
      'highest' => counties.last,
      'national' => parsed['national'],
      'dataYear' => parsed['dataYear']
    }
  end

  def parse_ncei_annual_temperature_csv(csv)
    years = []
    seen = {}
    csv.split("\n").each do |line|
      row = line.strip
      next if row.empty? || row.start_with?('#') || row == 'Date,Value'

      match = row.match(/\A(\d{4})(\d{2}),(-?\d+(?:\.\d+)?)\z/)
      if match.nil?
        raise UsSourceParseError.new('ncei',
                                     "Unreadable row in the temperature file: #{row}")
      end
      unless match[2] == '12'
        raise UsSourceParseError.new('ncei',
                                     "Expected one calendar year per row, got #{row}")
      end

      year = match[1].to_i
      raise UsSourceParseError.new('ncei', "Two rows for #{year}") if seen[year]

      seen[year] = true
      years << { 'year' => year, 'valueFahrenheit' => match[3].to_f }
    end
    raise UsSourceParseError.new('ncei', 'No annual rows in the response') if years.empty?

    years.sort_by { |row| row['year'] }
  end

  def build_ncei_annual_temperature_series(payload)
    unless payload.is_a?(String)
      raise UsSourceParseError.new('ncei',
                                   'The temperature download is CSV text, not JSON')
    end

    years = parse_ncei_annual_temperature_csv(payload)
    total = 0.0
    years.each { |row| total += row['valueFahrenheit'] }
    mean = total / years.length.to_f
    {
      'years' => years,
      'yearCount' => years.length,
      'firstYear' => years.first['year'],
      'lastYear' => years.last['year'],
      'warmest' => years.max_by { |row| row['valueFahrenheit'] },
      'coldest' => years.min_by { |row| row['valueFahrenheit'] },
      'meanFahrenheit' => normalize_number(mean)
    }
  end

  def parse_noaa_sea_level_payload(payload)
    parsed = require_hash(payload, 'noaa')
    if parsed['error'].is_a?(Hash)
      raise UsSourceApiError.new('noaa',
                                 parsed['error'].fetch('message',
                                                       'rejected').to_s)
    end

    metadata = parsed['metadata']
    unless metadata.is_a?(Hash) && metadata.key?('id') && metadata.key?('name')
      raise UsSourceParseError.new('noaa', 'The response carried no station metadata')
    end

    months = []
    require_array(parsed['data'], 'noaa').each do |row|
      next unless row.is_a?(Hash)

      year = number(row['year'])
      month = number(row['month'])
      if year.nil? || month.nil?
        raise UsSourceParseError.new('noaa',
                                     'A monthly row has no year or month')
      end
      next if row['MSL'].nil? || row['MSL'].to_s.strip.empty?

      value = number(row['MSL'])
      raise UsSourceParseError.new('noaa', "Unreadable mean sea level: #{row['MSL']}") if value.nil?

      months << { 'year' => year, 'month' => month, 'meanSeaLevelMeters' => value }
    end
    raise UsSourceParseError.new('noaa', 'No monthly values in the response') if months.empty?

    { 'station' => { 'id' => metadata['id'].to_s, 'name' => metadata['name'].to_s },
      'months' => months }
  end

  def annual_sea_level_years(months)
    by_year = Hash.new { |hash, key| hash[key] = [] }
    months.each { |month| by_year[month['year']] << month['meanSeaLevelMeters'] }
    by_year.keys.sort.map do |year|
      values = by_year[year]
      total = 0.0
      values.each { |value| total += value }
      {
        'year' => year,
        'meanSeaLevelMeters' => normalize_number(total / values.length.to_f),
        'monthCount' => values.length
      }
    end
  end

  def sea_level_trend(years)
    count = years.length
    sum_years = 0.0
    sum_levels = 0.0
    sum_products = 0.0
    sum_squares = 0.0
    years.each do |row|
      sum_years += row['year']
      sum_levels += row['meanSeaLevelMeters']
      sum_products += row['year'] * row['meanSeaLevelMeters']
      sum_squares += row['year'] * row['year']
    end
    denominator = (count * sum_squares) - (sum_years * sum_years)
    if denominator.zero?
      raise UsSourceParseError.new('noaa',
                                   'Every year in the window is the same year')
    end

    ((count * sum_products) - (sum_years * sum_levels)) / denominator.to_f * 1000
  end

  def build_noaa_sea_level_series(payload)
    parsed = parse_noaa_sea_level_payload(payload)
    years = annual_sea_level_years(parsed['months'])
    change = years.last['meanSeaLevelMeters'] - years.first['meanSeaLevelMeters']
    {
      'station' => parsed['station'],
      'years' => years,
      'yearCount' => years.length,
      'firstYear' => years.first,
      'lastYear' => years.last,
      'highest' => years.max_by { |row| row['meanSeaLevelMeters'] },
      'lowest' => years.min_by { |row| row['meanSeaLevelMeters'] },
      'trendMillimetresPerYear' => sea_level_trend(years),
      'changeFirstToLastMeters' => change
    }
  end

  def parse_nws_point_forecast_payload(payload)
    parsed = require_hash(payload, 'nws')
    unless parsed['type'] == 'Feature'
      raise UsSourceParseError.new('nws',
                                   'The response is not a GeoJSON feature')
    end

    coordinates = parsed['geometry'].is_a?(Hash) ? parsed['geometry']['coordinates'] : nil
    unless coordinates.is_a?(Array) && coordinates.length >= 2
      raise UsSourceParseError.new('nws',
                                   'The response carried no coordinate pair')
    end

    properties = parsed['properties']
    unless properties.is_a?(Hash) && %w[gridId gridX gridY forecast forecastOffice].all? do |key|
      properties.key?(key)
    end
      raise UsSourceParseError.new('nws', 'The response carried no forecast grid for the point')
    end

    relative = properties['relativeLocation']
    relative = relative['properties'] if relative.is_a?(Hash) && relative['properties'].is_a?(Hash)
    relative = {} unless relative.is_a?(Hash)
    {
      'latitude' => coordinates[1],
      'longitude' => coordinates[0],
      'city' => relative.fetch('city', ''),
      'state' => relative.fetch('state', ''),
      'gridId' => properties['gridId'],
      'gridX' => properties['gridX'],
      'gridY' => properties['gridY'],
      'forecastOfficeUrl' => properties['forecastOffice'],
      'forecastUrl' => properties['forecast'],
      'forecastHourlyUrl' => properties.fetch('forecastHourly', ''),
      'forecastGridDataUrl' => properties.fetch('forecastGridData', ''),
      'observationStationsUrl' => properties.fetch('observationStations', ''),
      'timeZone' => properties.fetch('timeZone', ''),
      'radarStation' => properties['radarStation'],
      'countyUrl' => properties.fetch('county', ''),
      'fireWeatherZoneUrl' => properties.fetch('fireWeatherZone', '')
    }
  end

  def json_fetcher(url, parser)
    ->(_options = nil) { parser.call(get_json(url)) }
  end

  def text_fetcher(url, parser)
    ->(_options = nil) { parser.call(get_text(url)) }
  end

  bls_unemployment_adapter = Adapter.new(
    'bls-unemployment-rate',
    'US unemployment rate, seasonally adjusted',
    'none',
    'Monthly national unemployment rate from the Current Population Survey.',
    json_fetcher("#{BLS_API_BASE}/#{US_UNEMPLOYMENT_SERIES_ID}?startyear=2006&endyear=2026",
                 method(:build_bls_series)),
    method(:build_bls_series),
    -> { build_bls_series(fixture_json('bls-unemployment-rate.json')) }
  )

  cdc_county_obesity_adapter = Adapter.new(
    'cdc-county-obesity',
    'CDC county adult obesity',
    'none',
    'Model-based share of adults with obesity in each US county, from the CDC PLACES release.',
    json_fetcher("#{CDC_PLACES_COUNTY_API_BASE}?$limit=5000",
                 method(:build_cdc_county_obesity_set)),
    method(:build_cdc_county_obesity_set),
    -> { build_cdc_county_obesity_set(fixture_json('cdc-county-obesity-2026-09-25.json')) }
  )

  ncei_annual_temperature_adapter = Adapter.new(
    'ncei-annual-temperature',
    'NOAA NCEI contiguous US annual temperature',
    'none',
    'Calendar-year average temperature for the contiguous United States since 1895, ' \
    'from the NOAA National Centers for Environmental Information.',
    text_fetcher(
      "#{NCEI_CLIMATE_AT_A_GLANCE_BASE}/national/time-series/110/avg-temp/12/12/" \
      "1895-#{Date.today.year}.csv",
      method(:build_ncei_annual_temperature_series)
    ),
    method(:build_ncei_annual_temperature_series),
    lambda {
      build_ncei_annual_temperature_series(fixture_text('ncei-annual-temperature-2026-09-26.csv'))
    }
  )

  noaa_sea_level_adapter = Adapter.new(
    'noaa-sea-level',
    'NOAA CO-OPS sea level',
    'none',
    'Monthly mean sea level at a NOAA tide gauge, folded into calendar-year averages ' \
    'with a fitted trend.',
    json_fetcher(NOAA_COOPS_API_BASE, method(:build_noaa_sea_level_series)),
    method(:build_noaa_sea_level_series),
    -> { build_noaa_sea_level_series(fixture_json('noaa-sea-level-2026-09-27.json')) }
  )

  nws_point_forecast_adapter = Adapter.new(
    'nws-point-forecast',
    'NWS point forecast',
    'none',
    'The National Weather Service forecast grid point for a latitude and longitude, ' \
    'with the URLs that lead to the daily and hourly forecast.',
    json_fetcher("#{NWS_API_BASE}/points/38.8894,-77.0352",
                 method(:parse_nws_point_forecast_payload)),
    method(:parse_nws_point_forecast_payload),
    -> { parse_nws_point_forecast_payload(fixture_json('nws-point-forecast-2026-10-05.json')) }
  )

  BLS_UNEMPLOYMENT_ADAPTER = bls_unemployment_adapter
  CDC_COUNTY_OBESITY_ADAPTER = cdc_county_obesity_adapter
  NCEI_ANNUAL_TEMPERATURE_ADAPTER = ncei_annual_temperature_adapter
  NOAA_SEA_LEVEL_ADAPTER = noaa_sea_level_adapter
  NWS_POINT_FORECAST_ADAPTER = nws_point_forecast_adapter
end
