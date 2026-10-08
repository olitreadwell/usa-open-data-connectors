import { UsSourceApiError } from './errors.js';

/**
 * Identifies this client to the public APIs it calls.
 *
 * Several US government endpoints ask callers to identify themselves, and the
 * National Weather Service and SEC reject anonymous callers outright, so every
 * adapter sends this. The string carries no version, so it cannot go stale
 * between releases. Where a source asks for more detail (the SEC wants a
 * contact address, for example) the adapter adds its own header on top.
 */
export const USER_AGENT = 'usa-open-data-connectors (Language=TypeScript)';

/** Per-request timeout in milliseconds, applied to every adapter. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** The one status code worth retrying: the server is asking us to slow down. */
const HTTP_TOO_MANY_REQUESTS = 429;

/** The lowest status code that means the server failed rather than the request. */
const HTTP_INTERNAL_SERVER_ERROR = 500;

/** Options shared by the shared HTTP helpers. */
export interface HttpGetOptions {
  /** Fetch implementation override, used by tests. */
  fetchImpl?: typeof globalThis.fetch | undefined;
  /** Extra request headers, merged over the defaults. */
  headers?: Record<string, string> | undefined;
  /** Overrides {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number | undefined;
}

/**
 * Builds the request headers, letting a caller replace the User-Agent.
 *
 * Most adapters send only the default identity. A few sources (the SEC and
 * the National Weather Service, for example) ask for a more descriptive
 * User-Agent of their own, and that one wins. Other headers merge over the
 * defaults.
 *
 * @param extra - Headers supplied by the adapter.
 * @returns The headers for one request.
 */
function buildRequestHeaders(extra: Record<string, string> | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'user-agent': USER_AGENT };
  for (const [name, value] of Object.entries(extra ?? {})) {
    if (name.toLowerCase() === 'user-agent') {
      headers['user-agent'] = value;
    } else {
      headers[name] = value;
    }
  }
  return headers;
}

/**
 * Issues a GET through the shared HTTP layer.
 *
 * Every adapter goes through here so that three things happen the same way
 * for all 22 sources: a `user-agent` identifies the client, a timeout aborts
 * a request that hangs, and a failure carries whether retrying is worthwhile.
 *
 * @param source - Source name used in the error message, e.g. "bls".
 * @param url - Absolute URL or URL object to fetch.
 * @param options - Fetch override, extra headers, and timeout.
 * @returns The response, already checked for a successful status.
 * @throws {UsSourceApiError} On a non-2xx status, an abort, or a network error.
 */
export async function httpGet(
  source: string,
  url: string | URL,
  options: HttpGetOptions = {}
): Promise<Response> {
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await doFetch(url, {
      headers: buildRequestHeaders(options.headers),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new UsSourceApiError(source, `request timed out after ${timeoutMs}ms`, {
        retryable: true,
      });
    }
    throw new UsSourceApiError(source, `request failed: ${String(error)}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new UsSourceApiError(source, `HTTP ${response.status}`, {
      status: response.status,
      retryable:
        response.status === HTTP_TOO_MANY_REQUESTS || response.status >= HTTP_INTERNAL_SERVER_ERROR,
    });
  }
  return response;
}
