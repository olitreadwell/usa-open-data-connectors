/** What a US source needs before it will answer a request. */
export type UsSourceAuth = 'none' | 'key';

/** Options shared by every adapter's live fetch. */
export interface UsFetchOptions {
  apiKey?: string;
  fetchImpl?: typeof globalThis.fetch;
}

/** Licence and attribution metadata for one registered US source adapter. */
export interface UsSourceMetadata {
  /** Licence or terms statement for the source as a whole. */
  licence: string;
  /** Publisher to credit when the data is reused. */
  attribution: string;
}

/**
 * One US data source behind a uniform interface: a live fetch, a strict
 * parse, and a committed fixture for tests. A live fetch never falls back
 * to the fixture.
 */
export interface UsDataAdapter<T> {
  readonly id: string;
  readonly name: string;
  readonly auth: UsSourceAuth;
  readonly description: string;
  fetchLive(options?: UsFetchOptions): Promise<T>;
  parse(payload: unknown): T;
  loadFixture(): T;
}

/** Result of a live verification probe against one source. */
export interface UsSourceProbe {
  id: string;
  name: string;
  auth: UsSourceAuth;
  ok: boolean;
  status: string;
  sample?: string;
}
