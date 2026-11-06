import { describe, expect, it } from 'vitest';

import { parseSocrataCatalogueMetadata } from './socrataCatalogueMetadata.js';

describe('parseSocrataCatalogueMetadata', () => {
  it('reads the licence URL and publisher from the portal metadata', () => {
    expect(
      parseSocrataCatalogueMetadata({
        custom_fields: {
          'Common Core': {
            License: 'http://opendefinition.org/licenses/odc-odbl/',
            Publisher: 'National Library of Medicine',
          },
        },
      })
    ).toEqual({
      licenceUrl: 'http://opendefinition.org/licenses/odc-odbl/',
      attribution: 'National Library of Medicine',
    });
  });

  it('falls back to the newer Common Core 3 group', () => {
    expect(
      parseSocrataCatalogueMetadata({
        custom_fields: {
          'Common Core 3': {
            Publisher: 'Bureau of Transportation Statistics',
          },
        },
      })
    ).toEqual({ licenceUrl: '', attribution: 'Bureau of Transportation Statistics' });
  });

  it('returns empty strings when the entry supplies no metadata', () => {
    expect(parseSocrataCatalogueMetadata(undefined)).toEqual({
      licenceUrl: '',
      attribution: '',
    });
    expect(parseSocrataCatalogueMetadata({ custom_fields: null })).toEqual({
      licenceUrl: '',
      attribution: '',
    });
  });
});
