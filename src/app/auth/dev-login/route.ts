import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseUrl } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Dev-only quick login: mints a magic-link token via the service role
// and exchanges it for a session cookie. Disabled outside `next dev`.
export async function GET(req: NextRequest) {
  const email = process.env.DEV_LOGIN_EMAIL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!email || !serviceRoleKey) {
    const missingVariables = [
      ...(!email ? ["DEV_LOGIN_EMAIL"] : []),
      ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    return new NextResponse(
      `Dev login is not configured: missing ${missingVariables.join(" and ")}. Add the variable(s) to .env.local and restart next dev.`,
      { status: 503 },
    );
  }

  const admin = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  const supabase = await getSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) {
    return new NextResponse(verifyError.message, { status: 500 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}
