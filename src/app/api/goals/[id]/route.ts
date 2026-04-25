import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  GoalNotFoundError,
  deleteGoal,
  updateGoal,
} from "@/lib/repositories/goals-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

    return NextResponse.json({ goal }, { status: 200 });
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
