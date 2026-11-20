"use client";

import { CartoonLoadingCard } from "@/components/cartoon/cartoon-loading-card";
import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { cn } from "@/lib/utils";

export interface RouteLoadingViewProps {
  pageName: string;
  hint?: string;
}

const KPI_SKELETON_PALETTES = [
  {
    cardBg: "bg-[#E6FBF0] dark:bg-[#1D3128]",
    barBg: "bg-[#A7F3D0]/85 dark:bg-emerald-800/70",
    subBg: "bg-[#2AB673]/25 dark:bg-emerald-900/70",
    dotBg: "bg-[#34D399]",
  },
  {
    cardBg: "bg-[#E6F5FE] dark:bg-[#1C2D3A]",
    barBg: "bg-[#BAE6FD]/85 dark:bg-sky-800/70",
    subBg: "bg-[#38BDF8]/25 dark:bg-sky-900/70",
    dotBg: "bg-[#7CC4FA]",
  },
  {
    cardBg: "bg-[#FEF6D3] dark:bg-[#382F1C]",
    barBg: "bg-[#FDE68A]/85 dark:bg-amber-800/70",
    subBg: "bg-[#F59E0B]/25 dark:bg-amber-900/70",
    dotBg: "bg-[#FBBF24]",
  },
  {
    cardBg: "bg-[#FFECF0] dark:bg-[#382128]",
    barBg: "bg-[#FECDD3]/85 dark:bg-rose-800/70",
    subBg: "bg-[#FB7185]/25 dark:bg-rose-900/70",
    dotBg: "bg-[#FDA4AF]",
  },
] as const;

const ROW_WIDTHS = [
  { primary: "w-2/5", secondary: "w-1/4", pill: "w-16" },
  { primary: "w-1/2", secondary: "w-1/5", pill: "w-20" },
  { primary: "w-1/3", secondary: "w-1/3", pill: "w-14" },
  { primary: "w-5/12", secondary: "w-1/4", pill: "w-24" },
] as const;

export function RouteLoadingView({ pageName, hint }: RouteLoadingViewProps) {
  const { isOpen } = useCartoonFeedback();

  if (!isOpen) {
    return (
      <div className="animate-kawaii-page-enter flex min-h-[65vh] w-full items-center justify-center px-4 py-12 print:hidden">
        <CartoonLoadingCard
          mode="navigating"
          title={`Membuka ${pageName}...`}
          subMessage={hint ?? `Menyiapkan data ${pageName} terbaru untukmu~`}
        />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={`Memuat ${pageName}`}
      className="animate-kawaii-page-enter space-y-6 pb-4 print:hidden"
    >
      {/* Pastel 2D Japanese Cartoon header shimmer */}
      <section className="animate-kawaii-shimmer relative overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-gradient-to-br from-[#DFF2FE] via-[#EFF8FF] to-[#FEF9DB] p-5 shadow-[4px_4px_0px_0px_#2C2623] sm:p-6 dark:border-[#6D5D54] dark:from-[#1A2D3B] dark:via-[#202E38] dark:to-[#2C281F] dark:shadow-[4px_4px_0px_0px_#0E0B0A]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-25 dark:opacity-15"
          style={{
            backgroundImage: "radial-gradient(#2C2623 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] sm:size-16 dark:border-[#6D5D54] dark:bg-[#28221F] dark:shadow-[3px_3px_0px_0px_#0E0B0A]">
              <span
                aria-hidden="true"
                className="size-8 animate-pulse rounded-xl bg-[#BAE6FD]/80 dark:bg-sky-900/70"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded-full border border-[#2C2623]/20 bg-[#7CC4FA]/50 dark:border-[#6D5D54]/40 dark:bg-sky-800/60" />
              <div className="h-6 w-48 max-w-full animate-pulse rounded-full bg-[#2C2623]/15 sm:w-64 dark:bg-stone-300/20" />
              <div className="h-3.5 w-64 max-w-full animate-pulse rounded-full bg-[#2C2623]/10 sm:w-80 dark:bg-stone-300/15" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="h-9 w-28 animate-pulse rounded-2xl border-2 border-[#2C2623]/30 bg-[#FFFDF7]/85 dark:border-[#6D5D54]/60 dark:bg-[#28221F]/80" />
          </div>
        </div>
      </section>

      {/* 4 pastel KPI skeleton boxes with 2px #2C2623 ink outline & comic shadow */}
      <div className="kawaii-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_SKELETON_PALETTES.map((palette, index) => (
          <div
            key={index}
            className={cn(
              "animate-kawaii-shimmer relative flex flex-col justify-between gap-3 overflow-hidden rounded-2xl border-2 border-[#2C2623] p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:shadow-[3px_3px_0px_0px_#0E0B0A]",
              palette.cardBg
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  "h-3.5 w-24 animate-pulse rounded-full",
                  palette.subBg
                )}
              />
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#28221F] dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 animate-pulse rounded-full",
                    palette.dotBg
                  )}
                />
              </div>
            </div>
            <div className="space-y-2 pt-1">
              <div
                className={cn(
                  "h-7 w-20 animate-pulse rounded-xl",
                  palette.barBg
                )}
              />
              <div
                className={cn(
                  "h-3 w-32 animate-pulse rounded-full",
                  palette.subBg
                )}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Pastel table / card shimmer box with subtle loading badge */}
      <section className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#28221F] dark:shadow-[4px_4px_0px_0px_#0E0B0A]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#2C2623] bg-[#FFF6EB] px-5 py-3.5 dark:border-[#6D5D54] dark:bg-[#312824]">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#FEF3C7] px-3 py-1 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#3A311E] dark:text-[#FDF8F0] dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
              <span
                aria-hidden="true"
                className="size-2 animate-pulse rounded-full border border-[#2C2623] bg-[#38BDF8]"
              />
              <span>Memuat {pageName}...</span>
            </span>
            {hint ? (
              <span className="hidden text-xs font-semibold text-[#6B5E57] sm:inline dark:text-[#C8B9AE]">
                {hint}
              </span>
            ) : null}
          </div>

          <div aria-hidden="true" className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#FDA4AF]" />
            <span className="size-2.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#FDE68A]" />
            <span className="size-2.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#A7F3D0]" />
          </div>
        </div>

        <div className="space-y-3.5 p-5">
          {/* Toolbar shimmer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
            <div className="animate-kawaii-shimmer h-9 w-full max-w-xs rounded-2xl border-[1.5px] border-[#E5D7C3] bg-[#FFF9EC] dark:border-[#524640] dark:bg-[#332B27]" />
            <div className="flex items-center gap-2">
              <div className="animate-kawaii-shimmer h-9 w-24 rounded-2xl border-[1.5px] border-[#E5D7C3] bg-[#E6F5FE]/70 dark:border-[#524640] dark:bg-[#1C2D3A]/70" />
              <div className="animate-kawaii-shimmer h-9 w-24 rounded-2xl border-[1.5px] border-[#E5D7C3] bg-[#E6FBF0]/70 dark:border-[#524640] dark:bg-[#1D3128]/70" />
            </div>
          </div>

          {/* Table/card row shimmer blocks */}
          <div className="space-y-2.5">
            {ROW_WIDTHS.map((row, index) => (
              <div
                key={index}
                className="animate-kawaii-shimmer flex items-center justify-between gap-4 rounded-2xl border-[1.5px] border-[#E5D7C3] bg-[#FFF9EC]/80 px-4 py-3.5 dark:border-[#524640] dark:bg-[#332B27]/65"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="size-9 shrink-0 animate-pulse rounded-xl border border-[#2C2623]/20 bg-[#F5E9D6] dark:border-[#6D5D54]/50 dark:bg-[#433728]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div
                      className={cn(
                        "h-3.5 animate-pulse rounded-full bg-[#2C2623]/15 dark:bg-stone-300/20",
                        row.primary
                      )}
                    />
                    <div
                      className={cn(
                        "h-2.5 animate-pulse rounded-full bg-[#2C2623]/10 dark:bg-stone-300/15",
                        row.secondary
                      )}
                    />
                  </div>
                </div>
                <div
                  className={cn(
                    "h-6 shrink-0 animate-pulse rounded-full border border-[#2C2623]/15 bg-[#FEF3C7] dark:border-[#6D5D54]/40 dark:bg-[#3A311E]",
                    row.pill
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
