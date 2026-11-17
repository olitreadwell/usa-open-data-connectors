# frozen_string_literal: true

module Usadata
  CLINICALTRIALS_STUDIES_API_BASE = 'https://clinicaltrials.gov/api/v2/studies'
  NCBI_EUTILS_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
  EPA_ENVIROFACTS_API_BASE = 'https://data.epa.gov/efservice'
  FDIC_BANK_API_BASE = 'https://banks.data.fdic.gov/api/institutions'
  PUBLICDATAHUB_API_BASE = 'https://publicdatahub.org'
  NIH_REPORTER_SEARCH_URL = 'https://api.reporter.nih.gov/v2/projects/search'
  NIH_REPORTER_DEFAULT_FISCAL_YEAR = 2025
  NIH_REPORTER_PAGE_SIZE = 10

  NIH_REPORTER_INCLUDE_FIELDS = %w[
    ProjectNum CoreProjectNum ProjectTitle FiscalYear AwardAmount Organization
    PrincipalInvestigators ProjectStartDate ProjectEndDate AgencyIcAdmin ProjectDetailUrl
  ].freeze

  module_function

  def clinical_study(row)
    protocol = row.is_a?(Hash) ? row['protocolSection'] : nil
    unless protocol.is_a?(Hash)
      raise UsSourceParseError.new('clinicaltrials-studies',
                                   'A study has no protocol section')
    end

    identification = protocol['identificationModule'] || {}
    status = protocol['statusModule'] || {}
    design = protocol['designModule'] || {}
    conditions = protocol['conditionsModule'] || {}
    sponsor = protocol['sponsorCollaboratorsModule'] || {}
    nct_id = identification['nctId']
    title = identification['briefTitle']
    if nct_id.nil? || title.nil?
      raise UsSourceParseError.new('clinicaltrials-studies',
                                   'A study arrived without its registry id or brief title')
    end

    enrollment = design['enrollmentInfo'] || {}
    {
      'nctId' => nct_id,
      'briefTitle' => title,
      'overallStatus' => status.fetch('overallStatus', ''),
      'studyType' => design['studyType'],
      'phases' => design.fetch('phases', []),
      'conditions' => conditions.fetch('conditions', []),
      'leadSponsor' => (sponsor['leadSponsor'] || {})['name'],
      'enrollmentCount' => enrollment['count'],
      'enrollmentType' => enrollment['type'],
      'startDate' => (status['startDateStruct'] || {})['date'],
      'lastUpdatePostDate' => (status['lastUpdatePostDateStruct'] || {})['date']
    }
  end

  def parse_clinical_trials_studies_payload(payload)
    parsed = require_hash(payload, 'clinicaltrials-studies')
    rows = require_array(parsed['studies'], 'clinicaltrials-studies')
    if rows.empty?
      raise UsSourceParseError.new('clinicaltrials-studies',
                                   'The response carried no studies')
    end

    studies = rows.map { |row| clinical_study(row) }
    counts = Hash.new(0)
    studies.each { |study| counts[study['overallStatus']] += 1 }
    {
      'studies' => studies,
      'studyCount' => studies.length,
      'statusCounts' => counts.sort_by { |status, count| [-count, status] }.map do |status, count|
        { 'status' => status, 'studyCount' => count }
      end,
      'nextPageToken' => parsed['nextPageToken']
    }
  end

  def parse_ncbi_pubmed_search_payload(payload)
    parsed = require_hash(payload, 'ncbi-pubmed-search')
    result = parsed['esearchresult']
    unless result.is_a?(Hash)
      raise UsSourceParseError.new('ncbi-pubmed-search',
                                   'The response carried no result block')
    end
    raise UsSourceApiError.new('ncbi-pubmed-search', result['error'].to_s) if result['error']

    total = Integer(result['count'])
    pmids = result.fetch('idlist', [])
    translations = result.fetch('translationset', []).map do |entry|
      if entry.is_a?(Hash) && entry.key?('from') && entry.key?('to')
        { 'from' => entry['from'],
          'to' => entry['to'] }
      end
    end.compact
    {
      'totalCount' => total,
      'returnedCount' => pmids.length,
      'pmids' => pmids,
      'queryTranslation' => result.fetch('querytranslation', ''),
      'translationSet' => translations
    }
  rescue ArgumentError, TypeError
    raise UsSourceParseError.new('ncbi-pubmed-search', 'Unreadable match count')
  end

  def text_or_empty(value)
    value.nil? ? '' : value.to_s
  end

  def epa_facility(row)
    required = %w[tri_facility_id facility_name state_abbr]
    unless row.is_a?(Hash) && required.all? { |key| !row[key].nil? }
      raise UsSourceParseError.new('epa-envirofacts-facilities',
                                   'A facility row is missing its id, name, or state')
    end

    parent = row['parent_co_name']
    parent_text = parent&.to_s&.strip
    parent_text = nil if parent_text&.empty? || parent_text == 'NA'
    {
      'facilityId' => row['tri_facility_id'],
      'facilityName' => row['facility_name'],
      'streetAddress' => row.fetch('street_address', ''),
      'city' => row.fetch('city_name', ''),
      'countyName' => row.fetch('county_name', ''),
      'stateAbbr' => row['state_abbr'],
      'postalCode' => row.fetch('zip_code', ''),
      'region' => row.fetch('region', ''),
      'closed' => row['fac_closed_ind'] == '1',
      'parentCompanyName' => parent_text
    }
  end

  def county_counts(facilities)
    counties = Hash.new(0)
    facilities.each { |facility| counties[facility['countyName']] += 1 }
    counties.sort_by { |name, count| [-count, name] }.map do |name, count|
      { 'countyName' => name, 'facilityCount' => count }
    end
  end

  def parse_epa_envirofacts_facilities_payload(payload)
    if payload.is_a?(Hash) && payload['error']
      raise UsSourceApiError.new('epa-envirofacts-facilities', payload['error'].to_s)
    end

    rows = require_array(payload, 'epa-envirofacts-facilities')
    if rows.empty?
      raise UsSourceParseError.new('epa-envirofacts-facilities',
                                   'The response carried no rows')
    end

    facilities = rows.map { |row| epa_facility(row) }
    closed = facilities.count { |facility| facility['closed'] }
    {
      'facilities' => facilities,
      'facilityCount' => facilities.length,
      'openCount' => facilities.length - closed,
      'closedCount' => closed,
      'counties' => county_counts(facilities)
    }
  end

  def fdic_bank(row)
    data = row.is_a?(Hash) ? row['data'] : nil
    unless data.is_a?(Hash) && %w[ID NAME CITY STALP].all? { |key| !data[key].nil? }
      raise UsSourceParseError.new('fdic-bank-directory',
                                   'A bank row is missing its id, name, city, or state')
    end

    { 'id' => data['ID'], 'name' => data['NAME'], 'city' => data['CITY'],
      'stateAbbr' => data['STALP'] }
  end

  def parse_fdic_bank_directory_payload(payload)
    parsed = require_hash(payload, 'fdic-bank-directory')
    if parsed['errors'].is_a?(Array) && !parsed['errors'].empty?
      raise UsSourceApiError.new('fdic-bank-directory', 'The API rejected the request')
    end

    rows = require_array(parsed['data'], 'fdic-bank-directory')
    if rows.empty?
      raise UsSourceParseError.new('fdic-bank-directory',
                                   'The response carried no rows')
    end

    banks = rows.map { |row| fdic_bank(row) }
    states = Hash.new(0)
    banks.each { |bank| states[bank['stateAbbr']] += 1 }
    total = (parsed['totals'] || {})['count'] || (parsed['meta'] || {})['total'] || banks.length
    {
      'banks' => banks,
      'bankCount' => banks.length,
      'totalBanks' => total,
      'states' => states.sort_by { |state, count| [-count, state] }.map do |state, count|
        { 'stateAbbr' => state, 'bankCount' => count }
      end
    }
  end

  def publicdatahub_measure(measure)
    return nil unless measure.is_a?(Hash)

    {
      'key' => measure['key'],
      'label' => measure['label'],
      'period' => measure['period'],
      'value' => measure['value'],
      'unit' => measure['unit'],
      'nationalRank' => measure['national_rank'],
      'tiedWith' => measure['tied_with'],
      'definition' => measure['definition']
    }
  end

  def publicdatahub_provenance(provenance_raw)
    {
      'source' => text_or_empty(provenance_raw['source']),
      'agency' => provenance_raw['agency'],
      'datasetUrl' => provenance_raw['dataset_url'],
      'licence' => provenance_raw['licence'],
      'licenceUrl' => text_or_empty(provenance_raw['licence_url']),
      'dataAsOf' => provenance_raw['data_as_of'],
      'versionId' => text_or_empty(provenance_raw['version_id']),
      'retrievedFrom' => text_or_empty(provenance_raw['retrieved_from'])
    }
  end

  def publicdatahub_hospital(raw, address_raw, measures, provenance)
    {
      'id' => raw['id'],
      'slug' => raw['slug'],
      'name' => raw['name'],
      'entityType' => raw['entity_type'],
      'hospitalType' => text_or_empty(raw['hospital_type']),
      'ownership' => text_or_empty(raw['ownership']),
      'emergencyServices' => text_or_empty(raw['emergency_services']),
      'cmsCcn' => text_or_empty(raw['cms_ccn']),
      'address' => {
        'street' => text_or_empty(address_raw['street']),
        'city' => text_or_empty(address_raw['city']),
        'state' => text_or_empty(address_raw['state']),
        'zip' => text_or_empty(address_raw['zip']),
        'county' => text_or_empty(address_raw['county']),
        'countyGeoid' => text_or_empty(address_raw['county_geoid'])
      },
      'phone' => text_or_empty(raw['phone']),
      'website' => text_or_empty(raw['website']),
      'qualityScore' => raw['quality_score'],
      'measures' => measures,
      'provenance' => provenance
    }
  end

  def publicdatahub_numeric(measures, key)
    measure = measures.find { |row| row['key'] == key }
    measure && measure['value'].is_a?(Numeric) ? measure['value'] : nil
  end

  def parse_publicdatahub_hospital_payload(payload)
    raw = require_hash(payload, 'publicdatahub-hospital-quality')
    measures_raw = require_array(raw['measures'], 'publicdatahub-hospital-quality')
    provenance_raw = require_hash(raw['provenance'], 'publicdatahub-hospital-quality')
    address_raw = raw['address'].is_a?(Hash) ? raw['address'] : {}
    measures = measures_raw.map do |measure|
      publicdatahub_measure(measure)
    end.compact
    provenance = publicdatahub_provenance(provenance_raw)
    hospital = publicdatahub_hospital(raw, address_raw, measures, provenance)
    {
      'hospital' => hospital,
      'measureCount' => measures.length,
      'reportedMeasureCount' => measures.count { |measure| !measure['value'].nil? },
      'overallRating' => publicdatahub_numeric(measures, 'overall_rating'),
      'betterThanNationalCount' => publicdatahub_numeric(measures, 'measures_better'),
      'worseThanNationalCount' => publicdatahub_numeric(measures, 'measures_worse'),
      'dataAsOf' => provenance['dataAsOf'],
      'agency' => provenance['agency'],
      'datasetUrl' => provenance['datasetUrl'],
      'licence' => provenance['licence']
    }
  end

  clinicaltrials_studies_adapter = Adapter.new(
    'clinicaltrials-studies',
    'ClinicalTrials.gov studies',
    'none',
    'Registered clinical studies from ClinicalTrials.gov, one row per study, with the ' \
    'status, phase, lead sponsor, and enrollment.',
    json_fetcher("#{CLINICALTRIALS_STUDIES_API_BASE}?pageSize=10",
                 method(:parse_clinical_trials_studies_payload)),
    method(:parse_clinical_trials_studies_payload),
    lambda {
      fixture = 'clinicaltrials-studies-2026-10-05.json'
      parse_clinical_trials_studies_payload(fixture_json(fixture))
    }
  )

  ncbi_pubmed_search_adapter = Adapter.new(
    'ncbi-pubmed-search',
    'NCBI PubMed search',
    'none',
    'PubMed literature searches through the NCBI Entrez Utilities API, with the match ' \
    'count, a page of PubMed ids, and how NCBI translated the query.',
    json_fetcher(
      "#{NCBI_EUTILS_API_BASE}/esearch.fcgi?db=pubmed&term=asthma&retmode=json&retmax=10",
      method(:parse_ncbi_pubmed_search_payload)
    ),
    method(:parse_ncbi_pubmed_search_payload),
    -> { parse_ncbi_pubmed_search_payload(fixture_json('ncbi-pubmed-search-2026-10-05.json')) }
  )

  epa_envirofacts_facilities_adapter = Adapter.new(
    'epa-envirofacts-facilities',
    'EPA Envirofacts facilities',
    'none',
    'Toxics Release Inventory facilities from the EPA Envirofacts service, one row per ' \
    'site, with its county, address, and open or closed status.',
    json_fetcher("#{EPA_ENVIROFACTS_API_BASE}/TRI_FACILITY/STATE_ABBR/RI/rows/0:9/JSON",
                 method(:parse_epa_envirofacts_facilities_payload)),
    method(:parse_epa_envirofacts_facilities_payload),
    lambda {
      fixture = 'epa-envirofacts-facilities-2026-10-05.json'
      parse_epa_envirofacts_facilities_payload(fixture_json(fixture))
    }
  )

  fdic_bank_directory_adapter = Adapter.new(
    'fdic-bank-directory',
    'FDIC bank directory',
    'none',
    'Insured banks in the FDIC institution directory, one row per bank, with the city ' \
    'and state of its main office.',
    json_fetcher("#{FDIC_BANK_API_BASE}?limit=10&fields=NAME,CITY,STALP",
                 method(:parse_fdic_bank_directory_payload)),
    method(:parse_fdic_bank_directory_payload),
    -> { parse_fdic_bank_directory_payload(fixture_json('fdic-bank-directory-2026-10-05.json')) }
  )

  publicdatahub_hospital_adapter = Adapter.new(
    'publicdatahub-hospital-quality',
    'PublicDataHub hospital quality',
    'none',
    'Medicare-certified hospital quality measures from CMS, republished by PublicDataHub ' \
    'with national ranks, provenance, and an explicit null for every value the agency ' \
    'did not publish.',
    json_fetcher(
      "#{PUBLICDATAHUB_API_BASE}/api/export/hospital/mayo-clinic-hospital-rochester.json",
      method(:parse_publicdatahub_hospital_payload)
    ),
    method(:parse_publicdatahub_hospital_payload),
    lambda {
      fixture = 'publicdatahub-hospital-quality-2026-10-21.json'
      parse_publicdatahub_hospital_payload(fixture_json(fixture))
    }
  )

  def build_nih_reporter_search_body(query = nil)
    options = query || {}
    {
      'criteria' => {
        'fiscal_years' => [options.fetch(:fiscalYear, NIH_REPORTER_DEFAULT_FISCAL_YEAR)],
        'agencies' => ['NIH']
      },
      'include_fields' => NIH_REPORTER_INCLUDE_FIELDS,
      'offset' => options.fetch(:offset, 0),
      'limit' => options.fetch(:limit, NIH_REPORTER_PAGE_SIZE),
      'sort_field' => 'award_amount',
      'sort_order' => 'desc'
    }
  end

  def nih_number(value, source, field)
    parsed = number(value)
    if parsed.nil?
      raise UsSourceParseError.new(source, "A project carried an unreadable #{field}")
    end

    parsed
  end

  def nih_optional_number(value, source, field)
    value.nil? ? nil : nih_number(value, source, field)
  end

  def nih_required_string(value, source, field)
    unless value.is_a?(String)
      raise UsSourceParseError.new(source, "A project carried an unreadable #{field}")
    end

    value
  end

  def nih_optional_string(value, source, field)
    value.nil? ? nil : nih_required_string(value, source, field)
  end

  def normalize_nih_date(value, source, field)
    return nil if value.nil?

    text = nih_required_string(value, source, field)
    match = text.match(/\A(\d{4}-\d{2}-\d{2})/)
    raise UsSourceParseError.new(source, "Unreadable #{field}: #{text}") if match.nil?

    match[1]
  end

  def nih_investigators(value, source)
    return [] if value.nil?
    unless value.is_a?(Array)
      raise UsSourceParseError.new(source, 'A project carried a malformed investigator list')
    end

    value.filter_map do |investigator|
      unless investigator.is_a?(Hash)
        raise UsSourceParseError.new(source, 'An investigator entry is not an object')
      end

      full_name = investigator['full_name']
      next nil if full_name.nil?
      unless full_name.is_a?(String)
        raise UsSourceParseError.new(source, 'An investigator carried an unreadable name')
      end

      name = full_name.split(/\s+/).reject(&:empty?).join(' ')
      name.empty? ? nil : name
    end
  end

  def nih_administering_institute(value, source)
    return nil if value.nil?
    unless value.is_a?(Hash)
      raise UsSourceParseError.new(source,
                                   'A project carried a malformed administering institute')
    end

    abbreviation = value['abbreviation']
    unless abbreviation.nil? || abbreviation.is_a?(String)
      raise UsSourceParseError.new(source,
                                   'A project carried an unreadable institute abbreviation')
    end
    return abbreviation unless abbreviation.nil? || abbreviation.empty?

    name = value['name']
    return nil if name.nil?
    unless name.is_a?(String)
      raise UsSourceParseError.new(source, 'A project carried an unreadable institute name')
    end

    name
  end

  def parse_nih_reporter_projects_payload(payload)
    source = 'nih-reporter-projects'
    parsed = require_hash(payload, source)
    message = parsed['message']
    unless message.nil?
      unless message.is_a?(String)
        raise UsSourceParseError.new(source, 'The response carried an unreadable message')
      end
      raise UsSourceApiError.new(source, message)
    end

    meta = parsed['meta']
    rows = parsed['results']
    unless meta.is_a?(Hash) && rows.is_a?(Array)
      raise UsSourceParseError.new(
        source,
        'The response carried no meta block or results array'
      )
    end
    total = nih_number(meta['total'], source, 'total')
    offset = nih_number(meta['offset'], source, 'offset')
    limit = nih_number(meta['limit'], source, 'limit')

    projects = rows.map do |row|
      unless row.is_a?(Hash)
        raise UsSourceParseError.new(source, 'A project is not an object')
      end

      organization = row['organization']
      unless organization.is_a?(Hash)
        raise UsSourceParseError.new(source, 'A project arrived without its organization')
      end
      {
        'projectNumber' => nih_required_string(row['project_num'], source, 'project number'),
        'coreProjectNumber' => nih_optional_string(row['core_project_num'], source,
                                                  'core project number'),
        'projectTitle' => nih_required_string(row['project_title'], source, 'project title'),
        'fiscalYear' => nih_number(row['fiscal_year'], source, 'fiscal year'),
        'awardAmount' => nih_optional_number(row['award_amount'], source, 'award amount'),
        'organizationName' => nih_required_string(organization['org_name'], source,
                                                  'organization name'),
        'organizationCity' => nih_optional_string(organization['org_city'], source,
                                                  'organization city'),
        'organizationState' => nih_optional_string(organization['org_state'], source,
                                                   'organization state'),
        'principalInvestigators' => nih_investigators(row['principal_investigators'], source),
        'administeringInstitute' => nih_administering_institute(row['agency_ic_admin'], source),
        'projectStartDate' => normalize_nih_date(row['project_start_date'], source,
                                                 'project start date'),
        'projectEndDate' => normalize_nih_date(row['project_end_date'], source,
                                               'project end date'),
        'projectDetailUrl' => nih_optional_string(row['project_detail_url'], source,
                                                  'project detail URL')
      }
    end

    {
      'projects' => projects,
      'projectCount' => projects.length,
      'totalCount' => total,
      'offset' => offset,
      'limit' => limit,
      'pageAwardAmountUsd' => projects.sum { |project| project['awardAmount'] || 0 }
    }
  end

  def fetch_nih_reporter_projects(options = nil)
    parse_nih_reporter_projects_payload(
      post_json(NIH_REPORTER_SEARCH_URL, build_nih_reporter_search_body(options))
    )
  end

  nih_reporter_projects_adapter = Adapter.new(
    'nih-reporter-projects',
    'NIH RePORTER funded projects',
    'none',
    'NIH RePORTER funded projects for one fiscal year, with the project title, award ' \
    'amount, organization, principal investigators, and administering institute.',
    ->(options = nil) { fetch_nih_reporter_projects(options) },
    method(:parse_nih_reporter_projects_payload),
    lambda {
      parse_nih_reporter_projects_payload(
        fixture_json('nih-reporter-projects-fy2025-2026-11-07.json')
      )
    }
  )

  CLINICALTRIALS_STUDIES_ADAPTER = clinicaltrials_studies_adapter
  NCBI_PUBMED_SEARCH_ADAPTER = ncbi_pubmed_search_adapter
  EPA_ENVIROFACTS_FACILITIES_ADAPTER = epa_envirofacts_facilities_adapter
  FDIC_BANK_DIRECTORY_ADAPTER = fdic_bank_directory_adapter
  PUBLICDATAHUB_HOSPITAL_ADAPTER = publicdatahub_hospital_adapter
  NIH_REPORTER_PROJECTS_ADAPTER = nih_reporter_projects_adapter
end
