import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { decryptToken } from "@/lib/crypto";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import {
  getProfile,
  updateYnabConnection,
} from "@/lib/repositories/profile-repo";
import { getCache, upsertCache } from "@/lib/repositories/ynab-cache-repo";
import {
  invalidPayloadResponse,
  invalidYnabConnectionResponse,
  unauthorizedResponse,
} from "@/lib/api/http";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildSyncErrorBody } from "@/lib/ynab/sync-error-response";
import { syncYnabData } from "@/lib/ynab/sync";
import { YnabRequestError } from "@/lib/ynab/ynab-request";

const syncPayloadSchema = z
  .object({
    baselineMonths: z.number().int().min(1).max(36).optional(),
  })
  .optional();

const DEFAULT_BASELINE_MONTHS = 6;
const SYNC_DEBOUNCE_MS = 60_000;

const wasSyncedRecently = (
  syncedAt: string | null | undefined,
  now = Date.now(),
): boolean => {
  if (!syncedAt) {
    return false;
  }
  const syncedAtMs = Date.parse(syncedAt);
  if (Number.isNaN(syncedAtMs)) {
    return false;
  }
  return now - syncedAtMs < SYNC_DEBOUNCE_MS;
};

const resolveBaselineMonths = (
  payload: z.infer<typeof syncPayloadSchema>,
  incomeSettings: Awaited<ReturnType<typeof getIncomeSettings>>,
): number =>
  payload?.baselineMonths ??
  incomeSettings?.baseline_months ??
  DEFAULT_BASELINE_MONTHS;

export async function POST(request: Request) {
  try {
    const payload = syncPayloadSchema.parse(
      await request.json().catch(() => ({})),
    );
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorizedResponse();
    }

    const profile = await getProfile(user.id);
    if (
      !profile?.ynab_budget_id ||
      !profile.ynab_token_ct ||
      !profile.ynab_token_iv
    ) {
      return invalidYnabConnectionResponse();
    }

    const [incomeSettings, cache] = await Promise.all([
      getIncomeSettings(user.id),
      getCache(user.id),
    ]);
    const baselineMonths = resolveBaselineMonths(payload, incomeSettings);

    if (wasSyncedRecently(cache?.synced_at)) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (SYNC_DEBOUNCE_MS -
            (Date.now() - Date.parse(cache?.synced_at ?? ""))) /
            1000,
        ),
      );
      return NextResponse.json(
        {
          error:
            "YNAB import ran recently. Wait a minute before importing again.",
          retryAfterSeconds,
        },
        { status: 409 },
      );
    }

    const token = await decryptToken(
      profile.ynab_token_ct,
      profile.ynab_token_iv,
    );
    const hasStoredCurrency =
      typeof profile.ynab_currency_code === "string" &&
      profile.ynab_currency_code.trim().length > 0;
    const synced = await syncYnabData({
      token,
      budgetId: profile.ynab_budget_id,
      baselineMonths,
      skipCurrencyLookup: hasStoredCurrency,
    });

    try {
      await updateYnabConnection(user.id, {
        ynabBudgetId: profile.ynab_budget_id,
        ynabTokenCt: profile.ynab_token_ct,
        ynabTokenIv: profile.ynab_token_iv,
        ynabCurrencyCode:
          synced.currencyCode ??
          (hasStoredCurrency ? profile.ynab_currency_code : null),
      });
    } catch {
      // Currency persistence is best-effort only.
      // Sync should succeed even when profile schema is not migrated yet.
    }

    await upsertCache(user.id, {
      categories: synced.categories,
      incomeHistory: synced.incomeHistory,
      syncedAt: synced.syncedAt,
    });

    return NextResponse.json({
      categoriesCount: synced.categories.length,
      incomeMonths: synced.incomeHistory.length,
      syncedAt: synced.syncedAt,
      currencyCode: synced.currencyCode,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return invalidPayloadResponse(error);
    }

    if (error instanceof YnabRequestError && error.status === 429) {
      const body = buildSyncErrorBody(
        error,
        "YNAB rate limit reached. Wait a few minutes, then try again.",
        error.operationId,
      );
      console.error("[YNAB] sync failed with rate limit", body);
      return NextResponse.json(body, { status: 429 });
    }

    const body = buildSyncErrorBody(error, "Failed to sync YNAB data");
    console.error("[YNAB] sync failed", body);
    return NextResponse.json(body, { status: 500 });
  }
}
