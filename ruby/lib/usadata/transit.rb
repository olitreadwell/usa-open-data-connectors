# frozen_string_literal: true

require 'rexml/document'
require 'uri'

module Usadata
  NEXTBUS_XML_FEED_BASE = 'https://retro.umoiq.com/service/publicXMLFeed'
  NHTSA_VEHICLE_MODELS_API_BASE = 'https://api.nhtsa.gov/vehicles/models'
  NHTSA_DEFAULT_MODEL_YEAR = 2025
  NHTSA_DEFAULT_MAKE = 'Honda'
  NHTSA_MODEL_PAGE_SIZE = 100
  NHTSA_MIN_MODEL_YEAR = 1900
  NHTSA_MAX_MODEL_YEAR = 2100

  module_function

  def nextbus_vehicle(vehicle)
    heading = vehicle.attributes['heading']
    speed = vehicle.attributes['speedKmHr']
    {
      'vehicleId' => vehicle.attributes['id'].to_s,
      'routeTag' => vehicle.attributes['routeTag'].to_s,
      'directionTag' => vehicle.attributes['dirTag'].to_s,
      'latitude' => vehicle.attributes['lat'].to_f,
      'longitude' => vehicle.attributes['lon'].to_f,
      'headingDegrees' => heading ? number(heading) : nil,
      'speedKmPerHour' => speed ? number(speed) : nil,
      'secondsSinceReport' => number(vehicle.attributes['secsSinceReport']),
      'predictable' => vehicle.attributes['predictable'] == 'true'
    }
  end

  def nextbus_summary(vehicles, agency_tag, route_tag, observed_at)
    report_ages = vehicles.map { |row| row['secondsSinceReport'] }.compact
    speeds = vehicles.map { |row| row['speedKmPerHour'] }.compact
    average = speeds.empty? ? 0 : normalize_number((speeds.sum.to_f / speeds.length).round(1))
    {
      'agencyTag' => agency_tag,
      'routeTag' => route_tag,
      'observedAtEpochMs' => observed_at,
      'vehicles' => vehicles,
      'vehicleCount' => vehicles.length,
      'predictableVehicleCount' => vehicles.count { |row| row['predictable'] },
      'averageSpeedKmPerHour' => average,
      'newestReportSeconds' => report_ages.min,
      'oldestReportSeconds' => report_ages.max
    }
  end

  def parse_nextbus_vehicle_payload(payload, agency_tag: 'portland-sc', route_tag: '193')
    document = REXML::Document.new(payload.to_s)
    root = document.root
    unless root && root.name == 'body'
      raise UsSourceParseError.new('nextbus',
                                   'The response carried no body')
    end

    error = root.elements['Error']
    raise UsSourceParseError.new('nextbus', error&.text || 'The feed rejected the request') if error

    last_time = root.elements['lastTime']
    if last_time.nil? || last_time.attributes['time'].nil?
      raise UsSourceParseError.new('nextbus',
                                   'The response carried no timestamp')
    end

    vehicles = []
    root.elements.each('vehicle') { |vehicle| vehicles << nextbus_vehicle(vehicle) }
    nextbus_summary(vehicles, agency_tag, route_tag, last_time.attributes['time'].to_i)
  rescue REXML::ParseException => e
    raise UsSourceParseError.new('nextbus', 'The response was not valid XML'), cause: e
  end

  nextbus_transit_vehicles_adapter = Adapter.new(
    'nextbus-transit-vehicles',
    'NextBus transit vehicles',
    'none',
    'Live vehicle positions on the Portland Streetcar NS line, one of the agencies on ' \
    'the keyless NextBus XML feed, with latitude, longitude, heading, speed, and report age.',
    lambda do |_options = nil|
      url = "#{NEXTBUS_XML_FEED_BASE}?command=vehicleLocations&a=portland-sc&r=193&t=0"
      parse_nextbus_vehicle_payload(get_text(url))
    end,
    method(:parse_nextbus_vehicle_payload),
    lambda {
      parse_nextbus_vehicle_payload(
        fixture_text('nextbus-portland-streetcar-vehicles-2026-10-22.xml')
      )
    }
  )

  def build_nhtsa_vehicle_models_url(options = nil)
    query = options || {}
    model_year = query.fetch(:modelYear, NHTSA_DEFAULT_MODEL_YEAR)
    unless model_year.is_a?(Integer) &&
           model_year.between?(NHTSA_MIN_MODEL_YEAR, NHTSA_MAX_MODEL_YEAR)
      raise UsSourceApiError.new(
        'nhtsa-vehicle-models',
        "modelYear must be a whole number from #{NHTSA_MIN_MODEL_YEAR} to #{NHTSA_MAX_MODEL_YEAR}."
      )
    end
    make = query.fetch(:make, NHTSA_DEFAULT_MAKE)
    unless make.is_a?(String) && !make.strip.empty?
      raise UsSourceApiError.new('nhtsa-vehicle-models', 'make must not be blank.')
    end
    max = query.fetch(:max, NHTSA_MODEL_PAGE_SIZE)
    unless max.is_a?(Integer) && max >= 1
      raise UsSourceApiError.new('nhtsa-vehicle-models',
                                 'max must be a whole number of at least 1.')
    end
    offset = query.fetch(:offset, 0)
    unless offset.is_a?(Integer) && offset >= 0
      raise UsSourceApiError.new('nhtsa-vehicle-models',
                                 'offset must be a whole number of at least 0.')
    end
    params = URI.encode_www_form(
      'modelYear' => model_year.to_s,
      'make' => make.strip,
      'max' => max.to_s,
      'offset' => offset.to_s
    )
    "#{NHTSA_VEHICLE_MODELS_API_BASE}?#{params}"
  end

  def nhtsa_integer(value, source, field)
    parsed = number(value)
    unless parsed.is_a?(Integer)
      raise UsSourceParseError.new(source, "A model page carried an unreadable #{field}")
    end

    parsed
  end

  def nhtsa_non_negative_integer(value, source, field)
    parsed = nhtsa_integer(value, source, field)
    if parsed.negative?
      raise UsSourceParseError.new(source, "A model page carried an invalid #{field}")
    end

    parsed
  end

  def parse_nhtsa_vehicle_models_payload(payload)
    source = 'nhtsa-vehicle-models'
    parsed = require_hash(payload, source)
    meta = parsed['meta']
    unless meta.is_a?(Hash)
      raise UsSourceParseError.new(source, 'The response carried no service metadata')
    end
    status = meta['status']
    unless status.is_a?(Integer)
      raise UsSourceParseError.new(source, 'The response carried no service status')
    end
    raise UsSourceApiError.new(source, "NHTSA reported status #{status}") unless status == 200

    pagination = meta['pagination']
    unless pagination.is_a?(Hash)
      raise UsSourceParseError.new(source, 'The response carried no pagination block')
    end
    rows = require_array(parsed['results'], source)
    models = rows.map do |row|
      unless row.is_a?(Hash)
        raise UsSourceParseError.new(source, 'A vehicle model is not an object')
      end

      model_year = nhtsa_integer(row['modelYear'], source, 'model year')
      make = row['make']
      vehicle_model = row['vehicleModel']
      unless make.is_a?(String) && !make.empty?
        raise UsSourceParseError.new(source, 'A vehicle model arrived without its make')
      end
      unless vehicle_model.is_a?(String) && !vehicle_model.empty?
        raise UsSourceParseError.new(source, 'A vehicle model arrived without its model name')
      end
      { 'modelYear' => model_year, 'make' => make, 'vehicleModel' => vehicle_model }
    end
    next_url = pagination['nextUrl']
    unless next_url.nil? || next_url.is_a?(String)
      raise UsSourceParseError.new(source, 'The response carried an unreadable next-page URL')
    end
    {
      'models' => models,
      'modelCount' => models.length,
      'totalCount' => nhtsa_non_negative_integer(pagination['total'], source, 'model total'),
      'offset' => nhtsa_non_negative_integer(pagination['offset'], source, 'offset'),
      'max' => nhtsa_non_negative_integer(pagination['max'], source, 'page size'),
      'nextUrl' => next_url
    }
  end

  def fetch_nhtsa_vehicle_models(options = nil)
    parse_nhtsa_vehicle_models_payload(get_json(build_nhtsa_vehicle_models_url(options)))
  end

  nhtsa_vehicle_models_adapter = Adapter.new(
    'nhtsa-vehicle-models',
    'NHTSA vehicle models',
    'none',
    'Vehicle models NHTSA lists for one model year and make, one row per model, with ' \
    'the service total and next-page URL.',
    ->(options = nil) { fetch_nhtsa_vehicle_models(options) },
    method(:parse_nhtsa_vehicle_models_payload),
    lambda {
      parse_nhtsa_vehicle_models_payload(
        fixture_json('nhtsa-vehicle-models-2025-honda-2026-11-08.json')
      )
    }
  )

  NEXTBUS_TRANSIT_VEHICLES_ADAPTER = nextbus_transit_vehicles_adapter
  NHTSA_VEHICLE_MODELS_ADAPTER = nhtsa_vehicle_models_adapter
end
