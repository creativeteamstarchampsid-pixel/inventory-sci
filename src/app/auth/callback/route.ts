import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/rbac";
import { sanitizeSafeRedirectPath } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isEmailOtpType(value: string): value is EmailOtpType {
  return ALLOWED_EMAIL_OTP_TYPES.has(value as EmailOtpType);
}

function isPathPrefix(target: string, prefix: string): boolean {
  return (
    target === prefix ||
    target.startsWith(`${prefix}/`) ||
    target.startsWith(`${prefix}?`)
  );
}

/**
 * Auth callback for Supabase PKCE (`?code=`) and Email OTP (`?token_hash=&type=`)
 * flows: Google OAuth sign-in, Google account linking, password recovery, invites,
 * and magic links.
 *
 * Enforces strict relative `?next=` validation (anti open redirect) and the
 * internal-app Google OAuth guard (unregistered Google strangers are signed out,
 * cleaned up when newly created, and bounced to `/login?error=google-unregistered`).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = sanitizeSafeRedirectPath(
    searchParams.get("next"),
    DEFAULT_AUTHENTICATED_ROUTE,
  );
  const isSettingsFlow = isPathPrefix(next, "/settings");
  const isResetPasswordFlow = isPathPrefix(next, "/reset-password");

  // 1. Handle upstream OAuth / Supabase callback errors gracefully.
  const callbackError = searchParams.get("error")?.trim() ?? "";
  const callbackErrorCode = searchParams.get("error_code")?.trim() ?? "";
  if (callbackError) {
    console.error(
      "[security:auth-callback] Upstream auth error:",
      callbackError,
      callbackErrorCode || undefined,
    );
    if (isSettingsFlow) {
      return NextResponse.redirect(new URL("/settings?google=error", origin));
    }
    if (isResetPasswordFlow || callbackErrorCode === "otp_expired") {
      return NextResponse.redirect(new URL("/login?error=auth", origin));
    }
    return NextResponse.redirect(new URL("/login?error=google-failed", origin));
  }

  // 2. Exchange PKCE `?code=` or verify `?token_hash=&type=` OTP.
  const code = searchParams.get("code")?.trim() ?? "";
  const tokenHash = searchParams.get("token_hash")?.trim() ?? "";
  const rawType = searchParams.get("type")?.trim() ?? "";

  const supabase = await createClient();
  let authenticated = false;
  let isRecoveryOtp = false;

  if (code && code.length <= 512) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      authenticated = true;
    } else {
      console.error(
        "[security:auth-callback] Failed to exchange PKCE code:",
        error.code ?? "unknown",
      );
    }
  } else if (tokenHash && tokenHash.length <= 512 && isEmailOtpType(rawType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: rawType,
      token_hash: tokenHash,
    });
    if (!error) {
      authenticated = true;
      isRecoveryOtp = rawType === "recovery";
    } else {
      console.error(
        "[security:auth-callback] Failed to verify OTP token_hash:",
        error.code ?? "unknown",
      );
    }
  }

  if (!authenticated) {
    if (isSettingsFlow) {
      return NextResponse.redirect(new URL("/settings?google=error", origin));
    }
    return NextResponse.redirect(new URL("/login?error=auth", origin));
  }

  // 3. Password recovery flows proceed directly to `/reset-password`.
  if (isResetPasswordFlow || isRecoveryOtp) {
    const resetTarget = isResetPasswordFlow ? next : "/reset-password";
    return NextResponse.redirect(new URL(resetTarget, origin));
  }

  // 4. Internal-app Google OAuth & active-profile guard.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=auth", origin));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_active, offboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    const isGoogleProvider = user.app_metadata?.provider === "google";
    const createdAtMs = user.created_at ? Date.parse(user.created_at) : Number.NaN;
    const isCreatedRecently =
      Number.isFinite(createdAtMs) &&
      Date.now() - createdAtMs <= 5 * 60 * 1000 &&
      Date.now() - createdAtMs >= -60 * 1000;
    const isUnactivatedGoogleStranger =
      isGoogleProvider && !profile?.is_active && !profile?.offboarded_at;

    await supabase.auth.signOut({ scope: "local" });

    if (
      isUnactivatedGoogleStranger &&
      isCreatedRecently &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      try {
        const admin = createAdminClient();
        await admin.auth.admin.deleteUser(user.id);
      } catch (cleanupErr) {
        console.error(
          "[security:auth-callback] Failed to clean up unactivated Google stranger:",
          cleanupErr instanceof Error ? cleanupErr.message.slice(0, 120) : "unknown",
        );
      }
    }

    if (profile && !profile.is_active && profile.offboarded_at) {
      return NextResponse.redirect(new URL("/login?error=google-disabled", origin));
    }

    return NextResponse.redirect(new URL("/login?error=google-unregistered", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
