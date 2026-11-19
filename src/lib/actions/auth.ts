"use server";

import { redirect } from "next/navigation";

import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export type LoginState = {
  error?: string;
  email?: string;
};

/** Only allow same-origin relative redirects (no `//evil.com`, no schemes). */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return DEFAULT_AUTHENTICATED_ROUTE;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }
  if (value === "/" || value.startsWith("/login")) return DEFAULT_AUTHENTICATED_ROUTE;
  return value;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email dan kata sandi wajib diisi.", email };
  }

  if (!hasSupabaseEnv()) {
    return {
      error: "Supabase belum dikonfigurasi. Isi .env.local terlebih dahulu.",
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
          : "Gagal masuk. Silakan coba lagi.";
    return { error: message, email };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
