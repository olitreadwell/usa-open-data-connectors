# frozen_string_literal: true

require 'json'
require 'net/http'
require 'uri'

module Usadata
  DEFAULT_TIMEOUT_SECONDS = 30
  USER_AGENT = 'usa-open-data-connectors (Language=Ruby)'

  module_function

  def get_text(url, headers: {})
    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    http.open_timeout = DEFAULT_TIMEOUT_SECONDS
    http.read_timeout = DEFAULT_TIMEOUT_SECONDS
    request = Net::HTTP::Get.new(uri)
    request['User-Agent'] = USER_AGENT
    headers.each { |key, value| request[key] = value }
    response = http.request(request)
    status = response.code.to_i
    unless status.between?(200, 299)
      raise UsSourceApiError.new('http', "HTTP #{status}", status: status)
    end

    response.body.to_s
  rescue Net::OpenTimeout, Net::ReadTimeout, SocketError => e
    raise UsSourceApiError.new('http', "request failed: #{e.message}")
  end

  def get_json(url, headers: {})
    JSON.parse(get_text(url, headers: headers))
  end
end
