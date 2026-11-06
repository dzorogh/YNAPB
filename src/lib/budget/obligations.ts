import type { MonthlyBudget, ObligationItem } from "../planner/types";

type YnabBudgetCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_target?: number | null;
  goal_cadence?: number | null;
  goal_cadence_frequency?: number | null;
  assigned_history: number[];
  hidden: boolean;
  deleted: boolean;
};

type ComputeMonthlyBudgetInput = {
  categories: YnabBudgetCategory[];
  activeGoalCategoryIds: string[];
  plannedIncome: number;
};

const WEEKS_PER_MONTH = 52 / 12;

/**
 * Monthly equivalent of a repeating YNAB target, or null when the target does
 * not repeat (e.g. a balance or by-date target). YNAB cadence: 1 monthly,
 * 2 weekly, 13 yearly (each times `goal_cadence_frequency`); 3–12 every
 * (cadence − 1) months; 14 every two years.
 */
/** Months covered by one target period, by YNAB cadence. */
const cadenceMonths = (cadence: number, frequency: number): number | null => {
  if (cadence === 1) return frequency;
  if (cadence === 2) return frequency / WEEKS_PER_MONTH;
  if (cadence === 13) return 12 * frequency;
  if (cadence >= 3 && cadence <= 12) return cadence - 1;
  if (cadence === 14) return 24;
  return null;
};

export const monthlyTargetAmount = (category: {
  goal_target?: number | null;
  goal_cadence?: number | null;
  goal_cadence_frequency?: number | null;
}): number | null => {
  const target = category.goal_target;
  if (typeof target !== "number" || target <= 0 || !category.goal_cadence) {
    return null;
  }
  const months = cadenceMonths(
    category.goal_cadence,
    Math.max(1, category.goal_cadence_frequency ?? 1),
  );
  return months === null ? null : target / months;
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
    // Money moved out of a category is not a monthly obligation.
    return Math.max(0, Math.round(sum / category.assigned_history.length));
  };
  // History shows what is really assigned; the monthly target caps one-off
  // spikes so they do not inflate the obligation.
  const obligationAmount = (category: YnabBudgetCategory): number => {
    const average = averageAssignedAmount(category);
    const cap = monthlyTargetAmount(category);
    return cap === null ? average : Math.min(average, Math.round(cap));
  };

  const obligationBreakdown: ObligationItem[] = categories
    .filter((category) => !category.hidden && !category.deleted)
    .filter((category) => category.goal_type !== null)
    // A zero target asks for nothing each month, e.g. a leftover category.
    .filter((category) => category.goal_target !== 0)
    .filter((category) => !activeGoalIds.has(category.id))
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      amount: obligationAmount(category),
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
