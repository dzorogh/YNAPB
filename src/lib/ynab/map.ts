export type YnabCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_target: number | null;
  goal_under_funded: number | null;
};

export type YnabMonthIncome = {
  month: string;
  income: number;
};

type YnabCategorySource = {
  id: string;
  name: string;
  goal_type?: string | null;
  goal_target?: number | null;
  goal_under_funded?: number | null;
};

type YnabMonthIncomeSource = {
  month: string;
  income?: number | null;
};

export const mapYnabCategory = (category: YnabCategorySource): YnabCategory => ({
  id: category.id,
  name: category.name,
  goal_type: category.goal_type ?? null,
  goal_target: category.goal_target ?? null,
  goal_under_funded: category.goal_under_funded ?? null,
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
      income: month.income ?? 0,
    }));
};
