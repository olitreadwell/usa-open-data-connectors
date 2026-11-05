# frozen_string_literal: true

require 'json'

module Usadata
  Adapter = Struct.new(:id, :name, :auth, :description, :fetch_live, :parse, :load_fixture)

  module_function

  def require_hash(payload, source)
    raise UsSourceParseError.new(source, 'expected a JSON object') unless payload.is_a?(Hash)

    payload
  end

  def require_array(payload, source)
    raise UsSourceParseError.new(source, 'expected a JSON array') unless payload.is_a?(Array)

    payload
  end

  def number(value)
    return nil if value.nil? || value == true || value == false

    parsed = Float(value)
    parsed == parsed.floor ? parsed.to_i : parsed
  rescue ArgumentError, TypeError
    nil
  end

  def normalize_number(value)
    value == value.floor ? value.to_i : value
  end

  def count_named(values)
    counts = Hash.new(0)
    values.each { |value| counts[value] += 1 unless value.nil? || value.empty? }
    counts.sort_by { |name, count| [-count, name] }.map do |name, count|
      { 'name' => name, 'count' => count }
    end
  end

  def count_recalls(values, key)
    counts = Hash.new(0)
    values.each { |value| counts[value] += 1 unless value.nil? || value.empty? }
    counts.sort_by { |name, count| [-count, name] }.map do |name, count|
      { key => name, 'recallCount' => count }
    end
  end

  def median(values)
    sorted = values.sort
    return nil if sorted.empty?

    middle = sorted.length / 2
    return sorted[middle] if sorted.length.odd?

    (sorted[middle - 1] + sorted[middle]) / 2.0
  end

  def fixture_json(filename)
    JSON.parse(File.read(File.join(__dir__, 'fixtures', filename), encoding: 'UTF-8'))
  end

  def fixture_text(filename)
    File.read(File.join(__dir__, 'fixtures', filename), encoding: 'UTF-8')
  end
end
