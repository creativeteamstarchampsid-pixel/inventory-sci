import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { hasSupabaseEnv } from "@/lib/supabase/env";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Lupa Kata Sandi" };

export default function ForgotPasswordPage() {
  const configured = hasSupabaseEnv();

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#FFFDF7] p-4 sm:p-6 dark:bg-slate-950">
      {/* 2D Pastel Playroom & Sky Background Elements */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 18%, rgba(125,211,252,0.28), transparent 36%), radial-gradient(circle at 85% 22%, rgba(253,224,71,0.28), transparent 34%), radial-gradient(circle at 80% 82%, rgba(110,231,183,0.26), transparent 38%), radial-gradient(circle at 15% 85%, rgba(244,114,182,0.2), transparent 34%)",
        }}
      />

      {/* Subtle 2D Polka-Dot Play Mat Pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-10"
        style={{
          backgroundImage: "radial-gradient(#94a3b8 1.25px, transparent 1.25px)",
          backgroundSize: "26px 26px",
        }}
      />

      {/* Floating 2D Cloud Top-Left */}
      <svg
        aria-hidden
        viewBox="0 0 180 90"
        className="animate-cloud-2d pointer-events-none absolute top-6 left-6 hidden w-36 opacity-90 sm:block"
      >
        <g stroke="#1e293b" strokeWidth="3.5" strokeLinejoin="round">
          <path
            d="M42 72h98a24 24 0 0 0 4-47.7A34 34 0 0 0 78 16a30 30 0 0 0-36 24.4A21 21 0 0 0 42 72Z"
            fill="#ffffff"
          />
        </g>
      </svg>

      {/* Floating 2D Cloud Top-Right */}
      <svg
        aria-hidden
        viewBox="0 0 180 90"
        className="animate-cloud-2d pointer-events-none absolute top-10 right-10 hidden w-32 opacity-85 lg:block"
        style={{ animationDelay: "1.4s" }}
      >
        <g stroke="#1e293b" strokeWidth="3.5" strokeLinejoin="round">
          <path
            d="M42 72h98a24 24 0 0 0 4-47.7A34 34 0 0 0 78 16a30 30 0 0 0-36 24.4A21 21 0 0 0 42 72Z"
            fill="#FEF9C3"
          />
        </g>
      </svg>

      {/* Floating 2D Mail Sticker Bottom-Left */}
      <svg
        aria-hidden
        viewBox="0 0 96 96"
        className="animate-float-2d-reverse pointer-events-none absolute bottom-8 left-8 hidden w-20 sm:block"
      >
        <g stroke="#1e293b" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
          <rect x="12" y="22" width="72" height="52" rx="14" fill="#BAE6FD" />
          <path d="M16 28 L48 52 L80 28" fill="none" />
        </g>
      </svg>

      {/* Floating 2D Star Key Sticker Bottom-Right */}
      <svg
        aria-hidden
        viewBox="0 0 96 96"
        className="animate-float-2d pointer-events-none absolute right-10 bottom-8 hidden w-20 sm:block"
      >
        <g stroke="#1e293b" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
          <circle cx="34" cy="48" r="18" fill="#FDE047" />
          <circle cx="34" cy="48" r="6" fill="#FFFDF7" />
          <path d="M52 48 H82 M70 48 V59 M80 48 V56" fill="none" />
        </g>
      </svg>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-slate-900 bg-sky-200 px-3.5 py-1 text-xs font-extrabold tracking-wide text-slate-900 shadow-[3px_3px_0px_0px_#0f172a]">
          <Sparkles className="size-3.5" />
          <span>STAROPS · PEMULIHAN KATA SANDI</span>
        </div>

        <ForgotPasswordForm configured={configured} />
      </div>
    </main>
  );
}
