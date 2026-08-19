import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ZodError, z } from "zod";

import { getCurrentUserId } from "@/lib/api/auth";
import {
  invalidPayloadResponse,
  invalidYnabConnectionResponse,
  unauthorizedResponse,
} from "@/lib/api/http";
import { decryptToken } from "@/lib/crypto";
import { monthKeyFromDate, monthStartFromKey } from "@/lib/dates/month";
import type { PlanResult } from "@/lib/planner/types";
import { buildPlanComputation } from "@/lib/plan/plan-computation";
import {
  listGoals,
  setGoalYnabCategoryId,
} from "@/lib/repositories/goals-repo";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import {
  createAndTrimPlanSnapshot,
  DEFAULT_PLAN_SNAPSHOT_KEEP,
} from "@/lib/repositories/plan-snapshots-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import { getCache, isCacheStale } from "@/lib/repositories/ynab-cache-repo";
import { ensureGoalCategoryLink } from "@/lib/ynab/goal-category-link";
import { toYnabGoalProgressInput } from "@/lib/ynab/category-progress-input";
import { buildMonthlyFundingTargetsForPush } from "@/lib/ynab/goal-progress";
import { buildSyncErrorBody } from "@/lib/ynab/sync-error-response";
import { YnabRequestError } from "@/lib/ynab/ynab-request";
import {
  finishYnabOperation,
  startYnabOperation,
} from "@/lib/ynab/ynab-request-log";
import {
  buildPushDiff,
  pushMonthlyFundingGoals,
  sortMonthlyFundingDiff,
  type MonthlyFundingDiffItem,
} from "@/lib/ynab/push-mf";

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

const hashValue = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const buildDiffHash = (month: string, diff: MonthlyFundingDiffItem[]): string =>
  hashValue({ month, diff: sortMonthlyFundingDiff(diff) });

const buildInputsHash = (params: {
  month: string;
  goals: Awaited<ReturnType<typeof listGoals>>;
  budget: ReturnType<typeof buildPlanComputation>["budget"];
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

const buildCanonicalPlanAndDiff = async (userId: string, month: string) => {
  const [goals, cache, incomeSettings] = await Promise.all([
    listGoals(userId),
    getCache(userId),
    getIncomeSettings(userId),
  ]);

  if (!cache || isCacheStale(cache)) {
    return {
      errorResponse: NextResponse.json(
        {
          error: "YNAB cache is missing or stale, run sync first",
          needsSync: true,
        },
        { status: 409 },
      ),
    } as const;
  }

  const computation = buildPlanComputation({ goals, cache, incomeSettings });
  const targetMonth = monthStartFromKey(month);
  const allocationForMonth = computation.planResult.allocations.find(
    (allocation) =>
      monthKeyFromDate(allocation.month) === monthKeyFromDate(targetMonth),
  );
  if (!allocationForMonth) {
    return {
      errorResponse: NextResponse.json(
        { error: "Requested month is outside the planning horizon" },
        { status: 400 },
      ),
    } as const;
  }

  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const categoriesById = new Map(
    computation.categories.map((category) => [
      category.id,
      toYnabGoalProgressInput(category),
    ]),
  );
  const categoryNamesById = new Map(
    computation.categories.map((category) => [category.id, category.name]),
  );
  const categoryGoalTargetsById = new Map(
    computation.categories.map((category) => [
      category.id,
      category.goal_target,
    ]),
  );
  const monthlyFundingTargets = buildMonthlyFundingTargetsForPush({
    goals: computation.plannerGoals.map((goal) => {
      const sourceGoal = goalsById.get(goal.id);
      if (!sourceGoal) {
        throw new Error(`Goal ${goal.id} is missing from planner input`);
      }

      return {
        id: goal.id,
        targetAmount: goal.targetAmount,
        deadline: sourceGoal.deadline,
        ynabCategoryId: goal.ynabCategoryId,
      };
    }),
    categoriesById,
    categoryNamesById,
    categoryGoalTargetsById,
    pushMonth: month,
    plannerAllocationForMonth: allocationForMonth.perGoal,
  });

  const diff = buildPushDiff({
    goals: goals.map((goal) => ({
      id: goal.id,
      status: goal.status,
      ynabCategoryId: goal.ynab_category_id,
    })),
    allocationForMonth: monthlyFundingTargets,
    categories: computation.categories.map((category) => ({
      id: category.id,
      name: category.name,
      goalTarget: category.goal_target,
    })),
  });

  return {
    goals,
    budget: computation.budget,
    planResult: computation.planResult,
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
    !profile?.ynab_budget_id ||
    !profile.ynab_token_ct ||
    !profile.ynab_token_iv
  ) {
    return invalidYnabConnectionResponse();
  }

  const token = await decryptToken(
    profile.ynab_token_ct,
    profile.ynab_token_iv,
  );
  const pushOperationId = startYnabOperation("push");
  const activeGoals = canonical.goals.filter(
    (goal) => goal.status === "active",
  );
  let hasCategoryLinkChanges = false;
  try {
    for (const goal of activeGoals) {
      const ynabCategoryId = await ensureGoalCategoryLink({
        token,
        budgetId: profile.ynab_budget_id,
        goal,
      });
      if (ynabCategoryId === goal.ynab_category_id) {
        continue;
      }
      await setGoalYnabCategoryId(userId, goal.id, ynabCategoryId);
      hasCategoryLinkChanges = true;
    }

    const effectiveCanonical = hasCategoryLinkChanges
      ? await buildCanonicalPlanAndDiff(userId, month)
      : canonical;
    if ("errorResponse" in effectiveCanonical) {
      return effectiveCanonical.errorResponse;
    }
    if (acceptedDiffHash !== effectiveCanonical.diffHash) {
      return NextResponse.json(
        {
          error: "Diff changed since preview. Please preview again.",
          diff: effectiveCanonical.diff,
          diffHash: effectiveCanonical.diffHash,
        },
        { status: 409 },
      );
    }
    if (effectiveCanonical.diff.length > 0) {
      await pushMonthlyFundingGoals({
        token,
        budgetId: profile.ynab_budget_id,
        updates: effectiveCanonical.diff,
      });
    }

    await createAndTrimPlanSnapshot(
      userId,
      {
        inputsHash: buildInputsHash({
          month,
          goals: effectiveCanonical.goals,
          budget: effectiveCanonical.budget,
          planResult: effectiveCanonical.planResult,
        }),
        result: effectiveCanonical.planResult,
      },
      DEFAULT_PLAN_SNAPSHOT_KEEP,
    );

    finishYnabOperation(pushOperationId, "ok");

    return NextResponse.json({
      applied: effectiveCanonical.diff.length,
      diffHash: effectiveCanonical.diffHash,
    });
  } catch (error) {
    const failedAt =
      error instanceof YnabRequestError ? `status ${error.status}` : null;
    finishYnabOperation(pushOperationId, "failed", failedAt);
    throw error;
  }
};

export async function POST(request: Request) {
  try {
    const payload = pushPayloadSchema.parse(await request.json());
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedResponse();
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
    return await applyDiffAndPersistSnapshot({
      userId,
      month: payload.month,
      acceptedDiffHash: payload.acceptedDiffHash,
      canonical,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return invalidPayloadResponse(error);
    }

    if (error instanceof YnabRequestError && error.status === 429) {
      const body = buildSyncErrorBody(
        error,
        "YNAB rate limit reached. Wait a few minutes, then try again.",
        error.operationId,
      );
      console.error("[YNAB] push failed with rate limit", body);
      return NextResponse.json(body, { status: 429 });
    }

    const body = buildSyncErrorBody(error, "Failed to push plan");
    console.error("[YNAB] push failed", body);
    return NextResponse.json(body, { status: 500 });
  }
}
