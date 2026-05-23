import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { encryptToken } from "@/lib/crypto";
import {
  getIncomeSettings,
  upsertIncomeSettings,
} from "@/lib/repositories/income-settings-repo";
import {
  getProfile,
  updateYnabConnection,
} from "@/lib/repositories/profile-repo";
import {
  getCache,
  parseCachedIncomeHistory,
} from "@/lib/repositories/ynab-cache-repo";
import { averageIncomeOrNull } from "@/lib/budget/average-income";
import { getCurrentUserId } from "@/lib/api/auth";
import { invalidPayloadResponse, unauthorizedResponse } from "@/lib/api/http";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const settingsPayloadSchema = z
  .object({
    token: z.string().trim().min(1).optional(),
    budgetId: z.string().trim().min(1).optional(),
    plannedIncome: z.number().finite().nonnegative().optional(),
    baselineMonths: z.number().int().min(1).max(36).optional(),
  })
  .superRefine((payload, context) => {
    const hasYnabFields =
      payload.token !== undefined || payload.budgetId !== undefined;
    const hasIncomeFields =
      payload.plannedIncome !== undefined ||
      payload.baselineMonths !== undefined;

    if (!hasYnabFields && !hasIncomeFields) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one settings section must be provided",
      });
    }

    if (payload.token !== undefined && payload.budgetId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "budgetId is required when token is provided",
      });
    }
  });

const DEFAULT_BASELINE_MONTHS = 6;

const getLatestIncomeHistory = (
  incomeHistory: ReturnType<typeof parseCachedIncomeHistory>,
  baselineMonths: number,
) =>
  [...incomeHistory]
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, baselineMonths);

const hasYnabConnection = (
  profile: Awaited<ReturnType<typeof getProfile>>,
): boolean =>
  Boolean(
    profile?.ynab_budget_id && profile.ynab_token_ct && profile.ynab_token_iv,
  );

const buildIncomeDetails = (
  cache: Awaited<ReturnType<typeof getCache>>,
  baselineMonths: number,
) => {
  const incomeHistory = cache
    ? parseCachedIncomeHistory(cache.income_history)
    : [];
  const latestIncomeHistory = getLatestIncomeHistory(
    incomeHistory,
    baselineMonths,
  );
  return {
    incomeHistory: latestIncomeHistory,
    historicalAverageIncome: averageIncomeOrNull(
      latestIncomeHistory.map((item) => item.income),
    ),
  };
};

const buildSettingsResponse = async (userId: string) => {
  const [profile, incomeSettings, cache] = await Promise.all([
    getProfile(userId),
    getIncomeSettings(userId),
    getCache(userId),
  ]);

  const baselineMonths =
    incomeSettings?.baseline_months ?? DEFAULT_BASELINE_MONTHS;
  const incomeDetails = buildIncomeDetails(cache, baselineMonths);

  return {
    budgetId: profile?.ynab_budget_id ?? "",
    hasYnabConnection: hasYnabConnection(profile),
    plannedIncome: incomeSettings?.planned_income ?? null,
    baselineMonths,
    incomeHistory: incomeDetails.incomeHistory,
    historicalAverageIncome: incomeDetails.historicalAverageIncome,
    syncedAt: cache?.synced_at ?? null,
  };
};

const applyYnabSettingsUpdate = async (
  userId: string,
  payload: z.infer<typeof settingsPayloadSchema>,
) => {
  if (payload.token === undefined && payload.budgetId === undefined) {
    return;
  }

  const profile = await getProfile(userId);
  if (!profile) {
    throw new Error("Profile not found");
  }

  if (payload.token === undefined) {
    await updateYnabConnection(userId, {
      ynabBudgetId: payload.budgetId ?? profile.ynab_budget_id,
      ynabTokenCt: profile.ynab_token_ct,
      ynabTokenIv: profile.ynab_token_iv,
    });
    return;
  }

  const encryptedToken = await encryptToken(payload.token);
  await updateYnabConnection(userId, {
    ynabBudgetId: payload.budgetId ?? profile.ynab_budget_id,
    ynabTokenCt: encryptedToken.ciphertext,
    ynabTokenIv: encryptedToken.iv,
  });
};

const applyIncomeSettingsUpdate = async (
  userId: string,
  payload: z.infer<typeof settingsPayloadSchema>,
) => {
  if (
    payload.plannedIncome === undefined &&
    payload.baselineMonths === undefined
  ) {
    return;
  }

  const existingIncomeSettings = await getIncomeSettings(userId);
  await upsertIncomeSettings(userId, {
    plannedIncome:
      payload.plannedIncome ?? existingIncomeSettings?.planned_income ?? null,
    baselineMonths:
      payload.baselineMonths ??
      existingIncomeSettings?.baseline_months ??
      DEFAULT_BASELINE_MONTHS,
  });
};

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedResponse();
    }
    return NextResponse.json(await buildSettingsResponse(userId));
  } catch {
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = settingsPayloadSchema.parse(await request.json());
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorizedResponse();
    }

    await Promise.all([
      applyYnabSettingsUpdate(user.id, payload),
      applyIncomeSettingsUpdate(user.id, payload),
    ]);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return invalidPayloadResponse(error);
    }

    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
