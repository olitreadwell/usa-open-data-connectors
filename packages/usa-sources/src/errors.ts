/** Base error for any US data source client in this package. */
export class UsSourceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UsSourceError';
  }
}

/** Extra detail carried by an API error. */
export interface UsSourceApiErrorDetails extends ErrorOptions {
  /** HTTP status code, when the failure arrived as a response. */
  status?: number | undefined;
  /** Whether retrying the same request could succeed. */
  retryable?: boolean | undefined;
}

/** The remote API rejected the request (HTTP error or bad payload). */
export class UsSourceApiError extends UsSourceError {
  /** HTTP status code, when the failure arrived as a response. */
  readonly status: number | undefined;
  /** Whether retrying the same request could succeed. */
  readonly retryable: boolean;

  constructor(source: string, message: string, details: UsSourceApiErrorDetails = {}) {
    super(`${source}: ${message}`, details);
    this.name = 'UsSourceApiError';
    this.status = details.status;
    this.retryable = details.retryable ?? false;
  }
}

/** The remote payload did not match the expected shape. */
export class UsSourceParseError extends UsSourceError {
  constructor(
    public readonly source: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${source}: ${message}`, options);
    this.name = 'UsSourceParseError';
  }
}
