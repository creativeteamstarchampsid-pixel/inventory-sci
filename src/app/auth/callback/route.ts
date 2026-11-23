import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/rbac";
import { sanitizeSafeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback for Supabase email links (invite, magic link, password reset).
 * Exchanges `?code=` for a session cookie, then redirects to a strictly validated
 * relative `?next=` path (preventing Open Redirects).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code")?.trim() ?? "";
  const next = sanitizeSafeRedirectPath(
    searchParams.get("next"),
    DEFAULT_AUTHENTICATED_ROUTE,
  );

  if (code && code.length <= 512) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error("[security:auth-callback] Failed to exchange PKCE code:", error.code ?? "unknown");
  }

  return NextResponse.redirect(new URL("/login?error=auth", origin));
}
