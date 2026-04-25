import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { decryptToken } from "@/lib/crypto";
import {
  GoalNotFoundError,
  deleteGoal,
  setGoalSyncState,
  type GoalSyncStatus,
  updateGoal,
} from "@/lib/repositories/goals-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { pushImmediateMonthlyFundingGoal } from "@/lib/ynab/push-mf";

const patchGoalPayloadSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    targetAmount: z.number().finite().nonnegative().optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid YYYY-MM-DD date").optional(),
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
type GoalSyncResult = { status: "synced" | "error" | "skipped"; message?: string };

const syncGoalWithYnab = async (userId: string, goal: GoalRow): Promise<GoalSyncResult> => {
  if (goal.status !== "active" || !goal.ynab_category_id) {
    return { status: "skipped" };
  }

  const profile = await getProfile(userId);
  if (!profile?.ynab_budget_id || !profile.ynab_token_ct || !profile.ynab_token_iv) {
    return {
      status: "error",
      message: "YNAB connection is not configured.",
    };
  }

  try {
    const token = await decryptToken(profile.ynab_token_ct, profile.ynab_token_iv);
    await pushImmediateMonthlyFundingGoal({
      token,
      budgetId: profile.ynab_budget_id,
      categoryId: goal.ynab_category_id,
      targetAmount: goal.target_amount,
      deadline: goal.deadline,
    });
    return { status: "synced" };
  } catch {
    return {
      status: "error",
      message: "Failed to sync goal to YNAB.",
    };
  }
};

const applyGoalSyncState = async (
  userId: string,
  goal: GoalRow,
  syncResult: GoalSyncResult,
): Promise<GoalRow> => {
  if (syncResult.status === "skipped") {
    return goal;
  }

  const syncStatus: GoalSyncStatus = syncResult.status === "error" ? "error" : "synced";
  const syncedGoal = await setGoalSyncState(userId, goal.id, {
    status: syncStatus,
    error: syncResult.status === "error" ? syncResult.message ?? "Sync error." : null,
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
    const goalWithSyncState = await applyGoalSyncState(userId, goal, syncResult);

    return NextResponse.json({ goal: goalWithSyncState, sync: syncResult }, { status: 200 });
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

    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
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

    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 });
  }
}
