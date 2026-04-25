import type { MonthlyBudget, ObligationItem } from "../planner/types";

type YnabBudgetCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_under_funded: number | null;
};

type ComputeMonthlyBudgetInput = {
  categories: YnabBudgetCategory[];
  activeGoalCategoryIds: string[];
  plannedIncome: number;
};

export const computeMonthlyBudget = ({
  categories,
  activeGoalCategoryIds,
  plannedIncome,
}: ComputeMonthlyBudgetInput): MonthlyBudget => {
  const activeGoalIds = new Set(activeGoalCategoryIds);

  const obligationBreakdown: ObligationItem[] = categories
    .filter((category) => category.goal_type !== null)
    .filter((category) => !activeGoalIds.has(category.id))
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      amount: category.goal_under_funded ?? 0,
    }));

  const obligations = obligationBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const available = plannedIncome - obligations;

  return {
    plannedIncome,
    obligations,
    available,
    obligationBreakdown,
  };
};
