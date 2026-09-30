/** OpenAPI 3.0 document for the connectors API. Served at /openapi.json. */
export const OPEN_API_DOCUMENT = {
  openapi: '3.0.3',
  info: {
    title: 'USA Open Data Connectors',
    version: '0.1.0',
    description:
      'Language-agnostic HTTP wrapper over US public data connectors. ' +
      'API keys stay server-side; every endpoint works keyless unless noted.',
  },
  paths: {
    '/openapi.json': {
      get: {
        summary: 'OpenAPI specification',
        responses: { '200': { description: 'OpenAPI 3.0 document' } },
      },
    },
    '/docs': {
      get: {
        summary: 'Swagger UI',
        responses: { '200': { description: 'HTML page' } },
      },
    },
    '/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'Service is up' } },
      },
    },
    '/metrics': {
      get: {
        summary: 'Prometheus metrics',
        responses: {
          '200': { description: 'Request counters in Prometheus text format' },
        },
      },
    },
    '/api/sources': {
      get: {
        summary: 'List every data source adapter',
        responses: {
          '200': { description: 'Adapter list' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/sources/{id}/probe': {
      get: {
        summary: 'Live probe one source',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Probe result' },
          '400': { description: 'Missing or invalid source id' },
          '404': { description: 'Unknown source id' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/sources/{id}/data': {
      get: {
        summary: 'Read and parse the live data behind one source',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Parsed payload for that source' },
          '400': { description: 'Missing or invalid source id' },
          '404': { description: 'Unknown source id' },
          '429': { description: 'Rate limit exceeded' },
          '502': { description: 'The upstream source failed' },
        },
      },
    },
  },
} as const;
