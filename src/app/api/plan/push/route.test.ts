import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCache,
  parseCachedCategories,
  patchCachedCategories,
} from "@/lib/repositories/ynab-cache-repo";
import { listGoals } from "@/lib/repositories/goals-repo";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import { pushAssignedMoves, pushMonthlyFundingGoals } from "@/lib/ynab/push-mf";
import type { Json } from "@/types/supabase";

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
    const cache = {
      user_id: "user",
      income_history: [],
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
      async (_userId, patches) => {
        cache.categories = parseCachedCategories(cache.categories).map(
          (category) => ({ ...category, ...patches.get(category.id) }),
        ) as unknown as Json;
      },
    );
  });

  afterEach(() => vi.useRealTimers());

  it("only previews moves, then applies them once with the accepted diff", async () => {
    const response = await callPush(
      request({ mode: "preview", month: "2026-10" }),
    );
    expect(response.status).toBe(200);
    const preview = await response.json();
    // Filling the month target must not shrink it and create false overfunding.
    expect(preview.diff).toEqual([]);
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
});
