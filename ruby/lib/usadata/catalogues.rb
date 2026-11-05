# frozen_string_literal: true

module Usadata
  BTS_TRANSPORTATION_STATS_API_BASE = 'https://data.bts.gov/api/views.json'
  CDC_SOCRATA_CATALOGUE_API_BASE = 'https://data.cdc.gov/api/views.json'
  HEALTHDATA_SOCRATA_CATALOGUE_API_BASE = 'https://healthdata.gov/api/views.json'
  NYC_OPEN_DATA_API_BASE = 'https://data.cityofnewyork.us/api/views.json'

  module_function

  def catalogue_entry(row, source)
    unless row.is_a?(Hash) && row.key?('id') && row.key?('name') && row.key?('createdAt')
      raise UsSourceParseError.new(
        source,
        'A catalogue entry arrived without its id, name, or creation time'
      )
    end

    created = row['createdAt']
    {
      'id' => row['id'],
      'name' => row['name'],
      'assetType' => row.fetch('assetType', ''),
      'category' => row['category'],
      'viewType' => row.fetch('viewType', ''),
      'createdAtEpochSeconds' => created,
      'viewLastModifiedEpochSeconds' => row.fetch('viewLastModified', created),
      'viewCount' => row.fetch('viewCount', 0),
      'downloadCount' => row.fetch('downloadCount', 0)
    }
  end

  def catalogue_categories(entries)
    counts = Hash.new(0)
    entries.each { |entry| counts[entry['category'] || 'Uncategorised'] += 1 }
    counts.sort_by { |category, count| [-count, category] }.map do |category, count|
      { 'category' => category, 'entryCount' => count }
    end
  end

  def catalogue_city_summary(entries)
    {
      'mapCount' => entries.count { |entry| entry['assetType'] == 'map' },
      'mostViewedEntry' => entries.max_by { |entry| entry['viewCount'] },
      'mostDownloadedEntry' => entries.max_by { |entry| entry['downloadCount'] },
      'totalViewCount' => entries.sum { |entry| entry['viewCount'] },
      'totalDownloadCount' => entries.sum { |entry| entry['downloadCount'] }
    }
  end

  def parse_catalogue_payload(payload, source, city_catalogue: false)
    rows = require_array(payload, source)
    raise UsSourceParseError.new(source, 'The response carried no entries') if rows.empty?

    entries = rows.map { |row| catalogue_entry(row, source) }
    result = {
      'entries' => entries,
      'entryCount' => entries.length,
      'datasetCount' => entries.count { |entry| entry['assetType'] == 'dataset' },
      'newestEntry' => entries.max_by { |entry| entry['createdAtEpochSeconds'] },
      'categories' => catalogue_categories(entries)
    }
    return result unless city_catalogue

    result.merge(catalogue_city_summary(entries))
  end

  def catalogue_adapter(source_id, name, description, options)
    url = options.fetch(:url)
    fixture = options.fetch(:fixture)
    city_catalogue = options.fetch(:city_catalogue, false)
    parser = lambda do |payload|
      parse_catalogue_payload(payload, source_id, city_catalogue: city_catalogue)
    end
    Adapter.new(
      source_id,
      name,
      'none',
      description,
      ->(_options = nil) { parser.call(get_json(url)) },
      parser,
      -> { parser.call(fixture_json(fixture)) }
    )
  end

  bts_transportation_stats_adapter = catalogue_adapter(
    'bts-transportation-stats',
    'BTS transportation statistics',
    'The Bureau of Transportation Statistics Socrata catalogue, one row per published ' \
    'dataset, chart, or story, with its category, view count, and download count.',
    {
      url: "#{BTS_TRANSPORTATION_STATS_API_BASE}?limit=10",
      fixture: 'bts-transportation-stats-2026-10-05.json'
    }
  )

  cdc_socrata_catalogue_adapter = catalogue_adapter(
    'cdc-socrata-catalogue',
    'CDC Socrata catalogue',
    "The CDC's Socrata catalogue, one row per published dataset, chart, or story, with " \
    'its category, view count, and download count.',
    {
      url: "#{CDC_SOCRATA_CATALOGUE_API_BASE}?limit=10",
      fixture: 'cdc-socrata-catalogue-2026-10-05.json'
    }
  )

  healthdata_socrata_catalogue_adapter = catalogue_adapter(
    'healthdata-socrata-catalogue',
    'HealthData.gov catalogue',
    'The HealthData.gov Socrata catalogue, one row per published dataset, chart, or ' \
    'story, with its category, view count, and download count.',
    {
      url: "#{HEALTHDATA_SOCRATA_CATALOGUE_API_BASE}?limit=10",
      fixture: 'healthdata-socrata-catalogue-2026-10-05.json'
    }
  )

  nyc_open_data_catalogue_adapter = catalogue_adapter(
    'nyc-open-data-catalogue',
    'NYC Open Data catalogue',
    'The New York City open data catalogue on Socrata, one row per published dataset or ' \
    'map, with its city topic, view count, and download count.',
    {
      url: "#{NYC_OPEN_DATA_API_BASE}?limit=50",
      fixture: 'nyc-open-data-catalogue-2026-10-19.json',
      city_catalogue: true
    }
  )

  BTS_TRANSPORTATION_STATS_ADAPTER = bts_transportation_stats_adapter
  CDC_SOCRATA_CATALOGUE_ADAPTER = cdc_socrata_catalogue_adapter
  HEALTHDATA_SOCRATA_CATALOGUE_ADAPTER = healthdata_socrata_catalogue_adapter
  NYC_OPEN_DATA_CATALOGUE_ADAPTER = nyc_open_data_catalogue_adapter
end
