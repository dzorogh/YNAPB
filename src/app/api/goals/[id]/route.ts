import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  finalizeGoalMutationResponse,
  syncGoalWithYnab,
} from "@/lib/api/goals/ynab-goal-sync";
import { getCurrentUserId } from "@/lib/api/auth";
import { invalidPayloadResponse, unauthorizedResponse } from "@/lib/api/http";
import { decryptToken } from "@/lib/crypto";
import {
  GoalNotFoundError,
  deleteGoal,
  getGoalById,
  updateGoal,
} from "@/lib/repositories/goals-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import { hideManagedYnabCategoryForDeletedGoal } from "@/lib/ynab/hide-managed-goal-category";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return unauthorizedResponse();
    }

    const { id } = paramsSchema.parse(await context.params);
    const payload = patchGoalPayloadSchema.parse(await request.json());
    const goal = await updateGoal(userId, id, payload);
    const syncResult = await syncGoalWithYnab(userId, goal);
    const response = await finalizeGoalMutationResponse({
      userId,
      goal,
      syncResult,
      syncStateFailureMessage: "Goal saved, but sync state persistence failed.",
    });
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return invalidPayloadResponse(error);
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
      return unauthorizedResponse();
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
