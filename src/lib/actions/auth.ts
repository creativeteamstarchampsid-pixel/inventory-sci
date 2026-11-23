"use server";

import { redirect } from "next/navigation";

import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/rbac";
import { sanitizeSafeRedirectPath, sanitizeTextInput } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export type LoginState = {
  error?: string;
  email?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    await supabase.auth.signOut();
  }
  redirect("/login");
}
