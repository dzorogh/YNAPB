import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { decryptToken } from "@/lib/crypto";
import {
  GoalNotFoundError,
  deleteGoal,
  getGoalById,
  setGoalYnabCategoryId,
  setGoalSyncState,
  type GoalSyncStatus,
  updateGoal,
} from "@/lib/repositories/goals-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ensureGoalCategoryLink } from "@/lib/ynab/goal-category-link";
import { hideManagedYnabCategoryForDeletedGoal } from "@/lib/ynab/hide-managed-goal-category";
import { pushImmediateMonthlyFundingGoal } from "@/lib/ynab/push-mf";
import { toUserFacingYnabError } from "@/lib/ynab/ynab-request";

const patchGoalPayloadSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    targetAmount: z.number().finite().nonnegative().optional(),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid YYYY-MM-DD date")
      .optional(),
    status: z.enum(["active", "frozen", "completed"]).optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    ynabCategoryId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided to update goal",
  });

const paramsSchema = z.object({
  id: z.uuid(),
});

const getCurrentUserId = async (): Promise<string | null> => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
};

type GoalRow = Awaited<ReturnType<typeof updateGoal>>;
type GoalSyncResult = {
  status: "synced" | "error" | "skipped";
  message?: string;
  goal?: GoalRow;
};

const syncGoalWithYnab = async (
  userId: string,
  goal: GoalRow,
): Promise<GoalSyncResult> => {
  if (goal.status !== "active") {
    return { status: "skipped" };
  }

  const profile = await getProfile(userId);
  if (
    !profile?.ynab_budget_id ||
    !profile.ynab_token_ct ||
    !profile.ynab_token_iv
  ) {
    return {
      status: "error",
      message: "YNAB connection is not configured.",
    };
  }

  try {
    const token = await decryptToken(
      profile.ynab_token_ct,
      profile.ynab_token_iv,
    );
    const ynabCategoryId = await ensureGoalCategoryLink({
      token,
      budgetId: profile.ynab_budget_id,
      goal,
    });
    const linkedGoal =
      ynabCategoryId === goal.ynab_category_id
        ? goal
        : await setGoalYnabCategoryId(userId, goal.id, ynabCategoryId);
    await pushImmediateMonthlyFundingGoal({
      token,
      budgetId: profile.ynab_budget_id,
      categoryId: ynabCategoryId,
      targetAmount: linkedGoal.target_amount,
      deadline: linkedGoal.deadline,
    });
    return { status: "synced", goal: linkedGoal };
  } catch (error) {
    return {
      status: "error",
      message: toUserFacingYnabError(error, "Failed to sync goal to YNAB."),
    };
  }
};

const applyGoalSyncState = async (
  userId: string,
  goal: GoalRow,
  syncResult: GoalSyncResult,
): Promise<GoalRow> => {
  if (syncResult.status === "skipped") {
    return syncResult.goal ?? goal;
  }

  const sourceGoal = syncResult.goal ?? goal;
  const syncStatus: GoalSyncStatus =
    syncResult.status === "error" ? "error" : "synced";
  const syncedGoal = await setGoalSyncState(userId, sourceGoal.id, {
    status: syncStatus,
    error:
      syncResult.status === "error"
        ? (syncResult.message ?? "Sync error.")
        : null,
  });

  return syncedGoal;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = paramsSchema.parse(await context.params);
    const payload = patchGoalPayloadSchema.parse(await request.json());
    const goal = await updateGoal(userId, id, payload);
    const syncResult = await syncGoalWithYnab(userId, goal);
    try {
      const goalWithSyncState = await applyGoalSyncState(
        userId,
        goal,
        syncResult,
      );
      return NextResponse.json(
        { goal: goalWithSyncState, sync: syncResult },
        { status: 200 },
      );
    } catch (syncStateError) {
      console.error("Failed to persist goal sync state", syncStateError);
      return NextResponse.json(
        {
          goal: syncResult.goal ?? goal,
          sync: {
            status: "error" as const,
            message: "Goal saved, but sync state persistence failed.",
          },
        },
        { status: 200 },
      );
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.flatten() },
        { status: 400 },
      );
    }

    if (error instanceof GoalNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update goal" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = paramsSchema.parse(await context.params);
    const goal = await getGoalById(userId, id);
    if (!goal) {
      throw new GoalNotFoundError();
    }

    const profile = await getProfile(userId);
    if (
      profile?.ynab_budget_id &&
      profile.ynab_token_ct &&
      profile.ynab_token_iv
    ) {
      try {
        const token = await decryptToken(
          profile.ynab_token_ct,
          profile.ynab_token_iv,
        );
        await hideManagedYnabCategoryForDeletedGoal({
          token,
          budgetId: profile.ynab_budget_id,
          goal,
        });
      } catch (error) {
        console.error("YNAB category cleanup after goal delete failed", error);
      }
    }

    await deleteGoal(userId, id);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid goal id", issues: error.flatten() },
        { status: 400 },
      );
    }

    if (error instanceof GoalNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to delete goal" },
      { status: 500 },
    );
  }
}
