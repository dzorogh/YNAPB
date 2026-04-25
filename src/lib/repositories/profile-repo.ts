import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type ProfileRow = Tables<"profiles">;

const userIdSchema = z.uuid();

const ynabConnectionSchema = z
  .object({
    ynabBudgetId: z.string().trim().min(1).nullable(),
    ynabTokenCt: z.string().trim().min(1).nullable(),
    ynabTokenIv: z.string().trim().min(1).nullable(),
    ynabCurrencyCode: z.string().trim().length(3).nullable().optional(),
  })
  .refine(
    (value) =>
      (value.ynabTokenCt === null && value.ynabTokenIv === null) ||
      (value.ynabTokenCt !== null && value.ynabTokenIv !== null),
    {
      message: "ynabTokenCt and ynabTokenIv must be provided together",
      path: ["ynabTokenCt"],
    },
  );

export type UpdateYnabConnectionInput = z.infer<typeof ynabConnectionSchema>;

const assertUserId = (userId: string): string => userIdSchema.parse(userId);

export const getProfile = async (
  userId: string,
): Promise<ProfileRow | null> => {
  const parsedUserId = assertUserId(userId);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", parsedUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  return data;
};

export const updateYnabConnection = async (
  userId: string,
  input: UpdateYnabConnectionInput,
): Promise<ProfileRow> => {
  const parsedUserId = assertUserId(userId);
  const parsedInput = ynabConnectionSchema.parse(input);
  const supabase = await getSupabaseServerClient();

  const updatePayload: {
    ynab_budget_id: string | null;
    ynab_token_ct: string | null;
    ynab_token_iv: string | null;
    ynab_currency_code?: string | null;
  } = {
    ynab_budget_id: parsedInput.ynabBudgetId,
    ynab_token_ct: parsedInput.ynabTokenCt,
    ynab_token_iv: parsedInput.ynabTokenIv,
  };
  if (parsedInput.ynabCurrencyCode !== undefined) {
    updatePayload.ynab_currency_code = parsedInput.ynabCurrencyCode;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", parsedUserId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update YNAB connection: ${error.message}`);
  }

  return data;
};
