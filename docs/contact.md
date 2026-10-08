# Contact and feedback

## Bugs and feature requests

Use the issue templates in `.github/ISSUE_TEMPLATE/`. A good report includes:

- the adapter id, for example `bls-unemployment-rate` or `sec-edgar-filings`
- the exact command you ran
- what you expected and what came back
- the output, including the error message and, when there is one, the HTTP
  status
- your Node version, and your Python or Ruby version if you use a port

Never paste an API key into an issue.

## A source has moved or died

Still worth an issue. Say which adapter, the endpoint URL from
`docs/CONNECTOR_DISCOVERY.md`, and what the endpoint answers now. If a source
is gone for good it moves to the "Remaining work" section in `COUNTRY.md`.

## Security reports

Do not open a public issue for a security problem. Use GitHub's private
advisory form:

https://github.com/olitreadwell/usa-open-data-connectors/security/advisories/new

`docs/SECURITY.md` says what is in scope.

## Pull requests

`CONTRIBUTING.md` covers setup, the quality gates, and the branch naming
pattern. Keep a PR small and say which adapter or package it touches.

## Maintainer

Oli Treadwell (`@olitreadwell`).
