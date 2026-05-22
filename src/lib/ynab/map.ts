export type YnabCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_cadence: number | null;
  goal_target: number | null;
  goal_target_month: string | null;
  goal_under_funded: number | null;
  balance: number | null;
  activity: number | null;
  assigned: number | null;
  cash_spent_total: number;
  hidden: boolean;
  deleted: boolean;
  assigned_history: number[];
  /** YNAB «Cash left over from last month» — prior month ending available. */
  prior_month_available: number | null;
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
  activity?: number | null;
  budgeted?: number | null;
  hidden?: boolean;
  deleted?: boolean;
};

type YnabMonthIncomeSource = {
  month: string;
  income?: number | null;
  categories?: Array<{
    id: string;
    budgeted?: number | null;
    activity?: number | null;
    balance?: number | null;
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
  activity: toCurrencyUnits(category.activity),
  assigned: toCurrencyUnits(category.budgeted),
  cash_spent_total: 0,
  hidden: category.hidden === true,
  deleted: category.deleted === true,
  assigned_history: [],
  prior_month_available: null,
});

/** YNAB month key for the calendar month containing `date` (`YYYY-MM-01`). */
export const currentBudgetMonthFromDate = (date: Date = new Date()): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;

/**
 * Prior budget month ending available per category (cash left over into the
 * reference month). Uses the month **before** `referenceMonth`, not `sorted[1]`,
 * so an open future month (e.g. June) does not shift carryover to current May.
 */
export const mapCategoryPriorMonthAvailable = (
  months: YnabMonthIncomeSource[],
  referenceMonth: string = currentBudgetMonthFromDate(),
): Map<string, number> => {
  const sorted = [...months].sort((left, right) =>
    right.month.localeCompare(left.month),
  );
  const referenceIndex = sorted.findIndex(
    (month) => month.month === referenceMonth,
  );
  const priorMonth =
    referenceIndex >= 0 ? sorted[referenceIndex + 1] : sorted[1];
  if (!priorMonth?.categories) {
    return new Map();
  }

  const availableByCategoryId = new Map<string, number>();
  for (const category of priorMonth.categories) {
    const balance = toCurrencyUnits(category.balance);
    if (balance === null) {
      continue;
    }
    availableByCategoryId.set(category.id, Math.max(0, balance));
  }

  return availableByCategoryId;
};

export const mapCategoryCashSpentTotal = (
  months: YnabMonthIncomeSource[],
): Map<string, number> => {
  const spentByCategoryId = new Map<string, number>();

  for (const month of months) {
    for (const category of month.categories ?? []) {
      const activity = toCurrencyUnits(category.activity);
      if (activity === null || activity >= 0) {
        continue;
      }

      const categorySpent = Math.max(0, -activity);
      spentByCategoryId.set(
        category.id,
        (spentByCategoryId.get(category.id) ?? 0) + categorySpent,
      );
    }
  }

  return spentByCategoryId;
};

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
