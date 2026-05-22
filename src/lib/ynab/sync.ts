import { createYnabClient, type YnabClient } from "./client";
import { finishYnabOperation, startYnabOperation } from "./ynab-request-log";
import {
  mapCategoryAssignedHistory,
  mapCategoryCashSpentTotal,
  currentBudgetMonthFromDate,
  mapCategoryPriorMonthAvailable,
  mapIncomeHistory,
  mapYnabCategory,
  type YnabCategory,
  type YnabMonthIncome,
} from "./map";

export type YnabDataClient = Pick<
  YnabClient,
  "getCategories" | "getMonths" | "getBudgetCurrencyCode"
>;

export class YnabSyncError extends Error {
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
};

type SyncYnabDataResult = {
  categories: YnabCategory[];
  incomeHistory: YnabMonthIncome[];
  syncedAt: string;
  currencyCode: string | null;
  operationId: string;
};

const hasToken = (token: string): boolean => token.trim().length > 0;
const OBLIGATIONS_AVERAGE_ASSIGNED_MONTHS = 3;

export const syncYnabData = async ({
  token,
  budgetId,
  baselineMonths,
  client,
  skipCurrencyLookup = false,
}: SyncYnabDataInput): Promise<SyncYnabDataResult> => {
  if (!hasToken(token)) {
    throw new YnabSyncError("MISSING_TOKEN", "YNAB token is required");
  }

  const operationId = startYnabOperation("sync");
  try {
    const ynabClient = client ?? createYnabClient(token);
    const rawCategories = await ynabClient.getCategories(budgetId);
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
    const cashSpentByCategoryId = mapCategoryCashSpentTotal(rawMonths);
    const priorMonthAvailableByCategoryId = mapCategoryPriorMonthAvailable(
      rawMonths,
      currentBudgetMonthFromDate(),
    );

    finishYnabOperation(operationId, "ok");
    return {
      categories: rawCategories.map((category) => {
        const mapped = mapYnabCategory(category);
        const assignedHistory = assignedByCategoryId.get(mapped.id) ?? [];
        const spentFromMonths = cashSpentByCategoryId.get(mapped.id) ?? 0;
        const spentFromCurrentActivity =
          typeof mapped.activity === "number" &&
          Number.isFinite(mapped.activity) &&
          mapped.activity < 0
            ? Math.max(0, -mapped.activity)
            : 0;
        return {
          ...mapped,
          cash_spent_total: Math.max(spentFromMonths, spentFromCurrentActivity),
          assigned_history: assignedHistory,
          assigned: mapped.assigned ?? assignedHistory[0] ?? null,
          prior_month_available:
            priorMonthAvailableByCategoryId.get(mapped.id) ?? null,
        };
      }),
      incomeHistory: mapIncomeHistory(rawMonths, baselineMonths),
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
