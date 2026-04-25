import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

export async function refreshSession(req: NextRequest) {
  let response = NextResponse.next({ request: req });
  let supabaseUrl: string;
  let supabaseKey: string;

  try {
    supabaseUrl = getSupabaseUrl();
    supabaseKey = getSupabasePublishableKey();
  } catch {
    return { response, user: null };
  }

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  return { response, user: data.user };
}
