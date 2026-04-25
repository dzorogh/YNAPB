type YnabApiResponse<TData> = {
  data: TData;
};

type YnabCategoryGroup = {
  id: string;
  name: string;
  hidden?: boolean;
  deleted?: boolean;
};

type YnabCategory = {
  id: string;
  name: string;
  category_group_id?: string;
  hidden?: boolean;
  deleted?: boolean;
  goal_type: string | null;
  goal_cadence?: number | null;
  goal_target: number | null;
  goal_target_month?: string | null;
  goal_under_funded: number | null;
};

type YnabCategoriesPayload = {
  category_groups: Array<{
    categories: YnabCategory[];
  }>;
};

type YnabCategoryGroupsPayload = {
  category_groups: YnabCategoryGroup[];
};

type YnabMonthsPayload = {
  months: Array<{
    month: string;
    income: number | null;
    categories?: Array<{
      id: string;
      budgeted?: number | null;
    }>;
  }>;
};

type YnabMonthDetailPayload = {
  month: {
    month: string;
    categories?: Array<{
      id: string;
      budgeted?: number | null;
    }>;
  };
};

type YnabBudgetPayload = {
  budget: {
    currency_format?: {
      iso_code?: string | null;
    } | null;
  };
};

type CreateCategoryGroupPayload = {
  category_group: {
    name: string;
  };
};

type CreateCategoryPayload = {
  category: {
    name: string;
    category_group_id: string;
  };
};

type UpdateCategoryPayload = {
  category: {
    name: string;
  };
};

type YnabCreatedCategoryGroupPayload = {
  category_group: YnabCategoryGroup;
};

type YnabCreatedCategoryPayload = {
  category: YnabCategory;
};

export type YnabClient = {
  getCategories: (budgetId: string) => Promise<YnabCategory[]>;
  getCategoryGroups: (budgetId: string) => Promise<YnabCategoryGroup[]>;
  createCategoryGroup: (
    budgetId: string,
    name: string,
  ) => Promise<YnabCategoryGroup>;
  createCategory: (
    budgetId: string,
    categoryGroupId: string,
    name: string,
  ) => Promise<YnabCategory>;
  updateCategoryName: (
    budgetId: string,
    categoryId: string,
    name: string,
  ) => Promise<YnabCategory>;
  getMonths: (
    budgetId: string,
  ) => Promise<
    Array<{
      month: string;
      income: number | null;
      categories?: Array<{ id: string; budgeted?: number | null }>;
    }>
  >;
  getBudgetCurrencyCode: (budgetId: string) => Promise<string | null>;
};

const YNAB_API_BASE = "https://api.ynab.com/v1";

const requestYnab = async <TData>(
  token: string,
  endpoint: string,
  options?: RequestInit,
): Promise<TData> => {
  const response = await fetch(`${YNAB_API_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`YNAB request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as YnabApiResponse<TData>;
  return payload.data;
};

export const createYnabClient = (token: string): YnabClient => ({
  getCategories: async (budgetId: string) => {
    const data = await requestYnab<YnabCategoriesPayload>(
      token,
      `/budgets/${budgetId}/categories`,
    );
    return data.category_groups
      .flatMap((group) => group.categories)
      .filter((category) => !category.deleted && !category.hidden);
  },
  getCategoryGroups: async (budgetId: string) => {
    const data = await requestYnab<YnabCategoryGroupsPayload>(
      token,
      `/budgets/${budgetId}/categories`,
    );
    return data.category_groups.filter(
      (group) => !group.deleted && !group.hidden,
    );
  },
  createCategoryGroup: async (budgetId: string, name: string) => {
    const data = await requestYnab<YnabCreatedCategoryGroupPayload>(
      token,
      `/budgets/${budgetId}/category_groups`,
      {
        method: "POST",
        body: JSON.stringify({
          category_group: {
            name,
          },
        } satisfies CreateCategoryGroupPayload),
      },
    );
    return data.category_group;
  },
  createCategory: async (
    budgetId: string,
    categoryGroupId: string,
    name: string,
  ) => {
    const data = await requestYnab<YnabCreatedCategoryPayload>(
      token,
      `/budgets/${budgetId}/categories`,
      {
        method: "POST",
        body: JSON.stringify({
          category: {
            name,
            category_group_id: categoryGroupId,
          },
        } satisfies CreateCategoryPayload),
      },
    );
    return data.category;
  },
  updateCategoryName: async (
    budgetId: string,
    categoryId: string,
    name: string,
  ) => {
    const data = await requestYnab<YnabCreatedCategoryPayload>(
      token,
      `/budgets/${budgetId}/categories/${categoryId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          category: {
            name,
          },
        } satisfies UpdateCategoryPayload),
      },
    );
    return data.category;
  },
  getMonths: async (budgetId: string) => {
    const data = await requestYnab<YnabMonthsPayload>(
      token,
      `/budgets/${budgetId}/months`,
    );
    const monthsWithCategories = await Promise.all(
      data.months.map(async (month) => {
        const detail = await requestYnab<YnabMonthDetailPayload>(
          token,
          `/budgets/${budgetId}/months/${month.month}`,
        );
        return {
          month: month.month,
          income: month.income,
          categories: detail.month.categories ?? [],
        };
      }),
    );
    return monthsWithCategories;
  },
  getBudgetCurrencyCode: async (budgetId: string) => {
    const data = await requestYnab<YnabBudgetPayload>(
      token,
      `/budgets/${budgetId}`,
    );
    const currencyCode = data.budget.currency_format?.iso_code;
    if (typeof currencyCode !== "string") {
      return null;
    }
    const trimmed = currencyCode.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
});
