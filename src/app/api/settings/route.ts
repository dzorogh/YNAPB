import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { encryptToken } from "@/lib/crypto";
import { upsertIncomeSettings } from "@/lib/repositories/income-settings-repo";
import { updateYnabConnection } from "@/lib/repositories/profile-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const settingsPayloadSchema = z.object({
  token: z.string().trim().min(1),
  budgetId: z.string().trim().min(1),
  plannedIncome: z.number().finite().nonnegative(),
  baselineMonths: z.number().int().min(1).max(36),
});

export async function POST(request: Request) {
  try {
    const payload = settingsPayloadSchema.parse(await request.json());
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const encryptedToken = await encryptToken(payload.token);

    await Promise.all([
      updateYnabConnection(user.id, {
        ynabBudgetId: payload.budgetId,
        ynabTokenCt: encryptedToken.ciphertext,
        ynabTokenIv: encryptedToken.iv,
      }),
      upsertIncomeSettings(user.id, {
        plannedIncome: payload.plannedIncome,
        baselineMonths: payload.baselineMonths,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      budgetId: payload.budgetId,
      plannedIncome: payload.plannedIncome,
      baselineMonths: payload.baselineMonths,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
