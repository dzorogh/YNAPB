type PushableGoalStatus = "active" | "frozen" | "completed";

type PushableGoal = {
  id: string;
  status: PushableGoalStatus;
  ynabCategoryId: string | null;
};

type AllocationForMonth = Record<string, number>;

type YnabCategoryForPush = {
  id: string;
  name: string;
  goalTarget: number | null;
};

export type MonthlyFundingDiffItem = {
  categoryId: string;
  categoryName: string;
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

import {
  computeYnabMonthlyFundingTarget,
  resolveFullMonthFundingTarget,
  resolveGoalAmountsFromCategory,
  shouldUseFullMonthFundingForPush,
} from "./goal-progress";

type PushImmediateMonthlyFundingGoalInput = {
  token: string;
  budgetId: string;
  categoryId: string;
  targetAmount: number;
  deadline: string;
  fetchImpl?: typeof fetch;
};

const YNAB_API_BASE = "https://api.ynab.com/v1";

const toMilliunits = (amount: number): number => Math.round(amount * 1000);
const fromMilliunits = (amount: number): number => amount / 1000;

const fetchYnabCategory = async ({
  token,
  budgetId,
  categoryId,
  fetchImpl = fetch,
}: {
  token: string;
  budgetId: string;
  categoryId: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  name: string;
  goalTarget: number | null;
  balance: number;
  budgeted: number;
  activity: number;
}> => {
  const response = await fetchImpl(
    `${YNAB_API_BASE}/budgets/${budgetId}/categories/${categoryId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`YNAB request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    data: {
      category: {
        name: string;
        goal_target: number | null;
        balance: number | null;
        budgeted: number | null;
        activity: number | null;
      };
    };
  };

  return {
    name: payload.data.category.name,
    goalTarget: payload.data.category.goal_target,
    balance: payload.data.category.balance ?? 0,
    budgeted: payload.data.category.budgeted ?? 0,
    activity: payload.data.category.activity ?? 0,
  };
};

export const sortMonthlyFundingDiff = (
  diff: MonthlyFundingDiffItem[],
): MonthlyFundingDiffItem[] =>
  [...diff].sort((left, right) =>
    left.categoryId.localeCompare(right.categoryId),
  );

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
      const current = toMilliunits(category.goalTarget ?? 0);
      const next = toMilliunits(allocationForMonth[goal.id] ?? 0);
      return {
        categoryId: category.id,
        categoryName: category.name,
        current,
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

export const pushImmediateMonthlyFundingGoal = async ({
  token,
  budgetId,
  categoryId,
  targetAmount,
  deadline,
  fetchImpl = fetch,
}: PushImmediateMonthlyFundingGoalInput): Promise<"updated" | "unchanged"> => {
  const category = await fetchYnabCategory({
    token,
    budgetId,
    categoryId,
    fetchImpl,
  });
  const progressInput = {
    balance: fromMilliunits(category.balance),
    assigned: fromMilliunits(category.budgeted),
    activity: fromMilliunits(category.activity),
  };
  const amounts = resolveGoalAmountsFromCategory(progressInput);
  const now = new Date();
  const pushMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const useFullMonthFunding = shouldUseFullMonthFundingForPush({
    goalDeadline: deadline,
    pushMonth,
    categoryName: category.name,
  });
  const nextAmount = useFullMonthFunding
    ? resolveFullMonthFundingTarget({
        targetAmount,
        carryoverFromLastMonth: amounts.carryoverFromLastMonth,
      })
    : computeYnabMonthlyFundingTarget({
        targetAmount,
        carryoverFromLastMonth: amounts.carryoverFromLastMonth,
        savedProgress: amounts.savedProgress,
        deadline,
        now,
      });
  const nextTarget = toMilliunits(nextAmount);

  if ((category.goalTarget ?? 0) === nextTarget) {
    return "unchanged";
  }

  await pushMonthlyFundingGoals({
    token,
    budgetId,
    updates: [
      {
        categoryId,
        categoryName: category.name,
        current: category.goalTarget ?? 0,
        next: nextTarget,
      },
    ],
    fetchImpl,
  });

  return "updated";
};
