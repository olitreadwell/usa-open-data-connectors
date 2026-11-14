# Evals

An eval is the test suite for a prompt. `pnpm test` proves the code around a
model call works; `pnpm run evals` proves the model call itself still does the
job you shipped it for.

A prompt change is a behaviour change, and no unit test can see it. These
cases run against a real provider and grade the answer, so "the summary got
worse" is a red build rather than a comment in review.

## Running

```bash
pnpm run evals                 # all cases, deterministic checks
pnpm run evals -- --case nz-data-briefing-plain-language
pnpm run evals -- --with-judge # adds the rubric grade
pnpm run evals -- --json       # print the report instead of the summary
```

With no `AI_API_KEY` set the run prints `evals skipped` and exits 0, so a
fresh clone and CI without secrets stay green.

## Adding a case

Add a file to `evals/cases/`. The filename is the case id.

```json
{
  "description": "What this case protects against",
  "system": "Optional system message",
  "prompt": "The user message to send",
  "expect": {
    "mustInclude": ["phrase that must appear"],
    "mustNotInclude": ["phrase that must not appear"],
    "mustMatch": ["^regex"],
    "minChars": 100,
    "maxChars": 1200
  },
  "judge": { "rubric": "What a good answer does", "threshold": 4 }
}
```

Every key is optional. A case with no `expect` and no `judge` passes as long
as the model answers at all, which is still worth asserting.

`judge` costs a second call and is only run with `--with-judge`, so the
default run stays cheap and deterministic.

## The report

Each run writes `evals/report.json`: per-case verdict, the answer, token
usage, latency, and which checks failed. Commit it when a baseline changes on
purpose; the diff is the record of what a prompt change did.
