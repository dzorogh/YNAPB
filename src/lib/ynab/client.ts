import type { Category, ExistingCategory } from "ynab";

import {
  createOfficialYnabApis,
  runOfficialYnabCall,
} from "@/lib/ynab/official-api";

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

/** Fields accepted by the official SDK `updateCategory`. */
type PatchBudgetCategoryPayload = ExistingCategory & {
  hidden?: boolean;
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
    category: PatchBudgetCategoryPayload,
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

const toClientCategory = (category: Category): YnabCategory => ({
  id: category.id,
  name: category.name,
  category_group_id: category.category_group_id,
  hidden: category.hidden,
  deleted: category.deleted,
  goal_type: category.goal_type ?? null,
  goal_cadence: category.goal_cadence,
  goal_target: category.goal_target ?? null,
  goal_target_month: category.goal_target_month,
  goal_under_funded: category.goal_under_funded ?? null,
});

const toExistingCategory = (
  category: PatchBudgetCategoryPayload,
): ExistingCategory => ({
  name: category.name,
  note: category.note,
  category_group_id: category.category_group_id,
  goal_target: category.goal_target,
  goal_target_date: category.goal_target_date,
  goal_needs_whole_amount: category.goal_needs_whole_amount,
});

export const createYnabClient = (
  token: string,
  fetchImpl?: typeof fetch,
): YnabClient => {
  const apis = createOfficialYnabApis(token, fetchImpl);

  const patchBudgetCategoryFields = async (
    budgetId: string,
    categoryId: string,
    categoryPayload: PatchBudgetCategoryPayload,
  ) => {
    const data = await runOfficialYnabCall(() =>
      apis.categories.updateCategory(budgetId, categoryId, {
        category: toExistingCategory(categoryPayload),
      }),
    );
    return toClientCategory(data.data.category);
  };

  return {
    getCategories: async (budgetId: string, options?: GetCategoriesOptions) => {
      const data = await runOfficialYnabCall(() =>
        apis.categories.getCategories(budgetId),
      );
      return data.data.category_groups
        .flatMap((group) => group.categories)
        .filter(
          (category) =>
            !category.deleted &&
            (options?.includeHidden === true || !category.hidden),
        )
        .map(toClientCategory);
    },
    getCategoryGroups: async (budgetId: string) => {
      const data = await runOfficialYnabCall(() =>
        apis.categories.getCategories(budgetId),
      );
      return data.data.category_groups
        .filter((group) => !group.deleted && !group.hidden)
        .map((group) => ({
          id: group.id,
          name: group.name,
          hidden: group.hidden,
          deleted: group.deleted,
        }));
    },
    getCategoryById: async (budgetId: string, categoryId: string) => {
      const data = await runOfficialYnabCall(() =>
        apis.categories.getCategoryById(budgetId, categoryId),
      );
      return toClientCategory(data.data.category);
    },
    createCategoryGroup: async (budgetId: string, name: string) => {
      const data = await runOfficialYnabCall(() =>
        apis.categories.createCategoryGroup(budgetId, {
          category_group: { name },
        }),
      );
      return data.data.category_group;
    },
    createCategory: async (
      budgetId: string,
      categoryGroupId: string,
      name: string,
    ) => {
      const data = await runOfficialYnabCall(() =>
        apis.categories.createCategory(budgetId, {
          category: {
            name,
            category_group_id: categoryGroupId,
          },
        }),
      );
      return toClientCategory(data.data.category);
    },
    patchBudgetCategoryFields,
    updateCategoryName: async (
      budgetId: string,
      categoryId: string,
      name: string,
    ) => patchBudgetCategoryFields(budgetId, categoryId, { name }),
    getMonths: async (budgetId, options) => {
      const monthDetailsLookback =
        options?.monthDetailsLookback ?? DEFAULT_MONTH_DETAILS_LOOKBACK;
      const data = await runOfficialYnabCall(() =>
        apis.months.getPlanMonths(budgetId),
      );
      const sortedMonths = [...data.data.months].sort((left, right) =>
        right.month.localeCompare(left.month),
      );
      const monthsForDetail = sortedMonths.slice(
        0,
        Math.max(1, monthDetailsLookback),
      );
      const categoriesByMonth = new Map<
        string,
        Array<{
          id: string;
          budgeted?: number | null;
          activity?: number | null;
          balance?: number | null;
        }>
      >();

      for (const [index, month] of monthsForDetail.entries()) {
        if (index > 0) {
          await sleep(MONTH_DETAIL_REQUEST_DELAY_MS);
        }
        const detail = await runOfficialYnabCall(() =>
          apis.months.getPlanMonth(budgetId, month.month),
        );
        categoriesByMonth.set(
          month.month,
          (detail.data.month.categories ?? []).map((category) => ({
            id: category.id,
            budgeted: category.budgeted,
            activity: category.activity,
            balance: category.balance,
          })),
        );
      }

      return sortedMonths.map((month) => ({
        month: month.month,
        income: month.income,
        categories: categoriesByMonth.get(month.month),
      }));
    },
    getBudgetCurrencyCode: async (budgetId: string) => {
      const data = await runOfficialYnabCall(() =>
        apis.plans.getPlanSettingsById(budgetId),
      );
      const currencyCode = data.data.settings.currency_format?.iso_code;
      if (typeof currencyCode !== "string") {
        return null;
      }
      const trimmed = currencyCode.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
  };
};
