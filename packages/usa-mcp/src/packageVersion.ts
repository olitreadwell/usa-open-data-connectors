import { readFileSync } from 'node:fs';

/**
 * Reads this package's version from its `package.json`.
 *
 * The MCP handshake and the npm package must never disagree, so the version
 * is read rather than copied into a constant that can drift.
 *
 * @returns the `version` field from the package manifest
 */
export function readPackageVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { version?: unknown };
  if (typeof manifest.version !== 'string') {
    throw new Error('package.json has no version string');
  }
  return manifest.version;
}
