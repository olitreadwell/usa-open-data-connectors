# Agent documentation review

## Scope and method

This review judges the repo's agent-facing documentation against the writing reference in `~/.agents/skills/writing-for-agents/SKILL.md` and `SKILL-MECHANICS.md`. It covers `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `CONSTRAINTS.md`, `package.json`, `docs/agents/`, `docs/llm-agent-optimization.md`, and the `docs/` tree.

The method was to compare always-loaded pointers with the material they point at, then check script names and paths against `package.json` and the checkout. Path existence was checked with `test -e`. No `pnpm` checks were run because this is a read-and-write-doc task.

## Findings, ranked by impact

### 1. AGENTS.md repeats the coding standard instead of routing to it

Where: `AGENTS.md:37-56`.

Lever: context load and duplication (`SKILL.md:24`, `SKILL.md:78`).

Evidence: the section begins `"## Non-negotiables"` at `AGENTS.md:37` and restates rules already owned elsewhere: test-first and naming at `CODING_STANDARDS.md:27-49`, the quality floor at `CONSTRAINTS.md:9-17`, the external-link rule at `docs/style-guide.md:29-33`, and the one-command contract at `docs/engineering.md:6-7`.

Proposed replacement:

```markdown
## Rules

Read `CODING_STANDARDS.md` for test-first and code conventions, `CONSTRAINTS.md` for the quality floor and exceptions, and `docs/style-guide.md` for UI and writing rules.
Run `pnpm run check` before and after a change; `package.json` defines its steps.
```

### 2. The check gate is restated in three places and every restatement is incomplete

Where: `AGENTS.md:39-41`, `CODING_STANDARDS.md:24-25`, `CONSTRAINTS.md:37-39`.

Lever: cache (`SKILL.md:79`).

Evidence: `AGENTS.md:39-41` says `"pnpm run check"` equals `"format:check + lint + typecheck + test:coverage + build + smoke + e2e + check:links"`. The authoritative script at `package.json:34` also runs `test:setup`, `check:external-links`, and `llms:check`. The CI `check` job runs only the six commands at `.github/workflows/ci.yml:61-66`, so it does not mirror the local script. `CONSTRAINTS.md:37-39` says the command runs the whole table except `perf`, `audit`, and `evals`, while the table also includes the secret scan at `CONSTRAINTS.md:33`, which `check` does not run.

Proposed replacement for all three passages:

```markdown
`pnpm run check` is the local gate. Its steps are defined in `package.json`; do not restate them here. CI runs its own checks in `.github/workflows/ci.yml`.
```

### 3. Naming rules sit under Links, below an empty heading

Where: `AGENTS.md:85-87`, `AGENTS.md:101-110`.

Lever: co-location and information hierarchy (`SKILL.md:41`, `SKILL.md:33-39`).

Evidence: `"## Naming and discoverability"` at `AGENTS.md:85` is immediately followed by `"## UI conventions (Radix-first)"` at `AGENTS.md:87`. The naming rules then appear at `AGENTS.md:107-110` under `"## Links"`, which starts at `AGENTS.md:101` and contains an unrelated external-link rule.

Proposed replacement: move the four bullets at `AGENTS.md:107-110` directly under `AGENTS.md:85`, then keep `## Links` for the external-link rule only. If the duplication with `CODING_STANDARDS.md:41-49` is removed, replace the four bullets with `Follow the naming and test-file rules in CODING_STANDARDS.md.`

### 4. CLAUDE.md duplicates AGENTS.md and asserts domain files that do not exist

Where: `CLAUDE.md:17-21`, `CLAUDE.md:37-38`, `AGENTS.md:60-68`, `docs/ai.md:27-36`, `docs/agents/domain.md:7-15`.

Lever: duplication and context load (`SKILL.md:78`, `SKILL.md:24`).

Evidence: `CLAUDE.md:17-19` says the AI seam is off unless `AI_API_KEY` is set, and `AGENTS.md:60-61` says the same. Both also require an eval for prompt changes at `CLAUDE.md:20-21` and `AGENTS.md:66-67`, while `docs/ai.md:35-36` already owns that rule. `CLAUDE.md:37` says `"one CONTEXT.md and one docs/adr/"`, but neither path exists in the checkout, and `docs/agents/domain.md:24` explicitly anticipates their absence. The generic guide's suggested content for Claude is `"One line pointing at AGENTS.md"` at `docs/contributing/00-index.md:39`, while `CLAUDE.md:1-38` is a second rulebook.

Proposed replacement: in `AGENTS.md`, replace `AGENTS.md:60-68` with `For AI work, read docs/ai.md before changing src/lib/ai/ or adding a prompt eval.` In `CLAUDE.md`, delete `CLAUDE.md:17-21` and `CLAUDE.md:37-38`; keep the unique stack facts at `CLAUDE.md:7-16` and point domain work at `docs/agents/domain.md`.

### 5. Contact and feedback reference is always loaded

Where: `AGENTS.md:70-83`.

Lever: progressive disclosure and pointer wording (`SKILL.md:39`, `SKILL.md:12-18`).

Evidence: `AGENTS.md:70-83` lists the contact routes, API routes, OpenAPI test, and issue labels. `docs/contact.md:7-17` already owns the route table, and `docs/contact.md:59-71` owns the agent filing contract.

Proposed replacement:

```markdown
## Contact and feedback

When a change touches `/help`, `/contact`, `/feedback`, `/docs`, or any `/api/contact`, `/api/feedback`, or `/.well-known/feedback.json` path, read `docs/contact.md`.
```

### 6. Domain layout claims a tree the repo does not have

Where: `docs/agents/domain.md:5-26`, `CLAUDE.md:37`.

Lever: cache (`SKILL.md:79`).

Evidence: `docs/agents/domain.md:7-8` says `CONTEXT.md` and `docs/adr/` exist only `"if they exist"`, but the tree at `docs/agents/domain.md:10-15` presents both as part of the current layout. `docs/agents/domain.md:24-26` then says to proceed silently when they do not exist. `CLAUDE.md:37` repeats the layout without the conditional.

Proposed replacement for `docs/agents/domain.md:5-26`:

```markdown
No `CONTEXT.md` or `docs/adr/` exists yet. When either appears, read the entries that touch the change. Do not create them before a term or decision is settled.

For AI work, read `docs/ai.md` and use the terms defined in `src/lib/ai/`.
```

### 7. The LLM optimization doc repeats the style guide and package contract

Where: `docs/llm-agent-optimization.md:8-32`.

Lever: duplication (`SKILL.md:78`).

Evidence: `docs/llm-agent-optimization.md:10-12` and `docs/style-guide.md:70-75` both define names as addresses and require domain-prefixed exports. `docs/llm-agent-optimization.md:13-24` repeats doc comments, comment placement, file naming, one spelling per concept, and deprecation rules already at `docs/style-guide.md:35-93` and `CODING_STANDARDS.md:41-49`. `docs/llm-agent-optimization.md:26-32` restates the `check` contract from `package.json:34`.

Proposed replacement: keep `docs/llm-agent-optimization.md:3-6` and `docs/llm-agent-optimization.md:34-38` as the rationale, delete `docs/llm-agent-optimization.md:8-32`, and add one line: `The concrete code and writing rules live in docs/style-guide.md; the gate lives in CODING_STANDARDS.md.`

### 8. The issue tracker repeats gh help and writes one trigger twice

Where: `docs/agents/issue-tracker.md:9-15`, `docs/agents/issue-tracker.md:19-20`, `docs/agents/issue-tracker.md:22-28`.

Lever: cache and negation (`SKILL.md:79`, `SKILL.md:74`).

Evidence: `docs/agents/issue-tracker.md:3-5` says `"Infer the repo from git remote -v"` and then says `gh` does it automatically, so the first clause asks for work the second clause removes. `docs/agents/issue-tracker.md:9-15` lists `gh issue create`, `view`, `list`, `comment`, `edit`, and `close`, which `gh issue --help` already exposes. The create and read commands are repeated as skill instructions at `docs/agents/issue-tracker.md:24` and `docs/agents/issue-tracker.md:28`. The prohibition `"PRs as a request surface: no."` at `docs/agents/issue-tracker.md:19` states the banned behaviour rather than the target.

Proposed replacement for `docs/agents/issue-tracker.md:7-28`:

```markdown
Issues and specs are GitHub issues. Run `gh` inside the clone; it infers the repo. Use `gh issue --help` for command syntax.

External pull requests are reviewed as code contributions; file feature requests as GitHub issues.

When a skill asks to publish to the issue tracker, create an issue. When it asks to fetch the relevant ticket, run `gh issue view <number> --comments`.
```

### 9. The triage label table duplicates its two key columns

Where: `docs/agents/triage-labels.md:6-14`.

Lever: sprawl (`SKILL.md:43`).

Evidence: every row at `docs/agents/triage-labels.md:8-12` has the same canonical role and label, such as `"needs-triage | needs-triage"`. `docs/agents/triage-labels.md:14` then says to apply the right-hand column, which adds nothing beyond the left-hand column.

Proposed replacement:

```markdown
Apply the role name as the label:

- `needs-triage`: maintainer needs to evaluate this issue.
- `needs-info`: waiting on the reporter for more information.
- `ready-for-agent`: fully specified, ready for an agent to pick up.
- `ready-for-human`: needs a human to implement.
- `wontfix`: will not be actioned.
```

### 10. The gate has five names

Where: `AGENTS.md:39`, `CONSTRAINTS.md:5`, `docs/engineering.md:6`, `docs/llm-agent-optimization.md:31`, `docs/philosophy.md:10`.

Lever: leading word (`SKILL.md:61-72`).

Evidence: the same idea is called `"one-command contract"` at `AGENTS.md:39` and `docs/engineering.md:6`, `"quality bar"` at `CONSTRAINTS.md:5`, `"single proof"` at `docs/llm-agent-optimization.md:31`, and `"entire gate"` at `docs/philosophy.md:10`.

Proposed replacement: use `check` for the command and `quality bar` for `CONSTRAINTS.md`. For example: `pnpm run check is the gate; the quality bar is CONSTRAINTS.md.` Do not introduce another name for either.

### 11. The root file tells the agent to read a file already in context

Where: `AGENTS.md:10-11`.

Lever: no-op (`SKILL.md:80`).

Evidence: `AGENTS.md:10-11` says `"Instructions for AI coding agents working in this repo. Read this before editing anything."` The file is already loaded as the root instruction file, so the second sentence asks for an action that has happened by the time it is read.

Proposed replacement: delete `AGENTS.md:10-11` with no replacement. The coding-standard block at `AGENTS.md:3-7` and the pointer section at `AGENTS.md:13` already establish the file's purpose.

## Duplication and cache audit

`AGENTS.md` and `CLAUDE.md` duplicate the AI seam rule at `AGENTS.md:60-61` and `CLAUDE.md:17-19`, the prompt-eval rule at `AGENTS.md:66-67` and `CLAUDE.md:20-21`, the issue-tracker pointer at `AGENTS.md:28` and `CLAUDE.md:27-28`, and the domain-doc pointer at `AGENTS.md:28` and `CLAUDE.md:35-38`.

`AGENTS.md` restates package scripts at `AGENTS.md:39-43`, `AGENTS.md:53`, and `AGENTS.md:119`. It does not restate the full directory tree. `CLAUDE.md:15-16` restates the module layout, and `docs/agents/domain.md:10-15` restates the repository tree.

The fix is one authoritative place per meaning, as the reference requires at `SKILL.md:78`. Keep the command in `package.json`, the quality floor in `CONSTRAINTS.md`, the code conventions in `CODING_STANDARDS.md`, and the pointer wording in `AGENTS.md`.

## Unverifiable or contradicted instructions

- `AGENTS.md:39-41` and `CONSTRAINTS.md:37-39` both misdescribe `pnpm run check`; compare `package.json:34`.
- `docs/contributing/00-index.md:65-66` says to run `scripts/copy.sh --detect`, but `scripts/copy.sh` is absent from the checkout.
- `docs/agents/domain.md:7-13` and `CLAUDE.md:37` name `CONTEXT.md` and `docs/adr/`, but both paths are absent.
- `AGENTS.md:131` says to read `node_modules/next/dist/docs/`, but that directory is absent in this checkout. This is an install-state fact, not a reason to edit the generated block.

## Do not change

- `CONSTRAINTS.md:21-35` and `CONSTRAINTS.md:41-53` hold exact thresholds and measured numbers that the environment cannot reveal. They are the expensive lookup the reference says to cache (`SKILL.md:79`).
- `docs/contact.md`, `docs/ai.md`, and `docs/api.md` are correctly disclosed reference. Keep their detail and point at them from the root file.
- `docs/contributing/templates/AGENT_CHECKLIST.md:3-28` turns completion criteria into checkable items. Keep it; the reference treats checkable completion criteria as a strength (`SKILL.md:47-52`).
- `AGENTS.md:96-97` records the Radix Select hidden-input gotcha. No config or generated file reveals it, so it earns its place.
- `AGENTS.md:127-135` is the Next.js generated block. It is re-added by `next dev`, so editing it creates churn rather than a durable improvement.
- `docs/contributing/00-index.md:7-22` gives a reading order for first changes. Keep it; it is branch guidance, not a duplicate rule.
- `docs/agents/triage-labels.md:3-4` holds the role mapping convention. Keep the convention; only remove the duplicate label column at `docs/agents/triage-labels.md:6-14`.

## Ranked shortlist

1. Delete the check step lists at `AGENTS.md:39-41`, `CODING_STANDARDS.md:24-25`, and `CONSTRAINTS.md:37-39`; replace with one sentence that points at `package.json` and `.github/workflows/ci.yml`. About 2 minutes.
2. Delete `AGENTS.md:37-56` and replace it with the pointer block proposed in finding 1. About 1 minute.
3. Move or replace the naming bullets at `AGENTS.md:107-110` so they sit under `AGENTS.md:85`, or point at `CODING_STANDARDS.md:41-49`. About 1 minute.
4. Replace `AGENTS.md:70-83` with the single `docs/contact.md` pointer in finding 5. About 1 minute.
5. Delete the duplicated AI and domain sections at `CLAUDE.md:17-21` and `CLAUDE.md:37-38`, keep the unique stack facts at `CLAUDE.md:7-16`, and point at `docs/ai.md` and `docs/agents/domain.md`. About 2 minutes.
