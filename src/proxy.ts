import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/auth/callback"];
const E2E_AUTH_BYPASS_HEADER = "x-e2e-auth";
const E2E_AUTH_BYPASS_VALUE = "1";

export async function proxy(req: NextRequest) {
  const shouldBypassAuthForE2E =
    process.env.E2E_AUTH_BYPASS === "true"
    && req.headers.get(E2E_AUTH_BYPASS_HEADER) === E2E_AUTH_BYPASS_VALUE;

  if (shouldBypassAuthForE2E) {
    return NextResponse.next();
  }

  const { response, user } = await refreshSession(req);
  const isPublic = PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path));
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
