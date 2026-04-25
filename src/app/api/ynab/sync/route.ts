import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { decryptToken } from "@/lib/crypto";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import { upsertCache } from "@/lib/repositories/ynab-cache-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { syncYnabData } from "@/lib/ynab/sync";

const syncPayloadSchema = z
  .object({
    baselineMonths: z.number().int().min(1).max(36).optional(),
  })
  .optional();

const DEFAULT_BASELINE_MONTHS = 6;

const resolveBaselineMonths = (
  payload: z.infer<typeof syncPayloadSchema>,
  incomeSettings: Awaited<ReturnType<typeof getIncomeSettings>>,
): number =>
  payload?.baselineMonths
  ?? incomeSettings?.baseline_months
  ?? DEFAULT_BASELINE_MONTHS;

const invalidConnectionResponse = () =>
  NextResponse.json(
    { error: "YNAB connection is not configured" },
    { status: 400 },
  );

const invalidPayloadResponse = (error: ZodError) =>
  NextResponse.json(
    { error: "Invalid payload", issues: error.flatten() },
    { status: 400 },
  );

export async function POST(request: Request) {
  try {
    const payload = syncPayloadSchema.parse(await request.json());
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getProfile(user.id);
    if (
      !profile?.ynab_budget_id ||
      !profile.ynab_token_ct ||
      !profile.ynab_token_iv
    ) {
      return invalidConnectionResponse();
    }

    const incomeSettings = await getIncomeSettings(user.id);
    const baselineMonths = resolveBaselineMonths(payload, incomeSettings);

    const token = await decryptToken(profile.ynab_token_ct, profile.ynab_token_iv);
    const synced = await syncYnabData({
      token,
      budgetId: profile.ynab_budget_id,
      baselineMonths,
    });

    await upsertCache(user.id, {
      categories: synced.categories,
      incomeHistory: synced.incomeHistory,
      syncedAt: synced.syncedAt,
    });

    return NextResponse.json({
      categoriesCount: synced.categories.length,
      incomeMonths: synced.incomeHistory.length,
      syncedAt: synced.syncedAt,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return invalidPayloadResponse(error);
    }

    return NextResponse.json({ error: "Failed to sync YNAB data" }, { status: 500 });
  }
}
