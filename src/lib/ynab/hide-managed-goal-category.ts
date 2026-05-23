import { createYnabClient } from "@/lib/ynab/client";
import type { Tables } from "@/types/supabase";

import {
  YNAP_DEFAULT_GOALS_GROUP_NAME,
  buildYnabGoalCategoryName,
  normalizeYnabComparableName,
} from "./goal-category-link";

type GoalRow = Tables<"goals">;

/**
 * When a YNAPB goal is removed, hide the linked YNAB category only if it was
 * created/managed by YNAPB (group "Goals" + canonical name). User-linked
 * categories are left unchanged.
 */
export const hideManagedYnabCategoryForDeletedGoal = async (params: {
  token: string;
  budgetId: string;
  goal: GoalRow;
}): Promise<void> => {
  const { token, budgetId, goal } = params;
  const linkedId = goal.ynab_category_id?.trim();
  if (!linkedId) {
    return;
  }

  const client = createYnabClient(token);

  let category: Awaited<ReturnType<typeof client.getCategoryById>>;
  try {
    category = await client.getCategoryById(budgetId, linkedId);
  } catch {
    return;
  }

  if (category.deleted === true) {
    return;
  }

  if (category.hidden === true) {
    return;
  }

  const groups = await client.getCategoryGroups(budgetId);
  const normalizedDefaultGroup = normalizeYnabComparableName(
    YNAP_DEFAULT_GOALS_GROUP_NAME,
  );
  const goalsGroup = groups.find(
    (group) =>
      normalizeYnabComparableName(group.name) === normalizedDefaultGroup,
  );
  if (!goalsGroup) {
    return;
  }

  if (category.category_group_id !== goalsGroup.id) {
    return;
  }

  const expectedName = buildYnabGoalCategoryName(goal);
  if (
    normalizeYnabComparableName(category.name) !==
    normalizeYnabComparableName(expectedName)
  ) {
    return;
  }

  try {
    await client.patchBudgetCategoryFields(budgetId, linkedId, {
      hidden: true,
    });
  } catch (error) {
    console.error("Failed to hide managed YNAB category after goal delete", {
      goalId: goal.id,
      ynabCategoryId: linkedId,
      error,
    });
  }
};
