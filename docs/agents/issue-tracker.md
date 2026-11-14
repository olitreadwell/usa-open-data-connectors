# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for
all operations. Infer the repo from `git remote -v`; `gh` does this
automatically inside a clone.

## Conventions

- **Create**: `gh issue create --title "..." --body "..."`. Use a heredoc
  for multi-line bodies.
- **Read**: `gh issue view <number> --comments`.
- **List**: `gh issue list --state open --json number,title,body,labels`.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Label**: `gh issue edit <number> --add-label "..."` or `--remove-label`.
- **Close**: `gh issue close <number> --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests are reviewed, not
triaged as feature requests.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
