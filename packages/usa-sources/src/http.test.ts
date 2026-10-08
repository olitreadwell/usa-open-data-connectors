import { describe, expect, it } from 'vitest';

import { UsSourceApiError } from './errors.js';
import { DEFAULT_TIMEOUT_MS, httpGet, USER_AGENT } from './http.js';

/** A fetch stub that records the init it was called with. */
function recordingFetch(response: () => Response): {
  impl: typeof globalThis.fetch;
  calls: RequestInit[];
} {
  const calls: RequestInit[] = [];
  const impl: typeof globalThis.fetch = async (_input, init) => {
    calls.push(init ?? {});
    return response();
  };
  return { impl, calls };
}

/** Headers from the first recorded call, as a plain lookup map. */
function headersOf(calls: RequestInit[]): Record<string, string> {
  return (calls[0]?.headers ?? {}) as Record<string, string>;
}

const URL_UNDER_TEST = 'https://example.govt.nz/api';

describe('httpGet', () => {
  it('identifies the client with a user agent', async () => {
    const { impl, calls } = recordingFetch(() => new Response('{}', { status: 200 }));
    await httpGet('Test source', URL_UNDER_TEST, { fetchImpl: impl });
    expect(headersOf(calls)['user-agent']).toBe(USER_AGENT);
  });

  it('merges caller headers over the defaults', async () => {
    const { impl, calls } = recordingFetch(() => new Response('{}', { status: 200 }));
    await httpGet('Test source', URL_UNDER_TEST, {
      fetchImpl: impl,
      headers: { Accept: 'application/json' },
    });
    const headers = headersOf(calls);
    expect(headers['user-agent']).toBe(USER_AGENT);
    expect(headers.Accept).toBe('application/json');
  });

  it('returns the response when the status is ok', async () => {
    const { impl } = recordingFetch(() => new Response('hello', { status: 200 }));
    const response = await httpGet('Test source', URL_UNDER_TEST, { fetchImpl: impl });
    expect(await response.text()).toBe('hello');
  });

  it('reports a 404 as not retryable, with the status', async () => {
    const { impl } = recordingFetch(() => new Response('gone', { status: 404 }));
    const failure = await httpGet('Test source', URL_UNDER_TEST, { fetchImpl: impl }).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(UsSourceApiError);
    expect((failure as UsSourceApiError).status).toBe(404);
    expect((failure as UsSourceApiError).retryable).toBe(false);
    expect((failure as UsSourceApiError).message).toBe('Test source: HTTP 404');
  });

  it('reports a 429 as retryable', async () => {
    const { impl } = recordingFetch(() => new Response('slow down', { status: 429 }));
    const failure = await httpGet('Test source', URL_UNDER_TEST, { fetchImpl: impl }).catch(
      (error: unknown) => error
    );
    expect((failure as UsSourceApiError).status).toBe(429);
    expect((failure as UsSourceApiError).retryable).toBe(true);
  });

  it('reports a 503 as retryable', async () => {
    const { impl } = recordingFetch(() => new Response('later', { status: 503 }));
    const failure = await httpGet('Test source', URL_UNDER_TEST, { fetchImpl: impl }).catch(
      (error: unknown) => error
    );
    expect((failure as UsSourceApiError).retryable).toBe(true);
  });

  it('reports a network failure as retryable', async () => {
    const impl: typeof globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const failure = await httpGet('Test source', URL_UNDER_TEST, { fetchImpl: impl }).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(UsSourceApiError);
    expect((failure as UsSourceApiError).retryable).toBe(true);
  });

  it('aborts a request that outlives the timeout', async () => {
    const hangingFetch: typeof globalThis.fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const failure = await httpGet('Test source', URL_UNDER_TEST, {
      fetchImpl: hangingFetch,
      timeoutMs: 10,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UsSourceApiError);
    expect((failure as UsSourceApiError).message).toBe('Test source: request timed out after 10ms');
    expect((failure as UsSourceApiError).retryable).toBe(true);
  });

  it('defaults the timeout to 30 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });
});
