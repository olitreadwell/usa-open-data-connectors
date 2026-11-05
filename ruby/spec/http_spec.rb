# frozen_string_literal: true

require_relative 'spec_helper'

class HttpSpec < Minitest::Test
  class TimedOutHttp
    def use_ssl=(_value); end

    def open_timeout=(_value); end

    def read_timeout=(_value); end

    def request(_request)
      raise Net::OpenTimeout, 'timed out'
    end
  end

  def test_network_timeout_is_reported_as_a_source_api_error
    Net::HTTP.stub(:new, TimedOutHttp.new) do
      error = assert_raises(Usadata::UsSourceApiError) do
        Usadata.get_text('https://example.test/data')
      end
      assert_equal 'http', error.source
      assert_match(/timed out/, error.message)
    end
  end
end
