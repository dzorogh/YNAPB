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
import { monthKeyFromDate } from "@/lib/dates/month";
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
import {
  type CachedCategoryPatch,
  type CachedYnabCategory,
  getCache,
  isCacheStale,
  patchCachedCategories,
} from "@/lib/repositories/ynab-cache-repo";
import {
  type AssignedMove,
  rebalanceAssignedToTargets,
} from "@/lib/ynab/assigned-rebalance";
import { ensureGoalCategoryLink } from "@/lib/ynab/goal-category-link";
import {
  activeGoalCategoryIds,
  shiftWithdrawalsToPriorMonth,
  type WithdrawalShift,
} from "@/lib/ynab/withdrawal-shift";
import { computeMonthTargets, type PlanInputs } from "@/lib/plan/month-targets";
import { buildSyncErrorBody } from "@/lib/ynab/sync-error-response";
import { YnabRequestError } from "@/lib/ynab/ynab-request";
import {
  finishYnabOperation,
  startYnabOperation,
} from "@/lib/ynab/ynab-request-log";
import {
  buildPushDiff,
  pushAssignedMoves,
  pushMonthlyFundingGoals,
  sortMonthlyFundingDiff,
  type MonthlyFundingDiffItem,
} from "@/lib/ynab/push-mf";
import { allocateReadyToAssign } from "@/lib/ynab/ready-to-assign";

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

type ReadyToAssignSummary = {
  available: number;
  remaining: number;
};

const buildDiffHash = (params: {
  month: string;
  diff: MonthlyFundingDiffItem[];
  withdrawalShifts: WithdrawalShift[];
  assignedMoves: AssignedMove[];
  readyToAssignMoves: AssignedMove[];
  readyToAssign: ReadyToAssignSummary;
}): string =>
  hashValue({
    month: params.month,
    diff: sortMonthlyFundingDiff(params.diff),
    withdrawalShifts: params.withdrawalShifts,
    assignedMoves: sortMonthlyFundingDiff(params.assignedMoves),
    readyToAssignMoves: sortMonthlyFundingDiff(params.readyToAssignMoves),
    readyToAssign: params.readyToAssign,
  });

const toMilliunits = (amount: number): number => Math.round(amount * 1000);

const MAX_REBALANCE_PASSES = 5;

type MonthTargets = NonNullable<ReturnType<typeof computeMonthTargets>>;

const resolveMonthlyTarget = (
  category: Pick<
    CachedYnabCategory,
    "assigned" | "goal_target" | "goal_target_month"
  >,
  planned: number,
): number => {
  const currentTarget = category.goal_target ?? 0;
  return category.goal_target_month === null &&
    (category.assigned ?? 0) > 0 &&
    currentTarget >= (category.assigned ?? 0)
    ? Math.max(planned, currentTarget)
    : planned;
};

/** Goal categories in planner priority order (earliest deadline first). */
const toRebalanceGoals = (
  monthTargets: MonthTargets,
  useFullGoalDeficit = false,
) => {
  const categoriesById = new Map(
    monthTargets.computation.categories.map((category) => [
      category.id,
      category,
    ]),
  );

  return [...monthTargets.computation.plannerGoals]
    .sort(
      (left, right) =>
        left.deadline.getTime() - right.deadline.getTime() ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    )
    .flatMap((goal) => {
      if (
        useFullGoalDeficit &&
        monthTargets.computation.planResult.autoFrozenGoalIds.includes(goal.id)
      ) {
        return [];
      }
      const category = goal.ynabCategoryId
        ? categoriesById.get(goal.ynabCategoryId)
        : undefined;
      if (!category) {
        return [];
      }

      const assigned = toMilliunits(category.assigned ?? 0);
      const balance = toMilliunits(category.balance ?? 0);
      // Spending on the goal is progress, so the deficit uses saved progress
      // (balance plus goal spending), not the remaining balance.
      const savedProgress = toMilliunits(goal.savedProgress);
      const monthlyTarget = resolveMonthlyTarget(
        category,
        monthTargets.targets[goal.id] ?? 0,
      );
      return [
        {
          categoryId: category.id,
          assigned,
          balance,
          planned: toMilliunits(monthlyTarget),
          target: useFullGoalDeficit
            ? assigned + toMilliunits(goal.targetAmount) - savedProgress
            : toMilliunits(monthlyTarget),
        },
      ];
    });
};

const withAssigned = (
  categories: CachedYnabCategory[],
  nextAssigned: Map<string, number>,
): CachedYnabCategory[] =>
  categories.map((category) => {
    const next = nextAssigned.get(category.id);
    const current = category.assigned ?? 0;
    if (next === undefined || toMilliunits(current) === next) {
      return category;
    }

    const delta = next / 1000 - current;
    return {
      ...category,
      assigned: next / 1000,
      balance: (category.balance ?? 0) + delta,
    };
  });

/**
 * In the current month, moves money assigned above plan in one goal into
 * goals still short of their target, then recomputes the plan until stable.
 */
const rebalanceCurrentMonth = (
  inputs: PlanInputs,
  categories: CachedYnabCategory[],
  month: string,
) => {
  let current = categories;
  for (let pass = 0; pass < MAX_REBALANCE_PASSES; pass++) {
    const monthTargets = computeMonthTargets(inputs, current, month);
    if (!monthTargets) {
      return current;
    }

    const goals = toRebalanceGoals(monthTargets);
    const nextAssigned = rebalanceAssignedToTargets(goals);
    const changed = goals.some(
      (goal) => nextAssigned.get(goal.categoryId) !== goal.assigned,
    );
    if (!changed) {
      return current;
    }

    current = withAssigned(current, nextAssigned);
  }

  return current;
};

const buildAssignedMoves = (
  before: CachedYnabCategory[],
  after: CachedYnabCategory[],
): AssignedMove[] => {
  const beforeById = new Map(before.map((category) => [category.id, category]));

  return sortMonthlyFundingDiff(
    after.flatMap((category) => {
      const previous = beforeById.get(category.id);
      const current = toMilliunits(previous?.assigned ?? 0);
      const next = toMilliunits(category.assigned ?? 0);
      if (!previous || current === next) {
        return [];
      }

      return [
        { categoryId: category.id, categoryName: category.name, current, next },
      ];
    }),
  );
};

const combineAssignedMoves = (
  assignedMoves: AssignedMove[],
  readyToAssignMoves: AssignedMove[],
): AssignedMove[] => {
  const combined = new Map(
    assignedMoves.map((move) => [move.categoryId, { ...move }]),
  );
  for (const move of readyToAssignMoves) {
    const existing = combined.get(move.categoryId);
    combined.set(move.categoryId, {
      ...move,
      current: existing?.current ?? move.current,
    });
  }
  return sortMonthlyFundingDiff(
    [...combined.values()].filter((move) => move.current !== move.next),
  );
};

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

  const inputs: PlanInputs = { goals, cache, incomeSettings };
  const syncedCategories = buildPlanComputation(inputs).categories;
  const isCurrentMonth = month === monthKeyFromDate(new Date());
  const { categories: normalizedCategories, shifts: withdrawalShifts } =
    isCurrentMonth
      ? shiftWithdrawalsToPriorMonth(
          syncedCategories,
          activeGoalCategoryIds(goals),
          month,
        )
      : { categories: syncedCategories, shifts: [] };
  const rebalancedCategories = isCurrentMonth
    ? rebalanceCurrentMonth(inputs, normalizedCategories, month)
    : normalizedCategories;
  const monthTargets = computeMonthTargets(inputs, rebalancedCategories, month);
  if (!monthTargets) {
    return {
      errorResponse: NextResponse.json(
        { error: "Requested month is outside the planning horizon" },
        { status: 400 },
      ),
    } as const;
  }

  const { computation } = monthTargets;
  const categoriesById = new Map(
    computation.categories.map((category) => [category.id, category]),
  );
  const monthlyFundingTargets = Object.fromEntries(
    computation.plannerGoals.map((goal) => {
      const category = categoriesById.get(goal.ynabCategoryId ?? "");
      return [
        goal.id,
        Math.max(
          resolveMonthlyTarget(
            category ?? {
              assigned: null,
              goal_target: null,
              goal_target_month: null,
            },
            monthTargets.targets[goal.id] ?? 0,
          ),
          category?.assigned ?? 0,
        ),
      ];
    }),
  );
  const withdrawalMoves = buildAssignedMoves(
    syncedCategories,
    normalizedCategories,
  );
  const assignedMoves = buildAssignedMoves(
    normalizedCategories,
    rebalancedCategories,
  );
  const availableReadyToAssign = isCurrentMonth
    ? Math.max(0, Math.trunc(cache.ready_to_assign ?? 0))
    : 0;
  const categories = isCurrentMonth
    ? withAssigned(
        rebalancedCategories,
        allocateReadyToAssign(
          toRebalanceGoals(monthTargets, true),
          availableReadyToAssign,
        ),
      )
    : rebalancedCategories;
  const readyToAssignMoves = buildAssignedMoves(
    rebalancedCategories,
    categories,
  );
  const allocatedReadyToAssign = readyToAssignMoves.reduce(
    (total, move) => total + move.next - move.current,
    0,
  );
  const readyToAssign = {
    available: availableReadyToAssign,
    remaining: availableReadyToAssign - allocatedReadyToAssign,
  };
  const appliedMoves = combineAssignedMoves(
    combineAssignedMoves(withdrawalMoves, assignedMoves),
    readyToAssignMoves,
  );
  const goalIdsByCategoryId = new Map(
    computation.plannerGoals.map((goal) => [goal.ynabCategoryId, goal.id]),
  );
  const pushFundingTargets = { ...monthlyFundingTargets };
  for (const move of readyToAssignMoves) {
    const goalId = goalIdsByCategoryId.get(move.categoryId);
    if (goalId) {
      pushFundingTargets[goalId] = Math.max(
        pushFundingTargets[goalId] ?? 0,
        move.next / 1000,
      );
    }
  }

  const diff = buildPushDiff({
    goals: goals.map((goal) => ({
      id: goal.id,
      status: goal.status,
      ynabCategoryId: goal.ynab_category_id,
    })),
    allocationForMonth: pushFundingTargets,
    categories: computation.categories.map((category) => ({
      id: category.id,
      name: category.name,
      goalTarget: category.goal_target,
      goalTargetMonth: category.goal_target_month,
      goalNeedsWholeAmount: category.goal_needs_whole_amount,
    })),
  });

  return {
    goals,
    budget: computation.budget,
    planResult: computation.planResult,
    categories,
    diff,
    assignedMoves,
    readyToAssignMoves,
    readyToAssign,
    withdrawalShifts,
    appliedMoves,
    diffHash: buildDiffHash({
      month,
      diff,
      withdrawalShifts,
      assignedMoves,
      readyToAssignMoves,
      readyToAssign,
    }),
  } as const;
};

const buildCachePatches = (
  assignedMoves: AssignedMove[],
  diff: MonthlyFundingDiffItem[],
  categories: CachedYnabCategory[],
): Map<string, CachedCategoryPatch> => {
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const patches = new Map<string, CachedCategoryPatch>();
  for (const move of assignedMoves) {
    const category = categoriesById.get(move.categoryId);
    patches.set(move.categoryId, {
      assigned: move.next / 1000,
      balance: category?.balance ?? null,
    });
  }
  for (const item of diff) {
    patches.set(item.categoryId, {
      ...patches.get(item.categoryId),
      goal_target: item.next / 1000,
      goal_target_month: null,
      goal_needs_whole_amount: true,
    });
  }
  return patches;
};

/** Writes prior-month assigned first; lowering it raises this month's RTA. */
const pushWithdrawalShifts = async (params: {
  userId: string;
  token: string;
  budgetId: string;
  shifts: WithdrawalShift[];
  /** Categories after the shift, carrying the adjusted prior-month fields. */
  categories: CachedYnabCategory[];
}) => {
  const categoriesById = new Map(
    params.categories.map((category) => [category.id, category]),
  );
  for (const shift of params.shifts) {
    await pushAssignedMoves({
      token: params.token,
      budgetId: params.budgetId,
      month: shift.priorMonth,
      moves: [shift],
      onMoveApplied: async () => {
        await patchCachedCategories(
          params.userId,
          new Map([
            [
              shift.categoryId,
              {
                prior_month_assigned: shift.next / 1000,
                prior_month_available:
                  categoriesById.get(shift.categoryId)?.prior_month_available ??
                  null,
              },
            ],
          ]),
          { readyToAssignDelta: shift.current - shift.next },
        );
      },
    });
  }
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
    await pushWithdrawalShifts({
      userId,
      token,
      budgetId: profile.ynab_budget_id,
      shifts: effectiveCanonical.withdrawalShifts,
      categories: effectiveCanonical.categories,
    });
    const assignedPatches = buildCachePatches(
      effectiveCanonical.appliedMoves,
      [],
      effectiveCanonical.categories,
    );
    if (effectiveCanonical.appliedMoves.length > 0) {
      await pushAssignedMoves({
        token,
        budgetId: profile.ynab_budget_id,
        month,
        moves: effectiveCanonical.appliedMoves,
        onMoveApplied: async (move) => {
          await patchCachedCategories(
            userId,
            new Map([[move.categoryId, assignedPatches.get(move.categoryId)!]]),
            { readyToAssignDelta: move.current - move.next },
          );
        },
      });
    }
    if (effectiveCanonical.diff.length > 0) {
      await pushMonthlyFundingGoals({
        token,
        budgetId: profile.ynab_budget_id,
        updates: effectiveCanonical.diff,
      });
      await patchCachedCategories(
        userId,
        buildCachePatches(
          [],
          effectiveCanonical.diff,
          effectiveCanonical.categories,
        ),
      );
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
      applied:
        effectiveCanonical.diff.length +
        effectiveCanonical.withdrawalShifts.length +
        effectiveCanonical.appliedMoves.length,
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
        withdrawalShifts: canonical.withdrawalShifts,
        assignedMoves: canonical.assignedMoves,
        readyToAssignMoves: canonical.readyToAssignMoves,
        readyToAssign: canonical.readyToAssign,
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
