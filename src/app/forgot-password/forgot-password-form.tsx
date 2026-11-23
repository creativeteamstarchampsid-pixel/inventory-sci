"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Send,
} from "lucide-react";

import {
  requestPasswordResetAction,
  type ForgotPasswordState,
} from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordResetAction,
    {},
  );
  const [remainingCooldown, setRemainingCooldown] = useState(0);

  useEffect(() => {
    if (!state.ok || !state.sentAt) return;
    const endsAt = Date.now() + 60_000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemainingCooldown(left);
      return left;
    };
    const startTimer = window.setTimeout(() => {
      tick();
    }, 0);
    const interval = window.setInterval(() => {
      if (tick() <= 0) {
        window.clearInterval(interval);
      }
    }, 1000);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
    };
  }, [state.ok, state.sentAt]);

  const isCooldownActive = remainingCooldown > 0;

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Cute 2D Mascot Peeking Over Card */}
      <div className="relative -mb-5 flex flex-col items-center">
        <div className="mb-1.5 rounded-full border-2 border-slate-900 bg-amber-200 px-3.5 py-1 text-center text-xs font-bold text-slate-900 shadow-[2px_2px_0px_0px_#0f172a]">
          {state.ok
            ? "Surat pemulihan meluncur! Cek kotak masuk atau Spam ya 📬"
            : "Lupa kata sandi? Tenang, aku kirim tautan pemulihan ke emailmu ✉️"}
        </div>

        <svg
          viewBox="0 0 180 115"
          className="h-28 w-44 overflow-visible select-none"
          aria-hidden
        >
          {/* Ears / Star Tips */}
          <circle cx="42" cy="52" r="14" fill="#FACC15" stroke="#0f172a" strokeWidth="3.5" />
          <circle cx="138" cy="52" r="14" fill="#FACC15" stroke="#0f172a" strokeWidth="3.5" />

          {/* Main Round Face */}
          <rect
            x="44"
            y="22"
            width="92"
            height="82"
            rx="42"
            fill="#FDE047"
            stroke="#0f172a"
            strokeWidth="4"
          />

          {/* Forehead Star Crest */}
          <path
            d="M90 28 L93 35 L100 36 L95 41 L96 48 L90 44 L84 48 L85 41 L80 36 L87 35 Z"
            fill="#38BDF8"
            stroke="#0f172a"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Rosy Cheeks */}
          <ellipse cx="64" cy="72" rx="7" ry="4.5" fill="#FB7185" opacity="0.75" />
          <ellipse cx="116" cy="72" rx="7" ry="4.5" fill="#FB7185" opacity="0.75" />

          {/* Eyes */}
          <circle cx="73" cy="60" r="6" fill="#0f172a" />
          <circle cx="71" cy="58" r="2" fill="#ffffff" />
          <circle cx="107" cy="60" r="6" fill="#0f172a" />
          <circle cx="105" cy="58" r="2" fill="#ffffff" />

          {/* Friendly Smile */}
          <path
            d="M80 74 Q90 84 100 74"
            fill="none"
            stroke="#0f172a"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Cute Envelope Badge Held on Right Side */}
          <g className="animate-float-2d" style={{ transformOrigin: "144px 86px" }}>
            <rect
              x="122"
              y="72"
              width="40"
              height="28"
              rx="8"
              fill={state.ok ? "#6EE7B7" : "#BAE6FD"}
              stroke="#0f172a"
              strokeWidth="3"
            />
            <path
              d="M125 76 L142 88 L159 76"
              fill="none"
              stroke="#0f172a"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>

      {/* 2D Cartoon Tactile Card */}
      <div className="rounded-3xl border-3 border-slate-900 bg-white p-6 shadow-[8px_8px_0px_0px_#0f172a] sm:p-7 dark:bg-slate-900">
        <div className="mb-5 text-center">
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            Lupa Kata Sandi?
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Masukkan email akun StarOps Anda untuk menerima tautan atur ulang kata sandi
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          {!configured && (
            <div className="flex gap-2 rounded-2xl border-2 border-slate-900 bg-amber-100 p-3 text-xs font-medium text-slate-900">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>Koneksi pusat data belum aktif. Hubungi Admin untuk memeriksa pengaturan.</p>
            </div>
          )}

          {state.error && (
            <div
              role="alert"
              className="flex gap-2 rounded-2xl border-2 border-slate-900 bg-rose-100 p-3 text-xs font-semibold text-rose-950"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
              <p>{state.error}</p>
            </div>
          )}

          {state.ok && state.message && (
            <div
              role="status"
              className="space-y-1.5 rounded-2xl border-2 border-slate-900 bg-emerald-100 p-3.5 text-xs font-semibold text-emerald-950 shadow-[2px_2px_0px_0px_#0f172a]"
            >
              <div className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
                <p>{state.message}</p>
              </div>
              <p className="pl-6 text-[11px] font-medium text-emerald-900/90">
                Belum terlihat dalam 1–2 menit? Cek folder <strong>Spam / Junk / Promosi</strong>{" "}
                Anda dan pastikan alamat email yang diketik sudah benar.
              </p>
            </div>
          )}

          <div className="flex gap-2.5 rounded-2xl border-2 border-slate-900/20 bg-sky-50/90 p-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
            <Mail className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
            <p>
              Tautan pemulihan dikirim otomatis dari alamat <strong>no-reply</strong> sistem
              StarOps. Buka tautan tersebut untuk membuat kata sandi baru secara aman.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="forgot-email"
              className="text-xs font-extrabold text-slate-800 dark:text-slate-200"
            >
              Alamat Email Terdaftar
            </Label>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="nama@starchamps.id"
              defaultValue={state.email}
              required
              disabled={pending}
              className="h-11 rounded-xl border-2 border-slate-900 bg-slate-50/70 font-medium focus-visible:bg-sky-50/50 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="pt-1">
            <Button
              type="submit"
              disabled={pending || !configured || isCooldownActive}
              className="h-12 w-full rounded-2xl border-2 border-slate-900 bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 text-sm font-black text-white shadow-[4px_4px_0px_0px_#0f172a] transition-all hover:translate-y-[-1px] hover:shadow-[5px_5px_0px_0px_#0f172a] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_#0f172a] disabled:opacity-70"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span>Mengirim Tautan Pemulihan…</span>
                </>
              ) : isCooldownActive ? (
                <>
                  <Clock className="size-4" aria-hidden />
                  <span>Kirim ulang dalam {remainingCooldown} detik…</span>
                </>
              ) : (
                <>
                  <Send className="size-4" aria-hidden />
                  <span>
                    {state.ok ? "Kirim Ulang Tautan ✉️" : "Kirim Tautan Atur Ulang ✉️"}
                  </span>
                </>
              )}
            </Button>
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-700 underline-offset-2 transition-colors hover:text-indigo-600 hover:underline dark:text-slate-300 dark:hover:text-sky-300"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              <span>Kembali ke Halaman Masuk</span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
