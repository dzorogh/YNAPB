import { createYnabClient } from "@/lib/ynab/client";
import type { Tables } from "@/types/supabase";

type GoalRow = Tables<"goals">;

type EnsureGoalCategoryLinkInput = {
  token: string;
  budgetId: string;
  goal: GoalRow;
  groupName?: string;
};

const DEFAULT_GOALS_GROUP_NAME = "Goals";

const normalizeName = (value: string): string =>
  value.trim().toLocaleLowerCase();

const toDeadlineMonth = (deadline: string): string => deadline.slice(0, 7);

const buildYnabGoalCategoryName = (goal: GoalRow): string =>
  `${goal.name} (${toDeadlineMonth(goal.deadline)})`;

export const ensureGoalCategoryLink = async ({
  token,
  budgetId,
  goal,
  groupName = DEFAULT_GOALS_GROUP_NAME,
}: EnsureGoalCategoryLinkInput): Promise<string> => {
  const client = createYnabClient(token);
  const categoryGroups = await client.getCategoryGroups(budgetId);
  const normalizedGroupName = normalizeName(groupName);
  const existingGroup = categoryGroups.find(
    (group) => normalizeName(group.name) === normalizedGroupName,
  );
  const targetGroup =
    existingGroup ?? (await client.createCategoryGroup(budgetId, groupName));

  const categories = await client.getCategories(budgetId);
  const ynabGoalCategoryName = buildYnabGoalCategoryName(goal);
  const normalizedGoalName = normalizeName(ynabGoalCategoryName);

  if (goal.ynab_category_id) {
    const linkedCategory = categories.find(
      (category) => category.id === goal.ynab_category_id,
    );
    if (linkedCategory) {
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
    return existingCategory.id;
  }

  const createdCategory = await client.createCategory(
    budgetId,
    targetGroup.id,
    ynabGoalCategoryName,
  );
  return createdCategory.id;
};
