import { parseArgs } from 'node:util';

import {
  getUsDataSource,
  probeUsDataSource,
  US_DATA_SOURCES,
} from '@open-data-connectors/usa-sources';

/** Where the CLI writes its output. Injectable for tests. */
export interface CliOutput {
  writeOut(line: string): void;
  writeErr(line: string): void;
}

/** Optional overrides so tests can stub network calls. */
export interface CliDependencies {
  probeSource?: typeof probeUsDataSource;
}

/** Help text shown by `usdata help` and on unknown commands. */
export const HELP_TEXT = `usdata - US open data connectors

Usage:
  usdata sources                          List every data source adapter
  usdata probe <id>                       Live probe one source
                                          (e.g. bls-unemployment-rate)
  usdata help                             Show this help

Options:
  -h, --help            Show help

Every adapter is keyless. Output goes to stdout as JSON; errors go to stderr.`;

/** Runs one CLI invocation and returns the process exit code. */
export async function runCli(
  args: string[],
  output: CliOutput,
  deps: CliDependencies = {}
): Promise<number> {
  try {
    const { positionals, values } = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    });

    if (values.help === true || positionals[0] === undefined || positionals[0] === 'help') {
      output.writeOut(HELP_TEXT);
      return 0;
    }

    const command = positionals[0];
    const probeSource = deps.probeSource ?? probeUsDataSource;

    if (command === 'sources') {
      const sources = US_DATA_SOURCES.map((source) => ({
        id: source.id,
        name: source.name,
        auth: source.auth,
        description: source.description,
      }));
      output.writeOut(JSON.stringify(sources, null, 2));
      return 0;
    }

    if (command === 'probe') {
      const id = positionals[1];
      if (id === undefined) {
        output.writeErr('Usage: usdata probe <id>');
        return 1;
      }
      const adapter = getUsDataSource(id);
      if (adapter === undefined) {
        output.writeErr(`Unknown source: ${id}`);
        return 1;
      }
      const probe = await probeSource(adapter);
      output.writeOut(JSON.stringify(probe, null, 2));
      return probe.ok ? 0 : 1;
    }

    output.writeErr(`Unknown command: ${command}\n\n${HELP_TEXT}`);
    return 1;
  } catch (error) {
    output.writeErr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
