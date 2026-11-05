# frozen_string_literal: true

module Usadata
  TREASURY_FISCAL_DATA_API_BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service'
  CFPB_COMPLAINT_SEARCH_API_BASE = 'https://www.consumerfinance.gov/data-research/' \
                                   'consumer-complaints/search/api/v1/'
  CPSC_RECALL_API_BASE = 'https://www.saferproducts.gov/RestWebServices/Recall'
  OPENFDA_FOOD_ENFORCEMENT_BASE = 'https://api.fda.gov/food/enforcement.json'

  module_function

  def parse_treasury_avg_interest_rate_payload(payload)
    parsed = require_hash(payload, 'treasury')
    if parsed['error']
      raise UsSourceApiError.new('treasury',
                                 (parsed['message'] || parsed['error']).to_s)
    end

    months = []
    require_array(parsed['data'], 'treasury').each do |row|
      unless row.is_a?(Hash) && row['record_date'].is_a?(String)
        raise UsSourceParseError.new('treasury', 'A row carries no record date')
      end

      match = row['record_date'].match(/\A(\d{4})-(\d{2})-\d{2}\z/)
      if match.nil?
        raise UsSourceParseError.new('treasury',
                                     "Unreadable record date: #{row['record_date']}")
      end

      value = number(row['avg_interest_rate_amt'])
      next if value.nil?

      months << {
        'recordDate' => row['record_date'],
        'year' => match[1].to_i,
        'month' => match[2].to_i,
        'averageInterestRatePercent' => value
      }
    end
    raise UsSourceParseError.new('treasury', 'No monthly values in the response') if months.empty?

    months
  end

  def build_treasury_avg_interest_rate_series(payload)
    months = parse_treasury_avg_interest_rate_payload(payload).sort_by { |row| row['recordDate'] }
    first = months.first
    last = months.last
    highest = months.max_by { |row| row['averageInterestRatePercent'] }
    lowest = months.min_by { |row| row['averageInterestRatePercent'] }
    change_since_low = last['averageInterestRatePercent'] - lowest['averageInterestRatePercent']
    change_from_first = last['averageInterestRatePercent'] - first['averageInterestRatePercent']
    {
      'months' => months,
      'monthCount' => months.length,
      'firstMonth' => first,
      'lastMonth' => last,
      'highest' => highest,
      'lowest' => lowest,
      'changeSinceLowPercentPoints' => change_since_low,
      'changeFirstToLastPercentPoints' => change_from_first
    }
  end

  def treasury_amount(value)
    return nil if value.nil? || value.to_s.strip.casecmp('null').zero?

    number(value)
  end

  def parse_treasury_debt_to_penny_payload(payload)
    parsed = require_hash(payload, 'treasury-debt-to-penny')
    if parsed['error']
      raise UsSourceApiError.new('treasury-debt-to-penny',
                                 (parsed['message'] || parsed['error']).to_s)
    end

    days = []
    require_array(parsed['data'], 'treasury-debt-to-penny').each do |row|
      unless row.is_a?(Hash) && row['record_date'].is_a?(String)
        raise UsSourceParseError.new('treasury-debt-to-penny', 'A row carries no record date')
      end

      total = treasury_amount(row['tot_pub_debt_out_amt'])
      next if total.nil?

      days << {
        'recordDate' => row['record_date'],
        'totalPublicDebtOutstandingUsd' => total,
        'debtHeldByPublicUsd' => treasury_amount(row['debt_held_public_amt']),
        'intragovernmentalHoldingsUsd' => treasury_amount(row['intragov_hold_amt'])
      }
    end
    if days.empty?
      raise UsSourceParseError.new('treasury-debt-to-penny',
                                   'No daily values in the response')
    end

    days
  end

  def build_treasury_debt_to_penny_page(payload)
    days = parse_treasury_debt_to_penny_payload(payload).sort_by { |row| row['recordDate'] }
    {
      'days' => days,
      'dayCount' => days.length,
      'firstDay' => days.first,
      'lastDay' => days.last,
      'highestTotalDebt' => days.max_by { |row| row['totalPublicDebtOutstandingUsd'] },
      'lowestTotalDebt' => days.min_by { |row| row['totalPublicDebtOutstandingUsd'] }
    }
  end

  def extreme(rows, key, maximum:)
    maximum ? rows.max_by { |row| row[key] } : rows.min_by { |row| row[key] }
  end

  def build_cfp_consumer_complaint_series(payload)
    parsed = require_hash(payload, 'cfpb-consumer-complaints')
    years = require_array(parsed['years'], 'cfpb-consumer-complaints')
    if years.empty?
      raise UsSourceParseError.new('cfpb-consumer-complaints',
                                   'No years to summarise')
    end

    newest_year = parsed['newestYear'].to_i
    complete = years.reject { |row| row['year'] == newest_year }
    total = years.sum { |row| row['complaintCount'] }
    if total.zero? || complete.empty?
      raise UsSourceParseError.new('cfpb-consumer-complaints',
                                   'No complaints to summarise')
    end

    {
      'firstYear' => parsed['firstYear'].to_i,
      'newestYear' => newest_year,
      'newestReceivedDate' => parsed['newestReceivedDate'].to_s,
      'totalComplaints' => total,
      'years' => years,
      'completeYearCount' => complete.length,
      'busiestCompleteYear' => extreme(complete, 'complaintCount', maximum: true),
      'quietestCompleteYear' => extreme(complete, 'complaintCount', maximum: false),
      'topProducts' => parsed.fetch('topProducts', []),
      'topCompanies' => parsed.fetch('topCompanies', [])
    }
  end

  def build_cpsc_product_recall_series(payload)
    parsed = require_hash(payload, 'cpsc-product-recalls')
    years = require_array(parsed['years'], 'cpsc-product-recalls')
    raise UsSourceParseError.new('cpsc-product-recalls', 'No years to summarise') if years.empty?

    newest_year = parsed['newestYear'].to_i
    complete = years.reject { |row| row['year'] == newest_year }
    if complete.empty?
      raise UsSourceParseError.new('cpsc-product-recalls', 'No complete year to compare against')
    end
    if years.sum { |row| row['recallCount'] } != parsed['totalRecalls'].to_i
      raise UsSourceParseError.new('cpsc-product-recalls',
                                   'Year counts do not add to the file total')
    end

    {
      'firstYear' => parsed['firstYear'].to_i,
      'newestYear' => newest_year,
      'newestRecallDate' => parsed['newestRecallDate'].to_s,
      'totalRecalls' => parsed['totalRecalls'].to_i,
      'years' => years,
      'completeYearCount' => complete.length,
      'busiestCompleteYear' => extreme(complete, 'recallCount', maximum: true),
      'quietestCompleteYear' => extreme(complete, 'recallCount', maximum: false),
      'remedyOptions' => parsed.fetch('remedyOptions', []),
      'manufacturerCountries' => parsed.fetch('manufacturerCountries', [])
    }
  end

  def openfda_date_label(value)
    unless value.match?(/\A\d{8}\z/)
      raise UsSourceParseError.new('openfda',
                                   "Unreadable publication date: #{value}")
    end

    "#{value[0, 4]}-#{value[4, 2]}-#{value[6, 2]}"
  end

  def openfda_year_totals(entries)
    totals = Hash.new(0)
    entries.each { |entry| totals[entry['time'].to_s[0, 4].to_i] += entry['count'].to_i }
    totals
  end

  def openfda_years(report_dates, class_one_dates)
    total_by_year = openfda_year_totals(report_dates)
    class_one_by_year = openfda_year_totals(class_one_dates)
    total_by_year.keys.sort.map do |year|
      total = total_by_year[year]
      class_one = class_one_by_year[year]
      { 'year' => year, 'total' => total, 'classOne' => class_one, 'other' => total - class_one }
    end
  end

  def openfda_term_counts(entries)
    entries.map { |entry| { 'name' => entry['term'], 'count' => entry['count'].to_i } }
  end

  def openfda_term_count(entries, name)
    row = entries.find { |entry| entry['name'] == name }
    row ? row['count'] : 0
  end

  def build_openfda_food_recall_summary(payload)
    parsed = require_hash(payload, 'openfda')
    report_dates = require_array(parsed['reportDates'], 'openfda')
    if report_dates.empty?
      raise UsSourceParseError.new('openfda',
                                   'No publication dates to summarise')
    end

    recall_count = parsed['recallCount'].to_i
    dated_total = report_dates.sum { |entry| entry['count'].to_i }
    unless dated_total == recall_count
      raise UsSourceParseError.new('openfda', 'Publication dates do not cover the recall count')
    end

    class_one_dates = parsed.fetch('classOneDates', [])
    years = openfda_years(report_dates, class_one_dates)
    classifications = openfda_term_counts(parsed.fetch('classifications', []))
    voluntary = openfda_term_counts(parsed.fetch('voluntary', []))
    voluntary_count = openfda_term_count(voluntary, 'Voluntary: Firm initiated')
    mandated_count = openfda_term_count(voluntary, 'FDA Mandated')
    class_one_count = class_one_dates.sum { |entry| entry['count'].to_i }
    {
      'recallCount' => recall_count,
      'reportDateCount' => report_dates.length,
      'firstReportDate' => openfda_date_label(report_dates.first['time'].to_s),
      'newestReportDate' => openfda_date_label(report_dates.last['time'].to_s),
      'firstYear' => years.first['year'],
      'newestYear' => years.last['year'],
      'newestYearCount' => years.last['total'],
      'years' => years,
      'busiestYear' => extreme(years, 'total', maximum: true),
      'classOneCount' => class_one_count,
      'classOneSharePercent' => class_one_count.to_f / recall_count * 100,
      'classifications' => classifications,
      'voluntaryCount' => voluntary_count,
      'mandatedCount' => mandated_count
    }
  end

  treasury_avg_interest_rate_adapter = Adapter.new(
    'treasury-avg-interest-rate',
    'US Treasury average interest rate',
    'none',
    'The average interest rate on US Treasury interest-bearing debt, one row per month.',
    json_fetcher("#{TREASURY_FISCAL_DATA_API_BASE}/v2/accounting/od/avg_interest_rates",
                 method(:build_treasury_avg_interest_rate_series)),
    method(:build_treasury_avg_interest_rate_series),
    lambda {
      fixture = 'treasury-avg-interest-rate-2026-09-28.json'
      build_treasury_avg_interest_rate_series(fixture_json(fixture))
    }
  )

  treasury_debt_to_penny_adapter = Adapter.new(
    'treasury-debt-to-penny',
    'US Treasury debt to the penny',
    'none',
    'Daily US public debt outstanding to the penny, one row per business day.',
    json_fetcher("#{TREASURY_FISCAL_DATA_API_BASE}/v2/accounting/od/debt_to_penny",
                 method(:build_treasury_debt_to_penny_page)),
    method(:build_treasury_debt_to_penny_page),
    -> { build_treasury_debt_to_penny_page(fixture_json('treasury-debt-to-penny-2026-10-05.json')) }
  )

  cfpb_consumer_complaints_adapter = Adapter.new(
    'cfpb-consumer-complaints',
    'CFPB consumer complaints',
    'none',
    'Every consumer complaint the Consumer Financial Protection Bureau has sent to a ' \
    'company, counted by year, with the products and companies named most often.',
    json_fetcher(CFPB_COMPLAINT_SEARCH_API_BASE, method(:build_cfp_consumer_complaint_series)),
    method(:build_cfp_consumer_complaint_series),
    lambda {
      build_cfp_consumer_complaint_series(fixture_json('cfpb-consumer-complaints-2026-10-03.json'))
    }
  )

  cpsc_product_recalls_adapter = Adapter.new(
    'cpsc-product-recalls',
    'CPSC product recalls',
    'none',
    'Every consumer product recall the Consumer Product Safety Commission has published, ' \
    'one row per recall, with the remedy offered and the countries that made the product.',
    json_fetcher(CPSC_RECALL_API_BASE, method(:build_cpsc_product_recall_series)),
    method(:build_cpsc_product_recall_series),
    -> { build_cpsc_product_recall_series(fixture_json('cpsc-product-recalls-2026-10-02.json')) }
  )

  openfda_food_recalls_adapter = Adapter.new(
    'openfda-food-recalls',
    'openFDA food enforcement reports',
    'none',
    'Every food recall FDA has published as an enforcement report, one record per recall, ' \
    'from June 2012 to the newest publication date.',
    json_fetcher(OPENFDA_FOOD_ENFORCEMENT_BASE, method(:build_openfda_food_recall_summary)),
    method(:build_openfda_food_recall_summary),
    -> { build_openfda_food_recall_summary(fixture_json('openfda-food-recalls-2026-09-30.json')) }
  )

  TREASURY_AVG_INTEREST_RATE_ADAPTER = treasury_avg_interest_rate_adapter
  TREASURY_DEBT_TO_PENNY_ADAPTER = treasury_debt_to_penny_adapter
  CFPB_CONSUMER_COMPLAINTS_ADAPTER = cfpb_consumer_complaints_adapter
  CPSC_PRODUCT_RECALLS_ADAPTER = cpsc_product_recalls_adapter
  OPENFDA_FOOD_RECALLS_ADAPTER = openfda_food_recalls_adapter
end
