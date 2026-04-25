import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/supabase";

type YnabCacheRow = Tables<"ynab_cache">;

const userIdSchema = z.uuid();

const cachePayloadSchema = z.object({
  categories: z.custom<Json>(),
  incomeHistory: z.custom<Json>(),
  syncedAt: z.string().datetime().optional(),
});

export type UpsertYnabCacheInput = z.infer<typeof cachePayloadSchema>;

const assertUserId = (userId: string): string => userIdSchema.parse(userId);

export const getCache = async (userId: string): Promise<YnabCacheRow | null> => {
  const parsedUserId = assertUserId(userId);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("ynab_cache")
    .select("*")
    .eq("user_id", parsedUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load YNAB cache: ${error.message}`);
  }

  return data;
};

export const upsertCache = async (
  userId: string,
  input: UpsertYnabCacheInput,
): Promise<YnabCacheRow> => {
  const parsedUserId = assertUserId(userId);
  const parsedInput = cachePayloadSchema.parse(input);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("ynab_cache")
    .upsert(
      {
        user_id: parsedUserId,
        categories: parsedInput.categories,
        income_history: parsedInput.incomeHistory,
        synced_at: parsedInput.syncedAt ?? new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to upsert YNAB cache: ${error.message}`);
  }

  return data;
};
