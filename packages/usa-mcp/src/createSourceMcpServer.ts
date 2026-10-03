import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';

/** One source in the registry, in the shape a model needs to pick from. */
export interface SourceSummary {
  id: string;
  name: string;
  auth: string;
  description: string;
}

/** Outcome of one live probe against a source. */
export interface SourceProbeResult {
  id: string;
  name: string;
  auth: string;
  ok: boolean;
  status: string;
  sample?: string;
  error?: string;
}

/**
 * A country-specific tool that wraps one named function in the connector
 * library, so the model gets the function's real parameters instead of the
 * adapter interface's no-argument `fetchLive()`.
 */
export interface SourceQueryTool {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Everything the generic server needs to know about one country's library. */
export interface SourceMcpConfig {
  serverName: string;
  serverVersion: string;
  listSources: () => SourceSummary[];
  probeSources: (ids?: string[]) => Promise<SourceProbeResult[]>;
  fetchSource: (id: string, options?: { apiKey?: string }) => Promise<unknown>;
  queryTools: SourceQueryTool[];
}

/**
 * Renders BigInt as its decimal string, because `JSON.stringify` throws on it.
 *
 * @param _key - the object key, unused
 * @param value - the value being stringified
 * @returns the value, or its decimal string when it is a BigInt
 */
function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * JSON text for a tool result. Falls back to a fixed marker for values that
 * `JSON.stringify` refuses (circular graphs, functions), so a single odd
 * payload never turns into an MCP protocol error.
 *
 * @param value - the value a tool returned
 * @returns pretty-printed JSON, `null` for undefined, or a marker
 */
function toJsonText(value: unknown): string {
  if (value === undefined) return 'null';
  try {
    return JSON.stringify(value, bigIntReplacer, 2) ?? '[unserialisable value]';
  } catch {
    return '[unserialisable value]';
  }
}

/**
 * Message text for a thrown value. Errors come first because
 * `JSON.stringify(new Error(...))` is `"{}"`: an Error's own properties are
 * not enumerable.
 *
 * @param error - whatever the tool threw
 * @returns the Error message, the thrown string as-is, or its JSON text
 */
function describeThrown(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : toJsonText(error);
}

/**
 * Wraps a tool return value in the MCP text-content envelope.
 *
 * @param value - the value a tool returned
 * @returns the MCP tool result carrying that value as JSON text
 */
function toTextResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: toJsonText(value) }] };
}

/**
 * Turns a thrown value into an MCP error result without leaking a stack.
 *
 * @param error - whatever the tool threw
 * @returns the MCP tool result flagged as an error
 */
function toErrorResult(error: unknown): CallToolResult {
  return { content: [{ type: 'text', text: describeThrown(error) }], isError: true };
}

/**
 * Builds the MCP server for one country: the registry, a live probe, a generic
 * adapter fetch, and every query tool the country's library can answer.
 *
 * @param config - the country's registry access and tool table
 * @returns a connected-ready MCP server over stdio
 */
export function createSourceMcpServer(config: SourceMcpConfig): McpServer {
  const server = new McpServer({ name: config.serverName, version: config.serverVersion });

  server.registerTool(
    'list_sources',
    {
      title: 'List data sources',
      description:
        "Lists every source in this country's open data connector library, with the id to pass to the other tools, whether it needs a key, and what it returns.",
      inputSchema: {},
    },
    () => toTextResult(config.listSources())
  );

  server.registerTool(
    'probe_sources',
    {
      title: 'Probe data sources',
      description:
        'Runs a live fetch against each source and reports whether it answered. Use this before quoting numbers, because a failing source silently falls back to a stale committed fixture.',
      inputSchema: {
        ids: z
          .array(z.string())
          .optional()
          .describe('Source ids to probe. Omit to probe all of them.'),
      },
    },
    async ({ ids }) => {
      try {
        return toTextResult(await config.probeSources(ids));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'fetch_source',
    {
      title: 'Fetch a data source',
      description:
        'Fetches one source through its adapter and returns the parsed data. Sources that need a key return an error unless you pass apiKey.',
      inputSchema: {
        id: z.string().describe('Source id from list_sources.'),
        apiKey: z.string().optional().describe('API key, for sources whose auth is "key".'),
      },
    },
    async ({ id, apiKey }) => {
      try {
        return toTextResult(
          await config.fetchSource(id, apiKey === undefined ? undefined : { apiKey })
        );
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  for (const tool of config.queryTools) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        try {
          return toTextResult(await tool.run(args ?? {}));
        } catch (error) {
          return toErrorResult(error);
        }
      }
    );
  }

  return server;
}
