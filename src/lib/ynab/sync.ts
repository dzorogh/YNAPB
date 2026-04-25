import { createYnabClient, type YnabClient } from "./client";
import { mapIncomeHistory, mapYnabCategory, type YnabCategory, type YnabMonthIncome } from "./map";

export type YnabDataClient = Pick<YnabClient, "getCategories" | "getMonths">;

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
};

const hasToken = (token: string): boolean => token.trim().length > 0;

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
  const [rawCategories, rawMonths] = await Promise.all([
    ynabClient.getCategories(budgetId),
    ynabClient.getMonths(budgetId),
  ]);

  return {
    categories: rawCategories.map(mapYnabCategory),
    incomeHistory: mapIncomeHistory(rawMonths, baselineMonths),
    syncedAt: new Date().toISOString(),
  };
};
