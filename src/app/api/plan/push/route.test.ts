import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCache,
  parseCachedCategories,
  patchCachedCategories,
} from "@/lib/repositories/ynab-cache-repo";
import { listGoals } from "@/lib/repositories/goals-repo";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import { pushAssignedMoves, pushMonthlyFundingGoals } from "@/lib/ynab/push-mf";
import type { Json, Tables } from "@/types/supabase";

import { POST } from "./route";

vi.mock("@/lib/api/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user"),
}));
vi.mock("@/lib/crypto", () => ({ decryptToken: vi.fn(async () => "fixture") }));
vi.mock("@/lib/repositories/goals-repo", () => ({
  listGoals: vi.fn(),
  setGoalYnabCategoryId: vi.fn(),
}));
vi.mock("@/lib/repositories/income-settings-repo", () => ({
  getIncomeSettings: vi.fn(),
}));
vi.mock("@/lib/repositories/plan-snapshots-repo", () => ({
  createAndTrimPlanSnapshot: vi.fn(),
  DEFAULT_PLAN_SNAPSHOT_KEEP: 10,
}));
vi.mock("@/lib/repositories/profile-repo", () => ({
  getProfile: vi.fn(async () => ({
    ynab_budget_id: "budget",
    ynab_token_ct: "fixture",
    ynab_token_iv: "fixture",
  })),
}));
vi.mock("@/lib/ynab/goal-category-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ynab/goal-category-link")>()),
  ensureGoalCategoryLink: vi.fn(async ({ goal }) => goal.ynab_category_id),
}));
vi.mock("@/lib/repositories/ynab-cache-repo", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/repositories/ynab-cache-repo")
  >()),
  getCache: vi.fn(),
  patchCachedCategories: vi.fn(),
}));
vi.mock("@/lib/ynab/push-mf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ynab/push-mf")>()),
  pushMonthlyFundingGoals: vi.fn(),
  pushAssignedMoves: vi.fn(),
}));

const NOW = "2026-10-25T12:00:00.000Z";
const request = (body: unknown) =>
  new Request("http://example.test/api/plan/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const callPush = async (input: Request) => {
  const response = await POST(input);
  if (!response) throw new Error("Push returned no response");
  return response;
};

describe("Push after automatic target updates", () => {
  let cache: Tables<"ynab_cache">;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const goals = [
      { id: "house", target_amount: 1_200_000, deadline: "2027-04-01" },
      { id: "vacation", target_amount: 300_000, deadline: "2026-12-01" },
    ].map((item) => ({
      ...item,
      name: item.id,
      ynab_category_id: item.id,
      status: "active" as const,
      user_id: "user",
      notes: null,
      created_at: NOW,
      updated_at: NOW,
      last_sync_status: "synced",
      last_sync_error: null,
      last_synced_at: NOW,
    }));
    vi.mocked(listGoals).mockResolvedValue(goals);
    vi.mocked(getIncomeSettings).mockResolvedValue({
      user_id: "user",
      planned_income: 300_000,
      baseline_months: 6,
      updated_at: NOW,
    });
    cache = {
      user_id: "user",
      income_history: [],
      ready_to_assign: 0,
      synced_at: NOW,
      categories: [
        {
          id: "house",
          name: "house",
          assigned: 700_000,
          balance: 700_000,
          goal_target: 171_428.571,
        },
        {
          id: "vacation",
          name: "vacation",
          assigned: 0,
          balance: 0,
          goal_target: 100_000,
        },
      ] as Json,
    };
    vi.mocked(getCache).mockImplementation(async () => cache);
    vi.mocked(patchCachedCategories).mockImplementation(
      async (_userId, patches, options) => {
        cache.categories = parseCachedCategories(cache.categories).map(
          (category) => ({ ...category, ...patches.get(category.id) }),
        ) as unknown as Json;
        cache.ready_to_assign = Math.max(
          0,
          (cache.ready_to_assign ?? 0) + (options?.readyToAssignDelta ?? 0),
        );
      },
    );
    vi.mocked(pushAssignedMoves).mockImplementation(
      async ({ moves, onMoveApplied }) => {
        for (const move of moves) {
          await onMoveApplied?.(move);
        }
      },
    );
  });

  afterEach(() => vi.useRealTimers());

  const setAssigned = (categoryId: string, assigned: number) => {
    cache.categories = parseCachedCategories(cache.categories).map(
      (category) =>
        category.id === categoryId
          ? { ...category, assigned, balance: assigned }
          : category,
    ) as unknown as Json;
  };

  const setBalance = (categoryId: string, balance: number) => {
    cache.categories = parseCachedCategories(cache.categories).map(
      (category) =>
        category.id === categoryId ? { ...category, balance } : category,
    ) as unknown as Json;
  };

  it("only previews moves, then applies them once with the accepted diff", async () => {
    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    expect(response.status).toBe(200);
    const preview = await response.json();
    // The target follows the final assigned amount to avoid overfunding.
    expect(preview.diff).toEqual([
      {
        categoryId: "house",
        categoryName: "house",
        current: 171_428_571,
        next: 600_000_000,
      },
    ]);
    expect(preview.assignedMoves).toEqual([
      {
        categoryId: "house",
        categoryName: "house",
        current: 700_000_000,
        next: 600_000_000,
      },
      {
        categoryId: "vacation",
        categoryName: "vacation",
        current: 0,
        next: 100_000_000,
      },
    ]);
    expect(pushAssignedMoves).not.toHaveBeenCalled();
    expect(pushMonthlyFundingGoals).not.toHaveBeenCalled();

    const applied = await callPush(
      request({
        mode: "apply",
        month: "2026-10",
        acceptedDiffHash: preview.diffHash,
      }),
    );
    expect(applied.status).toBe(200);
    expect(pushAssignedMoves).toHaveBeenCalledTimes(1);
    expect(pushAssignedMoves).toHaveBeenCalledWith(
      expect.objectContaining({ moves: preview.assignedMoves }),
    );

    const repeated = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    expect(await repeated.json()).toMatchObject({
      assignedMoves: [],
      diff: [],
    });
  });

  it("does not move money when the accepted preview is stale", async () => {
    const response = await callPush(
      request({
        mode: "apply",
        month: "2026-10",
        acceptedDiffHash: "outdated",
      }),
    );
    expect(response.status).toBe(409);
    expect(pushAssignedMoves).not.toHaveBeenCalled();
    expect(pushMonthlyFundingGoals).not.toHaveBeenCalled();
  });

  it("separates RTA preview moves and combines them only for apply", async () => {
    setAssigned("house", 250_000);
    cache.ready_to_assign = 50_000_000;

    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    const preview = await response.json();
    expect(preview.assignedMoves).toEqual([
      {
        categoryId: "house",
        categoryName: "house",
        current: 250_000_000,
        next: 171_428_571,
      },
      {
        categoryId: "vacation",
        categoryName: "vacation",
        current: 0,
        next: 78_571_429,
      },
    ]);
    expect(preview.readyToAssignMoves).toEqual([
      {
        categoryId: "vacation",
        categoryName: "vacation",
        current: 78_571_429,
        next: 128_571_429,
      },
    ]);
    expect(preview.diff).toEqual([
      {
        categoryId: "vacation",
        categoryName: "vacation",
        current: 100_000_000,
        next: 128_571_429,
      },
    ]);

    await callPush(
      request({
        mode: "apply",
        month: "2026-10",
        acceptedDiffHash: preview.diffHash,
      }),
    );
    expect(pushAssignedMoves).toHaveBeenCalledWith(
      expect.objectContaining({
        moves: [
          {
            categoryId: "house",
            categoryName: "house",
            current: 250_000_000,
            next: 171_428_571,
          },
          {
            categoryId: "vacation",
            categoryName: "vacation",
            current: 0,
            next: 128_571_429,
          },
        ],
      }),
    );
    expect(pushMonthlyFundingGoals).toHaveBeenCalledWith(
      expect.objectContaining({ updates: preview.diff }),
    );

    const repeated = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    expect(await repeated.json()).toMatchObject({
      diff: [],
      assignedMoves: [],
      readyToAssignMoves: [],
      readyToAssign: { available: 0, remaining: 0 },
    });
  });

  it("uses partial RTA in deadline priority order without overspending", async () => {
    setAssigned("house", 0);
    cache.ready_to_assign = 150_000_000;

    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    const preview = await response.json();
    expect(preview.readyToAssignMoves).toEqual([
      {
        categoryId: "vacation",
        categoryName: "vacation",
        current: 0,
        next: 150_000_000,
      },
    ]);
    expect(preview.readyToAssign).toEqual({
      available: 150_000_000,
      remaining: 0,
    });
  });

  it("raises targets to cover existing assigned money when RTA is empty", async () => {
    setAssigned("house", 367_229);
    setAssigned("vacation", 300_000);
    cache.ready_to_assign = 0;

    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    const preview = await response.json();
    expect(preview.assignedMoves).toEqual([]);
    expect(preview.readyToAssignMoves).toEqual([]);
    expect(preview.diff).toEqual([
      {
        categoryId: "house",
        categoryName: "house",
        current: 171_428_571,
        next: 367_229_000,
      },
      {
        categoryId: "vacation",
        categoryName: "vacation",
        current: 100_000_000,
        next: 300_000_000,
      },
    ]);
  });

  it("does not preserve a date-based target as a monthly target", async () => {
    setAssigned("house", 171_428.571);
    setAssigned("vacation", 100_000);
    cache.categories = parseCachedCategories(cache.categories).map(
      (category) =>
        category.id === "vacation"
          ? {
              ...category,
              goal_target: 300_000,
              goal_target_month: "2026-12-01",
            }
          : category,
    ) as Json;

    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    const preview = await response.json();
    expect(preview.diff).toEqual([
      {
        categoryId: "vacation",
        categoryName: "vacation",
        current: 300_000_000,
        next: 100_000_000,
        clearsTargetDate: true,
      },
    ]);
  });

  it("does not assign RTA to auto-frozen overdue goals", async () => {
    const goals = await listGoals("user");
    vi.mocked(listGoals).mockResolvedValue(
      goals.map((goal) =>
        goal.id === "vacation" ? { ...goal, deadline: "2026-09-01" } : goal,
      ),
    );
    setAssigned("house", 171_428.571);
    cache.ready_to_assign = 100_000_000;

    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    const preview = await response.json();
    expect(preview.readyToAssignMoves).toEqual([
      {
        categoryId: "house",
        categoryName: "house",
        current: 171_428_571,
        next: 271_428_571,
      },
    ]);
  });

  it("uses RTA toward full goal deficits and rejects apply when only it changes", async () => {
    setAssigned("house", 171_428.571);
    cache.ready_to_assign = 395_800_000;

    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    const preview = await response.json();
    expect(preview.readyToAssignMoves).toEqual([
      {
        categoryId: "house",
        categoryName: "house",
        current: 171_428_571,
        next: 267_228_571,
      },
      {
        categoryId: "vacation",
        categoryName: "vacation",
        current: 0,
        next: 300_000_000,
      },
    ]);
    expect(preview.readyToAssign).toEqual({
      available: 395_800_000,
      remaining: 0,
    });

    cache.ready_to_assign += 1_000;
    const stale = await callPush(
      request({
        mode: "apply",
        month: "2026-10",
        acceptedDiffHash: preview.diffHash,
      }),
    );
    expect(stale.status).toBe(409);
    expect(pushAssignedMoves).not.toHaveBeenCalled();
  });

  it("excludes negative categories from RTA without replacing rebalancing", async () => {
    cache.ready_to_assign = -1;
    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    const preview = await response.json();
    expect(preview.readyToAssignMoves).toEqual([]);
    expect(preview.assignedMoves).toHaveLength(2);

    setAssigned("house", 200_000);
    setAssigned("vacation", -10_000);
    cache.ready_to_assign = 100_000_000;
    const negative = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    expect(await negative.json()).toMatchObject({
      assignedMoves: [],
      readyToAssignMoves: [
        {
          categoryId: "house",
          current: 200_000_000,
          next: 300_000_000,
        },
      ],
    });

    setAssigned("house", 171_428.571);
    setAssigned("vacation", 0);
    setBalance("vacation", -1);
    const overspent = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    expect(await overspent.json()).toMatchObject({
      assignedMoves: [],
      readyToAssignMoves: [
        {
          categoryId: "house",
          current: 171_428_571,
          next: 271_428_571,
        },
      ],
    });
  });

  it("recovers cache and RTA after a successful rebalance decrease", async () => {
    vi.mocked(pushAssignedMoves).mockImplementation(
      async ({ onMoveApplied }) => {
        await onMoveApplied?.({
          categoryId: "house",
          categoryName: "house",
          current: 700_000_000,
          next: 600_000_000,
        });
        throw new Error("YNAB unavailable");
      },
    );

    const response = await callPush(
      request({
        mode: "apply",
        month: "2026-10",
        acceptedDiffHash: (
          await (
            await callPush(request({ mode: "preview", month: "2026-10" }))
          ).json()
        ).diffHash,
      }),
    );
    expect(response.status).toBe(500);
    const categories = parseCachedCategories(cache.categories);
    expect(
      categories.find((category) => category.id === "house")?.assigned,
    ).toBe(600_000);
    expect(
      categories.find((category) => category.id === "vacation")?.assigned,
    ).toBe(0);
    expect(cache.ready_to_assign).toBe(100_000_000);
  });

  it("rejects cache synced in the previous calendar month", async () => {
    vi.setSystemTime(new Date("2026-10-01T00:00:00.000Z"));
    cache.synced_at = "2026-09-30T23:59:30.000Z";

    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ needsSync: true });
    expect(pushAssignedMoves).not.toHaveBeenCalled();
  });
});
