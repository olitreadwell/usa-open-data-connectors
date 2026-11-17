# frozen_string_literal: true

require 'uri'

module Usadata
  FEMA_OPEN_DATA_API_BASE = 'https://www.fema.gov/api/open/v1'
  USASPENDING_API_BASE = 'https://api.usaspending.gov/api/v2'
  SEC_EDGAR_SUBMISSIONS_API_BASE = 'https://data.sec.gov/submissions'
  FEDERAL_REGISTER_API_BASE = 'https://www.federalregister.gov/api/v1/documents.json'

  module_function

  def fema_declaration(row)
    return nil unless row.is_a?(Hash)

    required = %w[disasterNumber declarationDate declarationType incidentType stateCode stateName]
    if required.any? { |key| row[key].nil? }
      raise UsSourceParseError.new('fema', 'A declaration row is missing a field')
    end

    declaration_date = row['declarationDate'].to_s
    match = declaration_date.match(/\A(\d{4})-/)
    if match.nil?
      raise UsSourceParseError.new('fema',
                                   "Unreadable declaration date: #{declaration_date}")
    end

    {
      'disasterNumber' => row['disasterNumber'],
      'declarationDate' => declaration_date,
      'year' => match[1].to_i,
      'declarationType' => row['declarationType'],
      'incidentType' => row['incidentType'],
      'stateCode' => row['stateCode'],
      'stateName' => row['stateName']
    }
  end

  def parse_fema_declaration_payload(payload)
    parsed = require_hash(payload, 'fema')
    errors = parsed['error']
    if errors.is_a?(Array) && !errors.empty?
      first = errors.first.is_a?(Hash) ? errors.first : {}
      raise UsSourceApiError.new('fema', (first['message'] || first['code'] || 'rejected').to_s)
    end
    rows = require_array(parsed['FemaWebDisasterDeclarations'], 'fema')
    raise UsSourceParseError.new('fema', 'The response carried no declarations') if rows.empty?

    metadata = parsed['metadata']
    if metadata.is_a?(Hash) && metadata['count'].is_a?(Integer) && metadata['count'] > rows.length
      raise UsSourceParseError.new('fema', 'The response was truncated')
    end

    rows.map { |row| fema_declaration(row) }.compact
  end

  def build_fema_declaration_catalogue(payload)
    indexed = parse_fema_declaration_payload(payload).each_with_index
    declarations = indexed.sort_by { |row, index| [row['year'], index] }.map(&:first)
    raise UsSourceParseError.new('fema', 'No declarations to summarise') if declarations.empty?

    years_by_number = {}
    declarations.each do |declaration|
      year = declaration['year']
      row = years_by_number[year] ||= { 'year' => year, 'total' => 0, 'fire' => 0 }
      row['total'] += 1
      row['fire'] += 1 if declaration['incidentType'] == 'Fire'
    end
    years = years_by_number.keys.sort.map { |year| years_by_number[year] }
    fires = declarations.select { |row| row['incidentType'] == 'Fire' }
    {
      'declarations' => declarations,
      'declarationCount' => declarations.length,
      'firstYear' => declarations.first['year'],
      'newestYear' => declarations.last['year'],
      'years' => years,
      'busiestYear' => years.max_by { |row| row['total'] },
      'fireCount' => fires.length,
      'firstFireYear' => fires.empty? ? declarations.first['year'] : fires.first['year'],
      'incidentTypes' => count_named(declarations.map { |row| row['incidentType'] }),
      'declarationTypes' => count_named(declarations.map { |row| row['declarationType'] }),
      'topStates' => count_named(declarations.map { |row| row['stateCode'] })
    }
  end

  def parse_usaspending_agencies_payload(payload)
    parsed = require_hash(payload, 'usaspending-agencies')
    rows = require_array(parsed['results'], 'usaspending-agencies')
    if rows.empty?
      raise UsSourceParseError.new('usaspending-agencies',
                                   'The response carried no agencies')
    end

    agencies = rows.map do |row|
      unless row.is_a?(Hash) && !row['agency_id'].nil? && !row['agency_name'].nil?
        raise UsSourceParseError.new('usaspending-agencies',
                                     'An agency row arrived without its id or name')
      end

      {
        'agencyId' => row['agency_id'],
        'toptierCode' => row.fetch('toptier_code', ''),
        'abbreviation' => row.fetch('abbreviation', ''),
        'agencyName' => row['agency_name'],
        'activeFiscalYear' => row.fetch('active_fy', ''),
        'activeFiscalQuarter' => row.fetch('active_fq', ''),
        'outlayAmount' => number(row['outlay_amount']) || 0,
        'obligatedAmount' => number(row['obligated_amount']) || 0,
        'budgetAuthorityAmount' => number(row['budget_authority_amount']) || 0,
        'currentTotalBudgetAuthorityAmount' =>
          number(row['current_total_budget_authority_amount']) || 0,
        'percentageOfTotalBudgetAuthority' =>
          number(row['percentage_of_total_budget_authority']) || 0,
        'agencySlug' => row.fetch('agency_slug', ''),
        'congressionalJustificationUrl' => row['congressional_justification_url']
      }
    end
    first = agencies.first
    {
      'agencies' => agencies,
      'agencyCount' => agencies.length,
      'fiscalYear' => first['activeFiscalYear'],
      'fiscalQuarter' => first['activeFiscalQuarter'],
      'currentTotalBudgetAuthorityAmount' => first['currentTotalBudgetAuthorityAmount'],
      'largestByObligation' => agencies.max_by { |row| row['obligatedAmount'] },
      'largestByOutlay' => agencies.max_by { |row| row['outlayAmount'] }
    }
  end

  def blank_to_nil(value)
    value.nil? || value.to_s.strip.empty? ? nil : value.to_s
  end

  def sec_columns(recent)
    accessions = recent['accessionNumber'] || []
    columns = {
      'filingDate' => recent['filingDate'] || [],
      'reportDate' => recent['reportDate'] || [],
      'form' => recent['form'] || [],
      'size' => recent['size'] || [],
      'isXBRL' => recent['isXBRL'] || [],
      'isInlineXBRL' => recent['isInlineXBRL'] || [],
      'primaryDocument' => recent['primaryDocument'] || [],
      'primaryDocDescription' => recent['primaryDocDescription'] || []
    }
    columns.each do |name, values|
      next if values.length == accessions.length

      raise UsSourceParseError.new('sec-edgar-filings',
                                   "The #{name} column has a different length")
    end
    columns
  end

  def sec_filing(accession, index, columns)
    filing_date = columns['filingDate'][index].to_s
    unless filing_date.match?(/\A\d{4}-\d{2}-\d{2}\z/)
      raise UsSourceParseError.new('sec-edgar-filings', "Unreadable filing date: #{filing_date}")
    end

    {
      'accessionNumber' => accession,
      'filingDate' => filing_date,
      'reportDate' => blank_to_nil(columns['reportDate'][index]),
      'form' => columns['form'][index],
      'primaryDocument' => columns['primaryDocument'][index],
      'primaryDocDescription' => blank_to_nil(columns['primaryDocDescription'][index]),
      'sizeBytes' => columns['size'][index],
      'isXbrl' => columns['isXBRL'][index] == 1,
      'isInlineXbrl' => columns['isInlineXBRL'][index] == 1
    }
  end

  def parse_sec_edgar_filings_payload(payload)
    parsed = require_hash(payload, 'sec-edgar-filings')
    recent = parsed['filings'].is_a?(Hash) ? parsed['filings']['recent'] : nil
    unless recent.is_a?(Hash)
      raise UsSourceParseError.new('sec-edgar-filings',
                                   'The response carried no filings')
    end

    accessions = recent['accessionNumber'] || []
    columns = sec_columns(recent)
    filings = accessions.each_with_index.map do |accession, index|
      sec_filing(accession, index, columns)
    end
    if filings.empty?
      raise UsSourceParseError.new('sec-edgar-filings',
                                   'The response carried no filings')
    end

    form_counts = Hash.new(0)
    filings.each { |filing| form_counts[filing['form']] += 1 }
    {
      'cik' => parsed.fetch('cik', ''),
      'name' => parsed.fetch('name', ''),
      'entityType' => blank_to_nil(parsed['entityType']),
      'sic' => blank_to_nil(parsed['sic']),
      'sicDescription' => blank_to_nil(parsed['sicDescription']),
      'tickers' => parsed.fetch('tickers', []),
      'exchanges' => parsed.fetch('exchanges', []),
      'fiscalYearEnd' => blank_to_nil(parsed['fiscalYearEnd']),
      'filings' => filings,
      'filingCount' => filings.length,
      'newestFilingDate' => filings.map { |row| row['filingDate'] }.max,
      'formCounts' => form_counts.sort_by { |form, count| [-count, form] }.map do |form, count|
        { 'form' => form, 'count' => count }
      end
    }
  end

  fema_disaster_declarations_adapter = Adapter.new(
    'fema-disaster-declarations',
    'FEMA disaster declarations',
    'none',
    'Every disaster declaration FEMA has published, one row per declaration, from 1953 ' \
    'to the newest declaration.',
    json_fetcher("#{FEMA_OPEN_DATA_API_BASE}/FemaWebDisasterDeclarations",
                 method(:build_fema_declaration_catalogue)),
    method(:build_fema_declaration_catalogue),
    lambda {
      build_fema_declaration_catalogue(fixture_json('fema-disaster-declarations-2026-09-29.json'))
    }
  )

  usaspending_agencies_adapter = Adapter.new(
    'usaspending-agencies',
    'USAspending agencies',
    'none',
    'Top-tier federal agencies from USAspending, one row per agency, with its budget, ' \
    'outlays, and obligations.',
    json_fetcher("#{USASPENDING_API_BASE}/references/toptier_agencies",
                 method(:parse_usaspending_agencies_payload)),
    method(:parse_usaspending_agencies_payload),
    -> { parse_usaspending_agencies_payload(fixture_json('usaspending-agencies-2026-10-05.json')) }
  )

  sec_edgar_filings_adapter = Adapter.new(
    'sec-edgar-filings',
    'SEC EDGAR filings',
    'none',
    "An issuer's recent filing history from SEC EDGAR, one row per filing, with the form " \
    'type and the newest date in the list.',
    json_fetcher("#{SEC_EDGAR_SUBMISSIONS_API_BASE}/CIK0000320193.json",
                 method(:parse_sec_edgar_filings_payload)),
    method(:parse_sec_edgar_filings_payload),
    -> { parse_sec_edgar_filings_payload(fixture_json('sec-edgar-filings-2026-10-05.json')) }
  )

  def non_negative_integer?(value)
    value.is_a?(Integer) && value >= 0
  end

  def required_text(value, source, field)
    unless value.is_a?(String) && !value.empty?
      raise UsSourceParseError.new(source, "A document arrived without its #{field}")
    end

    value
  end

  def build_federal_register_documents_url(query = nil)
    options = query || {}
    params = URI.encode_www_form(
      'per_page' => (options[:perPage] || 10).to_s,
      'page' => (options[:page] || 1).to_s,
      'order' => (options[:order] || 'newest').to_s
    )
    "#{FEDERAL_REGISTER_API_BASE}?#{params}"
  end

  def parse_federal_register_documents_payload(payload)
    source = 'federal-register-documents'
    parsed = require_hash(payload, source)
    count = parsed['count']
    total_pages = parsed['total_pages']
    unless non_negative_integer?(count) && non_negative_integer?(total_pages)
      raise UsSourceParseError.new(source, 'The response carried no valid page counts')
    end

    rows = require_array(parsed['results'], source)
    documents = rows.map do |row|
      unless row.is_a?(Hash)
        raise UsSourceParseError.new(source, 'A document is not an object')
      end

      number = required_text(row['document_number'], source, 'document number')
      publication_date = required_text(row['publication_date'], source, 'publication date')
      unless publication_date.match?(/\A\d{4}-\d{2}-\d{2}\z/)
        raise UsSourceParseError.new(
          source,
          "Document #{number} carried an unreadable publication date: #{publication_date}"
        )
      end
      abstract = row['abstract']
      unless abstract.nil? || abstract.is_a?(String)
        raise UsSourceParseError.new(source, 'A document carried an unreadable abstract')
      end

      agencies_raw = row['agencies'] || []
      agencies = require_array(agencies_raw, source).map do |agency|
        unless agency.is_a?(Hash)
          raise UsSourceParseError.new(source, 'An agency entry is not an object')
        end
        name = agency['name']
        next nil if name.nil?
        unless name.is_a?(String)
          raise UsSourceParseError.new(source, 'An agency entry carried an unreadable name')
        end

        name.strip.empty? ? nil : name
      end.compact
      pdf_url = row['pdf_url']
      unless pdf_url.nil? || pdf_url.is_a?(String)
        raise UsSourceParseError.new(source, 'A document carried an unreadable PDF URL')
      end
      {
        'documentNumber' => number,
        'title' => required_text(row['title'], source, 'title'),
        'type' => required_text(row['type'], source, 'type'),
        'publicationDate' => publication_date,
        'abstract' => abstract,
        'agencies' => agencies,
        'htmlUrl' => required_text(row['html_url'], source, 'HTML URL'),
        'pdfUrl' => pdf_url || ''
      }
    end

    next_page_url = parsed['next_page_url']
    unless next_page_url.nil? || next_page_url.is_a?(String)
      raise UsSourceParseError.new(source, 'The response carried an unreadable next-page URL')
    end
    {
      'documents' => documents,
      'documentCount' => documents.length,
      'reportedCount' => count,
      'totalPages' => total_pages,
      'nextPageUrl' => next_page_url
    }
  end

  federal_register_documents_adapter = Adapter.new(
    'federal-register-documents',
    'Federal Register documents',
    'none',
    'Documents published in the Federal Register, one row per document, with its type, ' \
    'publication date, agencies, abstract, and public HTML and PDF links.',
    json_fetcher(build_federal_register_documents_url,
                 method(:parse_federal_register_documents_payload)),
    method(:parse_federal_register_documents_payload),
    lambda {
      parse_federal_register_documents_payload(
        fixture_json('federal-register-documents-2026-11-08.json')
      )
    }
  )

  FEMA_DISASTER_DECLARATIONS_ADAPTER = fema_disaster_declarations_adapter
  USASPENDING_AGENCIES_ADAPTER = usaspending_agencies_adapter
  SEC_EDGAR_FILINGS_ADAPTER = sec_edgar_filings_adapter
  FEDERAL_REGISTER_DOCUMENTS_ADAPTER = federal_register_documents_adapter
end
