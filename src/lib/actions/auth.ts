"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/rbac";
import {
  sanitizeSafeError,
  sanitizeSafeRedirectPath,
  sanitizeTextInput,
} from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export type LoginState = {
  error?: string;
  email?: string;
};

export type ForgotPasswordState = {
  ok?: boolean;
  error?: string;
  message?: string;
  email?: string;
  sentAt?: number;
};

export type ResetPasswordState = {
  error?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ANTI_ENUMERATION_RESET_MESSAGE =
  "Jika email tersebut terdaftar di StarOps, tautan atur ulang kata sandi telah dikirim dari alamat no-reply ke kotak masuk (atau folder Spam) Anda.";

function parseSafeOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length > 255 || /[\u0000-\u001f\u007f\s]/.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

async function getSafeSiteOrigin(): Promise<string> {
  try {
    const reqHeaders = await headers();
    const directOrigin = parseSafeOrigin(reqHeaders.get("origin"));
    if (directOrigin) return directOrigin;

    const rawHost =
      reqHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
      reqHeaders.get("host")?.split(",")[0]?.trim() ??
      "";
    if (rawHost && /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost)) {
      const rawProto = reqHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
      const isLocal =
        rawHost.startsWith("localhost") ||
        rawHost.startsWith("127.0.0.1") ||
        rawHost.startsWith("[::1]");
      const proto =
        rawProto === "http" || rawProto === "https"
          ? rawProto
          : isLocal
            ? "http"
            : "https";
      const headerOrigin = parseSafeOrigin(`${proto}://${rawHost}`);
      if (headerOrigin) return headerOrigin;
    }
  } catch {
    // Fall through to env fallback when headers() is unavailable.
  }

  return parseSafeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3000";
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = sanitizeTextInput(
    typeof formData.get("email") === "string" ? String(formData.get("email")) : "",
    254,
  ).toLowerCase();
  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!email || !password) {
    return { error: "Email dan kata sandi wajib diisi.", email };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { error: "Format email tidak valid.", email };
  }

  if (password.length > 128) {
    return { error: "Email atau kata sandi salah.", email };
  }

  if (!hasSupabaseEnv()) {
    return {
      error: "Layanan autentikasi server belum aktif. Hubungi Admin Operasional.",
      email,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const message =
      error.code === "invalid_credentials" || error.status === 400
        ? "Email atau kata sandi salah."
        : error.code === "email_not_confirmed"
          ? "Email belum dikonfirmasi. Periksa kotak masuk Anda."
          : error.code === "over_request_rate_limit" || error.status === 429
            ? "Terlalu banyak percobaan masuk. Tunggu beberapa saat lalu coba lagi."
            : "Gagal masuk. Silakan coba lagi.";
    return { error: message, email };
  }

  const nextEntry = formData.get("next");
  const safeRedirect = sanitizeSafeRedirectPath(
    typeof nextEntry === "string" ? nextEntry : null,
    DEFAULT_AUTHENTICATED_ROUTE,
  );
  redirect(safeRedirect);
}

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = sanitizeTextInput(
    typeof formData.get("email") === "string" ? String(formData.get("email")) : "",
    254,
  ).toLowerCase();

  if (!email || !EMAIL_REGEX.test(email)) {
    return {
      ok: false,
      error: "Masukkan alamat email yang valid.",
      email,
    };
  }

  if (!hasSupabaseEnv()) {
    return {
      ok: false,
      error: "Layanan autentikasi server belum aktif. Hubungi Admin Operasional.",
      email,
    };
  }

  const siteOrigin = await getSafeSiteOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteOrigin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    const isRateLimit =
      error.status === 429 ||
      error.code === "over_email_send_rate_limit" ||
      error.code === "over_request_rate_limit" ||
      error.code === "rate_limit_exceeded";

    if (isRateLimit) {
      return {
        ok: false,
        error:
          "Terlalu banyak permintaan pengiriman tautan. Silakan tunggu beberapa menit lalu coba lagi.",
        email,
      };
    }

    // Log diagnostic server-side only; preserve anti-enumeration response.
    console.error(
      "[security:auth-reset-request]",
      JSON.stringify({ code: error.code ?? "unknown", status: error.status }),
    );
  }

  return {
    ok: true,
    email,
    sentAt: Date.now(),
    message: ANTI_ENUMERATION_RESET_MESSAGE,
  };
}

export async function completePasswordResetAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const rawPassword = formData.get("password");
  const rawConfirm = formData.get("confirmPassword");
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const confirmPassword = typeof rawConfirm === "string" ? rawConfirm : "";

  if (password.length < 8 || password.trim().length < 8) {
    return { error: "Kata sandi baru minimal 8 karakter (tidak boleh hanya spasi)." };
  }

  if (password.length > 128) {
    return { error: "Kata sandi baru maksimal 128 karakter." };
  }

  if (password !== confirmPassword) {
    return { error: "Konfirmasi kata sandi baru tidak cocok." };
  }

  if (!hasSupabaseEnv()) {
    return {
      error: "Layanan autentikasi server belum aktif. Hubungi Admin Operasional.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error:
        "Sesi pemulihan sudah berakhir atau tautan tidak valid. Silakan minta tautan atur ulang kata sandi baru.",
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    if (updateError.code === "same_password") {
      return {
        error: "Kata sandi baru harus berbeda dari kata sandi sebelumnya.",
      };
    }
    return {
      error: sanitizeSafeError(
        updateError,
        "Gagal memperbarui kata sandi. Pastikan tautan pemulihan masih berlaku lalu coba lagi.",
        "auth/completePasswordReset",
      ),
    };
  }

  // Best-effort audit trail (never logs password or credentials).
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      await supabase.from("audit_logs").insert({
        actor_id: profile.id,
        actor_name: profile.full_name ?? profile.email ?? user.email ?? "Pengguna",
        actor_role: profile.role,
        action: "USER_PASSWORD_RESET_SELF",
        entity_type: "profiles",
        entity_id: profile.id,
        entity_code: profile.email ?? user.email ?? null,
        summary: "Mengatur ulang kata sandi akun sendiri melalui tautan pemulihan email",
      });
    }
  } catch {
    // Never block password reset if audit log insertion fails.
  }

  // Mandatory global sign-out for auto-relogin after password change.
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    await supabase.auth.signOut({ scope: "local" });
  }

  redirect("/login?notice=password-reset");
}
