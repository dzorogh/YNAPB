import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { computeMonthlyBudget } from "@/lib/budget/obligations";
import { decryptToken } from "@/lib/crypto";
import { computePlan } from "@/lib/planner/planner";
import type { Goal as PlannerGoal } from "@/lib/planner/types";
import { listGoals } from "@/lib/repositories/goals-repo";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import {
  getCache,
  isCacheStale,
  parseCachedCategories,
  parseCachedIncomeHistory,
} from "@/lib/repositories/ynab-cache-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createYnabClient } from "@/lib/ynab/client";

const DEFAULT_HORIZON_MONTHS = 120;
const DEFAULT_CURRENCY_CODE = "USD";
const calculatePayloadSchema = z
  .object({
    deadlineShifts: z
      .record(z.string(), z.number().int().min(-240).max(240))
      .optional(),
  })
  .optional();

type TbdWarning = {
  categoryId: string;
  categoryName: string;
};

type GoalViewModel = {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  deadline: string;
  status: "active" | "frozen" | "completed";
  ynabCategoryId: string | null;
  createdAt: string;
};

const getCurrentUserId = async (): Promise<string | null> => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
};

const normalizeToMonthStart = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const addMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const currentMonthStart = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

const averageIncome = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
};

const resolveCurrentBalance = (
  _goal: Awaited<ReturnType<typeof listGoals>>[number],
  category: ReturnType<typeof parseCachedCategories>[number] | null,
): number => {
  if (!category) {
    return 0;
  }

  if (typeof category.balance === "number") {
    return Math.max(0, category.balance);
  }

  if (
    typeof category.goal_target === "number" &&
    typeof category.goal_under_funded === "number"
  ) {
    return Math.max(0, category.goal_target - category.goal_under_funded);
  }

  return 0;
};

const mapGoalsToPlannerInput = (
  goals: Awaited<ReturnType<typeof listGoals>>,
  categories: ReturnType<typeof parseCachedCategories>,
  deadlineShifts: Record<string, number>,
): PlannerGoal[] => {
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );

  return goals
    .filter((goal) => goal.status === "active")
    .map((goal) => {
      const linkedCategory = goal.ynab_category_id
        ? (categoriesById.get(goal.ynab_category_id) ?? null)
        : null;

      return {
        id: goal.id,
        name: goal.name,
        targetAmount: goal.target_amount,
        currentBalance: resolveCurrentBalance(goal, linkedCategory),
        deadline: addMonths(
          normalizeToMonthStart(goal.deadline),
          deadlineShifts[goal.id] ?? 0,
        ),
        status: goal.status,
        ynabCategoryId: goal.ynab_category_id,
        createdAt: new Date(goal.created_at),
      };
    });
};

const mapGoalsToViewModel = (
  goals: Awaited<ReturnType<typeof listGoals>>,
  categories: ReturnType<typeof parseCachedCategories>,
): GoalViewModel[] => {
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  return goals.map((goal) => {
    const linkedCategory = goal.ynab_category_id
      ? (categoriesById.get(goal.ynab_category_id) ?? null)
      : null;
    return {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.target_amount,
      currentBalance: resolveCurrentBalance(goal, linkedCategory),
      deadline: goal.deadline,
      status: goal.status,
      ynabCategoryId: goal.ynab_category_id,
      createdAt: goal.created_at,
    };
  });
};

const buildTbdWarnings = (
  categories: ReturnType<typeof parseCachedCategories>,
  plannerGoals: PlannerGoal[],
): TbdWarning[] => {
  const linkedCategoryIds = new Set(
    plannerGoals
      .map((goal) => goal.ynabCategoryId)
      .filter((categoryId): categoryId is string => Boolean(categoryId)),
  );

  return categories
    .filter((category) => category.goal_type === "TBD")
    .filter((category) => !linkedCategoryIds.has(category.id))
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
    }));
};

const resolveCurrencyCode = async (
  profile: Awaited<ReturnType<typeof getProfile>>,
): Promise<string> => {
  if (
    !profile?.ynab_budget_id ||
    !profile.ynab_token_ct ||
    !profile.ynab_token_iv
  ) {
    return DEFAULT_CURRENCY_CODE;
  }
  if (
    typeof profile.ynab_currency_code === "string" &&
    profile.ynab_currency_code.trim().length > 0
  ) {
    return profile.ynab_currency_code.trim().toUpperCase();
  }

  try {
    const token = await decryptToken(
      profile.ynab_token_ct,
      profile.ynab_token_iv,
    );
    const currencyCode = await createYnabClient(token).getBudgetCurrencyCode(
      profile.ynab_budget_id,
    );
    return currencyCode ?? DEFAULT_CURRENCY_CODE;
  } catch {
    return DEFAULT_CURRENCY_CODE;
  }
};

export async function POST(request: Request) {
  try {
    const payload = calculatePayloadSchema.parse(
      await request.json().catch(() => ({})),
    );
    const deadlineShifts = payload?.deadlineShifts ?? {};
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [goals, cache, incomeSettings, profile] = await Promise.all([
      listGoals(userId),
      getCache(userId),
      getIncomeSettings(userId),
      getProfile(userId),
    ]);

    const categories = cache ? parseCachedCategories(cache.categories) : [];
    const needsSync = isCacheStale(cache);
    const plannerGoals = mapGoalsToPlannerInput(
      goals,
      categories,
      deadlineShifts,
    );
    const activeGoalCategoryIds = plannerGoals
      .map((goal) => goal.ynabCategoryId)
      .filter((categoryId): categoryId is string => Boolean(categoryId));

    const incomeHistory = cache
      ? parseCachedIncomeHistory(cache.income_history)
      : [];
    const plannedIncome =
      incomeSettings?.planned_income ??
      averageIncome(incomeHistory.map((item) => item.income));

    const budget = computeMonthlyBudget({
      categories,
      activeGoalCategoryIds,
      plannedIncome,
    });
    const startMonth = currentMonthStart();

    const planResult = computePlan({
      goals: plannerGoals,
      budget,
      startMonth,
      horizonMonths: DEFAULT_HORIZON_MONTHS,
    });

    const tbdWarnings = buildTbdWarnings(categories, plannerGoals);
    const currencyCode = await resolveCurrencyCode(profile);
    const goalsView = mapGoalsToViewModel(goals, categories);
    return NextResponse.json({
      budget,
      planResult,
      goals: goalsView,
      startMonth: startMonth.toISOString(),
      horizonMonths: DEFAULT_HORIZON_MONTHS,
      tbdWarnings,
      needsSync,
      currencyCode,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to calculate plan" },
      { status: 500 },
    );
  }
}
