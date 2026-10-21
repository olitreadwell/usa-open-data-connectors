import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { readFixtureJson } from './fixtures.js';
import { httpGet } from './http.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the PublicDataHub hospital quality source. */
export const PUBLICDATAHUB_HOSPITAL_SOURCE_ID = 'publicdatahub-hospital-quality';

/** Base URL for the PublicDataHub export API. */
export const PUBLICDATAHUB_API_BASE = 'https://publicdatahub.org';

/** Default hospital record, matching the worked example PublicDataHub publishes. */
export const PUBLICDATAHUB_DEFAULT_HOSPITAL_SLUG = 'mayo-clinic-hospital-rochester';

/** Committed snapshot, so a build works when PublicDataHub is unreachable. */
const PUBLICDATAHUB_HOSPITAL_FIXTURE_FILENAME = 'publicdatahub-hospital-quality-2026-10-21.json';

/** Measure keys the adapter folds into headline counts. */
const PUBLICDATAHUB_OVERALL_RATING_KEY = 'overall_rating';
const PUBLICDATAHUB_MEASURES_BETTER_KEY = 'measures_better';
const PUBLICDATAHUB_MEASURES_WORSE_KEY = 'measures_worse';

const PUBLICDATAHUB_MEASURE_SCHEMA = z.object({
  key: z.string(),
  label: z.string(),
  period: z.string().nullable().optional(),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable().optional(),
  national_rank: z.number().int().nullable().optional(),
  tied_with: z.number().int().nullable().optional(),
  definition: z.string().nullable().optional(),
});

const PUBLICDATAHUB_ADDRESS_SCHEMA = z.object({
  street: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  county_geoid: z.string().nullable().optional(),
});

const PUBLICDATAHUB_PROVENANCE_SCHEMA = z.object({
  source: z.string().nullable().optional(),
  agency: z.string(),
  dataset_url: z.string(),
  licence: z.string(),
  licence_url: z.string().nullable().optional(),
  data_as_of: z.string(),
  version_id: z.string().nullable().optional(),
  retrieved_from: z.string().nullable().optional(),
});

const PUBLICDATAHUB_HOSPITAL_SCHEMA = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  entity_type: z.string(),
  hospital_type: z.string().nullable().optional(),
  ownership: z.string().nullable().optional(),
  emergency_services: z.string().nullable().optional(),
  cms_ccn: z.string().nullable().optional(),
  address: PUBLICDATAHUB_ADDRESS_SCHEMA.optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  quality_score: z.number().nullable().optional(),
  measures: z.array(PUBLICDATAHUB_MEASURE_SCHEMA),
  provenance: PUBLICDATAHUB_PROVENANCE_SCHEMA,
});

/** One measure PublicDataHub reports for a hospital. */
export interface PublicDataHubMeasure {
  /** Stable identifier for the measure, e.g. "overall_rating". */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Release period of the measure, e.g. "2026", or null when unspecified. */
  period: string | null;
  /** Published value. A null is a value the agency did not publish, never zero. */
  value: number | string | null;
  /** Unit of the value, e.g. "of 5", or null when the measure has none. */
  unit: string | null;
  /** National rank within this entity type, or null when not ranked. */
  nationalRank: number | null;
  /** How many records share this rank, or null when PublicDataHub did not say. */
  tiedWith: number | null;
  /** PublicDataHub's note on how to read the measure, or null when absent. */
  definition: string | null;
}

/** The postal address PublicDataHub records for a hospital. */
export interface PublicDataHubHospitalAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  countyGeoid: string;
}

/** Where a PublicDataHub record came from, reproduced on every response. */
export interface PublicDataHubProvenance {
  source: string;
  agency: string;
  datasetUrl: string;
  licence: string;
  licenceUrl: string;
  dataAsOf: string;
  versionId: string;
  retrievedFrom: string;
}

/** One Medicare-certified hospital and its reported quality measures. */
export interface PublicDataHubHospital {
  id: string;
  slug: string;
  name: string;
  entityType: string;
  hospitalType: string;
  ownership: string;
  emergencyServices: string;
  cmsCcn: string;
  address: PublicDataHubHospitalAddress;
  phone: string;
  website: string;
  qualityScore: number | null;
  measures: PublicDataHubMeasure[];
  provenance: PublicDataHubProvenance;
}

/** A hospital record folded into the counts a story can chart. */
export interface PublicDataHubHospitalQuality {
  hospital: PublicDataHubHospital;
  /** Measures in the record, whether or not the agency published a value. */
  measureCount: number;
  /** Measures with a published value. */
  reportedMeasureCount: number;
  /** CMS overall star rating, or null when the hospital has none. */
  overallRating: number | null;
  /** Measures where the hospital performed better than the national rate. */
  betterThanNationalCount: number | null;
  /** Measures where the hospital performed worse than the national rate. */
  worseThanNationalCount: number | null;
  /** The CMS release these figures came from. */
  dataAsOf: string;
  /** Agency that published the underlying figures. */
  agency: string;
  /** Dataset page for the underlying figures. */
  datasetUrl: string;
  /** Licence attached to the record. */
  licence: string;
}

/** Reads a nullable string field as a plain string. */
function readText(value: string | null | undefined): string {
  return value ?? '';
}

/** Finds one measure by key, or undefined when the record has no such measure. */
export function getPublicDataHubMeasure(
  hospital: PublicDataHubHospital,
  key: string
): PublicDataHubMeasure | undefined {
  return hospital.measures.find((measure) => measure.key === key);
}

/** Reads a numeric measure value, keeping a missing value as null. */
function readMeasureNumber(hospital: PublicDataHubHospital, key: string): number | null {
  const value = getPublicDataHubMeasure(hospital, key)?.value;
  return typeof value === 'number' ? value : null;
}

/** Builds the JSON export URL for one hospital slug. */
export function buildPublicDataHubHospitalUrl(slug: string): string {
  return `${PUBLICDATAHUB_API_BASE}/api/export/hospital/${encodeURIComponent(slug)}.json`;
}

/**
 * Parses one PublicDataHub hospital export into a quality profile.
 *
 * A missing name, measure list, or provenance block is a changed shape and
 * stops the parse. A null measure value stays null, so a chart never turns an
 * unpublished figure into zero.
 *
 * @param payload - the JSON body from the hospital export endpoint
 * @returns the hospital, its measures, and headline quality counts
 */
export function parsePublicDataHubHospitalPayload(payload: unknown): PublicDataHubHospitalQuality {
  const parsed = PUBLICDATAHUB_HOSPITAL_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(PUBLICDATAHUB_HOSPITAL_SOURCE_ID, parsed.error.message);
  }

  const raw = parsed.data;
  const measures: PublicDataHubMeasure[] = raw.measures.map((measure) => ({
    key: measure.key,
    label: measure.label,
    period: measure.period ?? null,
    value: measure.value,
    unit: measure.unit ?? null,
    nationalRank: measure.national_rank ?? null,
    tiedWith: measure.tied_with ?? null,
    definition: measure.definition ?? null,
  }));

  const address = raw.address;
  const hospital: PublicDataHubHospital = {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    entityType: raw.entity_type,
    hospitalType: readText(raw.hospital_type),
    ownership: readText(raw.ownership),
    emergencyServices: readText(raw.emergency_services),
    cmsCcn: readText(raw.cms_ccn),
    address: {
      street: readText(address?.street),
      city: readText(address?.city),
      state: readText(address?.state),
      zip: readText(address?.zip),
      county: readText(address?.county),
      countyGeoid: readText(address?.county_geoid),
    },
    phone: readText(raw.phone),
    website: readText(raw.website),
    qualityScore: raw.quality_score ?? null,
    measures,
    provenance: {
      source: readText(raw.provenance.source),
      agency: raw.provenance.agency,
      datasetUrl: raw.provenance.dataset_url,
      licence: raw.provenance.licence,
      licenceUrl: readText(raw.provenance.licence_url),
      dataAsOf: raw.provenance.data_as_of,
      versionId: readText(raw.provenance.version_id),
      retrievedFrom: readText(raw.provenance.retrieved_from),
    },
  };

  return {
    hospital,
    measureCount: measures.length,
    reportedMeasureCount: measures.filter((measure) => measure.value !== null).length,
    overallRating: readMeasureNumber(hospital, PUBLICDATAHUB_OVERALL_RATING_KEY),
    betterThanNationalCount: readMeasureNumber(hospital, PUBLICDATAHUB_MEASURES_BETTER_KEY),
    worseThanNationalCount: readMeasureNumber(hospital, PUBLICDATAHUB_MEASURES_WORSE_KEY),
    dataAsOf: hospital.provenance.dataAsOf,
    agency: hospital.provenance.agency,
    datasetUrl: hospital.provenance.datasetUrl,
    licence: hospital.provenance.licence,
  };
}

/**
 * Fetches one hospital record from PublicDataHub's keyless export API.
 *
 * The API answers one named record per request. It does not publish a bulk
 * list, so the slug is explicit and stable.
 *
 * @param options - an optional hospital slug and fetch stub
 * @returns the hospital quality profile
 */
export async function fetchPublicDataHubHospital(options?: {
  slug?: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<PublicDataHubHospitalQuality> {
  const slug = options?.slug ?? PUBLICDATAHUB_DEFAULT_HOSPITAL_SLUG;
  const fetchOptions = options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl };
  const response = await httpGet(
    PUBLICDATAHUB_HOSPITAL_SOURCE_ID,
    buildPublicDataHubHospitalUrl(slug),
    fetchOptions
  );
  return parsePublicDataHubHospitalPayload(await response.json());
}

/** PublicDataHub Medicare hospital quality records, keyless, one hospital per call. */
export const publicDataHubHospitalAdapter: UsDataAdapter<PublicDataHubHospitalQuality> = {
  id: PUBLICDATAHUB_HOSPITAL_SOURCE_ID,
  name: 'PublicDataHub hospital quality',
  auth: 'none',
  description:
    'Medicare-certified hospital quality measures from CMS, republished by PublicDataHub with national ranks, provenance, and an explicit null for every value the agency did not publish.',
  fetchLive: async (options) =>
    fetchPublicDataHubHospital(
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: (payload) => parsePublicDataHubHospitalPayload(payload),
  loadFixture: () =>
    parsePublicDataHubHospitalPayload(readFixtureJson(PUBLICDATAHUB_HOSPITAL_FIXTURE_FILENAME)),
};
