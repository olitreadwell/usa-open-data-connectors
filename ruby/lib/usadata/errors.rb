# frozen_string_literal: true

module Usadata
  # Base error for any US data source client.
  class UsSourceError < StandardError; end

  # The remote API rejected the request or returned an error body.
  class UsSourceApiError < UsSourceError
    attr_reader :source, :status

    def initialize(source, message, status: nil)
      super("#{source}: #{message}")
      @source = source
      @status = status
    end
  end

  # The remote payload did not match the expected shape.
  class UsSourceParseError < UsSourceError
    attr_reader :source

    def initialize(source, message)
      super("#{source}: #{message}")
      @source = source
    end
  end
end
