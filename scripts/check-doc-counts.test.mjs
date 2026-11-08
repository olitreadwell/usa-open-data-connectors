import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { checkDocCounts, loadAdapterCount, parseCount } from './check-doc-counts.mjs';

async function withRepo(run) {
  const root = mkdtempSync(join(tmpdir(), 'check-doc-counts-'));
  try {
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeFile(root, path, contents) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
}

function writeRegistry(root, count) {
  writeFile(
    root,
    'packages/uk-sources/dist/registry.js',
    `export const UK_DATA_SOURCES = ${JSON.stringify(
      Array.from({ length: count }, (_, index) => ({ id: `source-${index}` }))
    )};\n`
  );
}

test('parses digit and word counts', () => {
  assert.equal(parseCount('29'), 29);
  assert.equal(parseCount('Sixteen'), 16);
  assert.equal(parseCount('Twenty-five'), 25);
  assert.equal(parseCount('twenty five'), 25);
  assert.equal(parseCount('dozens'), undefined);
});

test('derives the adapter count from the registry export', async () => {
  await withRepo(async (root) => {
    writeRegistry(root, 23);
    assert.equal(await loadAdapterCount({ root, country: 'uk' }), 23);
  });
});

test('flags a stale count in every tracked doc kind', async () => {
  await withRepo(async (root) => {
    writeRegistry(root, 23);
    const docs = {
      'README.md': 'This repo ships 22 UK public data sources.\n',
      'COUNTRY.md': '22 adapters are registered.\n',
      'AGENTS.md': 'The packages hold 22 adapters.\n',
      'packages/uk-sources/README.md': 'Ships 22 adapters.\n',
      'packages/uk-mcp/README.md': 'An MCP server for 22 sources.\n',
      'docs/MCP.md': 'The MCP server covers 22 sources.\n',
    };
    for (const [path, contents] of Object.entries(docs)) {
      writeFile(root, path, contents);
    }

    const { adapterCount, problems } = await checkDocCounts({ root, country: 'uk' });

    assert.equal(adapterCount, 23);
    assert.deepEqual(problems.map((problem) => problem.path).sort(), Object.keys(docs).sort());
    assert.ok(
      problems.every(
        (problem) => problem.claimed === 22 && problem.expected === 23 && problem.line === 1
      )
    );
  });
});

test('accepts the current count', async () => {
  await withRepo(async (root) => {
    writeRegistry(root, 23);
    writeFile(root, 'README.md', 'This repo ships 23 UK public data sources.\n');
    writeFile(root, 'COUNTRY.md', 'Twenty-three adapters are registered.\n');
    writeFile(root, 'packages/uk-sources/README.md', 'All 23 adapters are keyless.\n');

    const { problems } = await checkDocCounts({ root, country: 'uk' });

    assert.deepEqual(problems, []);
  });
});

test('ignores subset and historical counts', async () => {
  await withRepo(async (root) => {
    writeRegistry(root, 23);
    writeFile(
      root,
      'README.md',
      [
        'The other eleven adapters need keys.',
        'The eleven adapters added on 2026-10-05 were probed live.',
        'Five adapters copy licence fields.',
        'Eight adapters the ports do not carry yet.',
        'The remaining eight adapters are pending.',
        'Fourteen more keyless adapters were added.',
        'Three sources ask callers to identify themselves.',
        '',
      ].join('\n')
    );

    const { problems } = await checkDocCounts({ root, country: 'uk' });

    assert.deepEqual(problems, []);
  });
});

test('flags a stale count written as words', async () => {
  await withRepo(async (root) => {
    writeRegistry(root, 23);
    writeFile(root, 'README.md', 'Twenty-two adapters are registered.\n');

    const { problems } = await checkDocCounts({ root, country: 'uk' });

    assert.deepEqual(
      problems.map((problem) => [problem.path, problem.claimed]),
      [['README.md', 22]]
    );
  });
});

test('fails clearly when the registry export is missing', async () => {
  await withRepo(async (root) => {
    writeFile(root, 'packages/uk-sources/dist/registry.js', 'export const WRONG = [];\n');
    await assert.rejects(() => loadAdapterCount({ root, country: 'uk' }), /UK_DATA_SOURCES/);
  });
});
