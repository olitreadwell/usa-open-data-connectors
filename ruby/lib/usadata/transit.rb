# frozen_string_literal: true

require 'rexml/document'

module Usadata
  NEXTBUS_XML_FEED_BASE = 'https://retro.umoiq.com/service/publicXMLFeed'

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

  NEXTBUS_TRANSIT_VEHICLES_ADAPTER = nextbus_transit_vehicles_adapter
end
