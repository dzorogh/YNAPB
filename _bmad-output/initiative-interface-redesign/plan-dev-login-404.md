---
title: 'Diagnose dev login misconfiguration'
type: 'bugfix'
ticket: ''
created: '2026-10-26'
status: 'built'
baseline_revision: '677a9a379f37fc593d0c46826cfa48d2b3538123'
route: 'oneshot'
route_source: 'pinned'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/auth/dev-login` returns an ambiguous 404 on `next dev` when required local configuration is missing, making a setup problem look like a missing route.

**Approach:** Preserve 404 outside development, but return an explicit configuration response in development when `DEV_LOGIN_EMAIL` or `SUPABASE_SERVICE_ROLE_KEY` is absent. Do not bypass authentication or expose configuration values.

</frozen-after-approval>

## Implementation Notes

Oneshot route: the route guard and running development server were inspected directly, and the change is limited to error semantics plus regression coverage.

Development now returns 503 with only the missing variable names and setup direction; production still returns 404. Added three route tests covering both missing variables, one missing variable, and the production guard. Tests, typecheck, Biome and the real localhost:3002 request pass. Quick review reported no findings.

## Review Triage Log

Quick review: no findings.

## Verification

**Commands:**
- `npx vitest run src/app/auth/dev-login/route.test.ts` — 3 tests passed.
- `npm run typecheck` — passed.
- Biome lint and formatting on the route and test — passed.
- `curl http://localhost:3002/auth/dev-login` — returns 503 and identifies missing `DEV_LOGIN_EMAIL` and `SUPABASE_SERVICE_ROLE_KEY` instead of an ambiguous 404.
