import { describe, expect, it } from 'vitest';

import {
  buildCfpComplaintAggregationUrl,
  buildCfpComplaintCountUrl,
  buildCfpComplaintDayUrl,
  buildCfpConsumerComplaintSeries,
  CFPB_COMPLAINT_SEARCH_API_BASE,
  cfpbConsumerComplaintsAdapter,
  fetchCfpConsumerComplaints,
  findNewestCfpComplaintDate,
  parseCfpComplaintAggregations,
  parseCfpComplaintSnapshot,
  parseCfpComplaintTotal,
} from './cfpbConsumerComplaints.js';
import { UsSourceApiError, UsSourceParseError } from './errors.js';

/** A totals-only body in the shape the search API sends. */
function totalPayload(value: number): Record<string, unknown> {
  return { hits: { total: { value, relation: 'eq' }, hits: [] } };
}

/** One aggregation bucket. */
function bucket(key: string, doc_count: number): Record<string, unknown> {
  return { key, doc_count };
}

/** An aggregation body in the nested shape the search API sends. */
function aggregationPayload(input: {
  products: Record<string, unknown>[];
  companies: Record<string, unknown>[];
}): Record<string, unknown> {
  return {
    aggregations: {
      product: { product: { buckets: input.products } },
      company: { company: { buckets: input.companies } },
    },
  };
}

/** Year rows covering a two-year window, enough for a series. */
const YEARS = [
  { year: 2025, complaintCount: 5442963 },
  { year: 2026, complaintCount: 5462631 },
];

describe('buildCfpComplaintCountUrl', () => {
  it('asks for one year of totals with aggregations and rows turned off', () => {
    const params = new URL(buildCfpComplaintCountUrl(2025)).searchParams;
    expect(buildCfpComplaintCountUrl(2025).startsWith(CFPB_COMPLAINT_SEARCH_API_BASE)).toBe(true);
    expect(params.get('size')).toBe('0');
    expect(params.get('no_aggs')).toBe('true');
    expect(params.get('date_received_min')).toBe('2025-01-01');
    expect(params.get('date_received_max')).toBe('2025-12-31');
  });
});

describe('buildCfpComplaintDayUrl', () => {
  it('asks for the same day at both ends of the range', () => {
    const params = new URL(buildCfpComplaintDayUrl('2026-10-02')).searchParams;
    expect(params.get('date_received_min')).toBe('2026-10-02');
    expect(params.get('date_received_max')).toBe('2026-10-02');
    expect(params.get('no_aggs')).toBe('true');
  });
});

describe('buildCfpComplaintAggregationUrl', () => {
  it('asks for the tally request with no date filter', () => {
    expect(buildCfpComplaintAggregationUrl()).toBe(`${CFPB_COMPLAINT_SEARCH_API_BASE}?size=0`);
  });
});

describe('parseCfpComplaintTotal', () => {
  it('reads the total out of a totals-only body', () => {
    expect(parseCfpComplaintTotal(totalPayload(5442963))).toBe(5442963);
  });

  it('rejects a body without a total', () => {
    expect(() => parseCfpComplaintTotal({ hits: {} })).toThrow(UsSourceParseError);
  });
});

describe('parseCfpComplaintAggregations', () => {
  it('reads the nested product and company buckets', () => {
    const parsed = parseCfpComplaintAggregations(
      aggregationPayload({
        products: [bucket('Credit reporting', 12555681)],
        companies: [bucket('TRANSUNION INTERMEDIATE HOLDINGS, INC.', 5015681)],
      })
    );
    expect(parsed.topProducts[0]).toEqual({
      product: 'Credit reporting',
      complaintCount: 12555681,
    });
    expect(parsed.topCompanies[0]).toEqual({
      company: 'TRANSUNION INTERMEDIATE HOLDINGS, INC.',
      complaintCount: 5015681,
    });
  });

  it('drops an empty bucket', () => {
    const parsed = parseCfpComplaintAggregations(
      aggregationPayload({
        products: [bucket('', 0), bucket('Debt collection', 1204659)],
        companies: [],
      })
    );
    expect(parsed.topProducts).toHaveLength(1);
  });

  it('rejects a body with no aggregations', () => {
    expect(() => parseCfpComplaintAggregations({ hits: {} })).toThrow(UsSourceParseError);
  });
});

describe('buildCfpConsumerComplaintSeries', () => {
  it('sums the window and names the busiest and quietest complete years', () => {
    const series = buildCfpConsumerComplaintSeries({
      firstYear: 2025,
      newestYear: 2026,
      newestReceivedDate: '2026-10-02',
      years: YEARS,
      topProducts: [],
      topCompanies: [],
    });
    expect(series.totalComplaints).toBe(10905594);
    expect(series.completeYearCount).toBe(1);
    expect(series.busiestCompleteYear.year).toBe(2025);
    expect(series.quietestCompleteYear.year).toBe(2025);
  });

  it('rejects a window that does not start where the years start', () => {
    expect(() =>
      buildCfpConsumerComplaintSeries({
        firstYear: 2011,
        newestYear: 2026,
        newestReceivedDate: '2026-10-02',
        years: YEARS,
        topProducts: [],
        topCompanies: [],
      })
    ).toThrow(UsSourceParseError);
  });

  it('rejects a window with only one year', () => {
    expect(() =>
      buildCfpConsumerComplaintSeries({
        firstYear: 2026,
        newestYear: 2026,
        newestReceivedDate: '2026-10-02',
        years: [YEARS[1] ?? { year: 2026, complaintCount: 1 }],
        topProducts: [],
        topCompanies: [],
      })
    ).toThrow(UsSourceParseError);
  });
});

describe('parseCfpComplaintSnapshot', () => {
  it('reads a folded snapshot into the story shape', () => {
    const series = parseCfpComplaintSnapshot({
      exportedAt: '2026-10-03T00:00:00Z',
      firstYear: 2025,
      newestYear: 2026,
      newestReceivedDate: '2026-10-02',
      totalComplaints: 10905594,
      years: YEARS,
      topProducts: [{ product: 'Credit reporting', complaintCount: 12555681 }],
      topCompanies: [
        { company: 'TRANSUNION INTERMEDIATE HOLDINGS, INC.', complaintCount: 5015681 },
      ],
    });
    expect(series.firstYear).toBe(2025);
    expect(series.totalComplaints).toBe(10905594);
    expect(series.topCompanies[0]?.company).toContain('TRANSUNION');
  });

  it('rejects a snapshot without year rows', () => {
    expect(() =>
      parseCfpComplaintSnapshot({
        exportedAt: '2026-10-03T00:00:00Z',
        firstYear: 2011,
        newestYear: 2026,
        newestReceivedDate: '2026-10-02',
        totalComplaints: 1,
        years: [],
        topProducts: [],
        topCompanies: [],
      })
    ).toThrow(UsSourceParseError);
  });
});

describe('findNewestCfpComplaintDate', () => {
  it('stops at the first day with a complaint', async () => {
    const asked: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const date = new URL(String(input)).searchParams.get('date_received_min') ?? '';
      asked.push(date);
      return new Response(JSON.stringify(totalPayload(date === '2026-10-01' ? 6739 : 0)), {
        status: 200,
      });
    }) as unknown as typeof globalThis.fetch;
    const newest = await findNewestCfpComplaintDate(fetchImpl, new Date('2026-10-03T00:00:00Z'));
    expect(newest).toBe('2026-10-01');
    expect(asked).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
  });

  it('throws when no recent day has a complaint', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(totalPayload(0)), {
        status: 200,
      })) as unknown as typeof globalThis.fetch;
    await expect(
      findNewestCfpComplaintDate(fetchImpl, new Date('2026-10-03T00:00:00Z'))
    ).rejects.toThrow(UsSourceApiError);
  });
});

describe('fetchCfpConsumerComplaints', () => {
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    if (!url.searchParams.has('no_aggs')) {
      return new Response(
        JSON.stringify(
          aggregationPayload({
            products: [bucket('Credit reporting', 12555681)],
            companies: [bucket('TRANSUNION INTERMEDIATE HOLDINGS, INC.', 5015681)],
          })
        ),
        { status: 200 }
      );
    }
    const min = url.searchParams.get('date_received_min') ?? '';
    const max = url.searchParams.get('date_received_max') ?? '';
    if (min === max) {
      return new Response(JSON.stringify(totalPayload(min === '2026-10-02' ? 443 : 0)), {
        status: 200,
      });
    }
    const counts: Record<string, number> = { '2025-01-01': 5442963, '2026-01-01': 5462631 };
    return new Response(JSON.stringify(totalPayload(counts[min] ?? 0)), { status: 200 });
  }) as unknown as typeof globalThis.fetch;

  it('reads one request per year plus the tallies', async () => {
    const series = await fetchCfpConsumerComplaints({
      firstYear: 2025,
      newestYear: 2026,
      fetchImpl,
    });
    expect(series.totalComplaints).toBe(10905594);
    expect(series.topCompanies[0]?.complaintCount).toBe(5015681);
    expect(series.newestReceivedDate).toBe('2026-10-02');
  });

  it('throws when a year request fails', async () => {
    const failing = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(
      fetchCfpConsumerComplaints({ firstYear: 2025, newestYear: 2026, fetchImpl: failing })
    ).rejects.toThrow(UsSourceApiError);
  });
});

describe('cfpbConsumerComplaintsAdapter', () => {
  it('describes a keyless source', () => {
    expect(cfpbConsumerComplaintsAdapter.auth).toBe('none');
    expect(cfpbConsumerComplaintsAdapter.id).toBe('cfpb-consumer-complaints');
  });

  it('loads the committed snapshot as a series', () => {
    const series = cfpbConsumerComplaintsAdapter.loadFixture();
    expect(series.firstYear).toBe(2011);
    expect(series.newestYear).toBe(2026);
    expect(series.totalComplaints).toBeGreaterThan(18000000);
  });
});
