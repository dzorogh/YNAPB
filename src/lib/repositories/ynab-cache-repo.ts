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
  goal_cadence: number | null;
  goal_target: number | null;
  goal_target_month: string | null;
  goal_under_funded: number | null;
  balance: number | null;
  activity: number | null;
  assigned: number | null;
  prior_month_available: number | null;
  cash_spent_total: number;
  hidden: boolean;
  deleted: boolean;
  assigned_history: number[];
};
export type CachedIncomeHistoryItem = {
  month: string;
  income: number;
};

const cachedYnabCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  goal_type: z.string().nullable().optional(),
  goal_cadence: z.number().int().nullable().optional(),
  goal_target: z.number().finite().nullable().optional(),
  goal_target_month: z.string().nullable().optional(),
  goal_under_funded: z.number().finite().nullable().optional(),
  balance: z.number().finite().nullable().optional(),
  activity: z.number().finite().nullable().optional(),
  assigned: z.number().finite().nullable().optional(),
  prior_month_available: z.number().finite().nullable().optional(),
  cash_spent_total: z.number().finite().nonnegative().optional(),
  hidden: z.boolean().optional(),
  deleted: z.boolean().optional(),
  assigned_history: z.array(z.number().finite()).optional(),
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
    goal_cadence: category.goal_cadence ?? null,
    goal_target: category.goal_target ?? null,
    goal_target_month: category.goal_target_month ?? null,
    goal_under_funded: category.goal_under_funded ?? null,
    balance: category.balance ?? null,
    activity: category.activity ?? null,
    assigned: category.assigned ?? category.assigned_history?.[0] ?? null,
    prior_month_available: category.prior_month_available ?? null,
    cash_spent_total: category.cash_spent_total ?? 0,
    hidden: category.hidden ?? false,
    deleted: category.deleted ?? false,
    assigned_history: category.assigned_history ?? [],
  }));
};

export const parseCachedIncomeHistory = (
  value: Json,
): CachedIncomeHistoryItem[] => {
  const parsed = z.array(cachedIncomeHistoryItemSchema).safeParse(value);
  if (!parsed.success) {
    return [];
  }

  return parsed.data;
};

export const getCache = async (
  userId: string,
): Promise<YnabCacheRow | null> => {
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
