# YNAPB Core MVP (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the operational MVP core after foundation: YNAB connection in `/settings`, sync from YNAB, automatic monthly budget calculation (`obligations`/`available`), and Goals CRUD.

**Architecture:** Keep planner pure and move all I/O into explicit service/repository modules. API routes become thin orchestration layers over `lib` services. UI pages call local API routes only (no direct YNAB SDK calls from client components).

**Tech Stack:** Next.js App Router, Supabase SSR, YNAB SDK (`ynab`), Zod validation, Vitest, Playwright.

---

## File Structure

```
src/
├── app/
│   ├── settings/page.tsx
│   ├── goals/page.tsx
│   └── api/
│       ├── settings/route.ts
│       ├── ynab/sync/route.ts
│       └── goals/
│           ├── route.ts
│           └── [id]/route.ts
├── lib/
│   ├── budget/
│   │   ├── obligations.ts
│   │   └── obligations.test.ts
│   ├── repositories/
│   │   ├── profile-repo.ts
│   │   ├── income-settings-repo.ts
│   │   ├── goals-repo.ts
│   │   └── ynab-cache-repo.ts
│   ├── ynab/
│   │   ├── client.ts
│   │   ├── sync.ts
│   │   ├── map.ts
│   │   └── sync.test.ts
│   ├── crypto.ts
│   └── supabase/
└── components/
    ├── settings/
    │   └── budget-settings-form.tsx
    └── goals/
        ├── goal-form.tsx
        └── goals-table.tsx
```

---

## Task 1: Stabilize env contract and helper accessors

**Files:**

- Create: `src/lib/supabase/env.ts`
- Modify: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `.env.example`, `README.md`

- [ ] **Step 1: Add env accessor module**

Create `src/lib/supabase/env.ts` with `getSupabaseUrl()` and `getSupabasePublishableKey()` that support:

- primary: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 2: Refactor clients to use accessors**

Replace direct `process.env.*` reads in:

- `src/lib/supabase/browser.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/middleware.ts`

- [ ] **Step 3: Verify docs and examples**

Ensure `.env.example` and `README.md` document the publishable key naming.

- [ ] **Step 4: Verify**

Run: `npm run check`  
Expected: all checks green.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md src/lib/supabase/env.ts src/lib/supabase/browser.ts src/lib/supabase/server.ts src/lib/supabase/middleware.ts
git commit -m "chore(env): centralize Supabase env access with publishable key support"
```

---

## Task 2: Budget obligations calculator (pure domain + tests)

**Files:**

- Create: `src/lib/budget/obligations.ts`, `src/lib/budget/obligations.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- excludes categories linked to active goals
- excludes categories with `goal_type = null`
- sums `goal_under_funded` as `obligations`
- computes `available = plannedIncome - obligations`
- returns `obligationBreakdown`

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/lib/budget/obligations.test.ts`  
Expected: FAIL (module or behavior mismatch).

- [ ] **Step 3: Implement minimal calculator**

Implement `computeMonthlyBudget({ categories, activeGoalCategoryIds, plannedIncome })`.

- [ ] **Step 4: Verify passing tests**

Run: `npx vitest run src/lib/budget/obligations.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/obligations.ts src/lib/budget/obligations.test.ts
git commit -m "feat(budget): compute obligations and available budget from ynab categories"
```

---

## Task 3: Repositories for profile/settings/goals/cache

**Files:**

- Create:

  - `src/lib/repositories/profile-repo.ts`
  - `src/lib/repositories/income-settings-repo.ts`
  - `src/lib/repositories/goals-repo.ts`
  - `src/lib/repositories/ynab-cache-repo.ts`

- [ ] **Step 1: Add repository interfaces and Zod guards**

Each repo should expose focused functions (no broad query builders), e.g.:

- profile: `getProfile`, `updateYnabConnection`
- income: `getIncomeSettings`, `upsertIncomeSettings`
- goals: `listGoals`, `createGoal`, `updateGoal`, `deleteGoal`
- cache: `getCache`, `upsertCache`

- [ ] **Step 2: Wire Supabase server client**

Use `getSupabaseServerClient()` only in repository layer.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run test:arch`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/repositories/*.ts
git commit -m "feat(data): add focused repositories for profile, income, goals, and ynab cache"
```

---

## Task 4: YNAB sync service (SDK wrapper + mapping)

**Files:**

- Create:

  - `src/lib/ynab/client.ts`
  - `src/lib/ynab/map.ts`
  - `src/lib/ynab/sync.ts`
  - `src/lib/ynab/sync.test.ts`

- [ ] **Step 1: Write failing sync unit tests**

Cover:

- missing token => typed error
- categories mapping includes goal fields (`goal_type`, `goal_target`, `goal_under_funded`)
- income history from latest N months

- [ ] **Step 2: Run tests to confirm red**

Run: `npx vitest run src/lib/ynab/sync.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement YNAB service**

`syncYnabData({ token, budgetId, baselineMonths })` should return:

- normalized categories
- normalized income history
- sync timestamp

- [ ] **Step 4: Verify green**

Run: `npx vitest run src/lib/ynab/sync.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ynab/client.ts src/lib/ynab/map.ts src/lib/ynab/sync.ts src/lib/ynab/sync.test.ts
git commit -m "feat(ynab): add sync service with category and income normalization"
```

---

## Task 5: Settings API + sync API

**Files:**

- Create:
  - `src/app/api/settings/route.ts`
  - `src/app/api/ynab/sync/route.ts`
- Modify: `src/lib/crypto.ts` (if helper wrappers needed), repository/service imports

- [ ] **Step 1: Implement `POST /api/settings`**

Responsibilities:

- validate payload (`token`, `budgetId`, `plannedIncome`, `baselineMonths`)
- encrypt token using `encryptToken`
- persist connection + income settings via repositories

- [ ] **Step 2: Implement `POST /api/ynab/sync`**

Responsibilities:

- load and decrypt stored token
- call `syncYnabData`
- persist cache
- return summary (`categoriesCount`, `incomeMonths`, `syncedAt`)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run test:arch && npm run test:unit`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/settings/route.ts src/app/api/ynab/sync/route.ts src/lib/crypto.ts src/lib/repositories/*.ts src/lib/ynab/*.ts
git commit -m "feat(api): add settings and ynab sync endpoints"
```

---

## Task 6: Goals CRUD API

**Files:**

- Create:
  - `src/app/api/goals/route.ts`
  - `src/app/api/goals/[id]/route.ts`
- Modify: `src/lib/repositories/goals-repo.ts`

- [ ] **Step 1: Add list/create endpoint**

`GET /api/goals` => list goals for current user  
`POST /api/goals` => create goal with input validation

- [ ] **Step 2: Add update/delete endpoint**

`PATCH /api/goals/[id]` => partial update  
`DELETE /api/goals/[id]` => delete goal

- [ ] **Step 3: Verify**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/goals/route.ts src/app/api/goals/[id]/route.ts src/lib/repositories/goals-repo.ts
git commit -m "feat(api): implement goals CRUD endpoints"
```

---

## Task 7: `/settings` UI for connection and sync

**Files:**

- Create:

  - `src/app/settings/page.tsx`
  - `src/components/settings/budget-settings-form.tsx`

- [ ] **Step 1: Build settings form component**

Fields:

- YNAB token
- budget id
- planned monthly income
- baseline months (default 6)

Actions:

- Save settings (`/api/settings`)
- Sync YNAB (`/api/ynab/sync`)

- [ ] **Step 2: Add success/error states**

Show inline status and basic validation messages.

- [ ] **Step 3: Verify**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/page.tsx src/components/settings/budget-settings-form.tsx
git commit -m "feat(settings): add ynab connection and sync controls"
```

---

## Task 8: `/goals` UI for CRUD

**Files:**

- Create:

  - `src/app/goals/page.tsx`
  - `src/components/goals/goal-form.tsx`
  - `src/components/goals/goals-table.tsx`

- [ ] **Step 1: Build goals list and create form**

Load from `GET /api/goals`, create via `POST /api/goals`.

- [ ] **Step 2: Add edit/delete interactions**

Edit via `PATCH /api/goals/[id]`, delete via `DELETE /api/goals/[id]`.

- [ ] **Step 3: Verify**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/goals/page.tsx src/components/goals/goal-form.tsx src/components/goals/goals-table.tsx
git commit -m "feat(goals): add goals management page with CRUD interactions"
```

---

## Task 9: E2E smoke for settings + goals core flow

**Files:**

- Create: `tests/e2e/settings-goals.spec.ts`
- Modify: `playwright.config.ts` (only if routing/mocks need update)

- [ ] **Step 1: Add e2e test scenarios**

Scenarios:

- unauth -> redirect to `/login`
- settings page renders
- goals page renders empty state

- [ ] **Step 2: Run e2e**

Run: `npx playwright test tests/e2e/settings-goals.spec.ts`  
Expected: PASS.

- [ ] **Step 3: Full verification**

Run: `npm run check && npx playwright test`  
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/settings-goals.spec.ts playwright.config.ts
git commit -m "test(e2e): cover settings and goals core navigation flow"
```

---

## Self-review (run after all tasks complete)

1. **Spec coverage check**

   - `/settings` with YNAB connect and baseline income: Tasks 5 + 7
   - sync and cached categories/income: Tasks 4 + 5
   - obligations/available computation: Task 2
   - goals CRUD: Tasks 6 + 8
   - quality checks and e2e smoke: Task 9

2. **Placeholder scan**

   - No TODO/TBD placeholders in tasks.
   - Every task has concrete files, commands, and expected outcomes.

3. **Type consistency**
   - Budget type uses one calculator output contract.
   - API payload names align between UI and route handlers.
   - Repository methods are reused by route handlers, not duplicated.
