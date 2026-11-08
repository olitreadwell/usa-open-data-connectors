#!/usr/bin/env node
// Fails when a total adapter count in the repo's docs disagrees with the registry.
//
// The registry is the source of truth. This reads the built registry because
// `npm run check` builds before it runs this script.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

const REPO_CONFIG = {
  uk: {
    sourcesPackage: 'uk-sources',
    mcpPackage: 'uk-mcp',
    registryExport: 'UK_DATA_SOURCES',
  },
  nz: {
    sourcesPackage: 'nz-sources',
    mcpPackage: 'nz-mcp',
    registryExport: 'NZ_DATA_SOURCES',
  },
  usa: {
    sourcesPackage: 'usa-sources',
    mcpPackage: 'usa-mcp',
    registryExport: 'US_DATA_SOURCES',
  },
};

const UNITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const NUMBER_WORDS = new Map([
  ...UNITS.map((word, value) => [word, value]),
  ...TENS.map((word, index) => [word, (index + 2) * 10]),
]);
const WORD_NUMBERS = [
  ...TENS.flatMap((tens) => UNITS.slice(1, 10).map((unit) => `${tens}[- ]${unit}`)),
  ...TENS,
  ...UNITS,
];
const NUMBER_PATTERN = `(?:[0-9]{1,3}|${WORD_NUMBERS.join('|')})`;
const COUNT_PATTERN = new RegExp(
  `\\b(${NUMBER_PATTERN})\\s+` +
    '(?:(?:keyless|public|open|source|data|country|total|registered|TypeScript|TypeScript-only|New|Zealand|UK|NZ|USA|US)\\s+){0,5}' +
    '(adapters|sources)\\b',
  'gi'
);

const SUBSET_PREFIX = /\b(?:more|other|remaining|earlier|previous|only)\s*$/;
const SUBSET_SUFFIX =
  /^\s*(?:added|ask|copy|copies|return|returns|cover|covers|carry|carries|need|needs|shipped|probed|checked|not\s+(?:yet|carried|ported))\b/;
const PORT_SUFFIX = /^\s*(?:the\s+)?ports?\b/;

/** Reads a file, or returns null when it does not exist. */
function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Returns the 1-based line number of an index in a string. */
function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Lists the README under each package directory. */
function listPackageReadmes(root) {
  const packages = join(root, 'packages');
  if (!existsSync(packages)) return [];
  return readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packages, entry.name, 'README.md'))
    .filter((path) => existsSync(path));
}

/** Lists Markdown docs whose name mentions MCP. */
function listMcpDocs(root) {
  const docs = join(root, 'docs');
  if (!existsSync(docs)) return [];
  return readdirSync(docs, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && /mcp/i.test(entry.name))
    .map((entry) => join(docs, entry.name));
}

/** The doc files that carry a total adapter count. */
export function collectDocPaths(root, country) {
  const config = REPO_CONFIG[country];
  if (config === undefined) {
    throw new Error(`Unknown connector repo "${country}".`);
  }
  const candidates = [
    join(root, 'README.md'),
    join(root, 'COUNTRY.md'),
    join(root, 'AGENTS.md'),
    join(root, 'packages', config.sourcesPackage, 'README.md'),
    join(root, 'packages', config.mcpPackage, 'README.md'),
    ...listPackageReadmes(root),
    ...listMcpDocs(root),
  ];
  return [...new Set(candidates.filter((path) => existsSync(path)))];
}

/** Parses a digit count or an English number word. */
export function parseCount(raw) {
  const normalized = raw.toLowerCase().trim().replace(/-/g, ' ');
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return NUMBER_WORDS.get(parts[0]);
  if (parts.length === 2) {
    const tens = NUMBER_WORDS.get(parts[0]);
    const unit = NUMBER_WORDS.get(parts[1]);
    if (tens !== undefined && tens >= 20 && unit !== undefined && unit > 0 && unit < 10) {
      return tens + unit;
    }
  }
  return undefined;
}

/** True when a count is a subset or a historical claim, not the total. */
function isSubsetClaim(text, index, length) {
  const prefix = text.slice(Math.max(0, index - 50), index).toLowerCase();
  const suffix = text.slice(index + length, index + length + 90).toLowerCase();
  return SUBSET_PREFIX.test(prefix) || SUBSET_SUFFIX.test(suffix) || PORT_SUFFIX.test(suffix);
}

/** Finds total adapter counts that disagree with the registry. */
export function findStaleCounts({ root, country, adapterCount }) {
  const problems = [];
  for (const docPath of collectDocPaths(root, country)) {
    const text = readIfExists(docPath);
    if (text === null) continue;
    for (const match of text.matchAll(COUNT_PATTERN)) {
      const claimed = parseCount(match[1]);
      if (claimed === undefined || claimed === adapterCount) continue;
      if (isSubsetClaim(text, match.index, match[0].length)) continue;
      const lineStart = text.lastIndexOf('\n', match.index) + 1;
      const lineEnd = text.indexOf('\n', match.index);
      problems.push({
        path: relative(root, docPath),
        line: lineNumberAt(text, match.index),
        claimed,
        expected: adapterCount,
        excerpt: text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim(),
      });
    }
  }
  return problems;
}

/** Imports the built registry and returns its adapter count. */
export async function loadAdapterCount({ root, country, registryPath }) {
  const config = REPO_CONFIG[country];
  if (config === undefined) {
    throw new Error(`Unknown connector repo "${country}".`);
  }
  const path = registryPath ?? join(root, 'packages', config.sourcesPackage, 'dist', 'registry.js');
  if (!existsSync(path)) {
    throw new Error(`Registry build not found at ${path}. Run npm run build first.`);
  }
  const module = await import(pathToFileURL(path).href);
  const sources = module[config.registryExport];
  if (!Array.isArray(sources)) {
    throw new Error(
      `Registry export ${config.registryExport} in ${path} is missing or not an array.`
    );
  }
  return sources.length;
}

/** Reads the repo country from its package name. */
export function detectCountry(root) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const prefix = String(packageJson.name ?? '').split('-')[0];
  if (REPO_CONFIG[prefix] === undefined) {
    throw new Error(`Cannot detect a connector country from package name "${packageJson.name}".`);
  }
  return prefix;
}

/** Loads the registry count and checks every tracked doc against it. */
export async function checkDocCounts({ root = REPO_ROOT, country, registryPath } = {}) {
  const detectedCountry = country ?? detectCountry(root);
  const adapterCount = await loadAdapterCount({
    root,
    country: detectedCountry,
    ...(registryPath === undefined ? {} : { registryPath }),
  });
  return {
    adapterCount,
    problems: findStaleCounts({ root, country: detectedCountry, adapterCount }),
  };
}

async function main() {
  try {
    const { adapterCount, problems } = await checkDocCounts();
    if (problems.length > 0) {
      console.error(`Stale adapter count: registry has ${adapterCount}.`);
      for (const problem of problems) {
        console.error(
          `  ${problem.path}:${problem.line}: ${problem.excerpt} (says ${problem.claimed}, expected ${adapterCount})`
        );
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Doc counts match the registry: ${adapterCount} adapters.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
