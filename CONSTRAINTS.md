# Constraints

Last reviewed: 2026-10-02 by @olitreadwell

This file is the quality bar for this repo. It is the contract a change is
measured against, and it is not edited to make a failing change pass.
`AGENTS.md` points here; read it before writing code.

## Floor (always enforced, no setup required)

- No new suppression comments: `@ts-ignore`, `eslint-disable`, `# noqa`,
  `# type: ignore`, `istanbul ignore`, `nosemgrep`, `gitleaks:allow`.
- No unimplemented stubs: `throw new Error('Not implemented')`, empty
  `catch {}`, or a placeholder note standing where the implementation should be.
- No skipped or deleted tests without the reason in the commit message.
- No secrets in source.
- No weakening of this file in the same change that was failing.

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
| --- | --- | --- | --- |
| Format | No diff from Prettier | `pnpm run format:check` | every edit |
| Lint | Zero errors | `pnpm run lint` | every edit |
| Types | Zero type errors | `pnpm run typecheck` | every edit |
| Coverage | Lines >= 80, functions >= 80, statements >= 80, branches >= 70 | `pnpm run test:coverage` | task end, CI |
| Build | Production build succeeds | `pnpm run build` | task end, CI |
| Smoke | Boots and answers its routes | `pnpm run smoke` | task end, CI |
| Accessibility | Zero critical or serious axe violations on every route | `pnpm run test:a11y` | task end, CI |
| Performance | Lighthouse a11y >= 0.95, perf/SEO >= 0.90, best-practices >= 0.95 | `pnpm run perf` | CI |
| Links | Every internal markdown link resolves | `pnpm run check:links` | task end, CI |
| Agent index | `public/llms.txt` matches the route tree | `pnpm run llms:check` | task end, CI |
| Secrets | No committed credentials | `scripts/security-checks.sh` | CI |
| Dependencies | Nothing at high or above | `pnpm run audit` | CI |
| Evals | Every case in `evals/cases` passes | `pnpm run evals` | when a prompt changes |

`pnpm run check` covers every row marked every edit or task end. `perf`,
`audit` and `evals` run separately. `package.json` lists the steps.

## Measured, not yet enforced

Recorded on 2026-10-02. These numbers may improve; they must not fall.

| Metric | Today | Direction |
| --- | --- | --- |
| Statements | 91.68% | must not fall |
| Branches | 81.57% | must not fall |
| Functions | 89.04% | must not fall |
| Lines | 94.64% | must not fall |

A change that drops one of these by more than 0.5% is a finding to explain,
not a number to adjust.

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
| --- | --- | --- | --- | --- | --- |
| - | - | - | No exceptions are open | - | - |

An exception needs an owner and a date inside 90 days, or it is a decision
someone made by accident.
