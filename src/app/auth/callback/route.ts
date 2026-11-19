import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback for Supabase email links (invite, magic link, password reset).
 * Exchanges `?code=` for a session cookie, then redirects to `?next=`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? DEFAULT_AUTHENTICATED_ROUTE;
  const next =
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    !nextParam.startsWith("/\\")
      ? nextParam
      : DEFAULT_AUTHENTICATED_ROUTE;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
