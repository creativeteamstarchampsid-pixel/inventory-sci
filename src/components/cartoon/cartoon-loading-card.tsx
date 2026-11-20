import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type CartoonFeedbackMode =
  | "working"
  | "navigating"
  | "batch"
  | "success"
  | "idle"
  | "error";

export interface CartoonModeConfig {
  mode: CartoonFeedbackMode;
  gif: string;
  alt: string;
  badge: string;
  badgeIcon: string;
  defaultTitle: string;
  messages: readonly [string, string, string];
  isLoading: boolean;
  palette: {
    headerBg: string;
    badgeBg: string;
    frameBg: string;
    frameDot: string;
    dotColor: string;
    barFill: string;
    barAccent: string;
    buttonBg: string;
    subPillBg: string;
  };
}

export const CARTOON_GIF_CONFIG: Record<CartoonFeedbackMode, CartoonModeConfig> = {
  working: {
    mode: "working",
    gif: "/gifs/work-office-joguman.webp",
    alt: "Animasi Dino Joguman sedang semangat bekerja mengetik di meja",
    badge: "Sedang Dikerjakan",
    badgeIcon: "✦",
    defaultTitle: "Lagi Dikerjain Nih~",
    messages: [
      "Dino Joguman lagi ngebut ngetik dan nyimpen datamu nih! Tunggu sebentar ya, lagi diproses biar rapi~",
      "Lagi nyatet perubahan barumu ke buku besar StarOps! Bentar ya, dikit lagi kelar kok ✨",
      "Semua data lagi diperiksa dan disimpan dengan hati-hati. Tunggu sebentar ya, jangan ditutup dulu~",
    ],
    isLoading: true,
    palette: {
      headerBg: "bg-[#D1FAE5] dark:bg-emerald-950/75",
      badgeBg: "bg-[#A7F3D0] text-[#065F46] dark:bg-emerald-900 dark:text-emerald-100",
      frameBg: "bg-[#ECFDF5] dark:bg-emerald-950/40",
      frameDot: "rgba(16, 185, 129, 0.22)",
      dotColor: "bg-[#34D399]",
      barFill: "bg-[#34D399]",
      barAccent: "bg-[#A7F3D0]",
      buttonBg:
        "bg-[#A7F3D0] text-[#064E3B] hover:bg-[#6EE7B7] dark:bg-emerald-800 dark:text-emerald-50",
      subPillBg: "bg-[#ECFDF5] text-[#065F46] dark:bg-emerald-950/60 dark:text-emerald-200",
    },
  },
  navigating: {
    mode: "navigating",
    gif: "/gifs/confused-thinking.webp",
    alt: "Animasi Dino Joguman sedang berpikir mencari halaman tujuan",
    badge: "Pindah Halaman",
    badgeIcon: "?",
    defaultTitle: "Sebentar Ya, Cari Jalan...",
    messages: [
      "Eh bentar ya... lagi nyari jalan ke menu yang kamu pilih. Tunggu sebentar biar halamannya siap tampil!",
      "Lagi buka pintu ke halaman tujuanmu nih~ Dino lagi mikir sebentar sambil nyiapin semua datanya!",
      "Pindah ruangan dulu ya! Lagi ngumpulin catatan biar pas halamannya muncul langsung lengkap dan rapi~",
    ],
    isLoading: true,
    palette: {
      headerBg: "bg-[#E0F2FE] dark:bg-sky-950/75",
      badgeBg: "bg-[#BAE6FD] text-[#075985] dark:bg-sky-900 dark:text-sky-100",
      frameBg: "bg-[#F0F9FF] dark:bg-sky-950/40",
      frameDot: "rgba(14, 165, 233, 0.22)",
      dotColor: "bg-[#38BDF8]",
      barFill: "bg-[#38BDF8]",
      barAccent: "bg-[#BAE6FD]",
      buttonBg:
        "bg-[#BAE6FD] text-[#0C4A6E] hover:bg-[#7DD3FC] dark:bg-sky-800 dark:text-sky-50",
      subPillBg: "bg-[#F0F9FF] text-[#075985] dark:bg-sky-950/60 dark:text-sky-200",
    },
  },
  batch: {
    mode: "batch",
    gif: "/gifs/work-office.webp",
    alt: "Animasi tim mini kantor sedang lembur membereskan banyak tugas sekaligus",
    badge: "Tugas Banyak!",
    badgeIcon: "⚡",
    defaultTitle: "Lembur Beresin Semua!",
    messages: [
      "Wah, tugasnya lumayan banyak nih! Tim mini lagi lembur ngebut beresin semuanya sekaligus, santai dulu ya~",
      "Lagi proses banyak data barengan! Mesin cetak & arsip mini lagi kerja ekstra keras biar semuanya beres sekaligus ✨",
      "Sabar ya, tumpukan berkas lagi dirapikan satu per satu sekaligus! Tunggu sebentar sampai semuanya kelar~",
    ],
    isLoading: true,
    palette: {
      headerBg: "bg-[#FFEDD5] dark:bg-amber-950/75",
      badgeBg: "bg-[#FDE68A] text-[#92400E] dark:bg-amber-900 dark:text-amber-100",
      frameBg: "bg-[#FFFBEB] dark:bg-amber-950/40",
      frameDot: "rgba(245, 158, 11, 0.22)",
      dotColor: "bg-[#FB923C]",
      barFill: "bg-[#FBBF24]",
      barAccent: "bg-[#FDE68A]",
      buttonBg:
        "bg-[#FDE68A] text-[#78350F] hover:bg-[#FCD34D] dark:bg-amber-800 dark:text-amber-50",
      subPillBg: "bg-[#FFFBEB] text-[#92400E] dark:bg-amber-950/60 dark:text-amber-200",
    },
  },
  success: {
    mode: "success",
    gif: "/gifs/chiikawa.webp",
    alt: "Animasi Chiikawa merayakan keberhasilan dengan ceria",
    badge: "Berhasil!",
    badgeIcon: "♪",
    defaultTitle: "Yeay! Semua Beres ♪",
    messages: [
      "Yeay! Berhasil! Semua perubahan sudah tersimpan rapi dan aman, Chiikawa ikut senang ♪",
      "Horeee~ Proses selesai dengan mulus tanpa kendala! Data barumu sudah langsung aktif di StarOps ✨",
      "Mantap banget! Semua tugas beres dengan sempurna, sekarang siap lanjut ke aktivitas berikutnya ♪",
    ],
    isLoading: false,
    palette: {
      headerBg: "bg-[#FFE4E6] dark:bg-rose-950/70",
      badgeBg: "bg-[#FEF08A] text-[#854D0E] dark:bg-amber-900 dark:text-amber-100",
      frameBg: "bg-[#FFFBEB] dark:bg-rose-950/30",
      frameDot: "rgba(244, 114, 182, 0.22)",
      dotColor: "bg-[#FB7185]",
      barFill: "bg-[#F472B6]",
      barAccent: "bg-[#FEF08A]",
      buttonBg:
        "bg-[#FEF08A] text-[#2C2623] hover:bg-[#FDE047] dark:bg-amber-300 dark:text-stone-950",
      subPillBg: "bg-[#FFF1F2] text-[#9F1239] dark:bg-rose-950/60 dark:text-rose-200",
    },
  },
  idle: {
    mode: "idle",
    gif: "/gifs/sleepy-work.webp",
    alt: "Animasi Dino Joguman mengantuk karena layar lama tidak ada aktivitas",
    badge: "Mode Santai",
    badgeIcon: "💤",
    defaultTitle: "Hoaaam... Lagi Istirahat?",
    messages: [
      "Hoaaam... sepi banget nih, udah cukup lama gak ada aktivitas di layar. Masih di sana? Klik tombol di bawah buat lanjut kerja ya~",
      "Zzz... Dino sampai ketiduran di meja karena layarnya tenang banget. Kalau sudah siap lanjut, bangunin aku ya~",
      "Lagi istirahat sebentar ya? Tenang, datamu tetap aman kok. Ketuk tombol di bawah kapan pun kamu mau lanjut lagi ✨",
    ],
    isLoading: false,
    palette: {
      headerBg: "bg-[#EDE9FE] dark:bg-violet-950/75",
      badgeBg: "bg-[#DDD6FE] text-[#5B21B6] dark:bg-violet-900 dark:text-violet-100",
      frameBg: "bg-[#F5F3FF] dark:bg-violet-950/40",
      frameDot: "rgba(139, 92, 246, 0.22)",
      dotColor: "bg-[#A78BFA]",
      barFill: "bg-[#A78BFA]",
      barAccent: "bg-[#DDD6FE]",
      buttonBg:
        "bg-[#DDD6FE] text-[#2C2623] hover:bg-[#C4B5FD] dark:bg-violet-400 dark:text-stone-950",
      subPillBg: "bg-[#F5F3FF] text-[#5B21B6] dark:bg-violet-950/60 dark:text-violet-200",
    },
  },
  error: {
    mode: "error",
    gif: "/gifs/cartoon-rain.webp",
    alt: "Animasi hujan kartun menandakan proses gagal diperbarui",
    badge: "Yah, Gagal...",
    badgeIcon: "🌧",
    defaultTitle: "Yah, Hujan Error Turun...",
    messages: [
      "Yah, hujan turun... gagal memperbarui data kali ini. Jangan sedih, coba cek lagi datanya atau ulangi ya!",
      "Aduh, prosesnya kepeleset di tengah jalan nih... Coba periksa koneksi atau isian form lalu ulangi sekali lagi ya!",
      "Hmm, sepertinya ada sedikit kendala saat memproses permintaanmu. Tenang, tidak ada yang hilang — yuk coba lagi!",
    ],
    isLoading: false,
    palette: {
      headerBg: "bg-[#DBEAFE] dark:bg-slate-800/90",
      badgeBg: "bg-[#BFDBFE] text-[#1E3A8A] dark:bg-slate-700 dark:text-sky-100",
      frameBg: "bg-[#EFF6FF] dark:bg-slate-900/70",
      frameDot: "rgba(96, 165, 250, 0.24)",
      dotColor: "bg-[#60A5FA]",
      barFill: "bg-[#60A5FA]",
      barAccent: "bg-[#BFDBFE]",
      buttonBg:
        "bg-[#BFDBFE] text-[#1E3A8A] hover:bg-[#93C5FD] dark:bg-sky-300 dark:text-stone-950",
      subPillBg: "bg-[#EFF6FF] text-[#1E3A8A] dark:bg-slate-800 dark:text-sky-200",
    },
  },
};

function ModeDoodleOverlay({ mode }: { mode: CartoonFeedbackMode }) {
  switch (mode) {
    case "working":
      return (
        <>
          <svg
            aria-hidden="true"
            viewBox="0 0 28 28"
            className="animate-twinkle-2d pointer-events-none absolute -top-2.5 -left-2.5 size-7 text-[#FBBF24] drop-shadow-[1px_1px_0px_#2C2623]"
          >
            <path
              d="M14 2 L16.8 10.6 L25.5 14 L16.8 17.4 L14 26 L11.2 17.4 L2.5 14 L11.2 10.6 Z"
              fill="currentColor"
              stroke="#2C2623"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="animate-float-2d pointer-events-none absolute -right-2 -bottom-2 size-6 text-[#34D399] drop-shadow-[1px_1px_0px_#2C2623]"
          >
            <circle cx="12" cy="12" r="8" fill="currentColor" stroke="#2C2623" strokeWidth="2" />
            <path
              d="M9 12.2 L11.1 14.3 L15.5 9.8"
              fill="none"
              stroke="#2C2623"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </>
      );
    case "navigating":
      return (
        <>
          <span
            aria-hidden="true"
            className="animate-float-2d pointer-events-none absolute -top-3 -right-2 inline-flex size-8 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FEF08A] text-sm font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]"
          >
            ?
          </span>
          <span
            aria-hidden="true"
            className="animate-float-2d-reverse pointer-events-none absolute -bottom-2 -left-2 inline-flex size-6 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#BAE6FD] text-xs font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
          >
            ?
          </span>
        </>
      );
    case "batch":
      return (
        <>
          <span
            aria-hidden="true"
            className="animate-twinkle-2d pointer-events-none absolute -top-3 -right-2 inline-flex size-8 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FDE68A] text-sm font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]"
          >
            ⚡
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 28 28"
            className="animate-float-2d pointer-events-none absolute -bottom-2.5 -left-2.5 size-6 text-[#FB923C] drop-shadow-[1px_1px_0px_#2C2623]"
          >
            <path
              d="M14 2 L17 11 L26 14 L17 17 L14 26 L11 17 L2 14 L11 11 Z"
              fill="currentColor"
              stroke="#2C2623"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </>
      );
    case "success":
      return (
        <>
          <span
            aria-hidden="true"
            className="animate-float-2d pointer-events-none absolute -top-3 -right-2 inline-flex size-8 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FDA4AF] text-sm font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]"
          >
            ♪
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 28 28"
            className="animate-twinkle-2d pointer-events-none absolute -top-2.5 -left-2.5 size-7 text-[#FDE047] drop-shadow-[1px_1px_0px_#2C2623]"
          >
            <path
              d="M14 2 L16.8 10.6 L25.5 14 L16.8 17.4 L14 26 L11.2 17.4 L2.5 14 L11.2 10.6 Z"
              fill="currentColor"
              stroke="#2C2623"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span
            aria-hidden="true"
            className="animate-float-2d-reverse pointer-events-none absolute -right-1.5 -bottom-2 inline-flex size-6 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FEF08A] text-xs font-black text-[#E11D48] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
          >
            ♥
          </span>
        </>
      );
    case "idle":
      return (
        <>
          <span
            aria-hidden="true"
            className="animate-float-2d-slow pointer-events-none absolute -top-3 -right-2 inline-flex items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#DDD6FE] px-2 py-0.5 text-xs font-black tracking-widest text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]"
          >
            Zzz
          </span>
          <span
            aria-hidden="true"
            className="animate-float-2d-reverse pointer-events-none absolute -bottom-2 -left-2 inline-flex size-7 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FEF08A] text-xs font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
          >
            ☾
          </span>
        </>
      );
    case "error":
      return (
        <>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 28"
            className="animate-float-2d-reverse pointer-events-none absolute -top-3 -right-1.5 h-7 w-6 text-[#93C5FD] drop-shadow-[1px_1px_0px_#2C2623]"
          >
            <path
              d="M12 2 C12 2 4 12.5 4 18 C4 22.4 7.6 26 12 26 C16.4 26 20 22.4 20 18 C20 12.5 12 2 12 2 Z"
              fill="currentColor"
              stroke="#2C2623"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          </svg>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 28"
            className="animate-float-2d pointer-events-none absolute -bottom-2 -left-2 h-6 w-5 text-[#60A5FA] drop-shadow-[1px_1px_0px_#2C2623]"
          >
            <path
              d="M12 2 C12 2 4 12.5 4 18 C4 22.4 7.6 26 12 26 C16.4 26 20 22.4 20 18 C20 12.5 12 2 12 2 Z"
              fill="currentColor"
              stroke="#2C2623"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          </svg>
        </>
      );
  }
}

export interface CartoonLoadingCardProps {
  mode?: CartoonFeedbackMode;
  title?: string;
  message?: string;
  subMessage?: string;
  compact?: boolean;
  className?: string;
  /** Deterministic index into CARTOON_GIF_CONFIG[mode].messages when message is omitted */
  messageIndex?: number;
  /** Optional top-right slot (e.g. close button inside modal) */
  headerRight?: ReactNode;
  /** Optional footer slot (e.g. action buttons inside modal) */
  footer?: ReactNode;
}

export function CartoonLoadingCard({
  mode = "navigating",
  title,
  message,
  subMessage,
  compact = false,
  className,
  messageIndex = 0,
  headerRight,
  footer,
}: CartoonLoadingCardProps) {
  const config = CARTOON_GIF_CONFIG[mode];
  const safeIndex =
    ((messageIndex % config.messages.length) + config.messages.length) %
    config.messages.length;
  const resolvedTitle = title ?? config.defaultTitle;
  const resolvedMessage = message ?? config.messages[safeIndex];

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[28px] border-[2.5px] border-[#2C2623] bg-[#FFFDF7] text-[#2C2623] shadow-[5px_5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900 dark:text-stone-100 dark:shadow-[5px_5px_0px_0px_#1c1917] print:hidden",
        compact ? "max-w-sm" : "max-w-md",
        className
      )}
    >
      {/* Cute Japanese 2D pastel header ribbon */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b-[2px] border-[#2C2623] px-4 dark:border-stone-500",
          compact ? "py-2.5" : "py-3",
          config.palette.headerBg
        )}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border-2 border-[#2C2623] px-3 py-0.5 text-xs font-extrabold tracking-wide shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-400 dark:shadow-[2px_2px_0px_0px_#1c1917]",
            config.palette.badgeBg
          )}
        >
          <span aria-hidden="true" className="leading-none">
            {config.badgeIcon}
          </span>
          <span>{config.badge}</span>
        </span>

        {headerRight ? (
          <div className="flex items-center">{headerRight}</div>
        ) : (
          <div aria-hidden="true" className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#FDA4AF]" />
            <span className="size-2.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#FDE68A]" />
            <span className="size-2.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#A7F3D0]" />
          </div>
        )}
      </div>

      {/* Main body */}
      <div
        className={cn(
          "flex flex-col items-center text-center",
          compact ? "gap-3 px-5 py-4" : "gap-4 px-6 py-6"
        )}
      >
        {/* Framed animated GIF stage */}
        <div className="relative">
          <div
            className={cn(
              "relative flex items-center justify-center overflow-hidden rounded-2xl border-[2.5px] border-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-400 dark:shadow-[3px_3px_0px_0px_#1c1917]",
              compact ? "h-32 w-32 p-2" : "h-44 w-44 p-2.5 sm:h-48 sm:w-48",
              config.palette.frameBg
            )}
            style={{
              backgroundImage: `radial-gradient(${config.palette.frameDot} 1.5px, transparent 1.5px)`,
              backgroundSize: "12px 12px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.gif}
              alt={config.alt}
              loading="eager"
              decoding="async"
              draggable={false}
              className="h-full w-full rounded-xl object-contain select-none"
            />
          </div>

          <ModeDoodleOverlay mode={mode} />
        </div>

        {/* Title & descriptive Indonesian copy */}
        <div className="space-y-1.5">
          <h3
            className={cn(
              "font-extrabold tracking-tight text-[#2C2623] dark:text-stone-100",
              compact ? "text-base" : "text-lg sm:text-xl"
            )}
          >
            {resolvedTitle}
          </h3>
          <p
            className={cn(
              "mx-auto max-w-xs leading-relaxed font-medium text-[#574F4A] dark:text-stone-300",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {resolvedMessage}
          </p>
        </div>

        {subMessage ? (
          <div
            className={cn(
              "max-w-full rounded-xl border-[1.5px] border-dashed border-[#2C2623]/45 px-3 py-1.5 text-xs font-semibold break-words dark:border-stone-500",
              config.palette.subPillBg
            )}
          >
            {subMessage}
          </div>
        ) : null}

        {/* Loading indicator or mood divider */}
        {config.isLoading ? (
          <div className="flex w-full max-w-[240px] flex-col items-center gap-2 pt-0.5">
            {/* Cute cartoon progress bar */}
            <div className="relative h-3 w-full overflow-hidden rounded-full border-2 border-[#2C2623] bg-white p-0.5 dark:border-stone-400 dark:bg-stone-800">
              <div className="flex h-full w-full gap-1">
                <span
                  className={cn(
                    "h-full flex-1 animate-pulse rounded-full",
                    config.palette.barFill
                  )}
                />
                <span
                  className={cn(
                    "h-full flex-1 animate-pulse rounded-full [animation-delay:200ms]",
                    config.palette.barAccent
                  )}
                />
                <span
                  className={cn(
                    "h-full flex-1 animate-pulse rounded-full [animation-delay:400ms]",
                    config.palette.barFill
                  )}
                />
              </div>
            </div>

            {/* Bouncy 3-dot comic animation */}
            <div aria-hidden="true" className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 animate-bounce rounded-full border border-[#2C2623] [animation-delay:0ms]",
                  config.palette.dotColor
                )}
              />
              <span
                className={cn(
                  "size-2 animate-bounce rounded-full border border-[#2C2623] [animation-delay:150ms]",
                  config.palette.dotColor
                )}
              />
              <span
                className={cn(
                  "size-2 animate-bounce rounded-full border border-[#2C2623] [animation-delay:300ms]",
                  config.palette.dotColor
                )}
              />
            </div>
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="flex items-center gap-2 text-xs font-bold tracking-widest text-[#2C2623]/45 dark:text-stone-400"
          >
            <span className="h-0.5 w-8 rounded-full bg-current opacity-40" />
            <span>
              {mode === "success"
                ? "✦ ♪ ✦"
                : mode === "idle"
                  ? "☾ · z z Z · ☽"
                  : "☁ · 💧 · ☁"}
            </span>
            <span className="h-0.5 w-8 rounded-full bg-current opacity-40" />
          </div>
        )}

        {footer ? <div className="w-full pt-1">{footer}</div> : null}
      </div>
    </div>
  );
}
