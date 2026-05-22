import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { getCurrentUserId } from "@/lib/api/auth";
import { unauthorizedResponse } from "@/lib/api/http";
import {
  buildTbdWarnings,
  mapGoalsToViewModel,
} from "@/lib/planner/goal-mapping";
import {
  buildPlanComputation,
  DEFAULT_HORIZON_MONTHS,
} from "@/lib/planner/plan-computation";
import { listGoals } from "@/lib/repositories/goals-repo";
import { getIncomeSettings } from "@/lib/repositories/income-settings-repo";
import { getProfile } from "@/lib/repositories/profile-repo";
import {
  getCache,
  isCacheStale,
} from "@/lib/repositories/ynab-cache-repo";

const DEFAULT_CURRENCY_CODE = "USD";
const calculatePayloadSchema = z
  .object({
    deadlineShifts: z
      .record(z.string(), z.number().int().min(-240).max(240))
      .optional(),
  })
  .optional();

const resolveCurrencyCode = async (
  profile: Awaited<ReturnType<typeof getProfile>>,
): Promise<string> => {
  if (
    !profile?.ynab_budget_id ||
    !profile.ynab_token_ct ||
    !profile.ynab_token_iv
  ) {
    return DEFAULT_CURRENCY_CODE;
  }
  if (
    typeof profile.ynab_currency_code === "string" &&
    profile.ynab_currency_code.trim().length > 0
  ) {
    return profile.ynab_currency_code.trim().toUpperCase();
  }

  return DEFAULT_CURRENCY_CODE;
};

export async function POST(request: Request) {
  try {
    const payload = calculatePayloadSchema.parse(
      await request.json().catch(() => ({})),
    );
    const deadlineShifts = payload?.deadlineShifts ?? {};
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const [goals, cache, incomeSettings, profile] = await Promise.all([
      listGoals(userId),
      getCache(userId),
      getIncomeSettings(userId),
      getProfile(userId),
    ]);

    const needsSync = isCacheStale(cache);
    const computation = buildPlanComputation({
      goals,
      cache,
      incomeSettings,
      deadlineShifts,
    });
    const tbdWarnings = buildTbdWarnings(
      computation.categories,
      computation.plannerGoals,
    );
    const currencyCode = await resolveCurrencyCode(profile);
    const goalsView = mapGoalsToViewModel(goals, computation.categories);

    return NextResponse.json({
      budget: computation.budget,
      planResult: computation.planResult,
      goals: goalsView,
      startMonth: computation.startMonth.toISOString(),
      horizonMonths: DEFAULT_HORIZON_MONTHS,
      tbdWarnings,
      needsSync,
      currencyCode,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to calculate plan" },
      { status: 500 },
    );
  }
}
