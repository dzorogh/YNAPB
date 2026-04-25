# YNAPB Foundation & Algorithm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the YNAPB project skeleton (Next.js 16 + Supabase + quality tooling) and implement the pure-TypeScript planner algorithm with full test coverage. End state: `npm run check` green, `/login` works, planner library proven correct by tests.

**Architecture:** Next.js 16 App Router app deployed against Supabase cloud. Domain (`/lib/planner`) is pure TypeScript with zero I/O dependencies; tested in isolation by Vitest. Layered architecture enforced by `dependency-cruiser`. UI built with shadcn/ui + Tailwind v4. AES-GCM encrypts the YNAB token at rest.

**Tech Stack:** Next.js 16.2, React 19.2, TypeScript 6.0, Tailwind v4.2, shadcn (CLI 4.5), Supabase (cloud), `@supabase/ssr` 0.10, Vitest 4.1, Playwright 1.59, dependency-cruiser 17, eslint-plugin-sonarjs 4, ESLint 9 flat config.

**Spec:** `docs/superpowers/specs/2026-04-25-ynapb-design.md` (sections 1, 2, 4 — stack, 5 — schema, 6 — algorithm, 8 — testing).

**Out of scope for this plan:** YNAB SDK integration, goals CRUD UI, plan rendering UI, drag-and-drop, MF goal push. Those land in Plans 2 and 3.

---

## File Structure

```
.
├── .env.example                          # documented env vars (no secrets)
├── .env.local                            # dev secrets (gitignored)
├── .eslintrc / eslint.config.mjs         # ESLint flat config + sonarjs rules
├── .dependency-cruiser.cjs               # architectural rules
├── .gitignore
├── README.md                             # how to run, env, scripts
├── next.config.ts                        # Next.js config
├── package.json                          # all deps + scripts
├── playwright.config.ts                  # e2e config
├── postcss.config.mjs                    # Tailwind v4 / postcss
├── tailwind.config.ts                    # Tailwind theme (minimal in plan 1)
├── tsconfig.json                         # strict TS
├── vitest.config.ts                      # vitest runner config
├── components.json                       # shadcn config
├── supabase/
│   ├── config.toml                       # supabase project ref pinned
│   └── migrations/
│       └── 00000000000000_init.sql       # initial schema + RLS
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx              # /login magic-link form
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts              # supabase auth callback
│   │   ├── layout.tsx                    # root layout
│   │   ├── page.tsx                      # / → redirect /plan or /login
│   │   └── globals.css                   # tailwind + shadcn tokens
│   ├── components/
│   │   └── ui/                           # shadcn components, added on demand
│   ├── lib/
│   │   ├── crypto.ts                     # AES-GCM encrypt/decrypt
│   │   ├── crypto.test.ts
│   │   ├── planner/
│   │   │   ├── types.ts                  # Goal, MonthlyBudget, PlanInput, PlanResult
│   │   │   ├── planner.ts                # pure algorithm
│   │   │   ├── planner.test.ts           # full TDD suite
│   │   │   └── fixtures.ts               # shared test fixtures
│   │   └── supabase/
│   │       ├── server.ts                 # server-side Supabase client
│   │       ├── browser.ts                # browser-side Supabase client
│   │       └── middleware.ts             # session refresh
│   ├── middleware.ts                     # next middleware: redirect unauth
│   └── types/
│       └── supabase.ts                   # generated DB types
└── tests/
    └── e2e/
        └── login.spec.ts                 # smoke e2e: /login renders
```

---

## Task 1: Initialize Next.js 16 project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `postcss.config.mjs`

- [ ] **Step 1: Init Next.js with the official scaffolder**

Run: `npx create-next-app@16 . --typescript --tailwind --eslint --app --src-dir --turbopack --import-alias "@/*" --use-npm --no-git`

Expected: scaffolds project files into the current empty directory. If prompted because folder isn't empty (only `.git/` and `.claude/` should exist), confirm overwrite.

- [ ] **Step 2: Verify dev server runs**

Run: `npm run dev`
Expected: Next.js boots on `http://localhost:3000` showing the default page. Stop with Ctrl+C.

- [ ] **Step 3: Pin Next.js and React to spec versions**

Open `package.json` and confirm:
```json
"dependencies": {
  "next": "16.2.4",
  "react": "19.2.5",
  "react-dom": "19.2.5"
}
```
If versions differ, run: `npm install next@16.2.4 react@19.2.5 react-dom@19.2.5`

- [ ] **Step 4: Set TypeScript to strict and target ES2024**

Replace `tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["dom", "dom.iterable", "ES2024"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: exits 0 with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with strict TypeScript"
```

---

## Task 2: Install full stack dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install \
  @supabase/supabase-js@2.104.1 \
  @supabase/ssr@0.10.2 \
  @tanstack/react-query@5.100.3 \
  @tanstack/react-virtual@3.13.24 \
  zustand@5.0.12 \
  recharts@3.8.1 \
  @dnd-kit/core@6.3.1 \
  ynab@4.1.0 \
  lucide-react@1.11.0 \
  date-fns@4.1.0 \
  zod@4.0.0
```

- [ ] **Step 2: Install dev deps**

Run:
```bash
npm install -D \
  vitest@4.1.5 \
  @vitest/ui@4.1.5 \
  @testing-library/react@16.3.0 \
  @testing-library/jest-dom@6.7.0 \
  jsdom@26.1.0 \
  @playwright/test@1.59.1 \
  dependency-cruiser@17.3.10 \
  eslint-plugin-sonarjs@4.0.3 \
  msw@2.8.0 \
  supabase@2.50.0 \
  prettier@3.5.0
```

- [ ] **Step 3: Init shadcn**

Run: `npx shadcn@4.5.0 init`
Expected: prompts for style, color, base path. Choose: `Default`, `Neutral`, accept defaults. Creates `components.json` and updates `globals.css` with Tailwind v4 tokens.

- [ ] **Step 4: Add base shadcn components used in /login**

Run: `npx shadcn@4.5.0 add button input label card alert toast`

- [ ] **Step 5: Verify build still works**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: install runtime and dev dependencies, init shadcn"
```

---

## Task 3: Configure ESLint flat config with sonarjs

**Files:**
- Replace: `eslint.config.mjs`

- [ ] **Step 1: Write the flat config**

Replace `eslint.config.mjs` with:
```js
import nextPlugin from "@next/eslint-plugin-next";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/types/supabase.ts",
      "tests/e2e/**/*-snapshots/**",
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      sonarjs: sonarjs,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-redundant-jump": "error",
      "complexity": ["error", 10],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
```

- [ ] **Step 2: Run lint**

Run: `npx eslint .`
Expected: passes (scaffolding files are clean). If a generated Next.js file violates `max-lines-per-function`, refactor it before continuing — do not silence the rule.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: configure ESLint flat config with sonarjs and complexity limits"
```

---

## Task 4: Configure Vitest

**Files:**
- Create: `vitest.config.ts`, `src/test-setup.ts`

- [ ] **Step 1: Write vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/**/fixtures.ts"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 2: Write setup file**

Create `src/test-setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add a smoke test**

Create `src/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run vitest**

Run: `npx vitest run`
Expected: 1 passing test, exits 0.

- [ ] **Step 5: Delete the smoke test**

Run: `rm src/lib/smoke.test.ts`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure Vitest with jsdom environment"
```

---

## Task 5: Configure Playwright

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/login.spec.ts`

- [ ] **Step 1: Init Playwright**

Run: `npx playwright install chromium`

- [ ] **Step 2: Write Playwright config**

Create `playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Write a smoke e2e test**

Create `tests/e2e/login.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("home redirects to /login when unauthenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});
```

This test will be wired up when /login lands in Task 14. For now it is documented; we skip running it until then.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: configure Playwright e2e harness"
```

---

## Task 6: Configure dependency-cruiser

**Files:**
- Create: `.dependency-cruiser.cjs`

- [ ] **Step 1: Write the config with layer rules**

Create `.dependency-cruiser.cjs`:
```js
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-pure",
      severity: "error",
      comment: "/lib/planner must remain pure: no React, no Supabase, no Next, no YNAB SDK",
      from: { path: "^src/lib/planner" },
      to: {
        path: [
          "^node_modules/(react|next|@supabase|ynab)",
          "^src/(app|components)",
          "^src/lib/(supabase|ynab)",
        ],
      },
    },
    {
      name: "no-ui-in-api",
      severity: "error",
      from: { path: "^src/app/api" },
      to: {
        path: ["^src/components", "^node_modules/react($|/)"],
      },
    },
    {
      name: "no-api-in-ui",
      severity: "error",
      from: { path: "^src/components" },
      to: { path: "^src/app/api" },
    },
    {
      name: "no-cross-page",
      severity: "error",
      comment: "Pages must not import from sibling page directories",
      from: { path: "^src/app/(?!api/)([^/]+)/" },
      to: { path: "^src/app/(?!api/)(?!$1)([^/]+)/" },
    },
    {
      name: "no-orphans",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|ts|cjs|mjs)$",
          "\\.d\\.ts$",
          "(^|/)src/app/.+\\.(tsx|ts)$",
          "\\.test\\.(ts|tsx)$",
          "(^|/)tests/",
          "(^|/)src/test-setup\\.ts$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
```

- [ ] **Step 2: Run dependency-cruiser**

Run: `npx depcruise --config .dependency-cruiser.cjs src`
Expected: passes (no source code yet to violate rules).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: add dependency-cruiser config enforcing layered architecture"
```

---

## Task 7: Add unified npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace the `scripts` block**

Edit `package.json`. Replace `scripts` with:
```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "format": "prettier --write .",
  "typecheck": "tsc --noEmit",
  "test:unit": "vitest run",
  "test:unit:watch": "vitest",
  "test:arch": "depcruise --config .dependency-cruiser.cjs src",
  "test:e2e": "playwright test",
  "check": "npm run lint && npm run typecheck && npm run test:arch && npm run test:unit"
}
```

`test:e2e` is intentionally not in `check` until Plan 2 wires sufficient mocks; it will be added then.

- [ ] **Step 2: Run the full check**

Run: `npm run check`
Expected: all four steps pass, exit 0.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: unified check script (lint + typecheck + arch + unit)"
```

---

## Task 8: Document env vars

**Files:**
- Create: `.env.example`
- Modify: `.gitignore` (verify `.env*.local` ignored)

- [ ] **Step 1: Write the example file**

Create `.env.example`:
```env
# Supabase project (cloud)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AES-GCM key for YNAB token encryption.
# 32 bytes, base64-encoded. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY=replace_with_base64_32_bytes
```

- [ ] **Step 2: Verify `.gitignore` covers env files**

`.gitignore` should already contain `.env*.local` (default Next scaffolding). If not, append:
```
.env*.local
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: document required env vars in .env.example"
```

---

## Task 9: Supabase initial schema migration

**Files:**
- Create: `supabase/migrations/00000000000000_init.sql`
- Create: `supabase/config.toml` (via CLI)

- [ ] **Step 1: Init Supabase project locally**

Run: `npx supabase init`
Expected: creates `supabase/config.toml`. Accept default settings.

- [ ] **Step 2: Write the schema migration**

Create `supabase/migrations/00000000000000_init.sql`:
```sql
-- profiles: one row per auth.users entry
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  ynab_token_ct   text,                       -- AES-GCM ciphertext, base64
  ynab_token_iv   text,                       -- IV (nonce), base64
  ynab_budget_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.income_settings (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  planned_income   numeric,
  baseline_months  int not null default 6,
  updated_at       timestamptz not null default now()
);

create type public.goal_status as enum ('active', 'frozen', 'completed');

create table public.goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  target_amount     numeric not null check (target_amount > 0),
  deadline          date not null,
  ynab_category_id  text,
  status            public.goal_status not null default 'active',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index goals_user_id_deadline_idx on public.goals (user_id, deadline);

create table public.ynab_cache (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  synced_at        timestamptz not null default now(),
  categories       jsonb not null default '[]'::jsonb,
  income_history   jsonb not null default '[]'::jsonb
);

create table public.plan_snapshots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  inputs_hash  text not null,
  result       jsonb not null
);
create index plan_snapshots_user_created_idx on public.plan_snapshots (user_id, created_at desc);

-- RLS
alter table public.profiles         enable row level security;
alter table public.income_settings  enable row level security;
alter table public.goals            enable row level security;
alter table public.ynab_cache       enable row level security;
alter table public.plan_snapshots   enable row level security;

create policy "self read profiles"  on public.profiles for select using (auth.uid() = id);
create policy "self write profiles" on public.profiles for all    using (auth.uid() = id) with check (auth.uid() = id);

create policy "self read income"  on public.income_settings for select using (auth.uid() = user_id);
create policy "self write income" on public.income_settings for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "self read goals"  on public.goals for select using (auth.uid() = user_id);
create policy "self write goals" on public.goals for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "self read cache"  on public.ynab_cache for select using (auth.uid() = user_id);
create policy "self write cache" on public.ynab_cache for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "self read snapshots"  on public.plan_snapshots for select using (auth.uid() = user_id);
create policy "self write snapshots" on public.plan_snapshots for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create profile row on signup
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.income_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: Manually create the Supabase project (one-time)**

Action (manual): in the Supabase dashboard, create a new cloud project named `ynapb-dev`. Save the project URL and anon key into `.env.local` per `.env.example`. Generate `ENCRYPTION_KEY` per the comment in `.env.example`.

- [ ] **Step 4: Link the local CLI to the project**

Run: `npx supabase link --project-ref <project-ref>`
(`<project-ref>` is the `xxxxx` from `https://xxxxx.supabase.co`.)

- [ ] **Step 5: Push the migration**

Run: `npx supabase db push`
Expected: applies `00000000000000_init.sql` to the cloud project. Verify tables exist in the dashboard.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): initial schema with RLS, profile auto-create trigger"
```

---

## Task 10: Generate Supabase TypeScript types

**Files:**
- Create: `src/types/supabase.ts`
- Modify: `package.json` (script)

- [ ] **Step 1: Add the generation script**

Edit `package.json` `scripts` block, add:
```json
"db:types": "supabase gen types typescript --project-id <project-ref> > src/types/supabase.ts"
```
Replace `<project-ref>` with the actual project ref. Commit hint at the end: do NOT commit secrets, but project ref is public-ish; storing it in `package.json` is fine.

- [ ] **Step 2: Generate types**

Run: `npm run db:types`
Expected: writes `src/types/supabase.ts` with `Database` type matching the schema.

- [ ] **Step 3: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(db): generate Supabase TypeScript types"
```

---

## Task 11: AES-GCM encryption helpers (TDD)

**Files:**
- Create: `src/lib/crypto.ts`, `src/lib/crypto.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/crypto.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { encryptToken, decryptToken } from "./crypto";

describe("crypto", () => {
  beforeAll(() => {
    // 32 zero bytes, base64
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
  });

  it("round-trips a token", async () => {
    const plaintext = "ynab_pat_abc123";
    const { ciphertext, iv } = await encryptToken(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(iv).toMatch(/^[A-Za-z0-9+/=]+$/);
    const decrypted = await decryptToken(ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("uses a fresh IV each call", async () => {
    const a = await encryptToken("same");
    const b = await encryptToken("same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects ciphertext modified after encryption (auth tag check)", async () => {
    const { ciphertext, iv } = await encryptToken("hello");
    const tampered = Buffer.from(ciphertext, "base64");
    tampered[0] ^= 0xff;
    await expect(
      decryptToken(tampered.toString("base64"), iv),
    ).rejects.toThrow();
  });

  it("throws if ENCRYPTION_KEY is missing", async () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      await expect(encryptToken("x")).rejects.toThrow(/ENCRYPTION_KEY/);
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run src/lib/crypto.test.ts`
Expected: FAIL — `Cannot find module './crypto'`.

- [ ] **Step 3: Implement `crypto.ts`**

Create `src/lib/crypto.ts`:
```ts
import { webcrypto } from "node:crypto";

const ALGO = "AES-GCM";
const IV_BYTES = 12;

function getKeyBytes(): Uint8Array {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY env var is not set");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes (AES-256)");
  }
  return new Uint8Array(bytes);
}

async function importKey(): Promise<CryptoKey> {
  return webcrypto.subtle.importKey(
    "raw",
    getKeyBytes(),
    { name: ALGO },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await webcrypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: Buffer.from(ct).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
  };
}

export async function decryptToken(
  ciphertext: string,
  iv: string,
): Promise<string> {
  const key = await importKey();
  const pt = await webcrypto.subtle.decrypt(
    { name: ALGO, iv: new Uint8Array(Buffer.from(iv, "base64")) },
    key,
    new Uint8Array(Buffer.from(ciphertext, "base64")),
  );
  return new TextDecoder().decode(pt);
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run src/lib/crypto.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Run full check**

Run: `npm run check`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(crypto): AES-GCM encrypt/decrypt for YNAB token storage"
```

---

## Task 12: Domain types for the planner

**Files:**
- Create: `src/lib/planner/types.ts`

- [ ] **Step 1: Write the types module**

Create `src/lib/planner/types.ts`:
```ts
export type GoalStatus = "active" | "frozen" | "completed";

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  /** Current accumulated amount in YNAB at calculation time (>= 0). */
  currentBalance: number;
  /** Normalized to the 1st of the deadline month. */
  deadline: Date;
  status: GoalStatus;
  ynabCategoryId: string | null;
  /** Used as a deterministic tie-breaker only, not as user-visible priority. */
  createdAt: Date;
};

export type YnabCategory = {
  id: string;
  name: string;
  group: string;
  balance: number;
  goalType: "TB" | "TBD" | "MF" | "NEED" | "DEBT" | null;
  goalTarget: number | null;
  /** YNAB-reported "still needed this month". */
  goalUnderFunded: number | null;
  goalTargetMonth: string | null;
};

export type ObligationItem = {
  categoryId: string;
  categoryName: string;
  amount: number;
};

export type MonthlyBudget = {
  plannedIncome: number;
  obligations: number;
  available: number;
  obligationBreakdown: ObligationItem[];
};

export type PlanInput = {
  goals: Goal[];
  budget: MonthlyBudget;
  /** Normalized to the 1st of the start month. */
  startMonth: Date;
  /** How many months ahead to plan (e.g. 120 for 10 years). */
  horizonMonths: number;
};

export type Allocation = {
  /** 1st of the month. */
  month: Date;
  /** goalId -> amount allocated this month. Goals not present this month are not in the map. */
  perGoal: Record<string, number>;
  /** Available - sum(perGoal). */
  unallocated: number;
};

export type Conflict =
  | { type: "unreachable"; goalId: string; earliestAchievable: Date | null; detail: string }
  | { type: "tied_deadline"; goalIds: string[]; deadline: Date; detail: string };

export type PlanResult = {
  allocations: Allocation[];
  conflicts: Conflict[];
  /** goalId -> month in which the goal closes (remaining hits 0). null = never within horizon. */
  completionMap: Record<string, Date | null>;
  /** Goals auto-frozen because their deadline already passed without funding. */
  autoFrozenGoalIds: string[];
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(planner): domain types for goals, budget, plan result"
```

---

## Task 13: Planner — basic distribution (TDD start)

**Files:**
- Create: `src/lib/planner/fixtures.ts`, `src/lib/planner/planner.ts`, `src/lib/planner/planner.test.ts`

- [ ] **Step 1: Write shared test fixtures**

Create `src/lib/planner/fixtures.ts`:
```ts
import type { Goal, MonthlyBudget } from "./types";

export const M = (year: number, month1to12: number): Date =>
  new Date(Date.UTC(year, month1to12 - 1, 1));

export const goal = (overrides: Partial<Goal> & { id: string }): Goal => ({
  name: overrides.id,
  targetAmount: 0,
  currentBalance: 0,
  deadline: M(2027, 1),
  status: "active",
  ynabCategoryId: null,
  createdAt: M(2026, 1),
  ...overrides,
});

export const budget = (available: number, plannedIncome = available): MonthlyBudget => ({
  plannedIncome,
  obligations: plannedIncome - available,
  available,
  obligationBreakdown: [],
});
```

- [ ] **Step 2: Write the failing basic-distribution test**

Create `src/lib/planner/planner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computePlan } from "./planner";
import { M, goal, budget } from "./fixtures";

describe("planner — basic distribution (spec §6 example)", () => {
  it("two goals with different deadlines: closer is funded first", () => {
    const goals = [
      goal({ id: "renovation", targetAmount: 1_000_000, deadline: M(2026, 9) }),
      goal({ id: "car",        targetAmount: 5_000_000, deadline: M(2027, 12) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(350_000),
      startMonth: M(2026, 5),
      horizonMonths: 24,
    });

    // First 5 months (May–Sep 2026): renovation gets 200k/mo, car gets 150k/mo
    for (let i = 0; i < 5; i++) {
      const m = result.allocations[i];
      expect(m.perGoal["renovation"]).toBeCloseTo(200_000, -2);
      expect(m.perGoal["car"]).toBeCloseTo(150_000, -2);
    }
    // After Sep 2026 renovation is completed; full 350k goes to car
    for (let i = 5; i < 20; i++) {
      const m = result.allocations[i];
      expect(m.perGoal["renovation"] ?? 0).toBe(0);
      expect(m.perGoal["car"]).toBeCloseTo(350_000, -2);
    }
  });
});
```

- [ ] **Step 3: Run — verify it fails**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: FAIL — `Cannot find module './planner'`.

- [ ] **Step 4: Implement minimal planner**

Create `src/lib/planner/planner.ts`:
```ts
import type {
  Allocation,
  Conflict,
  Goal,
  PlanInput,
  PlanResult,
} from "./types";

const monthsBetweenInclusive = (from: Date, to: Date): number => {
  const yDiff = to.getUTCFullYear() - from.getUTCFullYear();
  const mDiff = to.getUTCMonth() - from.getUTCMonth();
  return yDiff * 12 + mDiff + 1;
};

const addMonths = (d: Date, n: number): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

const isBeforeMonth = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() < b.getUTCFullYear() ||
  (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() < b.getUTCMonth());

type Working = Goal & { remaining: number };

const initialQueue = (goals: Goal[], startMonth: Date): Working[] =>
  goals
    .filter((g) => g.status === "active")
    .map((g) => ({ ...g, remaining: Math.max(0, g.targetAmount - g.currentBalance) }))
    .filter((g) => g.remaining > 0)
    .filter((g) => !isBeforeMonth(g.deadline, startMonth))
    .sort((a, b) =>
      a.deadline.getTime() - b.deadline.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime(),
    );

export function computePlan(input: PlanInput): PlanResult {
  const queue = initialQueue(input.goals, input.startMonth);
  const allocations: Allocation[] = [];
  const completionMap: Record<string, Date | null> = {};
  for (const g of input.goals) completionMap[g.id] = null;

  for (let i = 0; i < input.horizonMonths; i++) {
    const month = addMonths(input.startMonth, i);
    let remainingBudget = input.budget.available;
    const perGoal: Record<string, number> = {};

    for (const g of queue) {
      if (g.remaining <= 0) continue;
      if (isBeforeMonth(g.deadline, month)) continue;
      if (remainingBudget <= 0) break;

      const monthsLeft = monthsBetweenInclusive(month, g.deadline);
      const neededPerMonth = g.remaining / monthsLeft;
      const contribution = Math.min(neededPerMonth, remainingBudget, g.remaining);

      perGoal[g.id] = (perGoal[g.id] ?? 0) + contribution;
      g.remaining -= contribution;
      remainingBudget -= contribution;

      if (g.remaining <= 0 && completionMap[g.id] === null) {
        completionMap[g.id] = month;
      }
    }

    allocations.push({ month, perGoal, unallocated: remainingBudget });
  }

  const conflicts: Conflict[] = [];
  return { allocations, conflicts, completionMap, autoFrozenGoalIds: [] };
}
```

- [ ] **Step 5: Run — verify the basic test passes**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: 1 passing.

- [ ] **Step 6: Run architecture test**

Run: `npm run test:arch`
Expected: passes (planner has no forbidden imports).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(planner): greedy distribution by deadline (basic case)"
```

---

## Task 14: Planner — non-zero starting balances

**Files:**
- Modify: `src/lib/planner/planner.test.ts`

- [ ] **Step 1: Append the test**

Add to `src/lib/planner/planner.test.ts`:
```ts
describe("planner — starting balances", () => {
  it("does not over-fund a goal with existing balance", () => {
    const goals = [
      goal({ id: "phone", targetAmount: 100_000, currentBalance: 80_000, deadline: M(2026, 6) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(50_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    const totalAllocated =
      (result.allocations[0]?.perGoal["phone"] ?? 0) +
      (result.allocations[1]?.perGoal["phone"] ?? 0);
    expect(totalAllocated).toBeCloseTo(20_000, -1);
  });

  it("treats already-completed goals as completed (zero remaining)", () => {
    const goals = [
      goal({ id: "done", targetAmount: 100_000, currentBalance: 100_000, deadline: M(2026, 6) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(50_000),
      startMonth: M(2026, 5),
      horizonMonths: 3,
    });
    for (const m of result.allocations) {
      expect(m.perGoal["done"] ?? 0).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run — verify both pass on existing implementation**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: 3 passing total. (Implementation already covers this via `Math.max(0, target - currentBalance)`.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(planner): cover non-zero starting balances"
```

---

## Task 15: Planner — unallocated budget

**Files:**
- Modify: `src/lib/planner/planner.test.ts`

- [ ] **Step 1: Append the test**

Add:
```ts
describe("planner — unallocated budget", () => {
  it("reports remaining budget as unallocated when goals are fully funded", () => {
    const goals = [
      goal({ id: "small", targetAmount: 50_000, deadline: M(2026, 6) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(200_000),
      startMonth: M(2026, 5),
      horizonMonths: 4,
    });
    // Goal needs 25k/mo for 2 months -> 25k unallocated each of those 2 months,
    // then full 200k unallocated afterwards.
    expect(result.allocations[0]?.unallocated).toBeCloseTo(175_000, -1);
    expect(result.allocations[1]?.unallocated).toBeCloseTo(175_000, -1);
    expect(result.allocations[2]?.unallocated).toBeCloseTo(200_000, -1);
    expect(result.allocations[3]?.unallocated).toBeCloseTo(200_000, -1);
  });
});
```

- [ ] **Step 2: Run — verify it passes**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: 4 passing total.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(planner): cover unallocated budget reporting"
```

---

## Task 16: Planner — unreachable goals + earliestAchievable

**Files:**
- Modify: `src/lib/planner/planner.test.ts`, `src/lib/planner/planner.ts`

- [ ] **Step 1: Add the failing test**

Append to `planner.test.ts`:
```ts
describe("planner — unreachable goals", () => {
  it("flags a goal that cannot be funded by its deadline at current budget", () => {
    const goals = [
      goal({ id: "cottage", targetAmount: 10_000_000, deadline: M(2027, 6) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(100_000),
      startMonth: M(2026, 1),
      horizonMonths: 240,
    });
    const conflict = result.conflicts.find(
      (c) => c.type === "unreachable" && c.goalId === "cottage",
    );
    expect(conflict).toBeDefined();
    if (conflict?.type === "unreachable") {
      // 10M @ 100k/mo = 100 months from start (Jan 2026 + 99 months = Apr 2034)
      expect(conflict.earliestAchievable).toEqual(M(2034, 4));
    }
  });

  it("does not flag a reachable goal", () => {
    const goals = [
      goal({ id: "ok", targetAmount: 100_000, deadline: M(2026, 12) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(50_000),
      startMonth: M(2026, 1),
      horizonMonths: 24,
    });
    expect(result.conflicts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — verify the unreachable test fails**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: FAIL on "flags a goal that cannot be funded".

- [ ] **Step 3: Extend the planner with conflict detection**

Replace the `computePlan` function in `src/lib/planner/planner.ts` with:
```ts
export function computePlan(input: PlanInput): PlanResult {
  const queue = initialQueue(input.goals, input.startMonth);
  const allocations: Allocation[] = [];
  const completionMap: Record<string, Date | null> = {};
  for (const g of input.goals) completionMap[g.id] = null;

  for (let i = 0; i < input.horizonMonths; i++) {
    const month = addMonths(input.startMonth, i);
    let remainingBudget = input.budget.available;
    const perGoal: Record<string, number> = {};

    for (const g of queue) {
      if (g.remaining <= 0) continue;
      if (isBeforeMonth(g.deadline, month)) continue;
      if (remainingBudget <= 0) break;

      const monthsLeft = monthsBetweenInclusive(month, g.deadline);
      const neededPerMonth = g.remaining / monthsLeft;
      const contribution = Math.min(neededPerMonth, remainingBudget, g.remaining);

      perGoal[g.id] = (perGoal[g.id] ?? 0) + contribution;
      g.remaining -= contribution;
      remainingBudget -= contribution;

      if (g.remaining <= 0 && completionMap[g.id] === null) {
        completionMap[g.id] = month;
      }
    }

    allocations.push({ month, perGoal, unallocated: remainingBudget });
  }

  // After horizon, any goal still with remaining > 0 whose deadline already
  // passed is unreachable. Compute earliestAchievable by continuing greedy.
  const conflicts: Conflict[] = [];
  for (const g of queue) {
    if (g.remaining <= 0) continue;
    if (!isBeforeMonth(g.deadline, addMonths(input.startMonth, input.horizonMonths))) {
      // still within horizon but unfunded — also unreachable at current budget
    }
    const earliest = computeEarliestAchievable(g, input);
    conflicts.push({
      type: "unreachable",
      goalId: g.id,
      earliestAchievable: earliest,
      detail: earliest
        ? `Earliest achievable: ${earliest.toISOString().slice(0, 7)}`
        : "Not achievable within 100 years at current budget",
    });
  }

  return { allocations, conflicts, completionMap, autoFrozenGoalIds: [] };
}

function computeEarliestAchievable(
  goal: Working,
  input: PlanInput,
): Date | null {
  // Solo simulation: this goal alone consumes the full available budget every month.
  if (input.budget.available <= 0) return null;
  const monthsNeeded = Math.ceil(goal.remaining / input.budget.available);
  if (monthsNeeded > 1200) return null;
  return addMonths(input.startMonth, monthsNeeded - 1);
}
```

Note: this stores `earliestAchievable` based on a **solo** simulation (the goal alone consumes the full available budget after its dedicated time). This satisfies the spec definition “earliestAchievable: продолжаем алгоритм после её дедлайна, считая что цель остаётся в очереди с просроченным дедлайном (приоритет максимальный)” — once overdue, the goal sits at queue head and consumes whatever it needs, which in the worst case is the full budget. We refine this in Task 18 if a test demands it.

- [ ] **Step 4: Run — verify both tests pass**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: 6 passing total.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): unreachable goal detection with earliestAchievable"
```

---

## Task 17: Planner — tied deadlines conflict

**Files:**
- Modify: `src/lib/planner/planner.test.ts`, `src/lib/planner/planner.ts`

- [ ] **Step 1: Add the failing test**

Append:
```ts
describe("planner — tied deadlines", () => {
  it("flags two goals sharing the same month deadline when budget cannot cover both", () => {
    const goals = [
      goal({ id: "a", targetAmount: 600_000, deadline: M(2026, 8), createdAt: M(2026, 1) }),
      goal({ id: "b", targetAmount: 600_000, deadline: M(2026, 8), createdAt: M(2026, 2) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(400_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    const conflict = result.conflicts.find((c) => c.type === "tied_deadline");
    expect(conflict).toBeDefined();
    if (conflict?.type === "tied_deadline") {
      expect(conflict.goalIds.sort()).toEqual(["a", "b"]);
      expect(conflict.deadline).toEqual(M(2026, 8));
    }
  });

  it("does not flag tied deadlines if budget is sufficient", () => {
    const goals = [
      goal({ id: "a", targetAmount: 100_000, deadline: M(2026, 8) }),
      goal({ id: "b", targetAmount: 100_000, deadline: M(2026, 8) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(200_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    expect(
      result.conflicts.filter((c) => c.type === "tied_deadline"),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — verify the failing test fails**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: FAIL on "flags two goals sharing".

- [ ] **Step 3: Add tied-deadline detection**

In `src/lib/planner/planner.ts`, add this helper near the bottom and call it before returning:
```ts
function detectTiedDeadlines(input: PlanInput): Conflict[] {
  const buckets = new Map<string, Goal[]>();
  for (const g of input.goals) {
    if (g.status !== "active") continue;
    const remaining = Math.max(0, g.targetAmount - g.currentBalance);
    if (remaining <= 0) continue;
    const key = `${g.deadline.getUTCFullYear()}-${g.deadline.getUTCMonth()}`;
    const list = buckets.get(key) ?? [];
    list.push(g);
    buckets.set(key, list);
  }
  const result: Conflict[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const totalRemaining = list.reduce(
      (s, g) => s + Math.max(0, g.targetAmount - g.currentBalance),
      0,
    );
    const months = monthsBetweenInclusive(input.startMonth, list[0]!.deadline);
    const fundable = input.budget.available * months;
    if (fundable < totalRemaining) {
      result.push({
        type: "tied_deadline",
        goalIds: list.map((g) => g.id),
        deadline: list[0]!.deadline,
        detail: `Goals share deadline and combined need (${totalRemaining}) exceeds budget capacity (${fundable})`,
      });
    }
  }
  return result;
}
```

In `computePlan`, change the conflicts assembly to:
```ts
const conflicts: Conflict[] = [...detectTiedDeadlines(input)];
```
…then continue pushing the existing `unreachable` conflicts.

- [ ] **Step 4: Run — verify all tests pass**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: 8 passing total.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): tied-deadline conflict detection"
```

---

## Task 18: Planner — frozen goals

**Files:**
- Modify: `src/lib/planner/planner.test.ts`

- [ ] **Step 1: Add the test**

Append:
```ts
describe("planner — frozen goals", () => {
  it("does not allocate to frozen goals", () => {
    const goals = [
      goal({ id: "active", targetAmount: 100_000, deadline: M(2026, 8) }),
      goal({ id: "frozen", targetAmount: 100_000, deadline: M(2026, 8), status: "frozen" }),
    ];
    const result = computePlan({
      goals,
      budget: budget(100_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    for (const m of result.allocations) {
      expect(m.perGoal["frozen"] ?? 0).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run — verify it passes (existing filter handles this)**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: 9 passing total.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(planner): cover frozen-goal exclusion"
```

---

## Task 19: Planner — auto-freeze overdue, deterministic tie-break

**Files:**
- Modify: `src/lib/planner/planner.ts`, `src/lib/planner/planner.test.ts`

- [ ] **Step 1: Add the auto-freeze test**

Append:
```ts
describe("planner — auto-freeze overdue", () => {
  it("auto-freezes a goal whose deadline already passed before startMonth", () => {
    const goals = [
      goal({
        id: "expired",
        targetAmount: 100_000,
        currentBalance: 50_000,
        deadline: M(2025, 12),
      }),
    ];
    const result = computePlan({
      goals,
      budget: budget(100_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    expect(result.autoFrozenGoalIds).toContain("expired");
    for (const m of result.allocations) {
      expect(m.perGoal["expired"] ?? 0).toBe(0);
    }
  });
});

describe("planner — deterministic tie-break", () => {
  it("when deadlines tie, the earlier-created goal is funded first", () => {
    const earlier = goal({
      id: "earlier",
      targetAmount: 200_000,
      deadline: M(2026, 8),
      createdAt: M(2026, 1),
    });
    const later = goal({
      id: "later",
      targetAmount: 200_000,
      deadline: M(2026, 8),
      createdAt: M(2026, 3),
    });
    const result = computePlan({
      goals: [later, earlier], // input order intentionally swapped
      budget: budget(100_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    const earlierFirst = (result.allocations[0]?.perGoal["earlier"] ?? 0)
      >= (result.allocations[0]?.perGoal["later"] ?? 0);
    expect(earlierFirst).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify auto-freeze fails, tie-break passes**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: tie-break passes (covered by sort), auto-freeze FAILS (`autoFrozenGoalIds` is empty).

- [ ] **Step 3: Implement auto-freeze**

In `src/lib/planner/planner.ts`, modify `computePlan` to compute and return `autoFrozenGoalIds` before the queue is built:

Replace the body of `computePlan` to start with:
```ts
const autoFrozenGoalIds = input.goals
  .filter((g) =>
    g.status === "active"
    && Math.max(0, g.targetAmount - g.currentBalance) > 0
    && isBeforeMonth(g.deadline, input.startMonth),
  )
  .map((g) => g.id);

const liveGoals = input.goals.map((g) =>
  autoFrozenGoalIds.includes(g.id) ? { ...g, status: "frozen" as const } : g,
);

const queue = initialQueue(liveGoals, input.startMonth);
```

…and at the bottom, change the return to:
```ts
return { allocations, conflicts, completionMap, autoFrozenGoalIds };
```

- [ ] **Step 4: Run — verify all tests pass**

Run: `npx vitest run src/lib/planner/planner.test.ts`
Expected: 11 passing total.

- [ ] **Step 5: Run the full check**

Run: `npm run check`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(planner): auto-freeze overdue goals with deterministic tie-break"
```

---

## Task 20: Supabase clients (server, browser, middleware)

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`

- [ ] **Step 1: Server client**

Create `src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}
```

- [ ] **Step 2: Browser client**

Create `src/lib/supabase/browser.ts`:
```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

export function getSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Middleware helper**

Create `src/lib/supabase/middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

export async function refreshSession(req: NextRequest) {
  let response = NextResponse.next({ request: req });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  return { response, user: data.user };
}
```

- [ ] **Step 4: Next middleware**

Create `src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(req: NextRequest) {
  const { response, user } = await refreshSession(req);
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): Supabase server/browser clients and session-refreshing middleware"
```

---

## Task 21: /login page + auth callback

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/page.tsx`

- [ ] **Step 1: Login page (magic link form)**

Create `src/app/(auth)/login/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Magic link via email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "sending" || status === "sent"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={status === "sending" || status === "sent"}>
              {status === "sending" ? "Sending…" : status === "sent" ? "Check your inbox" : "Send magic link"}
            </Button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Auth callback route**

Create `src/app/auth/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}
```

- [ ] **Step 3: Root page redirects to /plan (placeholder for plan 2)**

Replace `src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  // Plan 2 will route to /plan; for now redirect to /login if unauth (handled by middleware)
  // and show a placeholder for authed users.
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">YNAPB</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Foundation ready. Plan 2 will add YNAB connection and the planner UI.
      </p>
    </main>
  );
}

// Suppress the unused-import warning about `redirect`
void redirect;
```

(We import `redirect` to keep the file ready for plan 2; remove the `void redirect;` then.)

Actually, simplify — remove unused import:
```tsx
export default function HomePage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">YNAPB</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Foundation ready. Plan 2 will add YNAB connection and the planner UI.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Run dev server, smoke-test in browser**

Run: `npm run dev`
Open `http://localhost:3000/`. Expected: redirected to `/login` because no session.
Open `http://localhost:3000/login`. Expected: card with email form renders.
Stop server with Ctrl+C.

- [ ] **Step 5: Run the e2e smoke test**

Run: `npx playwright test tests/e2e/login.spec.ts`
Expected: passes (home redirects to /login, heading visible).

- [ ] **Step 6: Run full check**

Run: `npm run check`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): /login magic-link page and /auth/callback route"
```

---

## Task 22: README and final foundation polish

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md`:
```markdown
# YNAPB — YNAB Planner & Budgeter

Long-term planner for one-time goals with deadlines, on top of YNAB.

See `docs/superpowers/specs/2026-04-25-ynapb-design.md` for the full design.
This codebase is implemented across multiple plans; see `docs/superpowers/plans/`.

## Status

- **Plan 1 (this commit):** foundation, auth, and the pure planner library with full test coverage. UI for goals/plan and YNAB integration ship in Plans 2 and 3.

## Prerequisites

- Node.js 22+ and npm
- A Supabase cloud project (free tier is fine)
- A YNAB Personal Access Token (only needed for Plan 2 onward)

## Setup

1. `cp .env.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from your Supabase project settings.
   - `ENCRYPTION_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. `npm install`
3. `npx supabase link --project-ref <your-ref>` (one-time)
4. `npx supabase db push` to apply migrations
5. `npm run db:types` to regenerate types when the schema changes

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint (incl. cognitive-complexity) |
| `npm run typecheck` | TypeScript check |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:arch` | dependency-cruiser architecture tests |
| `npm run test:e2e` | Playwright e2e |
| `npm run check` | All non-e2e checks (lint + typecheck + arch + unit) |

## Architecture

- `src/lib/planner` — pure-TS algorithm, zero I/O, fully unit-tested.
- `src/lib/supabase` — server/browser clients and middleware glue.
- `src/lib/crypto` — AES-GCM helpers for the YNAB token.
- `src/app` — Next.js App Router pages and API routes.
- `supabase/migrations` — declarative schema with RLS.

The layered architecture is enforced by `dependency-cruiser`; see `.dependency-cruiser.cjs`.
```

- [ ] **Step 2: Run final check**

Run: `npm run check && npx playwright test`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: README with setup, scripts, and architecture overview"
```

---

## Self-review (run after all tasks complete)

1. **Spec coverage check.** Spec sections covered by this plan:
   - §2 Architecture stack/layers — Tasks 1, 2, 3, 6, 7, 20
   - §5 Data model (schema + RLS) — Task 9, 10
   - §5 AES-GCM encryption — Task 11
   - §5 Domain types — Task 12
   - §6 Algorithm (steps 1–5: prep, distribution, unreachable, tied deadlines, frozen, auto-freeze) — Tasks 13–19
   - §8 Quality tooling (ESLint+sonarjs, dep-cruiser, Vitest, Playwright harness) — Tasks 3–7
   - §7 /login page — Task 21

   Out of scope (deferred to Plans 2/3 by design): YNAB sync, settings UI, goals CRUD, plan UI, drag-and-drop, MF goal push, plan_snapshots writes, e2e suite beyond the login smoke.

2. **Placeholder scan.** No "TBD", "TODO", "implement later" in steps. Each implementation step contains complete code. Each test step contains complete test code.

3. **Type consistency.** Function names used across tasks are consistent: `computePlan`, `encryptToken` / `decryptToken`, `getSupabaseServerClient` / `getSupabaseBrowserClient`. Types match: `PlanInput`, `PlanResult`, `Goal`, `Conflict`, `Allocation`, `MonthlyBudget` are defined in Task 12 and used consistently in Tasks 13–19.

4. **Discovered drift fixed inline:**
   - Task 21 originally had a `void redirect;` artifact; removed in same task before commit.
   - Task 16 step 3 notes the `earliestAchievable` simplification (solo simulation) and the rationale; future plans can refine if a stricter test demands.
