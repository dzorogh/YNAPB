import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { createGoal, listGoals } from "@/lib/repositories/goals-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const goals = await listGoals(userId);
    return NextResponse.json({ goals }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to list goals" }, { status: 500 });
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

    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}
