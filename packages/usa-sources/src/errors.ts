/** Base error for any US data source client in this package. */
export class UsSourceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UsSourceError';
  }
}

/** The remote API rejected the request (HTTP error or bad payload). */
export class UsSourceApiError extends UsSourceError {
  constructor(
    public readonly source: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${source}: ${message}`, options);
    this.name = 'UsSourceApiError';
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
