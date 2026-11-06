import { createYnabClient, type YnabClient } from "./client";
import { finishYnabOperation, startYnabOperation } from "./ynab-request-log";
import {
  mapCategoryAssignedHistory,
  currentBudgetMonthFromDate,
  mapCategoryPriorMonthAssigned,
  mapCategoryPriorMonthAvailable,
  mapIncomeHistory,
  mapReadyToAssign,
  mapYnabCategory,
  type YnabCategory,
  type YnabMonthIncome,
} from "./map";

export type YnabDataClient = Pick<
  YnabClient,
  | "getCategories"
  | "getMonths"
  | "getBudgetCurrencyCode"
  | "getCategorySpending"
>;

/** A YNAB category linked to a goal; spending counts from goal creation. */
export type GoalCategorySpendingSource = {
  categoryId: string;
  /** Goal creation timestamp (ISO). */
  since: string;
};

class YnabSyncError extends Error {
  code: "MISSING_TOKEN";

  constructor(code: "MISSING_TOKEN", message: string) {
    super(message);
    this.name = "YnabSyncError";
    this.code = code;
  }
}

type SyncYnabDataInput = {
  token: string;
  budgetId: string;
  baselineMonths: number;
  client?: YnabDataClient;
  /** When set, skips GET /budgets/{id} during sync (saves one API call). */
  skipCurrencyLookup?: boolean;
  /** Linked goal categories whose past spending counts as goal progress. */
  goalCategories?: GoalCategorySpendingSource[];
};

type SyncYnabDataResult = {
  categories: YnabCategory[];
  incomeHistory: YnabMonthIncome[];
  /** Current calendar month's positive Ready to Assign, milliunits. */
  readyToAssign: number;
  syncedAt: string;
  currencyCode: string | null;
  operationId: string;
};

/** Last day of the month before `currentMonth` (`YYYY-MM-01`). */
const dayBeforeMonth = (currentMonth: string): string => {
  const date = new Date(`${currentMonth}T00:00:00Z`);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
};

const fetchGoalSpendingBeforeMonth = async (
  client: YnabDataClient,
  budgetId: string,
  goalCategories: GoalCategorySpendingSource[],
  currentMonth: string,
): Promise<Map<string, number>> => {
  const untilDate = dayBeforeMonth(currentMonth);
  const spentByCategoryId = new Map<string, number>();
  for (const { categoryId, since } of goalCategories) {
    const sinceDate = since.slice(0, 10);
    if (sinceDate > untilDate || spentByCategoryId.has(categoryId)) {
      continue;
    }
    const spent = await client.getCategorySpending(budgetId, categoryId, {
      sinceDate,
      untilDate,
    });
    spentByCategoryId.set(categoryId, spent / 1000);
  }
  return spentByCategoryId;
};

export const toGoalCategorySpendingSources = (
  goals: Array<{ ynab_category_id: string | null; created_at: string }>,
): GoalCategorySpendingSource[] =>
  goals.flatMap((goal) =>
    goal.ynab_category_id
      ? [{ categoryId: goal.ynab_category_id, since: goal.created_at }]
      : [],
  );

const hasToken = (token: string): boolean => token.trim().length > 0;
const OBLIGATIONS_AVERAGE_ASSIGNED_MONTHS = 3;

export const syncYnabData = async ({
  token,
  budgetId,
  baselineMonths,
  client,
  skipCurrencyLookup = false,
  goalCategories = [],
}: SyncYnabDataInput): Promise<SyncYnabDataResult> => {
  if (!hasToken(token)) {
    throw new YnabSyncError("MISSING_TOKEN", "YNAB token is required");
  }

  const operationId = startYnabOperation("sync");
  try {
    const ynabClient = client ?? createYnabClient(token);
    const rawCategories = await ynabClient.getCategories(budgetId);
    const currentMonth = currentBudgetMonthFromDate();
    const rawMonths = await ynabClient.getMonths(budgetId, {
      monthDetailsLookback: OBLIGATIONS_AVERAGE_ASSIGNED_MONTHS,
    });
    const currencyCode = skipCurrencyLookup
      ? null
      : await ynabClient.getBudgetCurrencyCode(budgetId);
    const assignedHistory = mapCategoryAssignedHistory(
      rawMonths,
      OBLIGATIONS_AVERAGE_ASSIGNED_MONTHS,
    );
    const assignedByCategoryId = assignedHistory.reduce<Map<string, number[]>>(
      (accumulator, item) => {
        const current = accumulator.get(item.categoryId) ?? [];
        current.push(item.assigned);
        accumulator.set(item.categoryId, current);
        return accumulator;
      },
      new Map(),
    );
    const priorMonthAvailableByCategoryId = mapCategoryPriorMonthAvailable(
      rawMonths,
      currentMonth,
    );
    const priorMonthAssignedByCategoryId = mapCategoryPriorMonthAssigned(
      rawMonths,
      currentMonth,
    );
    const spentBeforeMonthByCategoryId = await fetchGoalSpendingBeforeMonth(
      ynabClient,
      budgetId,
      goalCategories,
      currentMonth,
    );

    finishYnabOperation(operationId, "ok");
    return {
      categories: rawCategories.map((category) => {
        const mapped = mapYnabCategory(category);
        const assignedHistory = assignedByCategoryId.get(mapped.id) ?? [];
        return {
          ...mapped,
          spent_before_month: spentBeforeMonthByCategoryId.get(mapped.id) ?? 0,
          assigned_history: assignedHistory,
          assigned: mapped.assigned ?? assignedHistory[0] ?? null,
          prior_month_available:
            priorMonthAvailableByCategoryId.get(mapped.id) ?? null,
          prior_month_assigned:
            priorMonthAssignedByCategoryId.get(mapped.id) ?? null,
        };
      }),
      incomeHistory: mapIncomeHistory(rawMonths, baselineMonths),
      readyToAssign: mapReadyToAssign(rawMonths),
      syncedAt: new Date().toISOString(),
      currencyCode,
      operationId,
    };
  } catch (error) {
    const failedAt =
      error instanceof Error && "message" in error
        ? error.message.slice(0, 120)
        : null;
    finishYnabOperation(operationId, "failed", failedAt);
    throw error;
  }
};
