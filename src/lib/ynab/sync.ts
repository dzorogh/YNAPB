import { createYnabClient, type YnabClient } from "./client";
import {
  mapCategoryAssignedHistory,
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
};

type SyncYnabDataResult = {
  categories: YnabCategory[];
  incomeHistory: YnabMonthIncome[];
  syncedAt: string;
  currencyCode: string | null;
};

const hasToken = (token: string): boolean => token.trim().length > 0;
const OBLIGATIONS_AVERAGE_ASSIGNED_MONTHS = 3;

export const syncYnabData = async ({
  token,
  budgetId,
  baselineMonths,
  client,
}: SyncYnabDataInput): Promise<SyncYnabDataResult> => {
  if (!hasToken(token)) {
    throw new YnabSyncError("MISSING_TOKEN", "YNAB token is required");
  }

  const ynabClient = client ?? createYnabClient(token);
  const [rawCategories, rawMonths, currencyCode] = await Promise.all([
    ynabClient.getCategories(budgetId),
    ynabClient.getMonths(budgetId),
    ynabClient.getBudgetCurrencyCode(budgetId),
  ]);
  const assignedHistory = mapCategoryAssignedHistory(
    rawMonths,
    OBLIGATIONS_AVERAGE_ASSIGNED_MONTHS,
  );
  const assignedByCategoryId = assignedHistory.reduce<
    Map<string, number[]>
  >((accumulator, item) => {
    const current = accumulator.get(item.categoryId) ?? [];
    current.push(item.assigned);
    accumulator.set(item.categoryId, current);
    return accumulator;
  }, new Map());

  return {
    categories: rawCategories.map((category) => {
      const mapped = mapYnabCategory(category);
      return {
        ...mapped,
        assigned_history: assignedByCategoryId.get(mapped.id) ?? [],
      };
    }),
    incomeHistory: mapIncomeHistory(rawMonths, baselineMonths),
    syncedAt: new Date().toISOString(),
    currencyCode,
  };
};
