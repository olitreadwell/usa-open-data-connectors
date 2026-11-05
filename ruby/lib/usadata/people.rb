# frozen_string_literal: true

require 'csv'

module Usadata
  CALLOOK_API_BASE = 'https://callook.info'
  COLLEGE_SCORECARD_DATA_RELEASE_DATE = '2026-10-15'
  ESTIMATETAX_API_BASE = 'https://estimatetax.net'

  MISSING_CSV_VALUES = ['', 'NA', 'PS', 'PRIVACYSUPPRESSED', 'NULL'].freeze
  CONTROL_LABELS = { '1' => 'public', '2' => 'private-nonprofit',
                     '3' => 'private-for-profit' }.freeze
  REQUIRED_COLLEGE_COLUMNS = %w[
    UNITID OPEID INSTNM CITY STABBR INSTURL CONTROL UGDS ADM_RATE TUITIONFEE_IN
    TUITIONFEE_OUT DEBT_MDN C150_4 RET_FT4 MD_EARN_WNE_P10
  ].freeze

  module_function

  def callook_date(value)
    return nil if value.nil? || value.strip.empty?

    match = value.strip.match(%r{\A(\d{2})/(\d{2})/(\d{4})\z})
    match ? "#{match[3]}-#{match[1]}-#{match[2]}" : nil
  end

  def empty_callook(status)
    {
      'status' => status, 'callsign' => '', 'licenseType' => '', 'operatorClass' => '',
      'previousCallsign' => '', 'previousOperatorClass' => '', 'licenseeName' => '',
      'trusteeCallsign' => '', 'trusteeName' => '', 'addressLine1' => '', 'addressLine2' => '',
      'attention' => '', 'latitude' => nil, 'longitude' => nil, 'gridsquare' => '',
      'grantDate' => nil, 'expiryDate' => nil, 'lastActionDate' => nil, 'frn' => '',
      'ulsUrl' => '', 'stateAbbr' => '', 'callDistrict' => ''
    }
  end

  def label_counts(values)
    counts = Hash.new(0)
    values.each { |value| counts[value] += 1 unless value.empty? }
    counts.sort_by { |label, count| [-count, label] }.map do |label, count|
      { 'label' => label, 'count' => count }
    end
  end

  def callook_coordinate(value)
    value.to_s.strip.empty? ? nil : number(value)
  end

  def callook_callsign(record)
    return empty_callook(record['status']) unless record['status'] == 'VALID'

    current = record['current'] || {}
    callsign = current['callsign']
    if callsign.nil? || callsign.empty?
      raise UsSourceParseError.new('callook-callsigns',
                                   'A valid lookup arrived without a current callsign')
    end

    address = record['address'] || {}
    location = record['location'] || {}
    other = record['otherInfo'] || {}
    previous = record['previous'] || {}
    trustee = record['trustee'] || {}
    line2 = address.fetch('line2', '')
    state = line2.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*\z/)
    district = callsign.match(/\d/)
    {
      'status' => record['status'],
      'callsign' => callsign,
      'licenseType' => record.fetch('type', ''),
      'operatorClass' => current.fetch('operClass', ''),
      'previousCallsign' => previous.fetch('callsign', ''),
      'previousOperatorClass' => previous.fetch('operClass', ''),
      'licenseeName' => record.fetch('name', ''),
      'trusteeCallsign' => trustee.fetch('callsign', ''),
      'trusteeName' => trustee.fetch('name', ''),
      'addressLine1' => address.fetch('line1', ''),
      'addressLine2' => line2,
      'attention' => address.fetch('attn', ''),
      'latitude' => callook_coordinate(location['latitude']),
      'longitude' => callook_coordinate(location['longitude']),
      'gridsquare' => location.fetch('gridsquare', ''),
      'grantDate' => callook_date(other['grantDate']),
      'expiryDate' => callook_date(other['expiryDate']),
      'lastActionDate' => callook_date(other['lastActionDate']),
      'frn' => other.fetch('frn', ''),
      'ulsUrl' => other.fetch('ulsUrl', ''),
      'stateAbbr' => state ? state[1] : '',
      'callDistrict' => district ? district[0] : ''
    }
  end

  def parse_callook_callsigns_payload(payload)
    rows = require_array(payload, 'callook-callsigns')
    if rows.empty?
      raise UsSourceParseError.new('callook-callsigns',
                                   'The response carried no lookups')
    end

    callsigns = rows.map do |record|
      unless record.is_a?(Hash) && %w[VALID INVALID UPDATING].include?(record['status'])
        raise UsSourceParseError.new('callook-callsigns', 'invalid Callook record')
      end

      callook_callsign(record)
    end
    valid = callsigns.select { |row| row['status'] == 'VALID' }
    expiries = valid.reject { |row| row['expiryDate'].nil? }
    {
      'callsigns' => callsigns,
      'callsignCount' => callsigns.length,
      'validCount' => valid.length,
      'invalidCount' => callsigns.count { |row| row['status'] == 'INVALID' },
      'updatingCount' => callsigns.count { |row| row['status'] == 'UPDATING' },
      'licenseTypeCounts' => label_counts(valid.map { |row| row['licenseType'] }),
      'operatorClassCounts' => label_counts(valid.map { |row| row['operatorClass'] }),
      'callDistrictCount' => valid.map { |row| row['callDistrict'] }.reject(&:empty?).uniq.length,
      'soonestExpiry' => expiries.min_by { |row| row['expiryDate'] },
      'latestExpiry' => expiries.max_by { |row| row['expiryDate'] }
    }
  end

  def csv_text(value)
    text = value.nil? ? '' : value.to_s.strip
    MISSING_CSV_VALUES.include?(text.upcase) ? '' : text
  end

  def csv_number(value, column)
    text = csv_text(value)
    return nil if text.empty?

    parsed = number(text)
    if parsed.nil?
      raise UsSourceParseError.new('college-scorecard-institutions',
                                   "Unreadable #{column} value: #{text}")
    end

    parsed
  end

  def state_summary(state, institutions)
    earnings = institutions.map { |row| row['medianEarnings10Years'] }.compact
    debts = institutions.map { |row| row['medianDebt'] }.compact
    completions = institutions.map { |row| row['completionRate'] }.compact
    {
      'stateAbbr' => state,
      'institutionCount' => institutions.length,
      'earningsReportedCount' => earnings.length,
      'medianEarnings10Years' => median(earnings),
      'medianDebt' => median(debts),
      'medianCompletionRate' => median(completions),
      'publicInstitutionCount' => institutions.count { |row| row['control'] == 'public' },
      'privateNonprofitInstitutionCount' => institutions.count do |row|
        row['control'] == 'private-nonprofit'
      end,
      'privateForProfitInstitutionCount' => institutions.count do |row|
        row['control'] == 'private-for-profit'
      end
    }
  end

  def pick_earning_state(rows, highest:)
    best = rows.first
    rows.drop(1).each do |row|
      value = row['medianEarnings10Years']
      best_value = best['medianEarnings10Years']
      if value == best_value
        best = row if row['stateAbbr'] < best['stateAbbr']
      elsif highest ? value > best_value : value < best_value
        best = row
      end
    end
    best
  end

  def earning_state(rows, highest:)
    rows.empty? ? nil : pick_earning_state(rows, highest: highest)
  end

  def college_institution(row)
    unit_id = csv_number(row['UNITID'], 'UNITID')
    name = csv_text(row['INSTNM'])
    if unit_id.nil? || name.empty?
      raise UsSourceParseError.new('college-scorecard-institutions',
                                   'An institution row arrived without its unit id or name')
    end

    institution_url = csv_text(row['INSTURL'])
    {
      'unitId' => unit_id,
      'opeId' => csv_text(row['OPEID']),
      'name' => name,
      'city' => csv_text(row['CITY']),
      'stateAbbr' => csv_text(row['STABBR']),
      'institutionUrl' => institution_url.empty? ? nil : institution_url,
      'control' => CONTROL_LABELS.fetch(csv_text(row['CONTROL']), 'unknown'),
      'undergraduateEnrollment' => csv_number(row['UGDS'], 'UGDS'),
      'admissionRate' => csv_number(row['ADM_RATE'], 'ADM_RATE'),
      'inStateTuition' => csv_number(row['TUITIONFEE_IN'], 'TUITIONFEE_IN'),
      'outStateTuition' => csv_number(row['TUITIONFEE_OUT'], 'TUITIONFEE_OUT'),
      'medianDebt' => csv_number(row['DEBT_MDN'], 'DEBT_MDN'),
      'completionRate' => csv_number(row['C150_4'], 'C150_4'),
      'retentionRate' => csv_number(row['RET_FT4'], 'RET_FT4'),
      'medianEarnings10Years' => csv_number(row['MD_EARN_WNE_P10'], 'MD_EARN_WNE_P10')
    }
  end

  def college_summaries(institutions)
    by_state = Hash.new { |hash, key| hash[key] = [] }
    institutions.each do |institution|
      by_state[institution['stateAbbr']] << institution unless institution['stateAbbr'].empty?
    end
    by_state.keys.sort.map { |state| state_summary(state, by_state[state]) }
  end

  def parse_college_scorecard_csv(csv)
    parsed = CSV.parse(csv, headers: true)
    headers = parsed.headers.compact
    missing = REQUIRED_COLLEGE_COLUMNS.find { |column| !headers.include?(column) }
    if missing
      raise UsSourceParseError.new('college-scorecard-institutions',
                                   "The institution file is missing the #{missing} column")
    end

    institutions = parsed.map { |row| college_institution(row) }
    if institutions.empty?
      raise UsSourceParseError.new('college-scorecard-institutions',
                                   'The institution file had a header but no rows')
    end

    summaries = college_summaries(institutions)
    earnings = institutions.map { |row| row['medianEarnings10Years'] }.compact
    debts = institutions.map { |row| row['medianDebt'] }.compact
    completions = institutions.map { |row| row['completionRate'] }.compact
    reported_states = summaries.reject { |summary| summary['medianEarnings10Years'].nil? }
    highest_institution = institutions.reject { |row| row['medianEarnings10Years'].nil? }
                                      .max_by { |row| row['medianEarnings10Years'] }
    {
      'dataReleaseDate' => COLLEGE_SCORECARD_DATA_RELEASE_DATE,
      'institutions' => institutions,
      'institutionCount' => institutions.length,
      'stateCount' => summaries.length,
      'earningsReportedCount' => earnings.length,
      'stateSummaries' => summaries,
      'nationalMedianEarnings10Years' => median(earnings),
      'nationalMedianDebt' => median(debts),
      'nationalMedianCompletionRate' => median(completions),
      'highestEarningState' => earning_state(reported_states, highest: true),
      'lowestEarningState' => earning_state(reported_states, highest: false),
      'highestEarningInstitution' => highest_institution
    }
  end

  def parse_college_scorecard_archive(payload)
    unless payload.is_a?(String) || payload.is_a?(Array)
      raise UsSourceParseError.new('college-scorecard-institutions',
                                   'The institution archive must be zip bytes or CSV text')
    end

    parse_college_scorecard_csv(payload)
  end

  def estimate_source(value)
    unless value.is_a?(Hash) && !value['url'].nil?
      raise UsSourceParseError.new('estimatetax-income-tax', 'A source block has no URL')
    end

    result = { 'url' => value['url'] }
    %w[citation authority document].each do |key|
      result[key] = value[key] unless value[key].nil?
    end
    checked = value['checked'] || value['verified']
    result['checkedDate'] = checked unless checked.nil?
    result
  end

  def estimate_input(input)
    {
      'income' => input['income'],
      'filingStatus' => input['filingStatus'],
      'state' => input['state'],
      'city' => input['city'],
      'preTaxDeductions' => input.fetch('preTaxDeductions', 0),
      'selfEmploymentIncome' => input.fetch('selfEmploymentIncome', 0)
    }
  end

  def estimate_federal(federal)
    {
      'incomeTax' => federal['incomeTax'],
      'totalFica' => federal['totalFica'],
      'marginalRate' => federal['marginalRate'],
      'brackets' => federal['brackets'].map do |bracket|
        { 'rate' => bracket['rate'], 'taxableIncome' => bracket['taxableInBracket'],
          'tax' => bracket['tax'] }
      end
    }
  end

  def estimate_state(state)
    return nil if state.nil?

    { 'code' => state['code'], 'name' => state['name'], 'tax' => state['tax'],
      'system' => state['system'] }
  end

  def estimate_local(local)
    return nil if local.nil?

    { 'jurisdiction' => local['jurisdiction'], 'tax' => local['tax'], 'rate' => local['rate'],
      'base' => local['base'] }
  end

  def estimate_sources(sources)
    {
      'federal' => estimate_source(sources['federal']),
      'state' => sources['state'].nil? ? nil : estimate_source(sources['state']),
      'local' => sources['local'].nil? ? nil : estimate_source(sources['local'])
    }
  end

  def parse_estimatetax_calculation(payload)
    parsed = require_hash(payload, 'estimatetax-income-tax')
    input = require_hash(parsed['input'], 'estimatetax-income-tax')
    federal = require_hash(parsed['federal'], 'estimatetax-income-tax')
    totals = require_hash(parsed['totals'], 'estimatetax-income-tax')
    sources = require_hash(parsed['sources'], 'estimatetax-income-tax')
    {
      'taxYear' => parsed['taxYear'],
      'input' => estimate_input(input),
      'federal' => estimate_federal(federal),
      'state' => estimate_state(parsed['state']),
      'local' => estimate_local(parsed['local']),
      'totals' => {
        'totalTax' => totals['totalTax'],
        'netIncome' => totals['netIncome'],
        'effectiveRate' => totals['effectiveRate'],
        'effectiveIncomeTaxRate' => totals['effectiveIncomeTaxRate']
      },
      'sources' => estimate_sources(sources)
    }
  end

  callook_callsigns_adapter = Adapter.new(
    'callook-callsigns',
    'Callook callsigns',
    'none',
    'US amateur radio callsign records from the FCC licence file, looked up through ' \
    'Callook.info, with the licence class, address, location, and expiry for each callsign.',
    lambda do |_options = nil|
      callsigns = %w[W1ABC W2ABC W3ABC W4ABC W5ABC W6ABC W7ABC W8ABC W9ABC W0ABC]
      parse_callook_callsigns_payload(callsigns.map do |callsign|
        get_json("#{CALLOOK_API_BASE}/#{callsign}/json")
      end)
    end,
    method(:parse_callook_callsigns_payload),
    -> { parse_callook_callsigns_payload(fixture_json('callook-callsigns-2026-10-21.json')) }
  )

  college_scorecard_institutions_adapter = Adapter.new(
    'college-scorecard-institutions',
    'College Scorecard institutions',
    'none',
    'Institution-level College Scorecard data, one row per institution, with enrollment, ' \
    'cost, completion, debt, and earnings.',
    lambda { |_options = nil|
      url = 'https://ed-public-download.scorecard.network/downloads/' \
            'Most-Recent-Cohorts-Institution_10152026.zip'
      parse_college_scorecard_csv(get_text(url))
    },
    method(:parse_college_scorecard_archive),
    lambda {
      fixture = 'college-scorecard-institutions-2026-10-15-sampled.csv'
      parse_college_scorecard_csv(fixture_text(fixture))
    }
  )

  estimatetax_income_tax_adapter = Adapter.new(
    'estimatetax-income-tax',
    'EstimateTax US income tax',
    'none',
    'US federal, state, and local income tax for one salary, with the official document ' \
    'behind every figure.',
    lambda { |_options = nil|
      url = "#{ESTIMATETAX_API_BASE}/api/v1/calculate?income=85000&filingStatus=single" \
            '&state=NY&city=new-york-city'
      parse_estimatetax_calculation(get_json(url))
    },
    method(:parse_estimatetax_calculation),
    -> { parse_estimatetax_calculation(fixture_json('estimatetax-income-tax-2026-10-18.json')) }
  )

  CALLOOK_CALLSIGNS_ADAPTER = callook_callsigns_adapter
  COLLEGE_SCORECARD_INSTITUTIONS_ADAPTER = college_scorecard_institutions_adapter
  ESTIMATETAX_INCOME_TAX_ADAPTER = estimatetax_income_tax_adapter
end
