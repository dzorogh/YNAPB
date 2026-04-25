import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { decryptToken } from "@/lib/crypto";
import {
  createGoal,
  listGoals,
  setGoalYnabCategoryId,
  setGoalSyncState,
  type GoalSyncStatus,
} from "@/lib/repositories/goals-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ensureGoalCategoryLink } from "@/lib/ynab/goal-category-link";
import { pushImmediateMonthlyFundingGoal } from "@/lib/ynab/push-mf";

const createGoalPayloadSchema = z.object({
  name: z.string().trim().min(1),
  targetAmount: z.number().finite().nonnegative(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid YYYY-MM-DD date"),
  status: z.enum(["active", "frozen", "completed"]).default("active"),
  notes: z.string().trim().max(5000).nullable().optional(),
  ynabCategoryId: z.string().trim().min(1).nullable().optional(),
});

const getCurrentUserId = async (): Promise<string | null> => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
};

type GoalRow = Awaited<ReturnType<typeof createGoal>>;
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
    const message =
      error instanceof Error ? error.message : "Failed to sync goal to YNAB.";
    return {
      status: "error",
      message,
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

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const goals = await listGoals(userId);
    return NextResponse.json({ goals }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to list goals" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = createGoalPayloadSchema.parse(await request.json());
    const goal = await createGoal(userId, payload);
    const syncResult = await syncGoalWithYnab(userId, goal);
    try {
      const goalWithSyncState = await applyGoalSyncState(
        userId,
        goal,
        syncResult,
      );
      return NextResponse.json(
        { goal: goalWithSyncState, sync: syncResult },
        { status: 201 },
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
        { status: 201 },
      );
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create goal" },
      { status: 500 },
    );
  }
}
