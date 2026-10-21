import { z } from 'zod';

import { UsSourceParseError } from './errors.js';
import { httpGet } from './http.js';
import { readFixtureJson } from './fixtures.js';
import type { UsDataAdapter } from './types.js';

/** Adapter id for the Callook.info amateur radio callsign source. */
export const CALLOOK_CALLSIGNS_SOURCE_ID = 'callook-callsigns';

/** Base URL for the Callook.info callsign lookup service. */
export const CALLOOK_API_BASE = 'https://callook.info';

/**
 * One callsign for each of the ten US amateur radio call districts.
 *
 * Callook answers one callsign per request rather than exposing a bulk list.
 * The W1ABC through W0ABC callsigns give the same lookup a ten-district
 * sample, so the adapter can show how the licence file varies across the
 * country instead of reporting a single record.
 */
export const CALLOOK_DISTRICT_CALLSIGNS: readonly string[] = [
  'W1ABC',
  'W2ABC',
  'W3ABC',
  'W4ABC',
  'W5ABC',
  'W6ABC',
  'W7ABC',
  'W8ABC',
  'W9ABC',
  'W0ABC',
];

/** The three states Callook uses when a lookup has no licence record. */
export type CallookLookupStatus = 'VALID' | 'INVALID' | 'UPDATING';

/** One callsign lookup, with the licence fields flattened into plain names. */
export interface CallookCallsign {
  /** Whether Callook found a current licence for the callsign. */
  status: CallookLookupStatus;
  /** Current callsign, or an empty string when the lookup found no licence. */
  callsign: string;
  /** Licence type, e.g. "CLUB" or "PERSON", or an empty string when none. */
  licenseType: string;
  /** Operator class, e.g. "GENERAL" or "EXTRA", or an empty string when none. */
  operatorClass: string;
  /** Previous callsign held by the same licensee, or an empty string. */
  previousCallsign: string;
  /** Previous operator class held by the same licensee, or an empty string. */
  previousOperatorClass: string;
  /** Name of the licensee, or the club the licence belongs to. */
  licenseeName: string;
  /** Callsign of the club trustee, or an empty string for a personal licence. */
  trusteeCallsign: string;
  /** Name of the club trustee, or an empty string for a personal licence. */
  trusteeName: string;
  /** First line of the mailing address on the FCC record. */
  addressLine1: string;
  /** Second line of the mailing address, usually city, state, and ZIP code. */
  addressLine2: string;
  /** Attention line on the mailing address, or an empty string. */
  attention: string;
  /** Approximate latitude Callook calculated from the address, or null. */
  latitude: number | null;
  /** Approximate longitude Callook calculated from the address, or null. */
  longitude: number | null;
  /** Maidenhead grid square Callook calculated from the coordinates, or empty. */
  gridsquare: string;
  /** Licence grant date as YYYY-MM-DD, or null when Callook reports none. */
  grantDate: string | null;
  /** Licence expiry date as YYYY-MM-DD, or null when Callook reports none. */
  expiryDate: string | null;
  /** Date of the last FCC action on the licence, or null. */
  lastActionDate: string | null;
  /** FCC Registration Number, or an empty string. */
  frn: string;
  /** Link to the licence in the FCC ULS search, or an empty string. */
  ulsUrl: string;
  /** Two-letter state parsed from the mailing address, or an empty string. */
  stateAbbr: string;
  /** US call district digit taken from the callsign, or an empty string. */
  callDistrict: string;
}

/** One label and how many records carry it. */
export interface CallookLabelCount {
  label: string;
  count: number;
}

/** A batch of callsign lookups, folded for a story. */
export interface CallookCallsignDirectory {
  /** Every lookup in the batch, valid or not, in the order it was requested. */
  callsigns: CallookCallsign[];
  callsignCount: number;
  validCount: number;
  invalidCount: number;
  updatingCount: number;
  /** Licence types, most records first, ties broken by label. */
  licenseTypeCounts: CallookLabelCount[];
  /** Operator classes, most records first, ties broken by label. */
  operatorClassCounts: CallookLabelCount[];
  /** How many different call districts the valid records cover. */
  callDistrictCount: number;
  /** Valid record with the earliest expiry date, or null when none has one. */
  soonestExpiry: CallookCallsign | null;
  /** Valid record with the latest expiry date, or null when none has one. */
  latestExpiry: CallookCallsign | null;
}

/** Committed snapshot, so a build works when Callook is unreachable. */
const CALLOOK_CALLSIGNS_FIXTURE_FILENAME = 'callook-callsigns-2026-10-21.json';

/** Shape of a US amateur radio callsign, without spaces or punctuation. */
const CALLSIGN_PATTERN = /^[A-Z0-9]{3,10}$/;

/** Shape of the dates Callook writes, e.g. "03/24/2036". */
const CALLOOK_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Shape of a US mailing address line ending in a state and ZIP code. */
const STATE_AND_ZIP_PATTERN = /\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/;

const CALLOOK_ADDRESS_SCHEMA = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  attn: z.string().optional(),
});

const CALLOOK_LOCATION_SCHEMA = z.object({
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  gridsquare: z.string().optional(),
});

const CALLOOK_OTHER_INFO_SCHEMA = z.object({
  grantDate: z.string().optional(),
  expiryDate: z.string().optional(),
  lastActionDate: z.string().optional(),
  frn: z.string().optional(),
  ulsUrl: z.string().optional(),
});

const CALLOOK_NAME_SCHEMA = z.object({
  callsign: z.string().optional(),
  operClass: z.string().optional(),
  name: z.string().optional(),
});

const CALLOOK_CALLSIGN_SCHEMA = z.object({
  status: z.enum(['VALID', 'INVALID', 'UPDATING']),
  type: z.string().optional(),
  current: CALLOOK_NAME_SCHEMA.optional(),
  previous: CALLOOK_NAME_SCHEMA.optional(),
  trustee: CALLOOK_NAME_SCHEMA.optional(),
  name: z.string().optional(),
  address: CALLOOK_ADDRESS_SCHEMA.optional(),
  location: CALLOOK_LOCATION_SCHEMA.optional(),
  otherInfo: CALLOOK_OTHER_INFO_SCHEMA.optional(),
});

const CALLOOK_CALLSIGNS_SCHEMA = z.array(CALLOOK_CALLSIGN_SCHEMA);

/** Builds the request URL for one callsign lookup. */
export function buildCallookCallsignUrl(callsign: string): string {
  const normalized = callsign.trim().toUpperCase();
  if (!CALLSIGN_PATTERN.test(normalized)) {
    throw new UsSourceParseError(
      CALLOOK_CALLSIGNS_SOURCE_ID,
      `A callsign must be 3 to 10 letters or digits: ${callsign}`
    );
  }
  return `${CALLOOK_API_BASE}/${normalized}/json`;
}

/** Converts Callook's MM/DD/YYYY date to YYYY-MM-DD, or null when unreadable. */
function toIsoDate(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  const match = CALLOOK_DATE_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

/** Reads a numeric coordinate from Callook's string field, or null. */
function toCoordinate(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

/** Reads the two-letter state from the end of a mailing address line. */
function toStateAbbr(addressLine2: string): string {
  return STATE_AND_ZIP_PATTERN.exec(addressLine2)?.[1] ?? '';
}

/** Reads the first digit in a callsign as its US call district. */
function toCallDistrict(callsign: string): string {
  return /\d/.exec(callsign)?.[0] ?? '';
}

/** Builds an empty record for a lookup that found no current licence. */
function emptyCallookCallsign(status: CallookLookupStatus): CallookCallsign {
  return {
    status,
    callsign: '',
    licenseType: '',
    operatorClass: '',
    previousCallsign: '',
    previousOperatorClass: '',
    licenseeName: '',
    trusteeCallsign: '',
    trusteeName: '',
    addressLine1: '',
    addressLine2: '',
    attention: '',
    latitude: null,
    longitude: null,
    gridsquare: '',
    grantDate: null,
    expiryDate: null,
    lastActionDate: null,
    frn: '',
    ulsUrl: '',
    stateAbbr: '',
    callDistrict: '',
  };
}

/** Counts labels in a record list, most records first, ties by label. */
function countLabels(labels: string[]): CallookLabelCount[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    if (label !== '') {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([leftLabel, leftCount], [rightLabel, rightCount]) =>
      leftCount === rightCount ? leftLabel.localeCompare(rightLabel) : rightCount - leftCount
    )
    .map(([label, count]) => ({ label, count }));
}

/** Picks the valid record with the earliest or latest date in one field. */
function edgeByDate(
  callsigns: CallookCallsign[],
  direction: 'earliest' | 'latest'
): CallookCallsign | null {
  let edge: CallookCallsign | null = null;
  let edgeDate: string | null = null;
  for (const callsign of callsigns) {
    const value = callsign.expiryDate;
    if (value === null) {
      continue;
    }
    if (edgeDate === null || (direction === 'earliest' ? value < edgeDate : value > edgeDate)) {
      edge = callsign;
      edgeDate = value;
    }
  }
  return edge;
}

/** Folds a list of callsign records into the shape the page reads. */
export function buildCallookCallsignDirectory(
  callsigns: CallookCallsign[]
): CallookCallsignDirectory {
  const valid = callsigns.filter((callsign) => callsign.status === 'VALID');
  return {
    callsigns,
    callsignCount: callsigns.length,
    validCount: valid.length,
    invalidCount: callsigns.filter((callsign) => callsign.status === 'INVALID').length,
    updatingCount: callsigns.filter((callsign) => callsign.status === 'UPDATING').length,
    licenseTypeCounts: countLabels(valid.map((callsign) => callsign.licenseType)),
    operatorClassCounts: countLabels(valid.map((callsign) => callsign.operatorClass)),
    callDistrictCount: new Set(
      valid.map((callsign) => callsign.callDistrict).filter((district) => district !== '')
    ).size,
    soonestExpiry: edgeByDate(valid, 'earliest'),
    latestExpiry: edgeByDate(valid, 'latest'),
  };
}

/**
 * Parses a batch of Callook lookup responses.
 *
 * A lookup with status INVALID or UPDATING is a valid answer from the service
 * and stays in `callsigns`, but it carries no licence fields and does not
 * contribute to the counts. A VALID record without a current callsign is a
 * changed shape and stops the parse.
 *
 * @param payload - an array of JSON bodies, one per callsign lookup
 * @returns the records and the folded counts
 */
export function parseCallookCallsignsPayload(payload: unknown): CallookCallsignDirectory {
  const parsed = CALLOOK_CALLSIGNS_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new UsSourceParseError(CALLOOK_CALLSIGNS_SOURCE_ID, parsed.error.message);
  }
  if (parsed.data.length === 0) {
    throw new UsSourceParseError(CALLOOK_CALLSIGNS_SOURCE_ID, 'The response carried no lookups');
  }

  const callsigns = parsed.data.map((record): CallookCallsign => {
    if (record.status !== 'VALID') {
      return emptyCallookCallsign(record.status);
    }
    const currentCallsign = record.current?.callsign;
    if (currentCallsign === undefined || currentCallsign === '') {
      throw new UsSourceParseError(
        CALLOOK_CALLSIGNS_SOURCE_ID,
        'A valid lookup arrived without a current callsign'
      );
    }
    const addressLine2 = record.address?.line2 ?? '';
    return {
      status: record.status,
      callsign: currentCallsign,
      licenseType: record.type ?? '',
      operatorClass: record.current?.operClass ?? '',
      previousCallsign: record.previous?.callsign ?? '',
      previousOperatorClass: record.previous?.operClass ?? '',
      licenseeName: record.name ?? '',
      trusteeCallsign: record.trustee?.callsign ?? '',
      trusteeName: record.trustee?.name ?? '',
      addressLine1: record.address?.line1 ?? '',
      addressLine2,
      attention: record.address?.attn ?? '',
      latitude: toCoordinate(record.location?.latitude),
      longitude: toCoordinate(record.location?.longitude),
      gridsquare: record.location?.gridsquare ?? '',
      grantDate: toIsoDate(record.otherInfo?.grantDate),
      expiryDate: toIsoDate(record.otherInfo?.expiryDate),
      lastActionDate: toIsoDate(record.otherInfo?.lastActionDate),
      frn: record.otherInfo?.frn ?? '',
      ulsUrl: record.otherInfo?.ulsUrl ?? '',
      stateAbbr: toStateAbbr(addressLine2),
      callDistrict: toCallDistrict(currentCallsign),
    };
  });

  return buildCallookCallsignDirectory(callsigns);
}

/**
 * Reads one Callook lookup for each callsign.
 *
 * The service answers one callsign per request and needs no key. When the
 * caller names no callsigns, the adapter reads the ten-district sample.
 *
 * @param options - an optional callsign list and fetch stub
 * @returns the records and the folded counts
 */
export async function fetchCallookCallsigns(options?: {
  callsigns?: readonly string[];
  fetchImpl?: typeof globalThis.fetch;
}): Promise<CallookCallsignDirectory> {
  const callsigns = options?.callsigns ?? CALLOOK_DISTRICT_CALLSIGNS;
  if (callsigns.length === 0) {
    throw new UsSourceParseError(CALLOOK_CALLSIGNS_SOURCE_ID, 'No callsigns were requested');
  }
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const payloads = await Promise.all(
    callsigns.map(async (callsign) => {
      const response = await httpGet(
        CALLOOK_CALLSIGNS_SOURCE_ID,
        buildCallookCallsignUrl(callsign),
        { fetchImpl }
      );
      return (await response.json()) as unknown;
    })
  );
  return parseCallookCallsignsPayload(payloads);
}

/** Callook.info US amateur radio callsigns, one record per lookup, keyless. */
export const callookCallsignsAdapter: UsDataAdapter<CallookCallsignDirectory> = {
  id: CALLOOK_CALLSIGNS_SOURCE_ID,
  name: 'Callook callsigns',
  auth: 'none',
  description:
    'US amateur radio callsign records from the FCC licence file, looked up through Callook.info, with the licence class, address, location, and expiry for each callsign.',
  fetchLive: async (options) =>
    fetchCallookCallsigns(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  parse: (payload) => parseCallookCallsignsPayload(payload),
  loadFixture: () =>
    parseCallookCallsignsPayload(readFixtureJson(CALLOOK_CALLSIGNS_FIXTURE_FILENAME)),
};
