import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

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
        style={{ animationDelay: "1.5s" }}
      >
        <g stroke="#1e293b" strokeWidth="3.5" strokeLinejoin="round">
          <path
            d="M42 72h98a24 24 0 0 0 4-47.7A34 34 0 0 0 78 16a30 30 0 0 0-36 24.4A21 21 0 0 0 42 72Z"
            fill="#FEF9C3"
          />
        </g>
      </svg>

      {/* Floating 2D Therapy Block Bottom-Left */}
      <svg
        aria-hidden
        viewBox="0 0 90 90"
        className="animate-float-2d-reverse pointer-events-none absolute bottom-8 left-8 hidden w-20 sm:block"
      >
        <g stroke="#1e293b" strokeWidth="3.5" strokeLinejoin="round">
          <rect x="12" y="14" width="64" height="64" rx="16" fill="#A7F3D0" />
          <rect x="20" y="22" width="48" height="48" rx="11" fill="#34D399" />
          <text
            x="44"
            y="54"
            textAnchor="middle"
            fill="#ffffff"
            stroke="none"
            fontSize="26"
            fontWeight="900"
          >
            A
          </text>
        </g>
      </svg>

      {/* Floating 2D Puzzle Piece Bottom-Right */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="animate-float-2d pointer-events-none absolute right-10 bottom-8 hidden w-20 sm:block"
      >
        <path
          d="M24 28h18a8 8 0 1 1 16 0h18v18a8 8 0 1 1 0 16v18H24V62a8 8 0 1 0 0-16V28Z"
          fill="#FDE047"
          stroke="#1e293b"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Main Content Container: 2-Column 2D Animated Showcase + Interactive Login */}
      <div className="relative z-10 mx-auto grid w-full max-w-5xl items-center gap-8 lg:grid-cols-12">
        {/* Left Column: 2D Animated Illustration Scene */}
        <div className="flex flex-col items-center text-center lg:col-span-7 lg:items-start lg:text-left">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border-2 border-slate-900 bg-amber-300 px-3.5 py-1 text-xs font-extrabold tracking-wide text-slate-900 shadow-[3px_3px_0px_0px_#0f172a]">
            <Sparkles className="size-3.5" />
            <span>STAR CHAMPS INDONESIA · RUANG KERJA CERIA</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Kelola Alat Terapi & Kegiatan Harian Jadi{" "}
            <span className="inline-block -rotate-1 rounded-xl border-2 border-slate-900 bg-sky-300 px-2.5 py-0.5 text-slate-900 shadow-[3px_3px_0px_0px_#0f172a]">
              Lebih Mudah!
            </span>
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed font-medium text-slate-600 sm:text-base dark:text-slate-300">
            Scan pinjam mainan terapi, cek kelengkapan kepingan puzzle, simpan SOP, dan buat
            pengajuan dengan tampilan penuh warna yang ramah untuk seluruh tim.
          </p>

          {/* 2D Animated Vector Scene Canvas */}
          <div className="relative mt-6 w-full max-w-lg">
            <div className="relative overflow-hidden rounded-3xl border-3 border-slate-900 bg-gradient-to-b from-sky-100 via-indigo-50 to-emerald-100 p-4 shadow-[8px_8px_0px_0px_#0f172a] sm:p-6">
              <svg
                viewBox="0 0 500 300"
                className="h-auto w-full select-none"
                role="img"
                aria-label="Ilustrasi 2D Animasi StarOps Star Champs Indonesia"
              >
                {/* Background Hills */}
                <path
                  d="M-20 265 Q110 205 240 255 T520 245 L520 320 L-20 320 Z"
                  fill="#A7F3D0"
                  stroke="#0f172a"
                  strokeWidth="3.5"
                />
                <path
                  d="M-20 280 Q180 235 340 270 T520 265 L520 320 L-20 320 Z"
                  fill="#6EE7B7"
                  stroke="#0f172a"
                  strokeWidth="3.5"
                />

                {/* Twinkling Mini Stars in Sky */}
                <g className="animate-twinkle-2d" style={{ transformOrigin: "75px 52px" }}>
                  <path
                    d="M75 38 L79 48 L90 52 L79 56 L75 66 L71 56 L60 52 L71 48 Z"
                    fill="#FACC15"
                    stroke="#0f172a"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                </g>
                <g
                  className="animate-twinkle-2d"
                  style={{ transformOrigin: "430px 58px", animationDelay: "1.1s" }}
                >
                  <path
                    d="M430 46 L433 54 L442 58 L433 62 L430 70 L427 62 L418 58 L427 54 Z"
                    fill="#F472B6"
                    stroke="#0f172a"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                </g>

                {/* Left Floating 2D Toy Box & Sensory Rings */}
                <g className="animate-float-2d-slow">
                  <rect
                    x="36"
                    y="128"
                    width="112"
                    height="92"
                    rx="18"
                    fill="#ffffff"
                    stroke="#0f172a"
                    strokeWidth="3.5"
                  />
                  <rect
                    x="36"
                    y="128"
                    width="112"
                    height="28"
                    rx="14"
                    fill="#38BDF8"
                    stroke="#0f172a"
                    strokeWidth="3.5"
                  />
                  <circle cx="54" cy="142" r="4.5" fill="#FDE047" stroke="#0f172a" strokeWidth="2" />
                  <circle cx="68" cy="142" r="4.5" fill="#F472B6" stroke="#0f172a" strokeWidth="2" />
                  {/* Toy Blocks inside card */}
                  <rect
                    x="52"
                    y="170"
                    width="34"
                    height="34"
                    rx="8"
                    fill="#FB7185"
                    stroke="#0f172a"
                    strokeWidth="3"
                  />
                  <text
                    x="69"
                    y="193"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="16"
                    fontWeight="900"
                  >
                    1
                  </text>
                  <rect
                    x="94"
                    y="170"
                    width="34"
                    height="34"
                    rx="8"
                    fill="#A78BFA"
                    stroke="#0f172a"
                    strokeWidth="3"
                  />
                  <text
                    x="111"
                    y="193"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="16"
                    fontWeight="900"
                  >
                    2
                  </text>
                </g>

                {/* Center Hero: 2D Animated Smiling Star Mascot ("Bintang StarChamps") */}
                <g className="animate-float-2d" style={{ transformOrigin: "250px 145px" }}>
                  {/* Waving Left Arm */}
                  <g className="animate-wave-2d" style={{ transformOrigin: "185px 155px" }}>
                    <path
                      d="M190 155 C165 145 152 125 162 112 C170 104 182 115 186 126"
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="162"
                      cy="112"
                      r="10"
                      fill="#FDE047"
                      stroke="#0f172a"
                      strokeWidth="3.5"
                    />
                  </g>

                  {/* Right Arm Holding Check Badge */}
                  <path
                    d="M310 155 C332 152 344 140 342 126"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="342"
                    cy="124"
                    r="14"
                    fill="#34D399"
                    stroke="#0f172a"
                    strokeWidth="3.5"
                  />
                  <path
                    d="M336 124 L340 129 L349 119"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Star Body */}
                  <path
                    d="M250 48 L274 98 L328 106 L288 144 L298 198 L250 172 L202 198 L212 144 L172 106 L226 98 Z"
                    fill="#FACC15"
                    stroke="#0f172a"
                    strokeWidth="4.5"
                    strokeLinejoin="round"
                  />

                  {/* Cute Rosy Cheeks */}
                  <ellipse cx="222" cy="136" rx="8" ry="5" fill="#FB7185" opacity="0.7" />
                  <ellipse cx="278" cy="136" rx="8" ry="5" fill="#FB7185" opacity="0.7" />

                  {/* Blinking Eyes */}
                  <g className="animate-blink-2d" style={{ transformOrigin: "250px 122px" }}>
                    <circle cx="232" cy="122" r="6" fill="#0f172a" />
                    <circle cx="230" cy="120" r="2" fill="#ffffff" />
                    <circle cx="268" cy="122" r="6" fill="#0f172a" />
                    <circle cx="266" cy="120" r="2" fill="#ffffff" />
                  </g>

                  {/* Happy 2D Smile */}
                  <path
                    d="M238 136 Q250 148 262 136"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </g>

                {/* Right Floating 2D Barcode Sticker Card with Animated Laser Scan */}
                <g className="animate-float-2d-reverse">
                  <rect
                    x="350"
                    y="122"
                    width="116"
                    height="98"
                    rx="18"
                    fill="#ffffff"
                    stroke="#0f172a"
                    strokeWidth="3.5"
                  />
                  <rect
                    x="366"
                    y="136"
                    width="84"
                    height="16"
                    rx="6"
                    fill="#DDD6FE"
                    stroke="#0f172a"
                    strokeWidth="2.5"
                  />
                  <text
                    x="408"
                    y="148"
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="9"
                    fontWeight="900"
                  >
                    SC-SNS-R01
                  </text>
                  {/* 2D Barcode Bars */}
                  <g fill="#0f172a">
                    <rect x="370" y="162" width="5" height="34" rx="2" />
                    <rect x="380" y="162" width="3" height="34" rx="1.5" />
                    <rect x="388" y="162" width="7" height="34" rx="2" />
                    <rect x="400" y="162" width="4" height="34" rx="1.5" />
                    <rect x="409" y="162" width="8" height="34" rx="2" />
                    <rect x="422" y="162" width="3" height="34" rx="1.5" />
                    <rect x="430" y="162" width="6" height="34" rx="2" />
                    <rect x="441" y="162" width="4" height="34" rx="1.5" />
                  </g>
                  {/* Animated Red/Emerald Laser Scan Line */}
                  <g className="animate-scan-2d">
                    <line
                      x1="362"
                      y1="164"
                      x2="454"
                      y2="164"
                      stroke="#10B981"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </g>
                </g>

                {/* Cute Floating Pill Label at Bottom of Illustration */}
                <g transform="translate(135, 232)">
                  <rect
                    x="0"
                    y="0"
                    width="230"
                    height="36"
                    rx="18"
                    fill="#ffffff"
                    stroke="#0f172a"
                    strokeWidth="3.5"
                  />
                  <circle cx="22" cy="18" r="8" fill="#34D399" stroke="#0f172a" strokeWidth="2.5" />
                  <text
                    x="124"
                    y="23"
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="12"
                    fontWeight="800"
                  >
                    Siap Dipakai Seluruh Tim!
                  </text>
                </g>
              </svg>
            </div>

            {/* 4 Role Pills in 2D Cartoon Sticker Style */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-2xl border-2 border-slate-900 bg-amber-200 px-3 py-2 text-center text-slate-900 shadow-[3px_3px_0px_0px_#0f172a]">
                <p className="text-xs font-black">🟡 Owner</p>
                <p className="text-[11px] font-medium opacity-85">Pemilik</p>
              </div>
              <div className="rounded-2xl border-2 border-slate-900 bg-violet-200 px-3 py-2 text-center text-slate-900 shadow-[3px_3px_0px_0px_#0f172a]">
                <p className="text-xs font-black">🟣 Admin Ops</p>
                <p className="text-[11px] font-medium opacity-85">Pengelola</p>
              </div>
              <div className="rounded-2xl border-2 border-slate-900 bg-sky-200 px-3 py-2 text-center text-slate-900 shadow-[3px_3px_0px_0px_#0f172a]">
                <p className="text-xs font-black">🔵 Ka. Terapis</p>
                <p className="text-[11px] font-medium opacity-85">Koordinator</p>
              </div>
              <div className="rounded-2xl border-2 border-slate-900 bg-emerald-200 px-3 py-2 text-center text-slate-900 shadow-[3px_3px_0px_0px_#0f172a]">
                <p className="text-xs font-black">🟢 Terapis</p>
                <p className="text-[11px] font-medium opacity-85">Tim Terapis</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive 2D Character Login Card */}
        <div className="w-full lg:col-span-5">
          <LoginForm
            next={next}
            configured={configured}
            initialError={
              error === "auth" ? "Sesi masuk telah berakhir. Silakan masuk kembali." : undefined
            }
          />
        </div>
      </div>
    </main>
  );
}
