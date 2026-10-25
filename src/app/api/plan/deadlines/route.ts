import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUserId } from "@/lib/api/auth";
import { unauthorizedResponse } from "@/lib/api/http";
import {
  finalizeGoalMutationResponse,
  syncGoalsWithYnab,
} from "@/lib/api/goals/ynab-goal-sync";
import { updateGoal } from "@/lib/repositories/goals-repo";

const payloadSchema = z.object({
  deadlines: z
    .array(
      z.object({
        goalId: z.uuid(),
        deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const payload = payloadSchema.parse(await request.json());
    const goals = await Promise.all(
      payload.deadlines.map((item) =>
        updateGoal(userId, item.goalId, { deadline: item.deadline }),
      ),
    );
    const sync = await syncGoalsWithYnab(userId, goals);
    const results = await Promise.all(
      goals.map((goal, index) =>
        finalizeGoalMutationResponse({
          userId,
          goal,
          syncResult: {
            status: sync.status,
            message: sync.message,
            goal: sync.goals[index],
          },
          syncStateFailureMessage:
            "Deadline saved, but sync state persistence failed.",
        }),
      ),
    );
    const syncError = results.find((result) => result.sync.status === "error");

    return NextResponse.json({
      ok: true,
      updated: payload.deadlines.length,
      sync: {
        status: syncError?.sync.status ?? sync.status,
        message: syncError?.sync.message ?? sync.message,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to persist deadlines" },
      { status: 500 },
    );
  }
}
