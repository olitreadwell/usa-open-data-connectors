/**
 * Normalizes an optional API key read from configuration or a caller.
 *
 * No US source needs a key today, but the adapter interface accepts one, and a
 * key that is set but empty must not reach a request as an empty parameter or
 * header.
 *
 * @param key - The raw key, or undefined when unset.
 * @returns The trimmed key, or undefined when it is blank.
 */
export function normalizeSourceApiKey(key: string | undefined): string | undefined {
  const trimmed = key?.trim();
  if (trimmed === undefined || trimmed === '') {
    return undefined;
  }
  return trimmed;
}
