# frozen_string_literal: true

module Usadata
  USGS_EARTHQUAKE_API_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query'
  USGS_WATER_DATA_API_BASE = 'https://api.waterdata.usgs.gov/ogcapi/v0'
  USGS_PEAK_STREAMFLOW_COLLECTION = 'peaks'
  USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID = 'USGS-07010000'

  module_function

  def earthquake_from_feature(feature)
    return nil unless feature.is_a?(Hash)
    return nil unless feature['properties'].is_a?(Hash) && feature['geometry'].is_a?(Hash)

    properties = feature['properties']
    coordinates = feature['geometry']['coordinates']
    return nil unless properties['type'] == 'earthquake' && coordinates.is_a?(Array)

    magnitude = number(properties['mag'])
    time_ms = number(properties['time'])
    depth = coordinates.length > 2 ? number(coordinates[2]) : nil
    place = properties['place']
    return nil if magnitude.nil? || time_ms.nil? || depth.nil? || place.nil?

    {
      'id' => feature['id'].to_s,
      'magnitude' => magnitude,
      'place' => place,
      'timeMs' => time_ms,
      'depthKm' => depth,
      'url' => properties['url'].to_s
    }
  end

  def parse_usgs_earthquakes(payload)
    parsed = require_hash(payload, 'usgs')
    metadata = parsed['metadata']
    status = metadata.is_a?(Hash) ? metadata['status'] : 'missing'
    unless metadata.is_a?(Hash) && metadata['status'] == 200
      raise UsSourceApiError.new('usgs',
                                 "catalogue status #{status}")
    end

    earthquakes = []
    require_array(parsed['features'], 'usgs').each do |feature|
      earthquake = earthquake_from_feature(feature)
      earthquakes << earthquake unless earthquake.nil?
    end
    earthquakes.sort_by { |row| [row['timeMs'], row['id']] }
  end

  def peak_streamflow_row(properties)
    location = properties['monitoring_location_id']
    if !location.nil? && location != USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID
      raise UsSourceParseError.new('usgs-peak-streamflow',
                                   "Unexpected gauge in the response: #{location}")
    end

    parameter = properties['parameter_code']
    if !parameter.nil? && parameter != '00060'
      raise UsSourceParseError.new('usgs-peak-streamflow',
                                   "Unexpected parameter in the response: #{parameter}")
    end

    value_text = properties['value']
    return nil if value_text.nil? || value_text.to_s.strip.empty?

    value = number(value_text)
    peak_date = properties['time']
    water_year = properties['water_year']
    unless value && peak_date.is_a?(String) && peak_date.match?(/\A\d{4}-\d{2}-\d{2}\z/)
      raise UsSourceParseError.new('usgs-peak-streamflow', "Unreadable peak row: #{properties}")
    end
    unless water_year.is_a?(Integer)
      raise UsSourceParseError.new('usgs-peak-streamflow',
                                   "Row #{peak_date} carries no water year")
    end

    {
      'waterYear' => water_year,
      'calendarYear' => peak_date[0, 4].to_i,
      'peakDate' => peak_date,
      'peakDischargeCubicFeetPerSecond' => value,
      'qualifiers' => properties['qualifier'] || []
    }
  end

  def build_usgs_earthquake_catalogue(payload)
    earthquakes = parse_usgs_earthquakes(payload)
    raise UsSourceParseError.new('usgs', 'No earthquakes in the catalogue') if earthquakes.empty?

    {
      'earthquakes' => earthquakes,
      'count' => earthquakes.length,
      'strongest' => earthquakes.max_by { |row| row['magnitude'] },
      'deepest' => earthquakes.max_by { |row| row['depthKm'] },
      'earliest' => earthquakes.first,
      'latest' => earthquakes.last
    }
  end

  def parse_usgs_peak_streamflow_payload(payload)
    parsed = require_hash(payload, 'usgs-peak-streamflow')
    features = parsed['features']
    unless features.is_a?(Array) && !features.empty?
      raise UsSourceParseError.new('usgs-peak-streamflow', 'The response carried no rows')
    end

    years = []
    features.each do |feature|
      properties = feature.is_a?(Hash) ? feature['properties'] : nil
      next unless properties.is_a?(Hash)

      row = peak_streamflow_row(properties)
      years << row unless row.nil?
    end
    if years.empty?
      raise UsSourceParseError.new('usgs-peak-streamflow',
                                   'No peak values in the response')
    end

    years
  end

  def build_usgs_peak_streamflow_series(payload)
    years = parse_usgs_peak_streamflow_payload(payload).sort_by { |row| row['waterYear'] }
    highest = years.max_by { |row| row['peakDischargeCubicFeetPerSecond'] }
    lowest = years.min_by { |row| row['peakDischargeCubicFeetPerSecond'] }
    by_value = years.sort_by { |row| row['peakDischargeCubicFeetPerSecond'] }
    filed = years.map { |row| row['waterYear'] }.to_h { |year| [year, true] }
    missing = (years.first['waterYear']..years.last['waterYear']).reject { |year| filed[year] }
    ratio = highest['peakDischargeCubicFeetPerSecond'].to_f /
            lowest['peakDischargeCubicFeetPerSecond']
    {
      'monitoringLocationId' => USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
      'years' => years,
      'yearCount' => years.length,
      'firstYear' => years.first,
      'lastYear' => years.last,
      'highest' => highest,
      'lowest' => lowest,
      'median' => by_value[by_value.length / 2],
      'missingWaterYears' => missing,
      'highestToLowestRatio' => (ratio * 10).round / 10.0
    }
  end

  usgs_hawaii_earthquakes_adapter = Adapter.new(
    'usgs-hawaii-earthquakes',
    'USGS earthquakes around Hawaii',
    'none',
    'Earthquakes of magnitude 2.5 and above near the Hawaiian islands.',
    json_fetcher("#{USGS_EARTHQUAKE_API_BASE}?format=geojson&minmagnitude=2.5",
                 method(:build_usgs_earthquake_catalogue)),
    method(:build_usgs_earthquake_catalogue),
    -> { build_usgs_earthquake_catalogue(fixture_json('usgs-hawaii-earthquakes.json')) }
  )

  usgs_peak_streamflow_adapter = Adapter.new(
    'usgs-peak-streamflow',
    'USGS annual peak streamflow',
    'none',
    'Annual peak streamflow for the Mississippi River at St. Louis, one row per water ' \
    'year, with the highest, lowest, and middle peaks.',
    json_fetcher(
      "#{USGS_WATER_DATA_API_BASE}/collections/#{USGS_PEAK_STREAMFLOW_COLLECTION}/items",
      method(:build_usgs_peak_streamflow_series)
    ),
    method(:build_usgs_peak_streamflow_series),
    -> { build_usgs_peak_streamflow_series(fixture_json('usgs-peak-streamflow-2026-10-01.json')) }
  )

  USGS_HAWAII_EARTHQUAKES_ADAPTER = usgs_hawaii_earthquakes_adapter
  USGS_PEAK_STREAMFLOW_ADAPTER = usgs_peak_streamflow_adapter
end
