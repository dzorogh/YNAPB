# YNAPB Plan UI & YNAB Push (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the full `/plan` experience: monthly allocation preview from current goals/data, conflict visibility (`unreachable`, `tied_deadline`), and safe push of current-month MF goals to YNAB with diff confirmation.

**Architecture:** Keep `src/lib/planner` pure and run calculations in an API orchestration layer (`/api/plan/*`). UI in `/plan` consumes only internal APIs. YNAB write operations stay in isolated service modules and are guarded by explicit diff/confirmation flow.

**Tech Stack:** Next.js App Router, React client components, existing planner domain module, Supabase repositories, YNAB integration service, Vitest, Playwright.

---

## File Structure

```
src/
├── app/
│   ├── plan/page.tsx
│   └── api/
│       └── plan/
│           ├── calculate/route.ts
│           └── push/route.ts
├── components/
│   └── plan/
│       ├── plan-header.tsx
│       ├── plan-conflicts.tsx
│       ├── plan-table.tsx
│       ├── plan-timeline.tsx
│       └── push-diff-dialog.tsx
├── lib/
│   ├── planner/
│   │   ├── planner.ts
│   │   └── planner.test.ts
│   ├── repositories/
│   │   ├── goals-repo.ts
│   │   ├── income-settings-repo.ts
│   │   ├── ynab-cache-repo.ts
│   │   └── plan-snapshots-repo.ts
│   └── ynab/
│       ├── push-mf.ts
│       └── push-mf.test.ts
tests/
└── e2e/
    └── plan.spec.ts
```

---

## Task 1: Plan snapshots repository + retention

**Files:**
- Create: `src/lib/repositories/plan-snapshots-repo.ts`

- [ ] **Step 1: Add repository methods**

Implement:
- `createPlanSnapshot(userId, { inputsHash, result })`
- `trimPlanSnapshots(userId, keep = 100)`
- `createAndTrimPlanSnapshot(...)` helper

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run test:arch`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/repositories/plan-snapshots-repo.ts
git commit -m "feat(data): add plan snapshots repository with retention helper"
```

---

## Task 2: Extend YNAB push service for MF goal writes (TDD)

**Files:**
- Create: `src/lib/ynab/push-mf.ts`, `src/lib/ynab/push-mf.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- converts human currency to YNAB milliunits
- updates only active linked goals
- prepares diff payload (`current` vs `next`)
- skips unchanged categories

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/lib/ynab/push-mf.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal service**

Implement:
- `buildPushDiff({ goals, allocationForMonth, categories })`
- `pushMonthlyFundingGoals({ token, budgetId, updates })`

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run src/lib/ynab/push-mf.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ynab/push-mf.ts src/lib/ynab/push-mf.test.ts
git commit -m "feat(ynab): add monthly funding diff and push service"
```

---

## Task 3: Plan calculate API orchestration

**Files:**
- Create: `src/app/api/plan/calculate/route.ts`
- Modify: `src/lib/repositories/goals-repo.ts`, `src/lib/repositories/ynab-cache-repo.ts`, `src/lib/budget/obligations.ts`

- [ ] **Step 1: Implement `POST /api/plan/calculate`**

Endpoint flow:
- auth user
- load active goals
- load ynab cache and income settings
- compute `budget` using obligations calculator
- map goals to planner input (including current balances from linked categories)
- run `computePlan`
- return `{ budget, planResult, tbdWarnings }`

- [ ] **Step 2: Add staleness handling**

If cache missing/stale (>24h), return warning flag `needsSync: true`.

- [ ] **Step 3: Verify**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plan/calculate/route.ts src/lib/repositories/goals-repo.ts src/lib/repositories/ynab-cache-repo.ts src/lib/budget/obligations.ts
git commit -m "feat(api): add plan calculation endpoint with budget and warnings"
```

---

## Task 4: Plan push API with confirmation + snapshot write

**Files:**
- Create: `src/app/api/plan/push/route.ts`
- Modify: `src/lib/repositories/plan-snapshots-repo.ts`, `src/lib/ynab/push-mf.ts`

- [ ] **Step 1: Implement dry-run diff mode**

`POST /api/plan/push` with `{ mode: "preview", month }`:
- recompute canonical plan
- build YNAB push diff for requested month
- return diff only (no writes)

- [ ] **Step 2: Implement apply mode**

`POST /api/plan/push` with `{ mode: "apply", month, acceptedDiffHash }`:
- recompute diff
- verify hash matches accepted preview
- perform YNAB updates via push service
- write `plan_snapshots` row and trim to 100 rows

- [ ] **Step 3: Verify**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plan/push/route.ts src/lib/repositories/plan-snapshots-repo.ts src/lib/ynab/push-mf.ts
git commit -m "feat(api): add preview and apply push endpoints with snapshot persistence"
```

---

## Task 5: Build `/plan` page shell and data fetch flow

**Files:**
- Create:
  - `src/app/plan/page.tsx`
  - `src/components/plan/plan-header.tsx`
  - `src/components/plan/plan-conflicts.tsx`
  - `src/components/plan/plan-table.tsx`
  - `src/components/plan/plan-timeline.tsx`

- [ ] **Step 1: Render plan screen states**

States:
- loading
- missing YNAB connection CTA to `/settings`
- needs sync warning
- empty goals CTA to `/goals`
- main plan view

- [ ] **Step 2: Wire calculate API**

Load data from `/api/plan/calculate` and pass to subcomponents.

- [ ] **Step 3: Show conflicts and warnings**

Display:
- `unreachable` conflicts with earliest achievable date
- `tied_deadline` conflict groups
- TBD-not-linked warnings

- [ ] **Step 4: Verify**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/plan/page.tsx src/components/plan/plan-header.tsx src/components/plan/plan-conflicts.tsx src/components/plan/plan-table.tsx src/components/plan/plan-timeline.tsx
git commit -m "feat(plan): add plan page shell with calculation and conflict rendering"
```

---

## Task 6: Push diff dialog and apply action

**Files:**
- Create: `src/components/plan/push-diff-dialog.tsx`
- Modify: `src/app/plan/page.tsx`

- [ ] **Step 1: Add preview button flow**

Button: `Push goals to YNAB for current month`  
On click:
- call `/api/plan/push` preview
- open dialog with row-by-row changes

- [ ] **Step 2: Add confirm apply flow**

On confirm:
- call `/api/plan/push` apply with accepted diff hash
- show success/failure feedback
- refresh plan data

- [ ] **Step 3: Verify**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/plan/push-diff-dialog.tsx src/app/plan/page.tsx
git commit -m "feat(plan): add ynab push diff confirmation flow"
```

---

## Task 7: Timeline interactions (phase 1: deadline editing without full DnD physics)

**Files:**
- Modify: `src/components/plan/plan-timeline.tsx`, `src/app/plan/page.tsx`

- [ ] **Step 1: Add month-shift controls per goal**

Implement deterministic deadline shift controls (`-1 month`, `+1 month`) as MVP substitute for freeform drag.

- [ ] **Step 2: Recalculate preview on shifts**

Update local goal deadlines and rerun `/api/plan/calculate` for live preview.

- [ ] **Step 3: Verify**

Run: `npm run check`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/plan/plan-timeline.tsx src/app/plan/page.tsx
git commit -m "feat(plan): add interactive deadline shifts with live recalculation"
```

---

## Task 8: E2E coverage for plan flow

**Files:**
- Create: `tests/e2e/plan.spec.ts`
- Modify: `playwright.config.ts` (if required)

- [ ] **Step 1: Add e2e scenarios**

Scenarios:
- unauth `/plan` redirect to `/login`
- `/plan` empty/connect states render
- mocked calculated plan renders table + conflicts
- push preview dialog opens with diff rows

- [ ] **Step 2: Run targeted e2e**

Run: `npx playwright test tests/e2e/plan.spec.ts`  
Expected: PASS.

- [ ] **Step 3: Full verification**

Run: `npm run check && npx playwright test`  
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/plan.spec.ts playwright.config.ts src/middleware.ts
git commit -m "test(e2e): add plan page and push preview flow coverage"
```

---

## Self-review (run after all tasks complete)

1. **Spec coverage check**
   - `/plan` header, conflicts, allocation table: Tasks 3 + 5
   - push MF diff + confirm: Tasks 2 + 4 + 6
   - snapshot writes + retention 100: Tasks 1 + 4
   - interactive timeline adjustment: Task 7
   - e2e plan scenarios: Task 8

2. **Placeholder scan**
   - No TODO/TBD placeholders in implementation steps.
   - Every task has file paths, commands, and expected outcomes.

3. **Type and flow consistency**
   - Planner input/output contracts remain in `src/lib/planner/types.ts`.
   - Push API uses preview/apply hash gate to prevent stale confirmation writes.
   - UI interacts only with internal API routes.
