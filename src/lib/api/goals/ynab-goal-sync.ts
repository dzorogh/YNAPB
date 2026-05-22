import { decryptToken } from "@/lib/crypto";
import {
  setGoalSyncState,
  setGoalYnabCategoryId,
  type GoalSyncStatus,
} from "@/lib/repositories/goals-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import { ensureGoalCategoryLink } from "@/lib/ynab/goal-category-link";
import { pushImmediateMonthlyFundingGoal } from "@/lib/ynab/push-mf";
import { toUserFacingYnabError } from "@/lib/ynab/ynab-request";

type GoalRow = {
  id: string;
  status: "active" | "frozen" | "completed";
  ynab_category_id: string | null;
  target_amount: number;
  deadline: string;
};

export type GoalSyncResult = {
  status: "synced" | "error" | "skipped";
  message?: string;
  goal?: GoalRow;
};

export const syncGoalWithYnab = async (
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

export const applyGoalSyncState = async (
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
