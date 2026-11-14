#!/usr/bin/env node
// Generates public/llms.txt from the repo itself: the route tree, the API
// routes, and the docs folder. A hand-written llms.txt drifts the first time
// someone adds a page; a generated one cannot, because `--check` fails the
// build when the committed file and the tree disagree.
//
// Usage:
//   node scripts/generate-llms-txt.mjs           # write public/llms.txt
//   node scripts/generate-llms-txt.mjs --check   # fail when it is out of date
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const checkOnly = process.argv.includes('--check');
const REPO_ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_PATH = join(REPO_ROOT, 'public', 'llms.txt');

/**
 * Turn a path segment into a readable label.
 *
 * @param {string} segment - URL segment such as "getting-started"
 * @returns {string} Title-cased words, e.g. "Getting Started"
 */
function humaniseSegment(segment) {
  return segment
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Find route files under a directory, skipping groups, private folders and
 * dynamic segments, since neither belongs in a static index for crawlers.
 *
 * @param {string} directory - Directory to walk
 * @param {string[]} filename - File name that marks a route, e.g. "page.tsx"
 * @returns {Promise<string[]>} Route paths, sorted
 */
async function collectRoutePaths(directory, filename) {
  const routes = [];

  async function walk(current, segments) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_') || entry.name.startsWith('(')) continue;
        if (entry.name.startsWith('[')) continue;
        await walk(join(current, entry.name), [...segments, entry.name]);
        continue;
      }
      if (entry.name === filename) {
        routes.push(`/${segments.join('/')}`.replace(/\/$/, '') || '/');
      }
    }
  }

  await walk(directory, []);
  return routes.sort();
}

/**
 * Read a metadata title out of a layout when one is written as a plain string.
 *
 * @param {string} filePath - Path to the layout file
 * @returns {Promise<string | null>} The title, or null when it cannot be read
 */
async function readLayoutTitle(filePath) {
  try {
    const source = await readFile(filePath, 'utf8');
    const match = source.match(/title:\s*'([^']+)'/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Build the llms.txt document.
 *
 * @returns {Promise<string>} The file contents, ending in a newline
 */
async function buildDocument() {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  const siteTitle =
    (await readLayoutTitle(join(REPO_ROOT, 'src', 'app', 'layout.tsx'))) ??
    humaniseSegment(pkg.name ?? 'app');

  const pages = await collectRoutePaths(join(REPO_ROOT, 'src', 'app'), 'page.tsx');
  const apis = (await collectRoutePaths(join(REPO_ROOT, 'src', 'app', 'api'), 'route.ts')).map(
    (route) => (route === '/' ? '/api' : `/api${route}`)
  );
  const docs = (await readdir(join(REPO_ROOT, 'docs'), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();

  const documentedElsewhere = new Set(['/api/openapi.json']);
  const apiLines = [
    ...apis
      .filter((route) => !documentedElsewhere.has(route))
      .map((route) => `- [${humaniseSegment(route.replace('/api/', ''))}](${route})`),
    '- [OpenAPI document](/api/openapi.json)',
    '- [Health check](/health)',
  ];

  const lines = [
    `# ${siteTitle}`,
    '',
    `> ${pkg.description ?? ''}`.trimEnd(),
    '',
    '## Pages',
    '',
    ...pages.map(
      (route) => `- [${route === '/' ? 'Home' : humaniseSegment(route.slice(1))}](${route})`
    ),
    '',
    '## APIs',
    '',
    ...[...new Set(apiLines)],
    '',
    '## Documentation',
    '',
    // Plain paths, not links: llms.txt is served from the site root, and the
    // docs folder is not published, so a link here would be a lie.
    ...docs.map((name) => `- docs/${name}`),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

async function main() {
  const generated = await buildDocument();

  if (checkOnly) {
    const committed = await readFile(OUTPUT_PATH, 'utf8').catch(() => null);
    if (committed !== generated) {
      console.error('public/llms.txt is out of date. Run: node scripts/generate-llms-txt.mjs');
      process.exitCode = 1;
    }
    return;
  }

  await writeFile(OUTPUT_PATH, generated, 'utf8');
  console.log(`wrote public/llms.txt (${generated.length} bytes)`);
}

await main();
