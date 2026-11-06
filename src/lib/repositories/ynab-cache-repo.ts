import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/supabase";

type YnabCacheRow = Tables<"ynab_cache">;

const userIdSchema = z.uuid();

const cachePayloadSchema = z.object({
  categories: z.custom<Json>(),
  incomeHistory: z.custom<Json>(),
  readyToAssign: z.number().int().nonnegative(),
  syncedAt: z.string().datetime().optional(),
});

export type UpsertYnabCacheInput = z.infer<typeof cachePayloadSchema>;
export type CachedYnabCategory = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_cadence: number | null;
  goal_cadence_frequency: number | null;
  goal_target: number | null;
  goal_target_month: string | null;
  goal_under_funded: number | null;
  goal_needs_whole_amount: boolean | null;
  balance: number | null;
  activity: number | null;
  assigned: number | null;
  prior_month_available: number | null;
  prior_month_assigned: number | null;
  /** Net goal spending from goal creation to the end of the prior month. */
  spent_before_month: number;
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
  goal_type: z.string().nullable().default(null),
  goal_cadence: z.number().int().nullable().default(null),
  goal_cadence_frequency: z.number().int().nullable().default(null),
  goal_target: z.number().finite().nullable().default(null),
  goal_target_month: z.string().nullable().default(null),
  goal_under_funded: z.number().finite().nullable().default(null),
  goal_needs_whole_amount: z.boolean().nullable().default(null),
  balance: z.number().finite().nullable().default(null),
  activity: z.number().finite().nullable().default(null),
  assigned: z.number().finite().nullable().default(null),
  prior_month_available: z.number().finite().nullable().default(null),
  prior_month_assigned: z.number().finite().nullable().default(null),
  spent_before_month: z.number().finite().nonnegative().default(0),
  hidden: z.boolean().default(false),
  deleted: z.boolean().default(false),
  assigned_history: z.array(z.number().finite()).default([]),
});
const cachedIncomeHistoryItemSchema = z.object({
  month: z.string().min(1),
  income: z.number().finite(),
});

const CACHE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

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

  const syncedAt = new Date(syncedAtMs);
  const current = new Date(now);
  const isPreviousCalendarMonth =
    syncedAt.getUTCFullYear() !== current.getUTCFullYear() ||
    syncedAt.getUTCMonth() !== current.getUTCMonth();

  return isPreviousCalendarMonth || now - syncedAtMs > CACHE_STALE_AFTER_MS;
};

export const parseCachedCategories = (value: Json): CachedYnabCategory[] => {
  const parsed = z.array(cachedYnabCategorySchema).safeParse(value);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.map((category) => ({
    ...category,
    assigned: category.assigned ?? category.assigned_history[0] ?? null,
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
        ready_to_assign: parsedInput.readyToAssign,
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

export type CachedCategoryPatch = Partial<
  Pick<
    CachedYnabCategory,
    | "assigned"
    | "balance"
    | "goal_target"
    | "goal_target_month"
    | "goal_needs_whole_amount"
    | "prior_month_available"
    | "prior_month_assigned"
  >
>;

/** Applies local edits after a push so the next preview sees YNAB's new state. */
export const patchCachedCategories = async (
  userId: string,
  patches: Map<string, CachedCategoryPatch>,
  options: { readyToAssignDelta?: number } = {},
): Promise<void> => {
  const readyToAssignDelta = options.readyToAssignDelta ?? 0;
  if (patches.size === 0 && readyToAssignDelta === 0) {
    return;
  }

  const cache = await getCache(userId);
  if (!cache) {
    return;
  }

  const categories = parseCachedCategories(cache.categories).map(
    (category) => ({ ...category, ...patches.get(category.id) }),
  );
  await upsertCache(userId, {
    categories: categories as unknown as Json,
    incomeHistory: cache.income_history,
    readyToAssign: Math.max(
      0,
      (cache.ready_to_assign ?? 0) + readyToAssignDelta,
    ),
    syncedAt: new Date(cache.synced_at).toISOString(),
  });
};
