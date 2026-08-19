import { requestYnab } from "./ynab-request";

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

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
      activity?: number | null;
    }>;
  }>;
};

type YnabMonthDetailPayload = {
  month: {
    month: string;
    categories?: Array<{
      id: string;
      budgeted?: number | null;
      activity?: number | null;
      balance?: number | null;
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

/** Subset accepted by PATCH `/budgets/{budget_id}/categories/{category_id}`. */
type PatchBudgetCategoryPayload = {
  category: {
    name?: string;
    hidden?: boolean;
  };
};

type YnabCreatedCategoryGroupPayload = {
  category_group: YnabCategoryGroup;
};

type PatchCategoryResponseInner = {
  category: YnabCategory;
};

type GetCategoriesOptions = {
  includeHidden?: boolean;
};

export type YnabClient = {
  getCategories: (
    budgetId: string,
    options?: GetCategoriesOptions,
  ) => Promise<YnabCategory[]>;
  getCategoryGroups: (budgetId: string) => Promise<YnabCategoryGroup[]>;
  getCategoryById: (
    budgetId: string,
    categoryId: string,
  ) => Promise<YnabCategory>;
  createCategoryGroup: (
    budgetId: string,
    name: string,
  ) => Promise<YnabCategoryGroup>;
  createCategory: (
    budgetId: string,
    categoryGroupId: string,
    name: string,
  ) => Promise<YnabCategory>;
  patchBudgetCategoryFields: (
    budgetId: string,
    categoryId: string,
    category: PatchBudgetCategoryPayload["category"],
  ) => Promise<YnabCategory>;
  updateCategoryName: (
    budgetId: string,
    categoryId: string,
    name: string,
  ) => Promise<YnabCategory>;
  getMonths: (
    budgetId: string,
    options?: {
      monthDetailsLookback?: number;
    },
  ) => Promise<
    Array<{
      month: string;
      income: number | null;
      categories?: Array<{
        id: string;
        budgeted?: number | null;
        activity?: number | null;
        balance?: number | null;
      }>;
    }>
  >;
  getBudgetCurrencyCode: (budgetId: string) => Promise<string | null>;
};

const DEFAULT_MONTH_DETAILS_LOOKBACK = 3;
const MONTH_DETAIL_REQUEST_DELAY_MS = 250;

export const createYnabClient = (token: string): YnabClient => {
  const patchBudgetCategoryFields = async (
    budgetId: string,
    categoryId: string,
    categoryPayload: PatchBudgetCategoryPayload["category"],
  ) => {
    const data = await requestYnab<PatchCategoryResponseInner>(
      token,
      `/budgets/${budgetId}/categories/${categoryId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          category: categoryPayload,
        } satisfies PatchBudgetCategoryPayload),
      },
    );
    return data.category;
  };

  return {
    getCategories: async (budgetId: string, options?: GetCategoriesOptions) => {
      const data = await requestYnab<YnabCategoriesPayload>(
        token,
        `/budgets/${budgetId}/categories`,
      );
      return data.category_groups
        .flatMap((group) => group.categories)
        .filter(
          (category) =>
            !category.deleted &&
            (options?.includeHidden === true || !category.hidden),
        );
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
    getCategoryById: async (budgetId: string, categoryId: string) => {
      const data = await requestYnab<PatchCategoryResponseInner>(
        token,
        `/budgets/${budgetId}/categories/${categoryId}`,
      );
      return data.category;
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
      const data = await requestYnab<PatchCategoryResponseInner>(
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
    patchBudgetCategoryFields: patchBudgetCategoryFields,
    updateCategoryName: async (
      budgetId: string,
      categoryId: string,
      name: string,
    ) => patchBudgetCategoryFields(budgetId, categoryId, { name }),
    getMonths: async (budgetId, options) => {
      const monthDetailsLookback =
        options?.monthDetailsLookback ?? DEFAULT_MONTH_DETAILS_LOOKBACK;
      const data = await requestYnab<YnabMonthsPayload>(
        token,
        `/budgets/${budgetId}/months`,
      );
      const sortedMonths = [...data.months].sort((left, right) =>
        right.month.localeCompare(left.month),
      );
      const monthsForDetail = sortedMonths.slice(
        0,
        Math.max(1, monthDetailsLookback),
      );
      const categoriesByMonth = new Map<
        string,
        NonNullable<YnabMonthsPayload["months"][number]["categories"]>
      >();

      for (const [index, month] of monthsForDetail.entries()) {
        if (index > 0) {
          await sleep(MONTH_DETAIL_REQUEST_DELAY_MS);
        }
        const detail = await requestYnab<YnabMonthDetailPayload>(
          token,
          `/budgets/${budgetId}/months/${month.month}`,
        );
        categoriesByMonth.set(month.month, detail.month.categories ?? []);
      }

      return sortedMonths.map((month) => ({
        month: month.month,
        income: month.income,
        categories: categoriesByMonth.get(month.month),
      }));
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
  };
};
