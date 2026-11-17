# frozen_string_literal: true

require 'time'

module Usadata
  BTS_TRANSPORTATION_STATS_API_BASE = 'https://data.bts.gov/api/views.json'
  CDC_SOCRATA_CATALOGUE_API_BASE = 'https://data.cdc.gov/api/views.json'
  HEALTHDATA_SOCRATA_CATALOGUE_API_BASE = 'https://healthdata.gov/api/views.json'
  NYC_OPEN_DATA_API_BASE = 'https://data.cityofnewyork.us/api/views.json'
  FCC_SOCRATA_CATALOGUE_API_BASE = 'https://opendata.fcc.gov/api/views.json'
  NY_STATE_OPEN_DATA_API_BASE = 'https://data.ny.gov/api/views.json'
  CHICAGO_OPEN_DATA_API_BASE = 'https://data.cityofchicago.org/api/views.json'
  SEATTLE_OPEN_DATA_API_BASE = 'https://data.seattle.gov/api/views.json'
  TEXAS_OPEN_DATA_API_BASE = 'https://data.texas.gov/api/views.json'
  COLORADO_OPEN_DATA_API_BASE = 'https://data.colorado.gov/api/views.json'
  WASHINGTON_STATE_OPEN_DATA_API_BASE = 'https://data.wa.gov/api/views.json'
  MICHIGAN_OPEN_DATA_API_BASE = 'https://data.michigan.gov/api/views.json'
  OREGON_OPEN_DATA_API_BASE = 'https://data.oregon.gov/api/views.json'
  PENNSYLVANIA_OPEN_DATA_API_BASE = 'https://data.pa.gov/api/views.json'
  ILLINOIS_OPEN_DATA_API_BASE = 'https://data.illinois.gov/api/views.json'
  NEW_JERSEY_OPEN_DATA_API_BASE = 'https://data.nj.gov/api/views.json'
  VERMONT_OPEN_DATA_API_BASE = 'https://data.vermont.gov/api/views.json'
  LOS_ANGELES_OPEN_DATA_API_BASE = 'https://data.lacity.org/api/views.json'
  SAN_FRANCISCO_OPEN_DATA_API_BASE = 'https://data.sf.gov/api/views.json'
  CALIFORNIA_OPEN_DATA_API_BASE = 'https://data.ca.gov/api/3/action/package_search'

  module_function

  def common_core_text(groups, key)
    %w[Common\ Core Common\ Core\ 3].each do |group_name|
      group = groups[group_name]
      next unless group.is_a?(Hash)

      value = group[key]
      next if value.nil?

      return value.is_a?(String) ? value.strip : ''
    end
    ''
  end

  def catalogue_metadata(row)
    metadata = row['metadata']
    return { 'licenceUrl' => '', 'attribution' => '' } unless metadata.is_a?(Hash)

    groups = metadata['custom_fields']
    return { 'licenceUrl' => '', 'attribution' => '' } unless groups.is_a?(Hash)

    {
      'licenceUrl' => common_core_text(groups, 'License'),
      'attribution' => common_core_text(groups, 'Publisher')
    }
  end

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
    }.merge(catalogue_metadata(row))
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

  fcc_socrata_catalogue_adapter = catalogue_adapter(
    'fcc-socrata-catalogue',
    'FCC Open Data catalogue',
    'The Federal Communications Commission Socrata catalogue, one row per published ' \
    'dataset, chart, or story, with its category, view count, and download count.',
    {
      url: "#{FCC_SOCRATA_CATALOGUE_API_BASE}?limit=10",
      fixture: 'fcc-socrata-catalogue-2026-11-08.json'
    }
  )

  ny_state_open_data_catalogue_adapter = catalogue_adapter(
    'ny-state-open-data-catalogue',
    'New York State Open Data catalogue',
    'The New York State Open Data catalogue on Socrata, one row per published dataset or ' \
    'file, with its state topic, view count, and download count.',
    {
      url: "#{NY_STATE_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'ny-state-open-data-catalogue-2026-11-08.json'
    }
  )

  chicago_open_data_catalogue_adapter = catalogue_adapter(
    'chicago-open-data-catalogue',
    'Chicago Data Portal catalogue',
    'The Chicago Data Portal Socrata catalogue, one row per published dataset, chart, ' \
    'map, or story, with its city topic, view count, and download count.',
    {
      url: "#{CHICAGO_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'chicago-open-data-catalogue-2026-11-08.json'
    }
  )

  seattle_open_data_catalogue_adapter = catalogue_adapter(
    'seattle-open-data-catalogue',
    'Seattle Open Data catalogue',
    'The Seattle Open Data Socrata catalogue, one row per published dataset, map, chart, ' \
    'or story, with its city topic, view count, and download count.',
    {
      url: "#{SEATTLE_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'seattle-open-data-catalogue-2026-11-08.json'
    }
  )

  texas_open_data_catalogue_adapter = catalogue_adapter(
    'texas-open-data-catalogue',
    'Texas Open Data catalogue',
    'The Texas Open Data Socrata catalogue, one row per published dataset, map, chart, ' \
    'or linked resource, with its state topic, view count, and download count.',
    {
      url: "#{TEXAS_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'texas-open-data-catalogue-2026-11-08.json'
    }
  )

  colorado_open_data_catalogue_adapter = catalogue_adapter(
    'colorado-open-data-catalogue',
    'Colorado Open Data catalogue',
    'The Colorado Open Data Socrata catalogue, one row per published dataset, map, chart, ' \
    'or linked resource, with its state topic, view count, and download count.',
    {
      url: "#{COLORADO_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'colorado-open-data-catalogue-2026-11-08.json'
    }
  )

  washington_state_open_data_catalogue_adapter = catalogue_adapter(
    'washington-state-open-data-catalogue',
    'Washington State Open Data catalogue',
    'The Washington State Open Data Socrata catalogue, one row per published dataset, ' \
    'chart, story, or other resource, with its state topic, view count, and download count.',
    {
      url: "#{WASHINGTON_STATE_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'washington-state-open-data-catalogue-2026-11-08.json'
    }
  )

  michigan_open_data_catalogue_adapter = catalogue_adapter(
    'michigan-open-data-catalogue',
    'Michigan Open Data catalogue',
    'The Michigan Open Data Socrata catalogue, one row per published dataset, map, chart, ' \
    'story, or other resource, with its state topic, view count, and download count.',
    {
      url: "#{MICHIGAN_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'michigan-open-data-catalogue-2026-11-08.json'
    }
  )

  oregon_open_data_catalogue_adapter = catalogue_adapter(
    'oregon-open-data-catalogue',
    'Oregon Open Data catalogue',
    'The Oregon Open Data Socrata catalogue, one row per published dataset, file, or ' \
    'filtered view, with its state topic, view count, and download count.',
    {
      url: "#{OREGON_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'oregon-open-data-catalogue-2026-11-08.json'
    }
  )

  pennsylvania_open_data_catalogue_adapter = catalogue_adapter(
    'pennsylvania-open-data-catalogue',
    'Pennsylvania Open Data catalogue',
    'The Pennsylvania Open Data Socrata catalogue, one row per published dataset, chart, ' \
    'or linked resource, with its state topic, view count, and download count.',
    {
      url: "#{PENNSYLVANIA_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'pennsylvania-open-data-catalogue-2026-11-08.json'
    }
  )

  illinois_open_data_catalogue_adapter = catalogue_adapter(
    'illinois-open-data-catalogue',
    'Illinois Open Data catalogue',
    'The Illinois Open Data Socrata catalogue, one row per published dataset, chart, ' \
    'story, or filtered view, with its state topic, view count, and download count.',
    {
      url: "#{ILLINOIS_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'illinois-open-data-catalogue-2026-11-08.json'
    }
  )

  new_jersey_open_data_catalogue_adapter = catalogue_adapter(
    'new-jersey-open-data-catalogue',
    'New Jersey Open Data catalogue',
    'The New Jersey Open Data Socrata catalogue, one row per published dataset, file, ' \
    'story, or other resource, with its state topic, view count, and download count.',
    {
      url: "#{NEW_JERSEY_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'new-jersey-open-data-catalogue-2026-11-08.json'
    }
  )

  vermont_open_data_catalogue_adapter = catalogue_adapter(
    'vermont-open-data-catalogue',
    'Vermont Open Data catalogue',
    'The Vermont Open Data Socrata catalogue, one row per published dataset or filtered ' \
    'view, with its state topic, view count, and download count.',
    {
      url: "#{VERMONT_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'vermont-open-data-catalogue-2026-11-08.json'
    }
  )

  los_angeles_open_data_catalogue_adapter = catalogue_adapter(
    'los-angeles-open-data-catalogue',
    'Los Angeles Open Data catalogue',
    'The Los Angeles Open Data Socrata catalogue, one row per published dataset, map, or ' \
    'filtered view, with its city topic, view count, and download count.',
    {
      url: "#{LOS_ANGELES_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'los-angeles-open-data-catalogue-2026-11-08.json'
    }
  )

  san_francisco_open_data_catalogue_adapter = catalogue_adapter(
    'san-francisco-open-data-catalogue',
    'San Francisco Open Data catalogue',
    'The San Francisco Open Data Socrata catalogue, one row per published dataset, map, ' \
    'or filtered view, with its city topic, view count, and download count.',
    {
      url: "#{SAN_FRANCISCO_OPEN_DATA_API_BASE}?limit=10",
      fixture: 'san-francisco-open-data-catalogue-2026-11-08.json'
    }
  )

  def ckan_text(value)
    value.is_a?(String) ? value.strip : ''
  end

  def ckan_timestamp(source, value, field)
    normalized = value.match?(/(?:Z|[+-]\d{2}:?\d{2})\z/) ? value : "#{value}Z"
    Time.iso8601(normalized).to_i
  rescue ArgumentError
    raise UsSourceParseError.new(source,
                                 "A catalogue entry carried an invalid #{field}")
  end

  def ckan_category(source, row)
    groups = row['groups']
    return nil if groups.nil?
    unless groups.is_a?(Array)
      raise UsSourceParseError.new(source,
                                   'A catalogue entry carried malformed groups')
    end
    return nil if groups.empty?

    first = groups.first
    unless first.is_a?(Hash)
      raise UsSourceParseError.new(source,
                                   'A catalogue entry carried a malformed group')
    end
    first['title'].is_a?(String) ? first['title'] : nil
  end

  def ckan_resource_count(source, row)
    count = row['num_resources']
    unless count.nil?
      unless count.is_a?(Integer)
        raise UsSourceParseError.new(source,
                                     'A catalogue entry carried an invalid resource total')
      end
      return count
    end
    row['resources'].is_a?(Array) ? row['resources'].length : 0
  end

  def ckan_licence(row)
    return ckan_text(row['license_url']) unless row['license_url'].nil?

    ckan_text(row['license_title'])
  end

  def ckan_attribution(row)
    organization = row['organization']
    organization.is_a?(Hash) ? ckan_text(organization['title']) : ''
  end

  def parse_california_open_data_catalogue_payload(payload)
    source = 'california-open-data-catalogue'
    parsed = require_hash(payload, source)
    result = parsed['result']
    unless parsed['success'] == true && result.is_a?(Hash)
      raise UsSourceParseError.new(source, 'The response is not a CKAN package search')
    end

    count = result['count']
    rows = result['results']
    unless count.is_a?(Integer) && count >= 0 && rows.is_a?(Array)
      raise UsSourceParseError.new(source,
                                   'The response carried no catalogue total or results')
    end
    raise UsSourceParseError.new(source, 'The response carried no entries') if rows.empty?

    entries = rows.map do |row|
      required = %w[id name title metadata_created]
      unless row.is_a?(Hash) && required.all? { |key| row[key].is_a?(String) }
        raise UsSourceParseError.new(
          source,
          'A catalogue entry arrived without its id, name, title, or creation time'
        )
      end
      created = ckan_timestamp(source, row['metadata_created'], 'metadata_created')
      modified = if row['metadata_modified'].nil?
                   created
                 else
                   ckan_timestamp(source, row['metadata_modified'], 'metadata_modified')
                 end
      {
        'id' => row['id'],
        'name' => row['name'],
        'title' => row['title'],
        'assetType' => row.fetch('type', ''),
        'category' => ckan_category(source, row),
        'createdAtEpochSeconds' => created,
        'viewLastModifiedEpochSeconds' => modified,
        'resourceCount' => ckan_resource_count(source, row),
        'licenceUrl' => ckan_licence(row),
        'attribution' => ckan_attribution(row)
      }
    end

    {
      'entries' => entries,
      'entryCount' => entries.length,
      'catalogueCount' => count,
      'datasetCount' => entries.count { |entry| entry['assetType'] == 'dataset' },
      'newestEntry' => entries.max_by { |entry| entry['createdAtEpochSeconds'] },
      'categories' => catalogue_categories(entries)
    }
  end

  california_open_data_catalogue_adapter = Adapter.new(
    'california-open-data-catalogue',
    'California Open Data catalogue',
    'none',
    'The California Open Data CKAN catalogue, one row per published dataset package, ' \
    'with its title, groups, resources, licence, and publishing organisation.',
    lambda do |_options = nil|
      parse_california_open_data_catalogue_payload(
        get_json("#{CALIFORNIA_OPEN_DATA_API_BASE}?rows=10")
      )
    end,
    method(:parse_california_open_data_catalogue_payload),
    lambda {
      parse_california_open_data_catalogue_payload(
        fixture_json('california-open-data-catalogue-2026-11-08.json')
      )
    }
  )

  BTS_TRANSPORTATION_STATS_ADAPTER = bts_transportation_stats_adapter
  CDC_SOCRATA_CATALOGUE_ADAPTER = cdc_socrata_catalogue_adapter
  HEALTHDATA_SOCRATA_CATALOGUE_ADAPTER = healthdata_socrata_catalogue_adapter
  NYC_OPEN_DATA_CATALOGUE_ADAPTER = nyc_open_data_catalogue_adapter
  FCC_SOCRATA_CATALOGUE_ADAPTER = fcc_socrata_catalogue_adapter
  NY_STATE_OPEN_DATA_CATALOGUE_ADAPTER = ny_state_open_data_catalogue_adapter
  CHICAGO_OPEN_DATA_CATALOGUE_ADAPTER = chicago_open_data_catalogue_adapter
  SEATTLE_OPEN_DATA_CATALOGUE_ADAPTER = seattle_open_data_catalogue_adapter
  TEXAS_OPEN_DATA_CATALOGUE_ADAPTER = texas_open_data_catalogue_adapter
  COLORADO_OPEN_DATA_CATALOGUE_ADAPTER = colorado_open_data_catalogue_adapter
  WASHINGTON_STATE_OPEN_DATA_CATALOGUE_ADAPTER = washington_state_open_data_catalogue_adapter
  MICHIGAN_OPEN_DATA_CATALOGUE_ADAPTER = michigan_open_data_catalogue_adapter
  OREGON_OPEN_DATA_CATALOGUE_ADAPTER = oregon_open_data_catalogue_adapter
  PENNSYLVANIA_OPEN_DATA_CATALOGUE_ADAPTER = pennsylvania_open_data_catalogue_adapter
  ILLINOIS_OPEN_DATA_CATALOGUE_ADAPTER = illinois_open_data_catalogue_adapter
  NEW_JERSEY_OPEN_DATA_CATALOGUE_ADAPTER = new_jersey_open_data_catalogue_adapter
  VERMONT_OPEN_DATA_CATALOGUE_ADAPTER = vermont_open_data_catalogue_adapter
  LOS_ANGELES_OPEN_DATA_CATALOGUE_ADAPTER = los_angeles_open_data_catalogue_adapter
  SAN_FRANCISCO_OPEN_DATA_CATALOGUE_ADAPTER = san_francisco_open_data_catalogue_adapter
  CALIFORNIA_OPEN_DATA_CATALOGUE_ADAPTER = california_open_data_catalogue_adapter
end
