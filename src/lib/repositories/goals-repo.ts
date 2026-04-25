import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type GoalRow = Tables<"goals">;

export class GoalNotFoundError extends Error {
  constructor(message = "Goal not found") {
    super(message);
    this.name = "GoalNotFoundError";
  }
}

const userIdSchema = z.uuid();
const goalIdSchema = z.uuid();
const deadlineSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid YYYY-MM-DD date");

const createGoalSchema = z.object({
  name: z.string().trim().min(1),
  targetAmount: z.number().finite().nonnegative(),
  deadline: deadlineSchema,
  status: z.enum(["active", "frozen", "completed"]).default("active"),
  notes: z.string().trim().max(5000).nullable().optional(),
  ynabCategoryId: z.string().trim().min(1).nullable().optional(),
});

const updateGoalSchema = createGoalSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  {
    message: "At least one field must be provided to update goal",
  },
);

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

const assertUserId = (userId: string): string => userIdSchema.parse(userId);
const assertGoalId = (goalId: string): string => goalIdSchema.parse(goalId);

export const listGoals = async (userId: string): Promise<GoalRow[]> => {
  const parsedUserId = assertUserId(userId);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", parsedUserId)
    .order("deadline", { ascending: true });

  if (error) {
    throw new Error(`Failed to list goals: ${error.message}`);
  }

  return data;
};

export const createGoal = async (
  userId: string,
  input: CreateGoalInput,
): Promise<GoalRow> => {
  const parsedUserId = assertUserId(userId);
  const parsedInput = createGoalSchema.parse(input);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: parsedUserId,
      name: parsedInput.name,
      target_amount: parsedInput.targetAmount,
      deadline: parsedInput.deadline,
      status: parsedInput.status,
      notes: parsedInput.notes ?? null,
      ynab_category_id: parsedInput.ynabCategoryId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create goal: ${error.message}`);
  }

  return data;
};

export const updateGoal = async (
  userId: string,
  goalId: string,
  input: UpdateGoalInput,
): Promise<GoalRow> => {
  const parsedUserId = assertUserId(userId);
  const parsedGoalId = assertGoalId(goalId);
  const parsedInput = updateGoalSchema.parse(input);
  const supabase = await getSupabaseServerClient();

  const updatePayload = {
    ...(parsedInput.name !== undefined ? { name: parsedInput.name } : {}),
    ...(parsedInput.targetAmount !== undefined
      ? { target_amount: parsedInput.targetAmount }
      : {}),
    ...(parsedInput.deadline !== undefined ? { deadline: parsedInput.deadline } : {}),
    ...(parsedInput.status !== undefined ? { status: parsedInput.status } : {}),
    ...(parsedInput.notes !== undefined ? { notes: parsedInput.notes } : {}),
    ...(parsedInput.ynabCategoryId !== undefined
      ? { ynab_category_id: parsedInput.ynabCategoryId }
      : {}),
  };

  const { data, error } = await supabase
    .from("goals")
    .update(updatePayload)
    .eq("id", parsedGoalId)
    .eq("user_id", parsedUserId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update goal: ${error.message}`);
  }

  if (!data) {
    throw new GoalNotFoundError();
  }

  return data;
};

export const deleteGoal = async (userId: string, goalId: string): Promise<void> => {
  const parsedUserId = assertUserId(userId);
  const parsedGoalId = assertGoalId(goalId);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("goals")
    .delete()
    .eq("id", parsedGoalId)
    .eq("user_id", parsedUserId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete goal: ${error.message}`);
  }

  if (!data) {
    throw new GoalNotFoundError();
  }
};
