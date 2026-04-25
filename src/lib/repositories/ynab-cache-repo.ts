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
export type CachedYnabCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_target: number | null;
  goal_under_funded: number | null;
  balance: number | null;
};
export type CachedIncomeHistoryItem = {
  month: string;
  income: number;
};

const cachedYnabCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  goal_type: z.string().nullable().optional(),
  goal_target: z.number().finite().nullable().optional(),
  goal_under_funded: z.number().finite().nullable().optional(),
  balance: z.number().finite().nullable().optional(),
});
const cachedIncomeHistoryItemSchema = z.object({
  month: z.string().min(1),
  income: z.number().finite(),
});

export const CACHE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const assertUserId = (userId: string): string => userIdSchema.parse(userId);

export const isCacheStale = (
  cache: Pick<YnabCacheRow, "synced_at"> | null,
  now = Date.now(),
): boolean => {
  if (!cache) {
    return true;
  }

  const syncedAtMs = Date.parse(cache.synced_at);
  if (Number.isNaN(syncedAtMs)) {
    return true;
  }

  return now - syncedAtMs > CACHE_STALE_AFTER_MS;
};

export const parseCachedCategories = (value: Json): CachedYnabCategory[] => {
  const parsed = z.array(cachedYnabCategorySchema).safeParse(value);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.map((category) => ({
    id: category.id,
    name: category.name,
    goal_type: category.goal_type ?? null,
    goal_target: category.goal_target ?? null,
    goal_under_funded: category.goal_under_funded ?? null,
    balance: category.balance ?? null,
  }));
};

export const parseCachedIncomeHistory = (value: Json): CachedIncomeHistoryItem[] => {
  const parsed = z.array(cachedIncomeHistoryItemSchema).safeParse(value);
  if (!parsed.success) {
    return [];
  }

  return parsed.data;
};

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
