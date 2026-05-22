import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  applyGoalSyncState,
  syncGoalWithYnab,
} from "@/lib/api/goals/ynab-goal-sync";
import { getCurrentUserId } from "@/lib/api/auth";
import { invalidPayloadResponse, unauthorizedResponse } from "@/lib/api/http";
import { createGoal, listGoals } from "@/lib/repositories/goals-repo";

const createGoalPayloadSchema = z.object({
  name: z.string().trim().min(1),
  targetAmount: z.number().finite().nonnegative(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid YYYY-MM-DD date"),
  status: z.enum(["active", "frozen", "completed"]).default("active"),
  notes: z.string().trim().max(5000).nullable().optional(),
  ynabCategoryId: z.string().trim().min(1).nullable().optional(),
});

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return unauthorizedResponse();
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
      return unauthorizedResponse();
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
      return invalidPayloadResponse(error);
    }

    return NextResponse.json(
      { error: "Failed to create goal" },
      { status: 500 },
    );
  }
}
