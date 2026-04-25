import type { MonthlyBudget, ObligationItem } from "../planner/types";

type YnabBudgetCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  assigned_history: number[];
  hidden: boolean;
  deleted: boolean;
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
  const averageAssignedAmount = (category: YnabBudgetCategory): number => {
    if (category.assigned_history.length === 0) {
      return 0;
    }
    const sum = category.assigned_history.reduce(
      (accumulator, value) => accumulator + value,
      0,
    );
    return Math.round(sum / category.assigned_history.length);
  };

  const obligationBreakdown: ObligationItem[] = categories
    .filter((category) => !category.hidden && !category.deleted)
    .filter((category) => category.goal_type !== null)
    .filter((category) => !activeGoalIds.has(category.id))
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      amount: averageAssignedAmount(category),
    }));

  const obligations = obligationBreakdown.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const available = plannedIncome - obligations;

  return {
    plannedIncome,
    obligations,
    available,
    obligationBreakdown,
  };
};
