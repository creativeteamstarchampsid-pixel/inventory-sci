"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from "lucide-react";

import { signIn, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  next,
  configured,
  initialError,
}: {
  next?: string;
  configured: boolean;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, {
    error: initialError,
  });

  const [focusedField, setFocusedField] = useState<"none" | "email" | "password">("none");
  const [showPassword, setShowPassword] = useState(false);

  const isCoveringEyes = focusedField === "password";
  const isLookingDown = focusedField === "email";

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Interactive 2D Animated Character Peeking Over the Login Card */}
      <div className="relative -mb-5 flex flex-col items-center">
        {/* Speech Bubble that changes based on user interaction */}
        <div className="mb-1.5 rounded-full border-2 border-slate-900 bg-amber-200 px-3.5 py-1 text-xs font-bold text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] transition-all">
          {isCoveringEyes
            ? showPassword
              ? "Hehe, aku intip sedikit ya! 👀"
              : "Tenang, aku tutup mata saat isi sandi! 🙈"
            : isLookingDown
              ? "Ketik email StarOps kamu di bawah ya ✨"
              : "Halo! Yuk masuk ke ruang kerja StarOps 👋"}
        </div>

        <svg
          viewBox="0 0 180 115"
          className="h-28 w-44 overflow-visible select-none"
          aria-hidden
        >
          {/* Cute 2D Character Body / Head */}
          <g className="transition-transform duration-300">
            {/* Ears / Star Tips */}
            <circle
              cx="42"
              cy="52"
              r="14"
              fill="#FACC15"
              stroke="#0f172a"
              strokeWidth="3.5"
            />
            <circle
              cx="138"
              cy="52"
              r="14"
              fill="#FACC15"
              stroke="#0f172a"
              strokeWidth="3.5"
            />

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

            {/* Forehead Little Star Crest */}
            <path
              d="M90 28 L93 35 L100 36 L95 41 L96 48 L90 44 L84 48 L85 41 L80 36 L87 35 Z"
              fill="#FB923C"
              stroke="#0f172a"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/* Rosy Cheeks */}
            <ellipse cx="64" cy="72" rx="7" ry="4.5" fill="#FB7185" opacity="0.75" />
            <ellipse cx="116" cy="72" rx="7" ry="4.5" fill="#FB7185" opacity="0.75" />

            {/* Eyes (Look down when typing email) */}
            <g
              className="transition-transform duration-200"
              style={{
                transform: isLookingDown ? "translateY(5px)" : "translateY(0px)",
              }}
            >
              <circle cx="73" cy="60" r="6" fill="#0f172a" />
              <circle cx="71" cy="58" r="2" fill="#ffffff" />
              <circle cx="107" cy="60" r="6" fill="#0f172a" />
              <circle cx="105" cy="58" r="2" fill="#ffffff" />
            </g>

            {/* Mouth (Changes expression) */}
            {isCoveringEyes ? (
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
          </g>

          {/* Left 2D Hand (Rises to cover left eye on password focus) */}
          <g
            className="transition-all duration-300 ease-out"
            style={{
              transform: isCoveringEyes
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

          {/* Right 2D Hand (Rises to cover right eye, or peeks when showPassword is true) */}
          <g
            className="transition-all duration-300 ease-out"
            style={{
              transform: isCoveringEyes
                ? showPassword
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

      {/* 2D Cartoon Tactile Login Card */}
      <div className="rounded-3xl border-3 border-slate-900 bg-white p-6 shadow-[8px_8px_0px_0px_#0f172a] sm:p-7 dark:bg-slate-900">
        <div className="mb-5 text-center">
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            Masuk ke StarOps
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Gunakan email dan kata sandi akun tim Star Champs Anda
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

          <input type="hidden" name="next" value={next ?? ""} />

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
              Alamat Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nama@starchamps.id"
              defaultValue={state.email}
              required
              disabled={pending}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField("none")}
              className="h-11 rounded-xl border-2 border-slate-900 bg-slate-50/70 font-medium focus-visible:bg-sky-50/50 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="text-xs font-extrabold text-slate-800 dark:text-slate-200"
            >
              Kata Sandi
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Masukkan kata sandi"
                required
                disabled={pending}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField("none")}
                className="h-11 rounded-xl border-2 border-slate-900 bg-slate-50/70 pr-10 font-medium focus-visible:bg-amber-50/50 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                title={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={pending || !configured}
              className="h-12 w-full rounded-2xl border-2 border-slate-900 bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 text-sm font-black text-white shadow-[4px_4px_0px_0px_#0f172a] transition-all hover:translate-y-[-1px] hover:shadow-[5px_5px_0px_0px_#0f172a] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_#0f172a]"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <LogIn className="size-4" aria-hidden />
              )}
              <span>{pending ? "Sedang Masuk ke StarOps…" : "Masuk Sekarang 🚀"}</span>
            </Button>
          </div>

          <p className="pt-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            Lupa kata sandi atau belum punya akun? Hubungi <strong>Admin Operasional</strong>.
          </p>
        </form>
      </div>
    </div>
  );
}
