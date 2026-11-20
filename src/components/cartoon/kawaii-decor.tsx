import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { KawaiiMascotSvg, type KawaiiMascotType } from "./kawaii-icons";

export type KawaiiAccent =
  | "mint"
  | "sky"
  | "pink"
  | "butter"
  | "lavender"
  | "peach"
  | "coral";

const ACCENT_STYLES: Record<
  KawaiiAccent,
  {
    bannerBg: string;
    statBg: string;
    badgeBg: string;
    stickerBg: string;
    sparkleColor: string;
  }
> = {
  mint: {
    bannerBg:
      "bg-gradient-to-br from-[#D8F8E7] via-[#ECFEF4] to-[#FEF9DB] dark:from-[#1B3328] dark:via-[#22332B] dark:to-[#2D2A1F]",
    statBg: "bg-[#E6FBF0] dark:bg-[#1D3128]",
    badgeBg: "bg-[#2AB673] text-white dark:bg-[#4ADE9B] dark:text-[#1B1715]",
    stickerBg: "bg-[#FFFDF7] dark:bg-[#28221F]",
    sparkleColor: "#2AB673",
  },
  sky: {
    bannerBg:
      "bg-gradient-to-br from-[#DFF2FE] via-[#EFF8FF] to-[#FEF9DB] dark:from-[#1A2D3B] dark:via-[#202E38] dark:to-[#2C281F]",
    statBg: "bg-[#E6F5FE] dark:bg-[#1C2D3A]",
    badgeBg: "bg-[#7CC4FA] text-[#2C2623]",
    stickerBg: "bg-[#FFFDF7] dark:bg-[#28221F]",
    sparkleColor: "#38BDF8",
  },
  pink: {
    bannerBg:
      "bg-gradient-to-br from-[#FFE4EA] via-[#FFF1F4] to-[#FEF9DB] dark:from-[#3A2128] dark:via-[#322327] dark:to-[#2E291F]",
    statBg: "bg-[#FFECF0] dark:bg-[#382128]",
    badgeBg: "bg-[#FDA4AF] text-[#2C2623]",
    stickerBg: "bg-[#FFFDF7] dark:bg-[#28221F]",
    sparkleColor: "#FB7185",
  },
  butter: {
    bannerBg:
      "bg-gradient-to-br from-[#FEF3C7] via-[#FFFBEB] to-[#E6FBF0] dark:from-[#382E1B] dark:via-[#312A1F] dark:to-[#1F2F27]",
    statBg: "bg-[#FEF6D3] dark:bg-[#382F1C]",
    badgeBg: "bg-[#FDE68A] text-[#2C2623]",
    stickerBg: "bg-[#FFFDF7] dark:bg-[#28221F]",
    sparkleColor: "#F59E0B",
  },
  lavender: {
    bannerBg:
      "bg-gradient-to-br from-[#EDE9FE] via-[#F5F3FF] to-[#FFE4EA] dark:from-[#2C233D] dark:via-[#292335] dark:to-[#362229]",
    statBg: "bg-[#F1EDFE] dark:bg-[#2B233B]",
    badgeBg: "bg-[#C4B5FD] text-[#2C2623]",
    stickerBg: "bg-[#FFFDF7] dark:bg-[#28221F]",
    sparkleColor: "#A78BFA",
  },
  peach: {
    bannerBg:
      "bg-gradient-to-br from-[#FFECD6] via-[#FFF6EB] to-[#FEF3C7] dark:from-[#3B281B] dark:via-[#32261F] dark:to-[#352C1C]",
    statBg: "bg-[#FFF1DF] dark:bg-[#3A281C]",
    badgeBg: "bg-[#FDBA74] text-[#2C2623]",
    stickerBg: "bg-[#FFFDF7] dark:bg-[#28221F]",
    sparkleColor: "#FB923C",
  },
  coral: {
    bannerBg:
      "bg-gradient-to-br from-[#FFE2DC] via-[#FFF2EF] to-[#FEF3C7] dark:from-[#3C2221] dark:via-[#332322] dark:to-[#352C1C]",
    statBg: "bg-[#FFEAE6] dark:bg-[#3A2322]",
    badgeBg: "bg-[#FB7185] text-white",
    stickerBg: "bg-[#FFFDF7] dark:bg-[#28221F]",
    sparkleColor: "#F43F5E",
  },
};

export function KawaiiPageHeader({
  badge,
  title,
  description,
  accent = "mint",
  mascot = "dino",
  actions,
  className,
}: {
  badge?: string;
  title: string;
  description?: string;
  accent?: KawaiiAccent;
  mascot?: KawaiiMascotType;
  actions?: React.ReactNode;
  className?: string;
}) {
  const palette = ACCENT_STYLES[accent];

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border-2 border-[#2C2623] p-5 shadow-[4px_4px_0px_0px_#2C2623] sm:p-6 dark:border-[#6D5D54] dark:shadow-[4px_4px_0px_0px_#0E0B0A] print:border print:border-neutral-300 print:bg-white print:shadow-none",
        palette.bannerBg,
        className,
      )}
    >
      {/* Subtle 2D notebook polka-dot overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-15 print:hidden"
        style={{
          backgroundImage: "radial-gradient(#2C2623 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />

      {/* Decorative floating 2D cloud & sparkles */}
      <svg
        aria-hidden="true"
        viewBox="0 0 120 60"
        className="animate-cloud-2d pointer-events-none absolute -top-2 right-12 hidden w-28 opacity-65 sm:block dark:opacity-20 print:hidden"
      >
        <path
          d="M28 46h64a16 16 0 0 0 2.5-31.8A22 22 0 0 0 52 10a20 20 0 0 0-24 16A14 14 0 0 0 28 46Z"
          fill="#FFFDF7"
          stroke="#2C2623"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>

      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="animate-twinkle-2d pointer-events-none absolute right-5 bottom-3 hidden size-6 opacity-80 sm:block print:hidden"
      >
        <path
          d="M16 3 L19 13 L29 16 L19 19 L16 29 L13 19 L3 16 L13 13 Z"
          fill={palette.sparkleColor}
          stroke="#2C2623"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5 sm:items-center sm:gap-4">
          {/* Mascot Sticker Badge */}
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] sm:size-16 dark:border-[#6D5D54] dark:shadow-[3px_3px_0px_0px_#0E0B0A] print:hidden",
              palette.stickerBg,
            )}
          >
            <KawaiiMascotSvg
              type={mascot}
              className="animate-float-2d-slow size-11 sm:size-12"
            />
          </div>

          <div className="min-w-0 space-y-1">
            {badge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide uppercase shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:shadow-[2px_2px_0px_0px_#0E0B0A]",
                  palette.badgeBg,
                )}
              >
                <span aria-hidden="true">★</span>
                {badge}
              </span>
            )}
            <h1 className="text-xl font-black tracking-tight text-[#2C2623] sm:text-2xl dark:text-[#FDF8F0]">
              {title}
            </h1>
            {description && (
              <p className="max-w-2xl text-sm leading-relaxed font-semibold text-[#5A4D46] dark:text-[#D5C6BA]">
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </section>
  );
}

export function KawaiiEmptyState({
  title,
  description,
  mascot = "dino",
  action,
  className,
}: {
  title: string;
  description?: string;
  mascot?: KawaiiMascotType;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-[#2C2623]/45 bg-[#FFFDF7]/90 px-6 py-10 text-center dark:border-[#6D5D54] dark:bg-[#28221F]/80",
        className,
      )}
    >
      <div className="relative mb-3 flex size-20 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FEF3C7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#3A311E] dark:shadow-[3px_3px_0px_0px_#0E0B0A]">
        <KawaiiMascotSvg type={mascot} className="animate-float-2d size-14" />
        <span
          aria-hidden="true"
          className="animate-twinkle-2d absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full border-[1.5px] border-[#2C2623] bg-[#FFE4EA] text-xs font-black text-[#2C2623]"
        >
          ✦
        </span>
      </div>
      <h3 className="text-base font-extrabold tracking-tight text-[#2C2623] dark:text-[#FDF8F0]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-md text-sm font-medium text-[#6B5E57] dark:text-[#C8B9AE]">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function KawaiiStatCard({
  label,
  value,
  hint,
  accent = "mint",
  icon,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: KawaiiAccent;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const palette = ACCENT_STYLES[accent];

  const cardBody = (
    <div
      className={cn(
        "relative flex h-full flex-col justify-between gap-3 overflow-hidden rounded-2xl border-2 border-[#2C2623] p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:shadow-[3px_3px_0px_0px_#0E0B0A] print:border print:border-neutral-300 print:bg-white print:shadow-none",
        palette.statBg,
        href &&
          "transition-all duration-150 group-hover:-translate-x-[1.5px] group-hover:-translate-y-[1.5px] group-hover:shadow-[5px_5px_0px_0px_#2C2623] group-active:translate-x-[1px] group-active:translate-y-[1px] group-active:shadow-[1px_1px_0px_0px_#2C2623] dark:group-hover:shadow-[5px_5px_0px_0px_#0E0B0A]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-extrabold tracking-wide text-[#5A4D46] uppercase dark:text-[#D5C6BA]">
          {label}
        </span>
        {icon && (
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:text-[#FDF8F0] dark:shadow-[2px_2px_0px_0px_#0E0B0A]",
              palette.stickerBg,
            )}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-2xl font-black tracking-tight text-[#2C2623] tabular-nums sm:text-3xl dark:text-[#FDF8F0]">
          {value}
        </div>
        {hint && (
          <p className="text-xs font-semibold text-[#6B5E57] dark:text-[#C8B9AE]">
            {hint}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block h-full rounded-2xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        {cardBody}
      </Link>
    );
  }

  return cardBody;
}
