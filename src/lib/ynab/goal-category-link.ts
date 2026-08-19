import { createYnabClient, type YnabClient } from "@/lib/ynab/client";
import type { Tables } from "@/types/supabase";

type GoalRow = Tables<"goals">;

type EnsureGoalCategoryLinkInput = {
  token: string;
  budgetId: string;
  goal: GoalRow;
  /** @deprecated YNAPB now creates new categories in `YNAPB Goals`. */
  groupName?: string;
};

/** Legacy group where early YNAPB categories may live. YNAB treats it as internal for creates. */
export const YNAP_DEFAULT_GOALS_GROUP_NAME = "Goals";

/** Writable group for new YNAPB-managed categories. */
export const YNAP_WRITABLE_GOALS_GROUP_NAME = "YNAPB Goals";

export const YNAP_MANAGED_GOALS_GROUP_NAMES = [
  YNAP_DEFAULT_GOALS_GROUP_NAME,
  YNAP_WRITABLE_GOALS_GROUP_NAME,
] as const;

export const isManagedGoalsGroupName = (name: string): boolean =>
  YNAP_MANAGED_GOALS_GROUP_NAMES.some(
    (groupName) =>
      normalizeYnabComparableName(groupName) ===
      normalizeYnabComparableName(name),
  );

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

const findOrCreateWritableGoalsGroup = async (
  client: YnabClient,
  budgetId: string,
): Promise<{ id: string; name: string }> => {
  const categoryGroups = await client.getCategoryGroups(budgetId);
  const normalizedWritableName = normalizeName(YNAP_WRITABLE_GOALS_GROUP_NAME);
  const existingGroup = categoryGroups.find(
    (group) => normalizeName(group.name) === normalizedWritableName,
  );
  return (
    existingGroup ??
    (await client.createCategoryGroup(budgetId, YNAP_WRITABLE_GOALS_GROUP_NAME))
  );
};

export const ensureGoalCategoryLink = async ({
  token,
  budgetId,
  goal,
}: EnsureGoalCategoryLinkInput): Promise<string> => {
  const client = createYnabClient(token);
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
    (category) => normalizeName(category.name) === normalizedGoalName,
  );
  if (existingCategory) {
    await ensureCategoryVisible(client, budgetId, existingCategory);
    return existingCategory.id;
  }

  const writableGroup = await findOrCreateWritableGoalsGroup(client, budgetId);
  const createdCategory = await client.createCategory(
    budgetId,
    writableGroup.id,
    ynabGoalCategoryName,
  );
  return createdCategory.id;
};
