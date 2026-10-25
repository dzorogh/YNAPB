import { monthKeyFromDate } from "@/lib/dates/month";
import { computeMonthTargets } from "@/lib/plan/month-targets";
import { listGoals } from "@/lib/repositories/goals-repo";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import {
  parseCachedCategories,
  patchCachedCategories,
  upsertCache,
} from "@/lib/repositories/ynab-cache-repo";
import { buildPushDiff, pushMonthlyFundingGoals } from "@/lib/ynab/push-mf";
import { syncYnabData } from "@/lib/ynab/sync";

/** Refresh all monthly targets after a goal mutation, without moving money. */
export const syncPlanTargets = async (
  userId: string,
  connection: { token: string; budgetId: string },
): Promise<void> => {
  const [goals, incomeSettings] = await Promise.all([
    listGoals(userId),
    getIncomeSettings(userId),
  ]);
  // Includes newly created categories and current assigned amounts. Do not
  // compute targets against the pre-mutation cache or stale account balances.
  const synced = await syncYnabData({
    ...connection,
    baselineMonths: incomeSettings?.baseline_months ?? 6,
    skipCurrencyLookup: true,
  });
  const cache = await upsertCache(userId, {
    categories: synced.categories,
    incomeHistory: synced.incomeHistory,
    syncedAt: synced.syncedAt,
  });
  const categories = parseCachedCategories(cache.categories);
  const monthTargets = computeMonthTargets(
    { goals, cache, incomeSettings },
    categories,
    monthKeyFromDate(new Date()),
  );
  if (!monthTargets) {
    throw new Error("Current month is outside the planning horizon.");
  }
  const diff = buildPushDiff({
    goals: goals.map((goal) => ({
      id: goal.id,
      status: goal.status,
      ynabCategoryId: goal.ynab_category_id,
    })),
    allocationForMonth: monthTargets.targets,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      goalTarget: category.goal_target,
      goalTargetMonth: category.goal_target_month,
    })),
  });

  for (const update of diff) {
    await pushMonthlyFundingGoals({ ...connection, updates: [update] });
    // Persist each successful update, even if a later YNAB request fails.
    await patchCachedCategories(
      userId,
      new Map([
        [
          update.categoryId,
          {
            goal_target: update.next / 1000,
            goal_target_month: null,
          },
        ],
      ]),
    );
  }
};
