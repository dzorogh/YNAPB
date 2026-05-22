import { addMonths, normalizeToMonthStart } from "@/lib/dates/month";
import type { Goal as PlannerGoal } from "@/lib/planner/types";
import type { listGoals } from "@/lib/repositories/goals-repo";
import type { parseCachedCategories } from "@/lib/repositories/ynab-cache-repo";
import { toYnabGoalProgressInput } from "@/lib/ynab/category-progress-input";
import { resolveGoalAmountsFromCategory } from "@/lib/ynab/goal-progress";

type GoalRecord = Awaited<ReturnType<typeof listGoals>>[number];
type CachedCategory = ReturnType<typeof parseCachedCategories>[number];

export type GoalViewModel = {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  savedProgress: number;
  availableBalance: number;
  deadline: string;
  status: "active" | "frozen" | "completed";
  ynabCategoryId: string | null;
  createdAt: string;
};

export type TbdWarning = {
  categoryId: string;
  categoryName: string;
};

const categoriesByIdMap = (categories: CachedCategory[]) =>
  new Map(categories.map((category) => [category.id, category]));

export const mapGoalsToPlannerInput = (
  goals: GoalRecord[],
  categories: CachedCategory[],
  options?: { deadlineShifts?: Record<string, number> },
): PlannerGoal[] => {
  const categoriesById = categoriesByIdMap(categories);
  const deadlineShifts = options?.deadlineShifts ?? {};

  return goals
    .filter((goal) => goal.status === "active")
    .map((goal) => {
      const linkedCategory = goal.ynab_category_id
        ? (categoriesById.get(goal.ynab_category_id) ?? null)
        : null;

      const ynabAmounts = resolveGoalAmountsFromCategory(
        toYnabGoalProgressInput(linkedCategory),
      );

      const deadline = options?.deadlineShifts
        ? addMonths(
            normalizeToMonthStart(goal.deadline),
            deadlineShifts[goal.id] ?? 0,
          )
        : normalizeToMonthStart(goal.deadline);

      return {
        id: goal.id,
        name: goal.name,
        targetAmount: goal.target_amount,
        currentBalance: ynabAmounts.currentBalance,
        savedProgress: ynabAmounts.savedProgress,
        availableBalance: ynabAmounts.availableBalance,
        deadline,
        status: goal.status,
        ynabCategoryId: goal.ynab_category_id,
        createdAt: new Date(goal.created_at),
      };
    });
};

export const mapGoalsToViewModel = (
  goals: GoalRecord[],
  categories: CachedCategory[],
): GoalViewModel[] => {
  const categoriesById = categoriesByIdMap(categories);

  return goals.map((goal) => {
    const linkedCategory = goal.ynab_category_id
      ? (categoriesById.get(goal.ynab_category_id) ?? null)
      : null;

    return {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.target_amount,
      ...resolveGoalAmountsFromCategory(
        toYnabGoalProgressInput(linkedCategory),
      ),
      deadline: goal.deadline,
      status: goal.status,
      ynabCategoryId: goal.ynab_category_id,
      createdAt: goal.created_at,
    };
  });
};

export const buildTbdWarnings = (
  categories: CachedCategory[],
  plannerGoals: PlannerGoal[],
): TbdWarning[] => {
  const linkedCategoryIds = new Set(
    plannerGoals
      .map((goal) => goal.ynabCategoryId)
      .filter((categoryId): categoryId is string => Boolean(categoryId)),
  );

  return categories
    .filter((category) => category.goal_type === "TBD")
    .filter((category) => !linkedCategoryIds.has(category.id))
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
    }));
};
