import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { decryptToken } from "@/lib/crypto";
import { computeMonthlyBudget } from "@/lib/budget/obligations";
import { computePlan } from "@/lib/planner/planner";
import type { Goal as PlannerGoal, PlanResult } from "@/lib/planner/types";
import {
  createAndTrimPlanSnapshot,
  DEFAULT_PLAN_SNAPSHOT_KEEP,
} from "@/lib/repositories/plan-snapshots-repo";
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
import {
  buildPushDiff,
  pushMonthlyFundingGoals,
  sortMonthlyFundingDiff,
  type MonthlyFundingDiffItem,
} from "@/lib/ynab/push-mf";

const DEFAULT_HORIZON_MONTHS = 120;
const monthStringSchema = z.string().regex(/^\d{4}-\d{2}$/);
const previewPayloadSchema = z.object({
  mode: z.literal("preview"),
  month: monthStringSchema,
});
const applyPayloadSchema = z.object({
  mode: z.literal("apply"),
  month: monthStringSchema,
  acceptedDiffHash: z.string().trim().min(1),
});
const pushPayloadSchema = z.union([previewPayloadSchema, applyPayloadSchema]);

const monthKeyFromDate = (value: Date): string =>
  `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;

const monthStartFromKey = (value: string): Date => {
  const [year, month] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year!, month! - 1, 1));
};

const normalizeToMonthStart = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

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
    typeof category.goal_target === "number"
    && typeof category.goal_under_funded === "number"
  ) {
    return Math.max(0, category.goal_target - category.goal_under_funded);
  }

  return 0;
};

const mapGoalsToPlannerInput = (
  goals: Awaited<ReturnType<typeof listGoals>>,
  categories: ReturnType<typeof parseCachedCategories>,
): PlannerGoal[] => {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

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
        deadline: normalizeToMonthStart(goal.deadline),
        status: goal.status,
        ynabCategoryId: goal.ynab_category_id,
        createdAt: new Date(goal.created_at),
      };
    });
};

const hashValue = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const buildDiffHash = (month: string, diff: MonthlyFundingDiffItem[]): string =>
  hashValue({ month, diff: sortMonthlyFundingDiff(diff) });

const buildInputsHash = (params: {
  month: string;
  goals: Awaited<ReturnType<typeof listGoals>>;
  budget: ReturnType<typeof computeMonthlyBudget>;
  planResult: PlanResult;
}): string =>
  hashValue({
    month: params.month,
    goals: params.goals.map((goal) => ({
      id: goal.id,
      status: goal.status,
      targetAmount: goal.target_amount,
      deadline: goal.deadline,
      ynabCategoryId: goal.ynab_category_id,
      createdAt: goal.created_at,
    })),
    budget: params.budget,
    planResult: params.planResult,
  });

const getCurrentUserId = async (): Promise<string | null> => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
};

const invalidPayloadResponse = (error: ZodError) =>
  NextResponse.json(
    { error: "Invalid payload", issues: error.flatten() },
    { status: 400 },
  );

const invalidConnectionResponse = () =>
  NextResponse.json(
    { error: "YNAB connection is not configured" },
    { status: 400 },
  );

const buildCanonicalPlanAndDiff = async (userId: string, month: string) => {
  const [goals, cache, incomeSettings] = await Promise.all([
    listGoals(userId),
    getCache(userId),
    getIncomeSettings(userId),
  ]);

  if (!cache || isCacheStale(cache)) {
    return {
      errorResponse: NextResponse.json(
        { error: "YNAB cache is missing or stale, run sync first", needsSync: true },
        { status: 409 },
      ),
    } as const;
  }

  const categories = parseCachedCategories(cache.categories);
  const plannerGoals = mapGoalsToPlannerInput(goals, categories);
  const activeGoalCategoryIds = plannerGoals
    .map((goal) => goal.ynabCategoryId)
    .filter((categoryId): categoryId is string => Boolean(categoryId));
  const incomeHistory = parseCachedIncomeHistory(cache.income_history);
  const plannedIncome = incomeSettings?.planned_income
    ?? averageIncome(incomeHistory.map((item) => item.income));
  const budget = computeMonthlyBudget({
    categories,
    activeGoalCategoryIds,
    plannedIncome,
  });
  const planResult = computePlan({
    goals: plannerGoals,
    budget,
    startMonth: currentMonthStart(),
    horizonMonths: DEFAULT_HORIZON_MONTHS,
  });

  const targetMonth = monthStartFromKey(month);
  const allocationForMonth = planResult.allocations.find(
    (allocation) => monthKeyFromDate(allocation.month) === monthKeyFromDate(targetMonth),
  );
  if (!allocationForMonth) {
    return {
      errorResponse: NextResponse.json(
        { error: "Requested month is outside the planning horizon" },
        { status: 400 },
      ),
    } as const;
  }

  const diff = buildPushDiff({
    goals: goals.map((goal) => ({
      id: goal.id,
      status: goal.status,
      ynabCategoryId: goal.ynab_category_id,
    })),
    allocationForMonth: allocationForMonth.perGoal,
    categories: categories.map((category) => ({
      id: category.id,
      goalTarget: category.goal_target,
    })),
  });

  return {
    goals,
    budget,
    planResult,
    diff,
    diffHash: buildDiffHash(month, diff),
  } as const;
};

const applyDiffAndPersistSnapshot = async (params: {
  userId: string;
  month: string;
  acceptedDiffHash: string;
  canonical: Awaited<ReturnType<typeof buildCanonicalPlanAndDiff>>;
}) => {
  const { userId, month, acceptedDiffHash, canonical } = params;
  if ("errorResponse" in canonical) {
    return canonical.errorResponse;
  }

  if (acceptedDiffHash !== canonical.diffHash) {
    return NextResponse.json(
      {
        error: "Diff changed since preview. Please preview again.",
        diff: canonical.diff,
        diffHash: canonical.diffHash,
      },
      { status: 409 },
    );
  }

  const profile = await getProfile(userId);
  if (
    !profile?.ynab_budget_id
    || !profile.ynab_token_ct
    || !profile.ynab_token_iv
  ) {
    return invalidConnectionResponse();
  }

  const token = await decryptToken(profile.ynab_token_ct, profile.ynab_token_iv);
  if (canonical.diff.length > 0) {
    await pushMonthlyFundingGoals({
      token,
      budgetId: profile.ynab_budget_id,
      updates: canonical.diff,
    });
  }

  await createAndTrimPlanSnapshot(
    userId,
    {
      inputsHash: buildInputsHash({
        month,
        goals: canonical.goals,
        budget: canonical.budget,
        planResult: canonical.planResult,
      }),
      result: canonical.planResult,
    },
    DEFAULT_PLAN_SNAPSHOT_KEEP,
  );

  return NextResponse.json({
    applied: canonical.diff.length,
    diffHash: canonical.diffHash,
  });
};

export async function POST(request: Request) {
  try {
    const payload = pushPayloadSchema.parse(await request.json());
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canonical = await buildCanonicalPlanAndDiff(userId, payload.month);
    if ("errorResponse" in canonical) {
      return canonical.errorResponse;
    }

    if (payload.mode === "preview") {
      return NextResponse.json({
        diff: canonical.diff,
        diffHash: canonical.diffHash,
      });
    }
    return applyDiffAndPersistSnapshot({
      userId,
      month: payload.month,
      acceptedDiffHash: payload.acceptedDiffHash,
      canonical,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return invalidPayloadResponse(error);
    }

    return NextResponse.json({ error: "Failed to push plan" }, { status: 500 });
  }
}
