import { createYnabClient, type YnabClient } from "@/lib/ynab/client";
import type { Tables } from "@/types/supabase";

type GoalRow = Tables<"goals">;

type EnsureGoalCategoryLinkInput = {
  token: string;
  budgetId: string;
  goal: GoalRow;
  groupName?: string;
};

/** Group where YNAPB creates auto-linked monthly-funding categories. */
export const YNAP_DEFAULT_GOALS_GROUP_NAME = "Goals";

export const normalizeYnabComparableName = (value: string): string =>
  value.trim().toLocaleLowerCase();

const normalizeName = normalizeYnabComparableName;

const toDeadlineMonth = (deadline: string): string => deadline.slice(0, 7);

const YNAB_CATEGORY_MONTH_SUFFIX = /\((\d{4}-\d{2})\)\s*$/;

/** Month encoded in a YNAPB-managed category name, e.g. `Беседка (2026-05)`. */
export const parseYnabCategoryMonthFromName = (name: string): string | null => {
  const match = name.match(YNAB_CATEGORY_MONTH_SUFFIX);
  return match?.[1] ?? null;
};

export const buildYnabGoalCategoryName = (goal: GoalRow): string =>
  `${goal.name} (${toDeadlineMonth(goal.deadline)})`;

const ensureCategoryVisible = async (
  client: YnabClient,
  budgetId: string,
  category: { id: string; hidden?: boolean },
): Promise<void> => {
  if (category.hidden === true) {
    await client.patchBudgetCategoryFields(budgetId, category.id, {
      hidden: false,
    });
  }
};

export const ensureGoalCategoryLink = async ({
  token,
  budgetId,
  goal,
  groupName = YNAP_DEFAULT_GOALS_GROUP_NAME,
}: EnsureGoalCategoryLinkInput): Promise<string> => {
  const client = createYnabClient(token);
  const categoryGroups = await client.getCategoryGroups(budgetId);
  const normalizedGroupName = normalizeName(groupName);
  const existingGroup = categoryGroups.find(
    (group) => normalizeName(group.name) === normalizedGroupName,
  );
  const targetGroup =
    existingGroup ?? (await client.createCategoryGroup(budgetId, groupName));

  const categories = await client.getCategories(budgetId, {
    includeHidden: true,
  });
  const ynabGoalCategoryName = buildYnabGoalCategoryName(goal);
  const normalizedGoalName = normalizeName(ynabGoalCategoryName);

  if (goal.ynab_category_id) {
    const linkedCategory = categories.find(
      (category) => category.id === goal.ynab_category_id,
    );
    if (linkedCategory) {
      await ensureCategoryVisible(client, budgetId, linkedCategory);
      const linkedNameNormalized = normalizeName(linkedCategory.name);
      if (linkedNameNormalized !== normalizedGoalName) {
        await client.updateCategoryName(
          budgetId,
          linkedCategory.id,
          ynabGoalCategoryName,
        );
      }
      return linkedCategory.id;
    }
  }

  const existingCategory = categories.find(
    (category) =>
      normalizeName(category.name) === normalizedGoalName &&
      category.category_group_id === targetGroup.id,
  );
  if (existingCategory) {
    await ensureCategoryVisible(client, budgetId, existingCategory);
    return existingCategory.id;
  }

  const createdCategory = await client.createCategory(
    budgetId,
    targetGroup.id,
    ynabGoalCategoryName,
  );
  return createdCategory.id;
};
