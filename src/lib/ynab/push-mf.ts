import {
  createOfficialYnabApis,
  runOfficialYnabCall,
} from "@/lib/ynab/official-api";

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
  /** YNAB target date; YNAPB targets are plain monthly, so push clears it. */
  goalTargetMonth?: string | null;
};

export type MonthlyFundingDiffItem = {
  categoryId: string;
  categoryName: string;
  current: number;
  next: number;
  clearsTargetDate?: true;
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

const toMilliunits = (amount: number): number => Math.round(amount * 1000);

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
        ...(category.goalTargetMonth
          ? { clearsTargetDate: true as const }
          : {}),
      };
    })
    .filter((item) => item.current !== item.next || item.clearsTargetDate);

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
          // SDK types omit null, but YNAB clears the date when it is sent.
          goal_target_date: null as unknown as string,
        },
      }),
    );
  }
};

/** Writes current-month assigned amounts; decreases go first to free money. */
export const pushAssignedMoves = async ({
  token,
  budgetId,
  month,
  moves,
  onMoveApplied,
  fetchImpl,
}: {
  token: string;
  budgetId: string;
  /** `YYYY-MM` of the budget month. */
  month: string;
  moves: MonthlyFundingDiffItem[];
  onMoveApplied?: (move: MonthlyFundingDiffItem) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<void> => {
  const apis = createOfficialYnabApis(token, fetchImpl);
  const ordered = [...moves].sort(
    (left, right) => left.next - left.current - (right.next - right.current),
  );
  for (const move of ordered) {
    await runOfficialYnabCall(() =>
      apis.categories.updateMonthCategory(
        budgetId,
        `${month}-01`,
        move.categoryId,
        { category: { budgeted: move.next } },
      ),
    );
    await onMoveApplied?.(move);
  }
};
