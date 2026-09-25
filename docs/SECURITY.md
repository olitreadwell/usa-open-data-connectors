# Security

This file explains how the repo handles keys, what the automated checks
are, and what to check before shipping.

## API keys

No registered connector needs a key today. Both adapters in
`packages/usa-sources` are keyless. When a keyed source lands, its key gets an
environment variable and is added to this list.

Rules:
- Keys come from the environment only, server-side
- The HTTP API and CLI never accept keys from callers
- Real keys are never committed; `.env` is gitignored
- Commit only `.env.example` (empty values)

## Automated checks

| Check | Command | What it finds |
| --- | --- | --- |
| npm audit | `npm audit --audit-level=high` | Known npm vulnerabilities |
| CodeQL | CI workflow | Security patterns in all three languages |
| Lint | `npm run lint` | Suspicious code patterns |

CI blocks on critical and high npm audit findings. CodeQL runs on every
push.

## Input validation

The HTTP API rejects bad input at the boundary:
- Query parameters go through zod schemas
- Route parameters go through zod schemas
- Unknown sources answer 404
- Malformed input answers 400
- An upstream source that fails answers 502, with no key material in the body

## CORS

The read-only GET endpoints under `/api` answer cross-origin browser
requests. By default any origin is allowed (`Access-Control-Allow-Origin:
*`). Set `CORS_ORIGIN` to a single origin (for example
`https://app.example.com`) to allow only that origin. The API is read-only
and keyless, so a permissive default exposes no credentials or write
endpoints.

## Rate limiting

The `/api` routes are rate limited per client IP with an in-memory fixed
window. Defaults: 60 requests per minute. Configure with `RATE_LIMIT_MAX`
and `RATE_LIMIT_WINDOW_MS` (milliseconds). Counters live in process memory,
so the limit applies per app instance. Multi-instance deployments must
enforce request limits at a shared proxy or gateway, and the proxy should
overwrite `X-Forwarded-For` so clients cannot spoof it.

## Metrics exposure

`/metrics` serves request counters in Prometheus text format. Metrics help
operators but can leak traffic details, so do not expose `/metrics`
publicly. Put it behind an internal network, a proxy ACL, or a load
balancer rule in production.

## Security checklist

Before merging a change:
- [ ] No secrets or keys in the diff
- [ ] New endpoints validate input before business logic
- [ ] New keys come from the environment, never from callers
- [ ] New dependencies pass `npm audit`
- [ ] No `console.log` in committed code
- [ ] `/metrics` is not publicly exposed
- [ ] Rate limit settings use sane values for the deployment

## Report a problem

Open an issue in the GitHub repository. For secrets or vulnerabilities,
mention "security" in the title and keep details out of the summary.
