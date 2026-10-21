import { describe, expect, it, vi } from 'vitest';

import { UsSourceApiError, UsSourceParseError } from './errors.js';
import {
  buildPublicDataHubHospitalUrl,
  fetchPublicDataHubHospital,
  getPublicDataHubMeasure,
  parsePublicDataHubHospitalPayload,
  PUBLICDATAHUB_DEFAULT_HOSPITAL_SLUG,
  PUBLICDATAHUB_HOSPITAL_SOURCE_ID,
  publicDataHubHospitalAdapter,
} from './publicDataHubHospital.js';

/** A small export payload with the same shape as the live response. */
function buildSamplePayload(): Record<string, unknown> {
  return {
    id: 'cms-ccn:240010',
    slug: 'mayo-clinic-hospital-rochester',
    name: 'Mayo Clinic Hospital Rochester',
    entity_type: 'hospital',
    hospital_type: 'Acute Care Hospitals',
    ownership: 'Voluntary non-profit - Church',
    emergency_services: 'Yes',
    cms_ccn: '240010',
    address: {
      street: '1216 Second Street Southwest',
      city: 'Rochester',
      state: 'MN',
      zip: '55902',
      county: 'Olmsted County',
      county_geoid: '27109',
    },
    phone: '(507) 255-5123',
    website: null,
    quality_score: 1,
    measures: [
      {
        key: 'overall_rating',
        label: 'Overall rating',
        period: '2026',
        value: 5,
        unit: 'of 5',
        national_rank: 1,
        tied_with: 384,
        definition: 'A five-star rating.',
      },
      {
        key: 'measures_reported',
        label: 'Measures reported',
        period: '2026',
        value: 51,
        unit: 'measures',
        national_rank: 71,
        tied_with: 178,
        definition: 'How many measures the hospital reported.',
      },
      {
        key: 'measures_better',
        label: 'Measures better than national',
        period: '2026',
        value: 16,
        unit: 'measures',
        national_rank: 2,
        tied_with: 1,
        definition: 'How many measures beat the national rate.',
      },
      {
        key: 'measures_worse',
        label: 'Measures worse than national',
        period: '2026',
        value: 0,
        unit: 'measures',
        national_rank: 1,
        tied_with: 2223,
        definition: 'How many measures fell below the national rate.',
      },
    ],
    provenance: {
      source: 'Hospital General Information',
      agency: 'Centers for Medicare & Medicaid Services',
      dataset_url: 'https://data.cms.gov/provider-data/dataset/xubh-q36u',
      licence: 'U.S. Public Domain',
      licence_url: 'https://www.usa.gov/government-works',
      data_as_of: '2026-08-27',
      version_id: 'cms-hospital-general-info@2026-07-22',
      retrieved_from: 'https://publicdatahub.org/hospital/mayo-clinic-hospital-rochester',
    },
  };
}

describe('parsePublicDataHubHospitalPayload', () => {
  it('reads the hospital record and its headline quality counts', () => {
    const report = parsePublicDataHubHospitalPayload(buildSamplePayload());

    expect(report.hospital.id).toBe('cms-ccn:240010');
    expect(report.hospital.name).toBe('Mayo Clinic Hospital Rochester');
    expect(report.hospital.address).toEqual({
      street: '1216 Second Street Southwest',
      city: 'Rochester',
      state: 'MN',
      zip: '55902',
      county: 'Olmsted County',
      countyGeoid: '27109',
    });
    expect(report.hospital.website).toBe('');
    expect(report.measureCount).toBe(4);
    expect(report.reportedMeasureCount).toBe(4);
    expect(report.overallRating).toBe(5);
    expect(report.betterThanNationalCount).toBe(16);
    expect(report.worseThanNationalCount).toBe(0);
    expect(report.dataAsOf).toBe('2026-08-27');
    expect(report.agency).toBe('Centers for Medicare & Medicaid Services');
    expect(report.licence).toBe('U.S. Public Domain');
  });

  it('keeps a null measure value as null rather than zero', () => {
    const payload = buildSamplePayload();
    const measures = payload.measures as Record<string, unknown>[];
    const first = measures[0];
    if (first !== undefined) {
      first.value = null;
    }

    const report = parsePublicDataHubHospitalPayload(payload);

    expect(report.hospital.measures[0]?.value).toBeNull();
    expect(report.reportedMeasureCount).toBe(3);
  });

  it('accepts a text measure value without inventing a number', () => {
    const payload = buildSamplePayload();
    const measures = payload.measures as Record<string, unknown>[];
    const first = measures[0];
    if (first !== undefined) {
      first.value = 'Not available';
    }

    const report = parsePublicDataHubHospitalPayload(payload);

    expect(report.hospital.measures[0]?.value).toBe('Not available');
    expect(report.overallRating).toBeNull();
  });

  it('normalises an absent address and optional strings', () => {
    const payload = buildSamplePayload();
    delete payload.address;
    payload.website = null;
    delete payload.phone;

    const report = parsePublicDataHubHospitalPayload(payload);

    expect(report.hospital.address).toEqual({
      street: '',
      city: '',
      state: '',
      zip: '',
      county: '',
      countyGeoid: '',
    });
    expect(report.hospital.phone).toBe('');
    expect(report.hospital.website).toBe('');
  });

  it('stops when the measure list is missing', () => {
    const payload = buildSamplePayload();
    delete payload.measures;

    expect(() => parsePublicDataHubHospitalPayload(payload)).toThrow(UsSourceParseError);
  });

  it('stops when the provenance block is missing', () => {
    const payload = buildSamplePayload();
    delete payload.provenance;

    expect(() => parsePublicDataHubHospitalPayload(payload)).toThrow(UsSourceParseError);
  });

  it('stops when the hospital name is missing', () => {
    const payload = buildSamplePayload();
    delete payload.name;

    expect(() => parsePublicDataHubHospitalPayload(payload)).toThrow(UsSourceParseError);
  });
});

describe('getPublicDataHubMeasure', () => {
  it('finds a measure by key and returns undefined for a missing one', () => {
    const report = parsePublicDataHubHospitalPayload(buildSamplePayload());

    expect(getPublicDataHubMeasure(report.hospital, 'overall_rating')?.label).toBe(
      'Overall rating'
    );
    expect(getPublicDataHubMeasure(report.hospital, 'not_a_measure')).toBeUndefined();
  });
});

describe('buildPublicDataHubHospitalUrl', () => {
  it('builds the export URL for one slug', () => {
    expect(buildPublicDataHubHospitalUrl('mayo-clinic-hospital-rochester')).toBe(
      'https://publicdatahub.org/api/export/hospital/mayo-clinic-hospital-rochester.json'
    );
  });

  it('encodes a slug with unexpected characters', () => {
    expect(buildPublicDataHubHospitalUrl('a hospital')).toBe(
      'https://publicdatahub.org/api/export/hospital/a%20hospital.json'
    );
  });
});

describe('fetchPublicDataHubHospital', () => {
  it('fetches the default hospital and parses the response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(buildSamplePayload()), { status: 200 }));

    const report = await fetchPublicDataHubHospital({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://publicdatahub.org/api/export/hospital/${PUBLICDATAHUB_DEFAULT_HOSPITAL_SLUG}.json`,
      expect.anything()
    );
    expect(report.hospital.name).toBe('Mayo Clinic Hospital Rochester');
  });

  it('fetches a named hospital when a slug is given', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(buildSamplePayload()), { status: 200 }));

    await fetchPublicDataHubHospital({ slug: 'cleveland-clinic', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://publicdatahub.org/api/export/hospital/cleveland-clinic.json',
      expect.anything()
    );
  });

  it('reports a refusing host as an API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));

    await expect(fetchPublicDataHubHospital({ fetchImpl })).rejects.toThrow(UsSourceApiError);
  });
});

describe('publicDataHubHospitalAdapter', () => {
  it('registers as a keyless source', () => {
    expect(publicDataHubHospitalAdapter.id).toBe(PUBLICDATAHUB_HOSPITAL_SOURCE_ID);
    expect(publicDataHubHospitalAdapter.auth).toBe('none');
    expect(publicDataHubHospitalAdapter.description).toContain('PublicDataHub');
  });

  it('parses a payload through the adapter surface', () => {
    expect(publicDataHubHospitalAdapter.parse(buildSamplePayload()).measureCount).toBe(4);
  });

  it('reads the committed fixture', () => {
    const report = publicDataHubHospitalAdapter.loadFixture();

    expect(report.hospital.slug).toBe(PUBLICDATAHUB_DEFAULT_HOSPITAL_SLUG);
    expect(report.hospital.name).toBe('Mayo Clinic Hospital Rochester');
    expect(report.measureCount).toBe(7);
    expect(report.overallRating).toBe(5);
  });
});
