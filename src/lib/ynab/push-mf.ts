type PushableGoalStatus = "active" | "frozen" | "completed";

type PushableGoal = {
  id: string;
  status: PushableGoalStatus;
  ynabCategoryId: string | null;
};

type AllocationForMonth = Record<string, number>;

type YnabCategoryForPush = {
  id: string;
  goalTarget: number | null;
};

export type MonthlyFundingDiffItem = {
  categoryId: string;
  current: number;
  next: number;
};

type BuildPushDiffInput = {
  goals: PushableGoal[];
  allocationForMonth: AllocationForMonth;
  categories: YnabCategoryForPush[];
};

type PushMonthlyFundingGoalsInput = {
  token: string;
  budgetId: string;
  updates: MonthlyFundingDiffItem[];
  fetchImpl?: typeof fetch;
};

const YNAB_API_BASE = "https://api.ynab.com/v1";

const toMilliunits = (amount: number): number => Math.round(amount * 1000);

export const sortMonthlyFundingDiff = (
  diff: MonthlyFundingDiffItem[],
): MonthlyFundingDiffItem[] =>
  [...diff].sort((left, right) => left.categoryId.localeCompare(right.categoryId));

export const buildPushDiff = ({
  goals,
  allocationForMonth,
  categories,
}: BuildPushDiffInput): MonthlyFundingDiffItem[] => {
  const goalsByCategoryId = new Map(
    goals
      .filter((goal) => goal.status === "active")
      .filter((goal) => goal.ynabCategoryId !== null)
      .map((goal) => [goal.ynabCategoryId as string, goal]),
  );

  const diff = categories
    .filter((category) => goalsByCategoryId.has(category.id))
    .map((category) => {
      const goal = goalsByCategoryId.get(category.id)!;
      const next = toMilliunits(allocationForMonth[goal.id] ?? 0);
      return {
        categoryId: category.id,
        current: category.goalTarget ?? 0,
        next,
      };
    })
    .filter((item) => item.current !== item.next);

  return sortMonthlyFundingDiff(diff);
};

export const pushMonthlyFundingGoals = async ({
  token,
  budgetId,
  updates,
  fetchImpl = fetch,
}: PushMonthlyFundingGoalsInput): Promise<void> => {
  for (const update of updates) {
    const response = await fetchImpl(
      `${YNAB_API_BASE}/budgets/${budgetId}/categories/${update.categoryId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: {
            goal_target: update.next,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`YNAB request failed with status ${response.status}`);
    }
  }
};
