import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type IncomeSettingsRow = Tables<"income_settings">;

const userIdSchema = z.uuid();

const incomeSettingsSchema = z.object({
  plannedIncome: z.number().finite().nonnegative().nullable(),
  baselineMonths: z.number().int().min(1).max(36),
});

export type UpsertIncomeSettingsInput = z.infer<typeof incomeSettingsSchema>;

const assertUserId = (userId: string): string => userIdSchema.parse(userId);

export const getIncomeSettings = async (
  userId: string,
): Promise<IncomeSettingsRow | null> => {
  const parsedUserId = assertUserId(userId);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("income_settings")
    .select("*")
    .eq("user_id", parsedUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load income settings: ${error.message}`);
  }

  return data;
};

export const upsertIncomeSettings = async (
  userId: string,
  input: UpsertIncomeSettingsInput,
): Promise<IncomeSettingsRow> => {
  const parsedUserId = assertUserId(userId);
  const parsedInput = incomeSettingsSchema.parse(input);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("income_settings")
    .upsert(
      {
        user_id: parsedUserId,
        planned_income: parsedInput.plannedIncome,
        baseline_months: parsedInput.baselineMonths,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to upsert income settings: ${error.message}`);
  }

  return data;
};
