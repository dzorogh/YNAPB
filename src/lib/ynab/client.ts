type YnabApiResponse<TData> = {
  data: TData;
};

type YnabCategoriesPayload = {
  category_groups: Array<{
    categories: Array<{
      id: string;
      name: string;
      goal_type: string | null;
      goal_target: number | null;
      goal_under_funded: number | null;
    }>;
  }>;
};

type YnabMonthsPayload = {
  months: Array<{
    month: string;
    income: number | null;
  }>;
};

export type YnabClient = {
  getCategories: (budgetId: string) => Promise<
    Array<{
      id: string;
      name: string;
      goal_type: string | null;
      goal_target: number | null;
      goal_under_funded: number | null;
    }>
  >;
  getMonths: (budgetId: string) => Promise<Array<{ month: string; income: number | null }>>;
};

const YNAB_API_BASE = "https://api.ynab.com/v1";

const fetchYnab = async <TData>(token: string, endpoint: string): Promise<TData> => {
  const response = await fetch(`${YNAB_API_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`YNAB request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as YnabApiResponse<TData>;
  return payload.data;
};

export const createYnabClient = (token: string): YnabClient => ({
  getCategories: async (budgetId: string) => {
    const data = await fetchYnab<YnabCategoriesPayload>(token, `/budgets/${budgetId}/categories`);
    return data.category_groups.flatMap((group) => group.categories);
  },
  getMonths: async (budgetId: string) => {
    const data = await fetchYnab<YnabMonthsPayload>(token, `/budgets/${budgetId}/months`);
    return data.months;
  },
});
