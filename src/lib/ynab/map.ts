export type YnabCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_cadence: number | null;
  goal_target: number | null;
  goal_target_month: string | null;
  goal_under_funded: number | null;
  /** NEED targets: true = «Set aside another», false = «Refill up to». */
  goal_needs_whole_amount: boolean | null;
  balance: number | null;
  activity: number | null;
  assigned: number | null;
  /**
   * Net spending on a linked goal category from goal creation until the end of
   * the prior month. Spending on a goal is progress, unlike moving money out.
   */
  spent_before_month: number;
  hidden: boolean;
  deleted: boolean;
  assigned_history: number[];
  /** YNAB «Cash left over from last month» — prior month ending available. */
  prior_month_available: number | null;
  /** Assigned in the prior budget month. */
  prior_month_assigned: number | null;
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
  goal_needs_whole_amount?: boolean | null;
  balance?: number | null;
  activity?: number | null;
  budgeted?: number | null;
  hidden?: boolean;
  deleted?: boolean;
};

type YnabMonthIncomeSource = {
  month: string;
  income?: number | null;
  readyToAssign?: number | null;
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
  goal_needs_whole_amount: category.goal_needs_whole_amount ?? null,
  balance: toCurrencyUnits(category.balance),
  activity: toCurrencyUnits(category.activity),
  assigned: toCurrencyUnits(category.budgeted),
  spent_before_month: 0,
  hidden: category.hidden === true,
  deleted: category.deleted === true,
  assigned_history: [],
  prior_month_available: null,
  prior_month_assigned: null,
});

/** YNAB month key for the calendar month containing `date` (`YYYY-MM-01`). */
export const currentBudgetMonthFromDate = (date: Date = new Date()): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;

export const mapReadyToAssign = (
  months: YnabMonthIncomeSource[],
  referenceMonth: string = currentBudgetMonthFromDate(),
): number => {
  const value = months.find(
    (month) => month.month === referenceMonth,
  )?.readyToAssign;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
};

const findPriorMonth = (
  months: YnabMonthIncomeSource[],
  referenceMonth: string,
): YnabMonthIncomeSource | undefined => {
  const sorted = [...months].sort((left, right) =>
    right.month.localeCompare(left.month),
  );
  const referenceIndex = sorted.findIndex(
    (month) => month.month === referenceMonth,
  );
  return referenceIndex >= 0 ? sorted[referenceIndex + 1] : sorted[1];
};

/**
 * Prior budget month ending available per category (cash left over into the
 * reference month). Uses the month **before** `referenceMonth`, not `sorted[1]`,
 * so an open future month (e.g. June) does not shift carryover to current May.
 */
export const mapCategoryPriorMonthAvailable = (
  months: YnabMonthIncomeSource[],
  referenceMonth: string = currentBudgetMonthFromDate(),
): Map<string, number> => {
  const priorMonth = findPriorMonth(months, referenceMonth);
  const availableByCategoryId = new Map<string, number>();
  for (const category of priorMonth?.categories ?? []) {
    const balance = toCurrencyUnits(category.balance);
    if (balance !== null) {
      availableByCategoryId.set(category.id, Math.max(0, balance));
    }
  }
  return availableByCategoryId;
};

/**
 * Assigned per category in the calendar month right before `referenceMonth`.
 * Strict: Push writes this value back, so it must never come from another month.
 */
export const mapCategoryPriorMonthAssigned = (
  months: YnabMonthIncomeSource[],
  referenceMonth: string = currentBudgetMonthFromDate(),
): Map<string, number> => {
  const date = new Date(`${referenceMonth}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const priorMonthKey = date.toISOString().slice(0, 10);
  const priorMonth = months.find((month) => month.month === priorMonthKey);
  const assignedByCategoryId = new Map<string, number>();
  for (const category of priorMonth?.categories ?? []) {
    const assigned = toCurrencyUnits(category.budgeted);
    if (assigned !== null) {
      assignedByCategoryId.set(category.id, assigned);
    }
  }
  return assignedByCategoryId;
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
