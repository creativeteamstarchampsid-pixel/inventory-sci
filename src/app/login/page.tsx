import type { Metadata } from "next";
import { Star } from "lucide-react";

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
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl shadow-sm">
            <Star className="size-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">StarOps</h1>
          <p className="text-muted-foreground text-sm">
            Sistem Operasional Internal Star Champs Indonesia
          </p>
        </div>
        <LoginForm
          next={next}
          configured={configured}
          initialError={error === "auth" ? "Sesi tidak valid. Silakan masuk kembali." : undefined}
        />
      </div>
    </main>
  );
}
