# YNAPB - YNAB Planner & Budgeter

Long-term planner for one-time goals with deadlines on top of YNAB.

Design and planning docs:
- `docs/superpowers/specs/2026-04-25-ynapb-design.md`
- `docs/superpowers/plans/`

## What is implemented

- Next.js app with App Router and Supabase authentication.
- Goals management and plan calculation/push flow via API routes.
- YNAB sync and encrypted token handling.
- Unit, e2e, architecture, duplication, spelling, and security checks.

## Prerequisites

- Node.js 22+ and npm
- Supabase project (cloud)
- YNAB Personal Access Token

## Local setup

1. Copy env template:
   - `cp .env.example .env.local`
2. Fill required values in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fallback, optional)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ENCRYPTION_KEY` (base64, 32 bytes)
3. Install dependencies:
   - `npm install`
4. Apply Supabase migrations:
   - `npx supabase link --project-ref <your-ref>` (one-time)
   - `npx supabase db push`
5. Start app:
   - `npm run dev`

## Scripts

- `npm run dev` - start local Next.js dev server (Turbopack)
- `npm run build` - production build
- `npm run start` - run production build locally
- `npm run lint` - ESLint
- `npm run format` - Prettier write
- `npm run format:check` - Prettier check
- `npm run typecheck` - TypeScript no-emit check
- `npm run test:unit` - Vitest tests
- `npm run test:unit:coverage` - Vitest with coverage
- `npm run test:unit:watch` - Vitest watch mode
- `npm run test:e2e` - Playwright tests
- `npm run test:arch` - dependency-cruiser constraints
- `npm run test:duplication` - jscpd duplication check
- `npm run test:spelling` - cspell
- `npm run test:security` - npm audit (`high` and above)
- `npm run check` - lint + typecheck + arch + unit
- `npm run quality:quick` - quick quality gate
- `npm run quality:full` - full quality gate

## Project structure

- `src/app` - pages, layouts, and route handlers
- `src/components` - UI and feature components
- `src/lib/planner` - planning algorithm and tests
- `src/lib/ynab` - YNAB client, sync, and push logic
- `src/lib/supabase` - client/server helpers and middleware integration
- `src/lib/repositories` - data access layer
- `supabase/migrations` - database schema changes

Architecture constraints are enforced in `.dependency-cruiser.cjs`.
