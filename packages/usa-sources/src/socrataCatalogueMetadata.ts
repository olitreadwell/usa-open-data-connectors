import { z } from 'zod';

/** Source-supplied licence and attribution metadata for one Socrata entry. */
export interface SocrataCatalogueMetadata {
  /** Licence URL the portal attaches to the entry, or "" when it supplies none. */
  licenceUrl: string;
  /** Publishing organisation the portal attaches to the entry, or "" when it supplies none. */
  attribution: string;
}

const SOCRATA_CATALOGUE_METADATA_SCHEMA = z
  .object({
    custom_fields: z.record(z.string(), z.record(z.string(), z.unknown())).nullable().optional(),
  })
  .nullable()
  .optional();

/**
 * Reads one string field from the portal's Common Core metadata groups.
 *
 * @param groups - the portal's custom field groups
 * @param key - the source field name, such as License or Publisher
 * @returns the trimmed value, or "" when the source did not supply a string
 */
function readCommonCoreText(groups: Record<string, Record<string, unknown>>, key: string): string {
  const value = groups['Common Core']?.[key] ?? groups['Common Core 3']?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reads the licence and attribution values Socrata attaches to a catalogue entry.
 *
 * Portals use "Common Core" for older entries and "Common Core 3" for newer
 * ones. A missing or malformed block returns empty strings, because the portal
 * did not supply the value rather than the adapter knowing better.
 *
 * @param metadata - the entry's Socrata metadata block
 * @returns the source-supplied licence URL and publisher
 */
export function parseSocrataCatalogueMetadata(metadata: unknown): SocrataCatalogueMetadata {
  const parsed = SOCRATA_CATALOGUE_METADATA_SCHEMA.safeParse(metadata);
  if (!parsed.success || parsed.data?.custom_fields == null) {
    return { licenceUrl: '', attribution: '' };
  }
  const groups = parsed.data.custom_fields;
  return {
    licenceUrl: readCommonCoreText(groups, 'License'),
    attribution: readCommonCoreText(groups, 'Publisher'),
  };
}
