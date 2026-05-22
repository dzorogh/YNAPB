import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUserId } from "@/lib/api/auth";
import { unauthorizedResponse } from "@/lib/api/http";
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
    await Promise.all(
      payload.deadlines.map((item) =>
        updateGoal(userId, item.goalId, { deadline: item.deadline }),
      ),
    );

    return NextResponse.json({ ok: true, updated: payload.deadlines.length });
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
