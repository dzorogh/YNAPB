import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listGoals } from "@/lib/repositories/goals-repo";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import {
  type CachedYnabCategory,
  parseCachedCategories,
  patchCachedCategories,
  upsertCache,
} from "@/lib/repositories/ynab-cache-repo";
import { pushAssignedMoves, pushMonthlyFundingGoals } from "@/lib/ynab/push-mf";
import { syncYnabData } from "@/lib/ynab/sync";
import type { Json, Tables } from "@/types/supabase";

import { syncPlanTargets } from "./sync-plan-targets";

vi.mock("@/lib/repositories/goals-repo", () => ({ listGoals: vi.fn() }));
vi.mock("@/lib/repositories/income-settings-repo", () => ({
  getIncomeSettings: vi.fn(),
}));
vi.mock("@/lib/repositories/ynab-cache-repo", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/repositories/ynab-cache-repo")
  >()),
  upsertCache: vi.fn(),
  patchCachedCategories: vi.fn(),
}));
vi.mock("@/lib/ynab/push-mf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ynab/push-mf")>()),
  pushMonthlyFundingGoals: vi.fn(),
  pushAssignedMoves: vi.fn(),
}));
vi.mock("@/lib/ynab/sync", () => ({ syncYnabData: vi.fn() }));

const NOW = "2026-10-25T12:00:00.000Z";
const connection = { token: "fixture", budgetId: "budget" };
const goal = (
  id: string,
  amount: number,
  deadline: string,
  status: Tables<"goals">["status"] = "active",
): Tables<"goals"> => ({
  id,
  user_id: "user",
  name: id,
  target_amount: amount,
  deadline,
  status,
  notes: null,
  ynab_category_id: id,
  created_at: NOW,
  updated_at: NOW,
  last_sync_status: "synced",
  last_sync_error: null,
  last_synced_at: NOW,
});

const category = (
  id: string,
  assigned: number,
  target: number | null,
): CachedYnabCategory => ({
  id,
  name: id,
  assigned,
  balance: assigned,
  goal_target: target,
  goal_type: target === null ? null : "MF",
  goal_cadence: 1,
  goal_target_month: null,
  goal_under_funded: 0,
  activity: 0,
  prior_month_available: 0,
  cash_spent_total: 0,
  hidden: false,
  deleted: false,
  assigned_history: [],
});

describe("syncPlanTargets", () => {
  let categories: CachedYnabCategory[];
  let cache: Tables<"ynab_cache">;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    categories = [
      category("house", 451_927, 451_927),
      category("dentistry", 62_500, 62_500),
      category("move", 185_573, 185_573),
      category("vacation", 0, null),
      category("frozen", 0, 50),
      {
        ...category("bills", 188_500, 188_500),
        assigned_history: [188_500, 188_500, 188_500],
      },
    ];
    vi.mocked(listGoals).mockResolvedValue([
      goal("house", 1_200_000, "2027-04-01"),
      goal("dentistry", 500_000, "2027-05-01"),
      goal("move", 10_000_000, "2029-09-01"),
      goal("vacation", 300_000, "2026-12-01"),
      goal("frozen", 1_000, "2026-12-01", "frozen"),
    ]);
    vi.mocked(getIncomeSettings).mockResolvedValue({
      user_id: "user",
      planned_income: 508_000,
      baseline_months: 6,
      updated_at: NOW,
    });
    vi.mocked(syncYnabData).mockImplementation(async () => ({
      categories,
      incomeHistory: [],
      syncedAt: NOW,
      currencyCode: null,
      operationId: "sync",
    }));
    vi.mocked(upsertCache).mockImplementation(async (_userId, input) => {
      cache = {
        user_id: "user",
        categories: input.categories,
        income_history: input.incomeHistory,
        synced_at: input.syncedAt ?? NOW,
      };
      return cache;
    });
    vi.mocked(patchCachedCategories).mockImplementation(
      async (_userId, patches) => {
        categories = parseCachedCategories(cache.categories).map((item) => ({
          ...item,
          ...patches.get(item.id),
        }));
        cache.categories = categories as unknown as Json;
      },
    );
  });

  afterEach(() => vi.useRealTimers());

  const sentTargets = () =>
    Object.fromEntries(
      vi
        .mocked(pushMonthlyFundingGoals)
        .mock.calls.flatMap(([input]) =>
          input.updates.map((update) => [update.categoryId, update.next]),
        ),
    );

  it("adding vacation recalculates all active targets and leaves assigned money untouched", async () => {
    const beforeAssigned = categories.map((item) => item.assigned);
    await syncPlanTargets("user", connection);

    expect(sentTargets()).toEqual({
      house: 171_428_571,
      dentistry: 48_071_429,
      move: 0,
      vacation: 100_000_000,
    });
    expect(pushAssignedMoves).not.toHaveBeenCalled();
    expect(categories.map((item) => item.assigned)).toEqual(beforeAssigned);
    expect(categories.find((item) => item.id === "move")?.goal_target).toBe(
      0,
    );
    expect(categories.find((item) => item.id === "frozen")?.goal_target).toBe(
      50,
    );
    expect(categories.find((item) => item.id === "bills")?.goal_target).toBe(
      188_500,
    );
  });

  it("does not write unchanged targets on retry", async () => {
    await syncPlanTargets("user", connection);
    vi.mocked(pushMonthlyFundingGoals).mockClear();
    await syncPlanTargets("user", connection);
    expect(pushMonthlyFundingGoals).not.toHaveBeenCalled();
    expect(pushAssignedMoves).not.toHaveBeenCalled();
  });

  it("retains successful target updates when a later request fails", async () => {
    vi.mocked(pushMonthlyFundingGoals)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("YNAB unavailable"));

    await expect(syncPlanTargets("user", connection)).rejects.toThrow(
      "YNAB unavailable",
    );
    expect(
      categories.find((item) => item.id === "dentistry")?.goal_target,
    ).toBe(48_071.429);
    expect(categories.find((item) => item.id === "house")?.goal_target).toBe(
      451_927,
    );
    expect(patchCachedCategories).toHaveBeenCalledTimes(1);
    expect(pushAssignedMoves).not.toHaveBeenCalled();
  });

  it("does not write targets if refreshing YNAB fails", async () => {
    vi.mocked(syncYnabData).mockRejectedValue(new Error("Sync unavailable"));
    await expect(syncPlanTargets("user", connection)).rejects.toThrow(
      "Sync unavailable",
    );
    expect(pushMonthlyFundingGoals).not.toHaveBeenCalled();
    expect(upsertCache).not.toHaveBeenCalled();
  });
});
