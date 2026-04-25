import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}
