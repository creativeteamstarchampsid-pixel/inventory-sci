import type { Metadata } from "next";
import { Sparkles, Star } from "lucide-react";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const configured = hasSupabaseEnv();

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50/70 via-white to-emerald-50/70 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/40">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-900/20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/20"
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 text-white shadow-md shadow-indigo-500/20">
            <Star className="size-7 fill-white/25" aria-hidden />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-indigo-700 shadow-2xs backdrop-blur dark:border-indigo-800 dark:bg-slate-900/80 dark:text-indigo-300">
            <Sparkles className="size-3.5 text-amber-500" />
            <span>Star Champs Indonesia</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Selamat Datang di StarOps</h1>
          <p className="text-muted-foreground max-w-xs text-sm">
            Ruang kerja bersama untuk mencatat alat terapi, peminjaman ruangan, dan kegiatan harian.
          </p>
        </div>

        <LoginForm
          next={next}
          configured={configured}
          initialError={error === "auth" ? "Sesi masuk telah berakhir. Silakan masuk kembali." : undefined}
        />

        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-2.5 py-2 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">Owner</p>
            <p className="text-[11px] opacity-80">Pemilik</p>
          </div>
          <div className="rounded-xl border border-violet-200/70 bg-violet-50/70 px-2.5 py-2 text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200">
            <p className="font-semibold">Admin Ops</p>
            <p className="text-[11px] opacity-80">Pengelola</p>
          </div>
          <div className="rounded-xl border border-sky-200/70 bg-sky-50/70 px-2.5 py-2 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
            <p className="font-semibold">Kepala Terapis</p>
            <p className="text-[11px] opacity-80">Koordinator</p>
          </div>
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-2.5 py-2 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
            <p className="font-semibold">Terapis</p>
            <p className="text-[11px] opacity-80">Tim Terapis</p>
          </div>
        </div>
      </div>
    </main>
  );
}
