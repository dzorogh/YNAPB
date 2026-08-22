import {
  createOfficialYnabApis,
  runOfficialYnabCall,
} from "@/lib/ynab/official-api";

import {
  computeYnabMonthlyFundingTarget,
  resolveFullMonthFundingTarget,
  resolveGoalAmountsFromCategory,
  shouldUseFullMonthFundingForPush,
} from "./goal-progress";

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

type PushImmediateMonthlyFundingGoalInput = {
  token: string;
  budgetId: string;
  categoryId: string;
  targetAmount: number;
  deadline: string;
  fetchImpl?: typeof fetch;
};

const toMilliunits = (amount: number): number => Math.round(amount * 1000);
const fromMilliunits = (amount: number): number => amount / 1000;

const fetchYnabCategory = async ({
  token,
  budgetId,
  categoryId,
  fetchImpl,
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
  const apis = createOfficialYnabApis(token, fetchImpl);
  const payload = await runOfficialYnabCall(() =>
    apis.categories.getCategoryById(budgetId, categoryId),
  );
  const category = payload.data.category;

  return {
    name: category.name,
    goalTarget: category.goal_target ?? null,
    balance: category.balance ?? 0,
    budgeted: category.budgeted ?? 0,
    activity: category.activity ?? 0,
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
  fetchImpl,
}: PushMonthlyFundingGoalsInput): Promise<void> => {
  const apis = createOfficialYnabApis(token, fetchImpl);
  for (const update of updates) {
    await runOfficialYnabCall(() =>
      apis.categories.updateCategory(budgetId, update.categoryId, {
        category: {
          goal_target: update.next,
        },
      }),
    );
  }
};

export const pushImmediateMonthlyFundingGoal = async ({
  token,
  budgetId,
  categoryId,
  targetAmount,
  deadline,
  fetchImpl,
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
  const nextAmount = Math.max(
    useFullMonthFunding
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
      }),
    amounts.assignedThisMonth,
  );
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
