import { decryptToken } from "@/lib/crypto";
import {
  setGoalSyncState,
  setGoalYnabCategoryId,
  type GoalSyncStatus,
} from "@/lib/repositories/goals-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import { ensureGoalCategoryLink } from "@/lib/ynab/goal-category-link";
import { syncPlanTargets } from "@/lib/api/goals/sync-plan-targets";
import { toUserFacingYnabError } from "@/lib/ynab/ynab-request";
import type { Tables } from "@/types/supabase";

type GoalRow = Tables<"goals">;

export type GoalSyncResult = {
  status: "synced" | "error" | "skipped";
  message?: string;
  goal?: GoalRow;
};

export const syncGoalWithYnab = async (
  userId: string,
  goal: GoalRow,
): Promise<GoalSyncResult> => {
  const result = await syncGoalsWithYnab(userId, [goal]);
  return {
    status: result.status,
    message: result.message,
    goal: result.goals[0],
  };
};

/** Batch deadline edits also refresh the plan only once, after all links exist. */
export const syncGoalsWithYnab = async (
  userId: string,
  goals: GoalRow[],
): Promise<GoalSyncResult & { goals: GoalRow[] }> => {
  const linkedGoals = [...goals];

  try {
    const profile = await getProfile(userId);
    if (
      !profile?.ynab_budget_id ||
      !profile.ynab_token_ct ||
      !profile.ynab_token_iv
    ) {
      return {
        status: "error",
        message: "YNAB connection is not configured.",
        goals: linkedGoals,
      };
    }
    const token = await decryptToken(
      profile.ynab_token_ct,
      profile.ynab_token_iv,
    );
    for (const [index, goal] of goals.entries()) {
      if (goal.status !== "active") continue;
      const ynabCategoryId = await ensureGoalCategoryLink({
        token,
        budgetId: profile.ynab_budget_id,
        goal,
      });
      if (ynabCategoryId !== goal.ynab_category_id) {
        linkedGoals[index] = await setGoalYnabCategoryId(
          userId,
          goal.id,
          ynabCategoryId,
        );
      }
    }
    await syncPlanTargets(userId, {
      token,
      budgetId: profile.ynab_budget_id,
    });
    return { status: "synced", goals: linkedGoals };
  } catch (error) {
    return {
      status: "error",
      message: toUserFacingYnabError(
        error,
        "Failed to update monthly targets in YNAB.",
      ),
      goals: linkedGoals,
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

export const finalizeGoalMutationResponse = async (params: {
  userId: string;
  goal: GoalRow;
  syncResult: GoalSyncResult;
  syncStateFailureMessage: string;
}): Promise<{
  goal: GoalRow;
  sync: GoalSyncResult;
}> => {
  const { userId, goal, syncResult, syncStateFailureMessage } = params;

  try {
    const goalWithSyncState = await applyGoalSyncState(
      userId,
      goal,
      syncResult,
    );
    return { goal: goalWithSyncState, sync: syncResult };
  } catch (syncStateError) {
    console.error("Failed to persist goal sync state", syncStateError);
    return {
      goal: syncResult.goal ?? goal,
      sync: {
        status: "error",
        message: syncStateFailureMessage,
      },
    };
  }
};
