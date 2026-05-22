import { averageIncome } from "@/lib/budget/average-income";
import { computeMonthlyBudget } from "@/lib/budget/obligations";
import { currentMonthStart } from "@/lib/dates/month";
import { computePlan } from "@/lib/planner/planner";
import { mapGoalsToPlannerInput } from "@/lib/planner/goal-mapping";
import type { Goal as PlannerGoal, PlanResult } from "@/lib/planner/types";
import type { listGoals } from "@/lib/repositories/goals-repo";
import type { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import {
  type getCache,
  parseCachedCategories,
  parseCachedIncomeHistory,
} from "@/lib/repositories/ynab-cache-repo";

export const DEFAULT_HORIZON_MONTHS = 120;

type GoalRecord = Awaited<ReturnType<typeof listGoals>>[number];

export type PlanComputation = {
  goals: GoalRecord[];
  categories: ReturnType<typeof parseCachedCategories>;
  plannerGoals: PlannerGoal[];
  budget: ReturnType<typeof computeMonthlyBudget>;
  planResult: PlanResult;
  startMonth: Date;
};

export const buildPlanComputation = (params: {
  goals: GoalRecord[];
  cache: Awaited<ReturnType<typeof getCache>>;
  incomeSettings: Awaited<ReturnType<typeof getIncomeSettings>>;
  deadlineShifts?: Record<string, number>;
  horizonMonths?: number;
}): PlanComputation => {
  const categories = params.cache
    ? parseCachedCategories(params.cache.categories)
    : [];
  const plannerGoals = mapGoalsToPlannerInput(params.goals, categories, {
    deadlineShifts: params.deadlineShifts,
  });
  const activeGoalCategoryIds = plannerGoals
    .map((goal) => goal.ynabCategoryId)
    .filter((categoryId): categoryId is string => Boolean(categoryId));

  const incomeHistory = params.cache
    ? parseCachedIncomeHistory(params.cache.income_history)
    : [];
  const plannedIncome =
    params.incomeSettings?.planned_income ??
    averageIncome(incomeHistory.map((item) => item.income));

  const budget = computeMonthlyBudget({
    categories,
    activeGoalCategoryIds,
    plannedIncome,
  });
  const startMonth = currentMonthStart();
  const planResult = computePlan({
    goals: plannerGoals,
    budget,
    startMonth,
    horizonMonths: params.horizonMonths ?? DEFAULT_HORIZON_MONTHS,
  });

  return {
    goals: params.goals,
    categories,
    plannerGoals,
    budget,
    planResult,
    startMonth,
  };
};
