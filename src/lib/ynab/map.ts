export type YnabCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_cadence: number | null;
  goal_target: number | null;
  goal_target_month: string | null;
  goal_under_funded: number | null;
  balance: number | null;
  hidden: boolean;
  deleted: boolean;
  assigned_history: number[];
};

export type YnabMonthIncome = {
  month: string;
  income: number;
};

export type YnabCategoryAssigned = {
  month: string;
  categoryId: string;
  assigned: number;
};

type YnabCategorySource = {
  id: string;
  name: string;
  goal_type?: string | null;
  goal_cadence?: number | null;
  goal_target?: number | null;
  goal_target_month?: string | null;
  goal_under_funded?: number | null;
  balance?: number | null;
  hidden?: boolean;
  deleted?: boolean;
};

type YnabMonthIncomeSource = {
  month: string;
  income?: number | null;
  categories?: Array<{
    id: string;
    budgeted?: number | null;
  }>;
};

const toCurrencyUnits = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value / 1000;
};

export const mapYnabCategory = (
  category: YnabCategorySource,
): YnabCategory => ({
  id: category.id,
  name: category.name,
  goal_type: category.goal_type ?? null,
  goal_cadence:
    typeof category.goal_cadence === "number" &&
    Number.isFinite(category.goal_cadence)
      ? category.goal_cadence
      : null,
  goal_target: toCurrencyUnits(category.goal_target),
  goal_target_month: category.goal_target_month ?? null,
  goal_under_funded: toCurrencyUnits(category.goal_under_funded),
  balance: toCurrencyUnits(category.balance),
  hidden: category.hidden === true,
  deleted: category.deleted === true,
  assigned_history: [],
});

export const mapIncomeHistory = (
  months: YnabMonthIncomeSource[],
  baselineMonths: number,
): YnabMonthIncome[] => {
  if (baselineMonths <= 0) {
    return [];
  }

  return [...months]
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, baselineMonths)
    .map((month) => ({
      month: month.month,
      income: toCurrencyUnits(month.income) ?? 0,
    }));
};

export const mapCategoryAssignedHistory = (
  months: YnabMonthIncomeSource[],
  lookbackMonths: number,
): YnabCategoryAssigned[] => {
  if (lookbackMonths <= 0) {
    return [];
  }

  return [...months]
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, lookbackMonths)
    .flatMap((month) =>
      (month.categories ?? []).map((category) => ({
        month: month.month,
        categoryId: category.id,
        assigned: toCurrencyUnits(category.budgeted) ?? 0,
      })),
    );
};
