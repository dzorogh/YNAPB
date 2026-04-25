# YNAPB - YNAB Planner & Budgeter

Long-term planner for one-time goals with deadlines, on top of YNAB.

See `docs/superpowers/specs/2026-04-25-ynapb-design.md` for the full design.
This codebase is implemented across multiple plans; see `docs/superpowers/plans/`.

## Status

- **Plan 1 (this commit):** foundation, auth, and the pure planner library with full test coverage.
- Goals UI, YNAB sync UX, and rich planning screens land in Plans 2 and 3.

## Prerequisites

- Node.js 22+ and npm
- A Supabase cloud project (free tier is fine)
- A YNAB Personal Access Token (needed from Plan 2 onward)

## Setup

1. `cp .env.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from Supabase project settings.
   - `ENCRYPTION_KEY` generated with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. `npm install`
3. `npx supabase link --project-ref <your-ref>` (one-time)
4. `npx supabase db push` to apply migrations
5. `npm run db:types` whenever schema changes

## Scripts

- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run lint` - ESLint (including complexity rules)
- `npm run typecheck` - TypeScript check
- `npm run test:unit` - Vitest unit tests
- `npm run test:arch` - dependency-cruiser architecture checks
- `npm run test:e2e` - Playwright e2e tests
- `npm run check` - lint + typecheck + arch + unit

## Architecture

- `src/lib/planner` - pure TypeScript planning algorithm, unit-tested
- `src/lib/supabase` - server/browser clients and middleware glue
- `src/lib/crypto` - AES-GCM helpers for YNAB token protection
- `src/app` - App Router pages and route handlers
- `supabase/migrations` - schema and RLS setup

Layering rules are enforced by dependency-cruiser config in `.dependency-cruiser.cjs`.
