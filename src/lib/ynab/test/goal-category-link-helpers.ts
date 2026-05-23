import { expect } from "vitest";

import type { Tables } from "@/types/supabase";

import { ensureGoalCategoryLink } from "../goal-category-link";

export const expectGoalCategoryLink = async (params: {
  token?: string;
  budgetId?: string;
  goal: Tables<"goals">;
  expectedCategoryId: string;
}) => {
  const categoryId = await ensureGoalCategoryLink({
    token: params.token ?? "token",
    budgetId: params.budgetId ?? "budget",
    goal: params.goal,
  });

  expect(categoryId).toBe(params.expectedCategoryId);
  return categoryId;
};
