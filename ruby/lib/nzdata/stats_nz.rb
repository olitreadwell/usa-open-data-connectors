# frozen_string_literal: true

require 'cgi'
require 'csv'
require 'json'
require 'net/http'
require 'rexml/document'
require 'uri'

module Nzdata
  StatsNzDataflow = Struct.new(:id, :agency_id, :version, :title)
  StatsNzObservation = Struct.new(:dimensions, :value, :labels, :status)
  StatsNzCodelistItem = Struct.new(:id, :name)
  StatsNzCodelist = Struct.new(:id, :agency_id, :version, :items)

  DEFAULT_BASE_URL = 'https://api.data.stats.govt.nz/rest'
  DEFAULT_VERSION = '1.0'
  DEFAULT_TIMEOUT_MS = 30_000
  USER_AGENT = 'nz-open-data-connectors (Language=Ruby)'
  VALID_FORMATS = %w[csv csvfilewithlabels jsondata].freeze

  module_function

  def parse_stats_nz_csv(text, dataflow_id)
    text = text.sub(/\A\uFEFF/, '')
    rows = CSV.parse(text, headers: true)
    return [] if rows.nil? || rows.empty?

    headers = rows.headers
    unless headers.include?('OBS_VALUE')
      raise StatsNzParseError,
            'Stats NZ CSV is missing the OBS_VALUE column'
    end

    suffix = "_#{dataflow_id}"
    label_suffix = "_LABEL#{suffix}"
    rows.map do |row|
      dimensions = {}
      labels = {}
      row.to_h.each do |key, value|
        next if %w[DATAFLOW OBS_VALUE OBS_STATUS].include?(key)

        if key.end_with?(label_suffix)
          labels[key[0...-label_suffix.length]] = value.to_s
          next
        end
        dimensions[key[0...-suffix.length]] = value.to_s if key.end_with?(suffix)
      end
      raw_value = row['OBS_VALUE'].to_s
      value = raw_value.empty? ? nil : Float(raw_value)
      if value && !value.finite?
        raise StatsNzParseError, "Invalid OBS_VALUE in Stats NZ CSV: #{raw_value}"
      end

      observation = StatsNzObservation.new(dimensions, value)
      observation.labels = labels unless labels.empty?
      observation.status = row['OBS_STATUS'].to_s.strip unless row['OBS_STATUS'].to_s.strip.empty?
      observation
    end
  end

  def format_value(value)
    return '' if value.nil?

    value == value.to_i ? value.to_i.to_s : value.to_s
  end

  def escape_csv_cell(value)
    if value.include?(',') || value.include?('"') || value.include?("\n")
      "\"#{value.gsub('"', '""')}\""
    else
      value
    end
  end

  def serialize_stats_nz_rows_to_csv(rows)
    return '' if rows.empty?

    dimension_keys = rows.flat_map { |row| row.dimensions.keys }.uniq.sort
    has_status = rows.any? { |row| !row.status.nil? }
    header = dimension_keys + ['value'] + (has_status ? ['status'] : [])
    lines = [header.join(',')]
    rows.each do |row|
      cells = dimension_keys.map { |key| row.dimensions[key].to_s }
      cells << format_value(row.value)
      cells << row.status.to_s if has_status
      lines << cells.map { |cell| escape_csv_cell(cell) }.join(',')
    end
    lines.join("\n")
  end

  def parse_dataflow_catalogue_xml(xml)
    doc = REXML::Document.new(xml)
    structure = REXML::XPath.first(doc, '//*[local-name()="Structure"]')
    if structure.nil?
      raise StatsNzParseError,
            'Stats NZ dataflow catalogue XML has no Structure element'
    end

    REXML::XPath.match(doc, '//*[local-name()="Dataflow"]').map do |flow|
      name = REXML::XPath.first(flow, './/*[local-name()="Name"]')
      StatsNzDataflow.new(
        flow.attributes['id'].to_s,
        flow.attributes['agencyID'].to_s,
        flow.attributes['version'].to_s,
        name ? name.text.to_s : ''
      )
    end
  rescue REXML::ParseException
    raise StatsNzParseError, 'Failed to parse Stats NZ dataflow catalogue XML'
  end

  def parse_codelist_xml(xml)
    doc = REXML::Document.new(xml)
    codelist = REXML::XPath.first(doc, '//*[local-name()="Codelist"]')
    raise StatsNzParseError, 'Stats NZ codelist XML has no Codelist element' if codelist.nil?

    items = REXML::XPath.match(codelist, './/*[local-name()="Code"]').map do |code|
      name = REXML::XPath.first(code, './/*[local-name()="Name"]')
      StatsNzCodelistItem.new(code.attributes['id'].to_s, name ? name.text.to_s : '')
    end
    StatsNzCodelist.new(
      codelist.attributes['id'].to_s,
      codelist.attributes['agencyID'].to_s,
      codelist.attributes['version'].to_s,
      items
    )
  rescue REXML::ParseException
    raise StatsNzParseError, 'Failed to parse Stats NZ codelist XML'
  end

  class StatsNzClient
    def initialize(subscription_key: nil, base_url: DEFAULT_BASE_URL,
                   timeout_ms: DEFAULT_TIMEOUT_MS, fetch_impl: nil)
      @base_url = base_url.dup
      @base_url = @base_url[0...-1] while @base_url.end_with?('/')
      @subscription_key = subscription_key
      @timeout_ms = timeout_ms
      @fetch = fetch_impl || method(:default_fetch)
    end

    def get_data(dataflow_id, key: 'all', version: nil, format: 'csv')
      unless VALID_FORMATS.include?(format)
        raise StatsNzError,
              "Unsupported Stats NZ response format: #{format}"
      end
      if format == 'jsondata'
        raise StatsNzError,
              'jsondata format is not implemented in the Ruby port'
      end

      version ||= DEFAULT_VERSION
      path = "/data/STATSNZ,#{encode(dataflow_id)},#{encode(version)}/" \
             "#{encode(key)}?format=#{format}"
      body = send_request(path, 'text/csv')
      Nzdata.parse_stats_nz_csv(body, dataflow_id)
    end

    def get_dataflow_catalogue
      body = send_request('/dataflow/STATSNZ/all', 'application/xml')
      Nzdata.parse_dataflow_catalogue_xml(body)
    end

    def get_codelist(codelist_id, version: nil)
      version_segment = version.nil? ? '' : "/#{encode(version)}"
      path = "/codelist/STATSNZ/#{encode(codelist_id)}#{version_segment}"
      body = send_request(path, 'application/xml')
      Nzdata.parse_codelist_xml(body)
    end

    private

    def encode(value)
      URI.encode_www_form_component(value)
    end

    def send_request(path, accept)
      url = "#{@base_url}#{path}"
      headers = { 'Accept' => accept, 'Cache-Control' => 'no-cache', 'user-agent' => USER_AGENT }
      headers['Ocp-Apim-Subscription-Key'] = @subscription_key unless @subscription_key.nil?
      status, body = @fetch.call(url, headers, @timeout_ms)
      unless status.between?(200, 299)
        message = "Stats NZ API request failed with status #{status}"
        begin
          parsed = JSON.parse(body)
          message = parsed['message'] if parsed.is_a?(Hash) && parsed['message'].is_a?(String)
        rescue JSON::ParserError
          # keep the default message
        end
        raise StatsNzApiError.new(message, status: status,
                                           retryable: status == 429 || status >= 500, url: url)
      end
      body
    end

    def default_fetch(url, headers, timeout_ms)
      uri = URI(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      http.open_timeout = timeout_ms / 1000.0
      http.read_timeout = timeout_ms / 1000.0
      request = Net::HTTP::Get.new(uri)
      headers.each { |key, value| request[key] = value }
      response = http.request(request)
      [response.code.to_i, response.body.to_s]
    rescue StandardError => e
      raise StatsNzApiError.new("Stats NZ request failed: #{e.message}", status: 0,
                                                                         retryable: true, url: url)
    end
  end

  def create_stats_nz_client(subscription_key: nil, base_url: DEFAULT_BASE_URL,
                             timeout_ms: DEFAULT_TIMEOUT_MS, fetch_impl: nil)
    StatsNzClient.new(
      subscription_key: subscription_key,
      base_url: base_url,
      timeout_ms: timeout_ms,
      fetch_impl: fetch_impl
    )
  end
end
