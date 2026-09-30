import { describe, expect, it } from 'vitest';

import { createMetricsCounter, renderPrometheusMetrics } from './metrics';

describe('createMetricsCounter', () => {
  it('counts requests per method and route', () => {
    const counter = createMetricsCounter();
    counter.increment('GET', '/health');
    counter.increment('GET', '/health');
    counter.increment('POST', '/api/sources');

    expect(counter.snapshot().get('GET /health')).toBe(2);
    expect(counter.snapshot().get('POST /api/sources')).toBe(1);
  });

  it('reset clears every counter', () => {
    const counter = createMetricsCounter();
    counter.increment('GET', '/health');
    counter.reset();

    expect(counter.snapshot().size).toBe(0);
  });

  it('renders Prometheus text format with sorted lines', () => {
    const counter = createMetricsCounter();
    counter.increment('POST', '/api/sources');
    counter.increment('GET', '/health');
    counter.increment('GET', '/health');

    const text = renderPrometheusMetrics(counter);
    expect(text).toBe(
      [
        'usdata_http_requests_total{method="GET",route="/health"} 2',
        'usdata_http_requests_total{method="POST",route="/api/sources"} 1',
        '',
      ].join('\n')
    );
  });
});
