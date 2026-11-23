"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldAlert,
} from "lucide-react";

import {
  completePasswordResetAction,
  type ResetPasswordState,
} from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getPasswordStrength(password: string): {
  label: string;
  colorClass: string;
  bars: number;
} {
  if (!password) return { label: "Belum diisi", colorClass: "bg-slate-200", bars: 0 };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  else if (/\d/.test(password)) score += 0.5;

  if (password.length < 8) {
    return { label: "Terlalu pendek (min. 8 karakter)", colorClass: "bg-rose-400", bars: 1 };
  }
  if (score < 2) {
    return { label: "Cukup — tambahkan angka/huruf besar agar lebih kuat", colorClass: "bg-amber-400", bars: 2 };
  }
  if (score < 3.5) {
    return { label: "Baik & aman", colorClass: "bg-sky-400", bars: 3 };
  }
  return { label: "Sangat kuat!", colorClass: "bg-emerald-500", bars: 4 };
}

export function ResetPasswordForm({
  configured,
  initialHasSession,
  initialEmail,
}: {
  configured: boolean;
  initialHasSession: boolean;
  initialEmail: string | null;
}) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    completePasswordResetAction,
    {},
  );
  const [hasSession, setHasSession] = useState(initialHasSession);
  const [accountEmail, setAccountEmail] = useState<string | null>(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isTypingSecret, setIsTypingSecret] = useState(false);

  // Also detect implicit/client recovery sessions if a hash fragment arrived directly.
  useEffect(() => {
    if (!configured || initialHasSession) return;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setHasSession(true);
        setAccountEmail(data.user.email ?? null);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") &&
        session?.user
      ) {
        setHasSession(true);
        setAccountEmail(session.user.email ?? null);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [configured, initialHasSession]);

  const strength = getPasswordStrength(password);
  const meetsMinLength = password.length >= 8 && password.trim().length >= 8;
  const hasLetterAndNumber = /[A-Za-z]/.test(password) && /\d/.test(password);
  const passwordsMatch = Boolean(password) && password === confirmPassword;

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Interactive 2D Character Peeking Over Card */}
      <div className="relative -mb-5 flex flex-col items-center">
        <div className="mb-1.5 rounded-full border-2 border-slate-900 bg-amber-200 px-3.5 py-1 text-center text-xs font-bold text-slate-900 shadow-[2px_2px_0px_0px_#0f172a]">
          {!hasSession
            ? "Ups, tautan pemulihannya belum aktif atau sudah kedaluwarsa 🔑"
            : isTypingSecret
              ? "Aku tutup mata biar kata sandi barumu tetap rahasia! 🙈"
              : "Yuk buat kata sandi baru yang kuat & mudah diingat 🔐"}
        </div>

        <svg
          viewBox="0 0 180 115"
          className="h-28 w-44 overflow-visible select-none"
          aria-hidden
        >
          <circle cx="42" cy="52" r="14" fill="#FACC15" stroke="#0f172a" strokeWidth="3.5" />
          <circle cx="138" cy="52" r="14" fill="#FACC15" stroke="#0f172a" strokeWidth="3.5" />

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

          <path
            d="M90 28 L93 35 L100 36 L95 41 L96 48 L90 44 L84 48 L85 41 L80 36 L87 35 Z"
            fill="#34D399"
            stroke="#0f172a"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          <ellipse cx="64" cy="72" rx="7" ry="4.5" fill="#FB7185" opacity="0.75" />
          <ellipse cx="116" cy="72" rx="7" ry="4.5" fill="#FB7185" opacity="0.75" />

          <circle cx="73" cy="60" r="6" fill="#0f172a" />
          <circle cx="71" cy="58" r="2" fill="#ffffff" />
          <circle cx="107" cy="60" r="6" fill="#0f172a" />
          <circle cx="105" cy="58" r="2" fill="#ffffff" />

          {isTypingSecret ? (
            <circle
              cx="90"
              cy="77"
              r="4.5"
              fill="#FB7185"
              stroke="#0f172a"
              strokeWidth="3"
            />
          ) : (
            <path
              d="M80 74 Q90 84 100 74"
              fill="none"
              stroke="#0f172a"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          )}

          {/* Left Hand */}
          <g
            className="transition-all duration-300 ease-out"
            style={{
              transform: isTypingSecret
                ? "translate(18px, -36px) rotate(18deg)"
                : "translate(0px, 0px) rotate(0deg)",
              transformOrigin: "55px 102px",
            }}
          >
            <rect
              x="44"
              y="88"
              width="24"
              height="26"
              rx="12"
              fill="#FACC15"
              stroke="#0f172a"
              strokeWidth="3.5"
            />
          </g>

          {/* Right Hand */}
          <g
            className="transition-all duration-300 ease-out"
            style={{
              transform: isTypingSecret
                ? showPassword || showConfirm
                  ? "translate(-6px, -22px) rotate(-8deg)"
                  : "translate(-18px, -36px) rotate(-18deg)"
                : "translate(0px, 0px) rotate(0deg)",
              transformOrigin: "125px 102px",
            }}
          >
            <rect
              x="112"
              y="88"
              width="24"
              height="26"
              rx="12"
              fill="#FACC15"
              stroke="#0f172a"
              strokeWidth="3.5"
            />
          </g>
        </svg>
      </div>

      {/* 2D Cartoon Tactile Card */}
      <div className="rounded-3xl border-3 border-slate-900 bg-white p-6 shadow-[8px_8px_0px_0px_#0f172a] sm:p-7 dark:bg-slate-900">
        <div className="mb-5 text-center">
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            Atur Ulang Kata Sandi
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {accountEmail
              ? `Membuat kata sandi baru untuk ${accountEmail}`
              : "Buat kata sandi baru untuk mengamankan akun StarOps Anda"}
          </p>
        </div>

        {!hasSession ? (
          <div className="space-y-4">
            <div
              role="alert"
              className="flex gap-2.5 rounded-2xl border-2 border-slate-900 bg-amber-100 p-3.5 text-xs font-semibold text-amber-950"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
              <div className="space-y-1">
                <p>Tautan pemulihan tidak ditemukan atau sudah kedaluwarsa.</p>
                <p className="font-medium text-amber-900/90">
                  Silakan minta tautan atur ulang kata sandi baru dan buka langsung dari email
                  no-reply yang masuk ke kotak masuk Anda.
                </p>
              </div>
            </div>

            <Button
              asChild
              className="h-12 w-full rounded-2xl border-2 border-slate-900 bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 text-sm font-black text-white shadow-[4px_4px_0px_0px_#0f172a] transition-all hover:translate-y-[-1px] hover:shadow-[5px_5px_0px_0px_#0f172a]"
            >
              <Link href="/forgot-password">
                <KeyRound className="size-4" aria-hidden />
                <span>Minta Tautan Pemulihan Baru</span>
              </Link>
            </Button>

            <div className="pt-1 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-700 underline-offset-2 hover:text-indigo-600 hover:underline dark:text-slate-300"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                <span>Kembali ke Halaman Masuk</span>
              </Link>
            </div>
          </div>
        ) : (
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

            {/* Auto-Relogin Security Notice */}
            <div className="flex gap-2 rounded-2xl border-2 border-slate-900 bg-amber-100/90 p-3 text-xs font-semibold text-amber-950 shadow-[2px_2px_0px_0px_#0f172a]">
              <Lock className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
              <p>
                Demi keamanan, setelah kata sandi baru disimpan Anda akan{" "}
                <strong>otomatis keluar</strong> dari semua perangkat dan diminta masuk kembali
                dengan kata sandi baru.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="new-password"
                className="text-xs font-extrabold text-slate-800 dark:text-slate-200"
              >
                Kata Sandi Baru
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  placeholder="Minimal 8 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setIsTypingSecret(true)}
                  onBlur={() => setIsTypingSecret(false)}
                  required
                  disabled={pending}
                  className="h-11 rounded-xl border-2 border-slate-900 bg-slate-50/70 pr-10 font-medium focus-visible:bg-amber-50/50 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                  title={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              {/* Password Strength Meter & Hints */}
              <div className="space-y-1.5 pt-1">
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((bar) => (
                    <div
                      key={bar}
                      className={`h-1.5 rounded-full transition-colors ${
                        bar <= strength.bars ? strength.colorClass : "bg-slate-200 dark:bg-slate-700"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  Kekuatan sandi: {strength.label}
                </p>
                <ul className="space-y-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <li className="flex items-center gap-1.5">
                    <Check
                      className={`size-3.5 ${meetsMinLength ? "text-emerald-600" : "text-slate-300"}`}
                    />
                    <span className={meetsMinLength ? "font-bold text-emerald-700 dark:text-emerald-400" : ""}>
                      Minimal 8 karakter (bukan spasi kosong)
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check
                      className={`size-3.5 ${hasLetterAndNumber ? "text-emerald-600" : "text-slate-300"}`}
                    />
                    <span className={hasLetterAndNumber ? "font-bold text-emerald-700 dark:text-emerald-400" : ""}>
                      Disarankan kombinasi huruf dan angka
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check
                      className={`size-3.5 ${passwordsMatch ? "text-emerald-600" : "text-slate-300"}`}
                    />
                    <span className={passwordsMatch ? "font-bold text-emerald-700 dark:text-emerald-400" : ""}>
                      Konfirmasi kata sandi cocok
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="confirm-password"
                className="text-xs font-extrabold text-slate-800 dark:text-slate-200"
              >
                Konfirmasi Kata Sandi Baru
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  name="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  placeholder="Ketik ulang kata sandi baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={() => setIsTypingSecret(true)}
                  onBlur={() => setIsTypingSecret(false)}
                  required
                  disabled={pending}
                  className="h-11 rounded-xl border-2 border-slate-900 bg-slate-50/70 pr-10 font-medium focus-visible:bg-amber-50/50 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                  title={showConfirm ? "Sembunyikan konfirmasi sandi" : "Lihat konfirmasi sandi"}
                  aria-label={
                    showConfirm ? "Sembunyikan konfirmasi sandi" : "Lihat konfirmasi sandi"
                  }
                >
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <Button
                type="submit"
                disabled={pending || !configured}
                className="h-12 w-full rounded-2xl border-2 border-slate-900 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 text-sm font-black text-white shadow-[4px_4px_0px_0px_#0f172a] transition-all hover:translate-y-[-1px] hover:shadow-[5px_5px_0px_0px_#0f172a] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_#0f172a]"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    <span>Menyimpan Kata Sandi Baru…</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="size-4" aria-hidden />
                    <span>Simpan Kata Sandi & Masuk Ulang 🔒</span>
                  </>
                )}
              </Button>
            </div>

            <div className="pt-1 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-700 underline-offset-2 hover:text-indigo-600 hover:underline dark:text-slate-300"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                <span>Batal & Kembali ke Halaman Masuk</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
