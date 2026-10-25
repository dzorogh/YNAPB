import { monthKeyFromDate, monthStartFromKey } from "@/lib/dates/month";
import { buildPlanComputation } from "@/lib/plan/plan-computation";
import { computePlan } from "@/lib/planner/planner";
import type { listGoals } from "@/lib/repositories/goals-repo";
import type { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import type {
  CachedYnabCategory,
  getCache,
} from "@/lib/repositories/ynab-cache-repo";
import type { Json } from "@/types/supabase";
import { toYnabGoalProgressInput } from "@/lib/ynab/category-progress-input";
import {
  buildMonthlyFundingTargetsForPush,
  resolveGoalAmountsFromCategory,
} from "@/lib/ynab/goal-progress";

export type PlanInputs = {
  goals: Awaited<ReturnType<typeof listGoals>>;
  cache: NonNullable<Awaited<ReturnType<typeof getCache>>>;
  incomeSettings: Awaited<ReturnType<typeof getIncomeSettings>>;
};

export const computeMonthTargets = (
  inputs: PlanInputs,
  categories: CachedYnabCategory[],
  month: string,
) => {
  const computation = buildPlanComputation({
    goals: inputs.goals,
    cache: { ...inputs.cache, categories: categories as unknown as Json },
    incomeSettings: inputs.incomeSettings,
  });
  const targetMonth = monthStartFromKey(month);
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  // A monthly target is the whole month's contribution, not another contribution
  // after subtracting this month's assigned money. Using opening progress also
  // keeps targets stable when Push redistributes that money between goals.
  const fundingPlan =
    month === monthKeyFromDate(computation.startMonth)
      ? computePlan({
          goals: computation.plannerGoals.map((goal) => {
            const category = goal.ynabCategoryId
              ? categoriesById.get(goal.ynabCategoryId)
              : null;
            const amounts = resolveGoalAmountsFromCategory(
              toYnabGoalProgressInput(category ?? null),
            );
            return { ...goal, savedProgress: amounts.carryoverFromLastMonth };
          }),
          budget: computation.budget,
          startMonth: computation.startMonth,
          horizonMonths: 1,
        })
      : computation.planResult;
  const allocationForMonth = fundingPlan.allocations.find(
    (allocation) =>
      monthKeyFromDate(allocation.month) === monthKeyFromDate(targetMonth),
  );
  if (!allocationForMonth) {
    return null;
  }

  const goalsById = new Map(inputs.goals.map((goal) => [goal.id, goal]));
  const params = {
    goals: computation.plannerGoals.map((goal) => {
      const sourceGoal = goalsById.get(goal.id);
      if (!sourceGoal) {
        throw new Error(`Goal ${goal.id} is missing from planner input`);
      }

      return {
        id: goal.id,
        targetAmount: goal.targetAmount,
        deadline: sourceGoal.deadline,
        ynabCategoryId: goal.ynabCategoryId,
      };
    }),
    categoriesById: new Map(
      computation.categories.map((category) => [
        category.id,
        toYnabGoalProgressInput(category),
      ]),
    ),
    categoryNamesById: new Map(
      computation.categories.map((category) => [category.id, category.name]),
    ),
    pushMonth: month,
    plannerAllocationForMonth: allocationForMonth.perGoal,
  };

  return {
    computation,
    targets: buildMonthlyFundingTargetsForPush(params),
  };
};
