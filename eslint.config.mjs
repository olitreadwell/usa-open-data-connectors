// Root ESLint config: aggregates each package's flat config so a single
// `eslint .` from the repo root works (used by the lint-review CI job).
import api from './packages/api/eslint.config.mjs';
import cli from './packages/cli/eslint.config.mjs';
import usaSources from './packages/usa-sources/eslint.config.mjs';

const packageConfigs = {
  'packages/api': api,
  'packages/cli': cli,
  'packages/usa-sources': usaSources,
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  ...Object.entries(packageConfigs).flatMap(([dir, configs]) =>
    configs.map((entry) => ({
      ...entry,
      files: entry.files
        ? entry.files.map((pattern) => `${dir}/${pattern}`)
        : [`${dir}/**/*.{ts,tsx}`],
    })),
  ),
];
