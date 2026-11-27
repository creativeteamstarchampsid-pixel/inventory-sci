"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Database,
  DoorOpen,
  FileSpreadsheet,
  FolderArchive,
  HardDrive,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminInfrastructureTelemetry } from "@/lib/telemetry";

type InfrastructureChartsCardProps = {
  telemetry: AdminInfrastructureTelemetry;
  canManageLocations: boolean;
};

const BAR_PALETTE = [
  "#7CC4FA", // Sky
  "#6EE7B7", // Mint
  "#FDE68A", // Butter
  "#C4B5FD", // Lavender
  "#FDA4AF", // Peach/Pink
  "#FDBA74", // Apricot
] as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  const decimals = unitIdx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIdx]}`;
}

function formatPercent(used: number, total: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

function formatPctLabel(pct: number): string {
  if (pct <= 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

function formatShortWibDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

function formatReadableWibDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function DonutGauge({
  title,
  subtitle,
  usedBytes,
  quotaBytes,
  accentHex,
  detailText,
  badgeBgClass,
}: {
  title: string;
  subtitle: string;
  usedBytes: number;
  quotaBytes: number;
  accentHex: string;
  detailText: string;
  badgeBgClass: string;
}) {
  const rawPct = formatPercent(usedBytes, quotaBytes);
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  // Ensure visible non-zero sliver when usage > 0 while keeping printed % exact
  const visualPct = usedBytes > 0 ? Math.max(3, rawPct) : 0;
  const dashOffset = circumference - (visualPct / 100) * circumference;

  const statusColor =
    rawPct >= 90 ? "#FDA4AF" : rawPct >= 75 ? "#FDE68A" : accentHex;
  const statusLabel =
    rawPct >= 90 ? "Hampir Penuh" : rawPct >= 75 ? "Perlu Pantau" : "Kapasitas Aman";

  return (
    <div className="flex min-w-0 flex-col items-center gap-3 rounded-2xl border-2 border-[#2C2623] bg-white p-3.5 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-800/80 dark:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.45)]">
      <div className="flex w-full items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-[#2C2623] dark:text-stone-100">
            {title}
          </p>
          <p className="truncate text-[11px] font-medium text-[#574E49] dark:text-stone-300">
            {subtitle}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border border-[#2C2623] px-2 py-0.5 text-[10px] font-extrabold text-[#2C2623] dark:border-stone-500 ${badgeBgClass}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="relative flex size-28 items-center justify-center">
        <svg viewBox="0 0 110 110" className="size-28 -rotate-90" aria-hidden="true">
          {/* Paper track */}
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke="#EFEAE1"
            strokeWidth="14"
            className="dark:stroke-stone-700"
          />
          {/* Progress ring */}
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke={statusColor}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-700 ease-out"
          />
          {/* Comic ink outer & inner outlines */}
          <circle
            cx="55"
            cy="55"
            r={radius + 7}
            fill="none"
            stroke="#2C2623"
            strokeWidth="2"
            className="dark:stroke-stone-400"
          />
          <circle
            cx="55"
            cy="55"
            r={radius - 7}
            fill="none"
            stroke="#2C2623"
            strokeWidth="2"
            className="dark:stroke-stone-400"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg leading-none font-black text-[#2C2623] dark:text-stone-100">
            {formatPctLabel(rawPct)}
          </span>
          <span className="mt-1 text-[10px] font-bold text-[#574E49] dark:text-stone-300">
            terpakai
          </span>
        </div>
      </div>

      <div className="w-full space-y-1 text-center">
        <p className="text-xs font-extrabold text-[#2C2623] dark:text-stone-100">
          {formatBytes(usedBytes)}{" "}
          <span className="font-semibold text-[#574E49] dark:text-stone-400">
            / {formatBytes(quotaBytes)}
          </span>
        </p>
        <p className="truncate text-[11px] font-medium text-[#574E49] dark:text-stone-300">
          {detailText}
        </p>
      </div>
    </div>
  );
}

export function InfrastructureChartsCard({
  telemetry,
  canManageLocations,
}: InfrastructureChartsCardProps) {
  const [storageTab, setStorageTab] = React.useState<"tables" | "buckets">("tables");
  const series = telemetry.egress.dailySeries;
  const defaultDayIdx = Math.max(0, series.length - 1);
  const [selectedDayIdx, setSelectedDayIdx] = React.useState<number>(defaultDayIdx);

  const safeDayIdx = Math.min(selectedDayIdx, Math.max(0, series.length - 1));
  const selectedDay = series[safeDayIdx] ?? null;

  const { database, storage, egress, pgPerformance } = telemetry;
  const topTables = database.tables.slice(0, 6);
  const maxTableBytes = Math.max(
    1,
    database.systemCatalogBytes,
    ...topTables.map((t) => t.totalBytes),
  );
  const maxBucketBytes = Math.max(1, ...storage.buckets.map((b) => b.usedBytes));

  const egressUsedPct = formatPercent(egress.monthTotalBytes, egress.quotaBytes);
  const egressDenominator = Math.max(1, egress.monthTotalBytes);
  const dbSharePct = (egress.monthDbBytes / egressDenominator) * 100;
  const exportSharePct = (egress.monthExportBytes / egressDenominator) * 100;
  const storageSharePct = (egress.monthStorageBytes / egressDenominator) * 100;

  // Chart geometry for 14-day SVG stacked column + trend line chart
  const svgWidth = 560;
  const svgHeight = 192;
  const padLeft = 50;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 30;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;
  const baselineY = padTop + plotHeight;

  const maxDailyBytes = Math.max(
    1024 * 64,
    ...series.map((d) => d.totalEgressBytes),
  );
  const stepX = series.length > 0 ? plotWidth / series.length : plotWidth;
  const barWidth = Math.min(24, Math.max(10, stepX * 0.58));

  const trendPoints = series
    .map((point, idx) => {
      const cx = padLeft + idx * stepX + stepX / 2;
      const ratio = Math.min(1, Math.max(0, point.totalEgressBytes / maxDailyBytes));
      const cy = baselineY - ratio * plotHeight;
      return `${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(" ");

  const capturedLabel = React.useMemo(() => {
    const parsed = new Date(telemetry.capturedAt);
    if (Number.isNaN(parsed.getTime())) return "Baru saja";
    return `${new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed)} WIB`;
  }, [telemetry.capturedAt]);

  return (
    <section className="space-y-3" aria-label="Grafik Kapasitas Penyimpanan dan Egress PostgreSQL">
      {/* Header Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#CCFBF1] px-3 py-1 text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-teal-950/70 dark:text-teal-100">
            <HardDrive className="size-3.5" />
            <span>Kapasitas Penyimpanan &amp; Egress PostgreSQL</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#2C2623] bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-amber-950/70 dark:text-amber-100">
            <Sparkles className="size-3" />
            <span>Khusus Owner &amp; Admin · {telemetry.planName}</span>
          </span>
          <span className="text-muted-foreground text-xs font-medium">
            Pembaruan langsung: {capturedLabel}
          </span>
        </div>

        {canManageLocations && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] text-xs font-extrabold text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#CCFBF1] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-teal-950/60"
          >
            <Link href="/rooms">
              <DoorOpen className="size-3.5" />
              <span>Kelola Ruangan &amp; Lemari</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>

      {/* Balanced 2-Column Storage + Egress Charts Grid */}
      <div className="kawaii-stagger grid gap-5 xl:grid-cols-2">
        {/* CARD A: KAPASITAS PENYIMPANAN (POSTGRES + STORAGE BUCKETS) */}
        <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
          <CardHeader className="border-b-2 border-[#2C2623] bg-[#D1FAE5] px-5 py-4 dark:border-stone-500 dark:bg-emerald-950/55">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex min-w-0 items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-emerald-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-emerald-300">
                  <Database className="size-4" />
                </span>
                <span className="min-w-0 break-words">Grafik Kapasitas Penyimpanan</span>
              </CardTitle>
              <span className="rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-2.5 py-0.5 text-[11px] font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100">
                {database.tables.length} Tabel · {storage.buckets.length} Bucket
              </span>
            </div>
            <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
              Pemakaian ruang database PostgreSQL dan bucket berkas privat Supabase secara real-time.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 p-5">
            {/* Dual SVG Donut Gauges */}
            <div className="grid gap-3.5 sm:grid-cols-2">
              <DonutGauge
                title="Database PostgreSQL"
                subtitle="Tabel aplikasi, indeks & sistem"
                usedBytes={database.usedBytes}
                quotaBytes={database.quotaBytes}
                accentHex="#6EE7B7"
                detailText={`Tabel data ${formatBytes(database.publicTablesBytes)} · Sistem ${formatBytes(database.systemCatalogBytes)}`}
                badgeBgClass="bg-[#D1FAE5] dark:bg-emerald-900/70 dark:text-emerald-100"
              />
              <DonutGauge
                title="File Storage Bucket"
                subtitle="Backup, arsip SOP, foto & bukti"
                usedBytes={storage.usedBytes}
                quotaBytes={storage.quotaBytes}
                accentHex="#7CC4FA"
                detailText={`${storage.totalFiles} berkas privat tersimpan aman`}
                badgeBgClass="bg-[#E0F2FE] dark:bg-sky-900/70 dark:text-sky-100"
              />
            </div>

            {/* Interactive Breakdown Tabs */}
            <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-white p-3.5 shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-800/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-[#2C2623] dark:text-stone-100">
                  {storageTab === "tables"
                    ? "Distribusi Ukuran Tabel PostgreSQL"
                    : "Distribusi Penyimpanan Per Bucket Privat"}
                </p>
                <div className="inline-flex rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7]/60 p-0.5 dark:border-stone-500 dark:bg-stone-900">
                  <button
                    type="button"
                    onClick={() => setStorageTab("tables")}
                    aria-pressed={storageTab === "tables"}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition-colors ${
                      storageTab === "tables"
                        ? "border border-[#2C2623] bg-[#6EE7B7] text-[#2C2623] shadow-[1px_1px_0px_0px_#2C2623] dark:border-stone-400"
                        : "text-[#574E49] hover:text-[#2C2623] dark:text-stone-300"
                    }`}
                  >
                    Tabel Database
                  </button>
                  <button
                    type="button"
                    onClick={() => setStorageTab("buckets")}
                    aria-pressed={storageTab === "buckets"}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition-colors ${
                      storageTab === "buckets"
                        ? "border border-[#2C2623] bg-[#7CC4FA] text-[#2C2623] shadow-[1px_1px_0px_0px_#2C2623] dark:border-stone-400"
                        : "text-[#574E49] hover:text-[#2C2623] dark:text-stone-300"
                    }`}
                  >
                    Bucket Storage
                  </button>
                </div>
              </div>

              {storageTab === "tables" ? (
                <div className="space-y-2.5">
                  {topTables.map((tbl, idx) => {
                    const widthPct =
                      tbl.totalBytes > 0
                        ? Math.max(4, Math.min(100, (tbl.totalBytes / maxTableBytes) * 100))
                        : 0;
                    const barColor = BAR_PALETTE[idx % BAR_PALETTE.length];
                    return (
                      <div key={tbl.tableName} className="space-y-1">
                        <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate font-bold text-[#2C2623] dark:text-stone-100">
                            {tbl.label}{" "}
                            <span className="text-muted-foreground font-mono text-[10px]">
                              ({tbl.tableName})
                            </span>
                          </span>
                          <span className="shrink-0 font-extrabold text-[#2C2623] dark:text-stone-200">
                            {formatBytes(tbl.totalBytes)}
                            {tbl.estimatedRows > 0
                              ? ` · ~${tbl.estimatedRows.toLocaleString("id-ID")} baris`
                              : ""}
                          </span>
                        </div>
                        <div className="h-3.5 w-full overflow-hidden rounded-full border-2 border-[#2C2623] bg-[#FAF6ED] dark:border-stone-500 dark:bg-stone-900">
                          <div
                            className="h-full rounded-full border-r border-[#2C2623] transition-all duration-500"
                            style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="space-y-1 border-t border-dashed border-[#2C2623]/25 pt-2 dark:border-stone-700">
                    <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-bold text-[#574E49] dark:text-stone-300">
                        Katalog Sistem, Auth, Storage &amp; Ekstensi PG
                      </span>
                      <span className="shrink-0 font-extrabold text-[#2C2623] dark:text-stone-200">
                        {formatBytes(database.systemCatalogBytes)}
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[#2C2623] bg-[#FAF6ED] dark:border-stone-500 dark:bg-stone-900">
                      <div
                        className="h-full rounded-full bg-[#E5E0D8] transition-all duration-500 dark:bg-stone-600"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(4, (database.systemCatalogBytes / Math.max(1, database.usedBytes)) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {storage.buckets.map((bucket, idx) => {
                    const widthPct =
                      bucket.usedBytes > 0
                        ? Math.max(6, Math.min(100, (bucket.usedBytes / maxBucketBytes) * 100))
                        : 0;
                    const barColor = BAR_PALETTE[idx % BAR_PALETTE.length];
                    return (
                      <div key={bucket.bucketId} className="space-y-1">
                        <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 truncate font-bold text-[#2C2623] dark:text-stone-100">
                            <FolderArchive className="size-3.5 shrink-0 text-[#574E49] dark:text-stone-300" />
                            <span className="truncate">{bucket.label}</span>
                          </span>
                          <span className="shrink-0 font-extrabold text-[#2C2623] dark:text-stone-200">
                            {formatBytes(bucket.usedBytes)} · {bucket.fileCount} berkas
                          </span>
                        </div>
                        <div className="h-3.5 w-full overflow-hidden rounded-full border-2 border-[#2C2623] bg-[#FAF6ED] dark:border-stone-500 dark:bg-stone-900">
                          <div
                            className="h-full rounded-full border-r border-[#2C2623] transition-all duration-500"
                            style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* CARD B: GRAFIK EGRESS POSTGRESQL & TRANSFER DATA */}
        <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
          <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE] px-5 py-4 dark:border-stone-500 dark:bg-sky-950/55">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex min-w-0 items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-sky-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-sky-300">
                  <Activity className="size-4" />
                </span>
                <span className="min-w-0 break-words">Grafik Egress PostgreSQL &amp; Transfer</span>
              </CardTitle>
              <span className="rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-2.5 py-0.5 text-[11px] font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100">
                {formatPctLabel(egressUsedPct)} Kuota Bulan Ini
              </span>
            </div>
            <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
              Estimasi trafik keluar PostgreSQL (PostgREST &amp; kueri), ekspor laporan, serta unduhan
              storage.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 p-5">
            {/* Monthly Quota Stacked Segment Bar */}
            <div className="space-y-2.5 rounded-2xl border-2 border-[#2C2623] bg-white p-3.5 shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-800/80">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#574E49] dark:text-stone-300">
                    Total Egress Bulan Berjalan ({egress.monthStart || "Bulan Ini"})
                  </p>
                  <p className="text-xl font-black text-[#2C2623] dark:text-stone-100">
                    {formatBytes(egress.monthTotalBytes)}{" "}
                    <span className="text-xs font-semibold text-[#574E49] dark:text-stone-400">
                      / {formatBytes(egress.quotaBytes)} kuota bulanan
                    </span>
                  </p>
                </div>
                <span className="rounded-full border border-[#2C2623] bg-[#E0F2FE] px-2.5 py-0.5 text-[11px] font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-sky-900/70 dark:text-sky-100">
                  {egress.monthQueries.toLocaleString("id-ID")} aktivitas kueri
                </span>
              </div>

              {/* Overall quota fill bar with internal source proportion segments */}
              <div className="h-5 w-full overflow-hidden rounded-full border-2 border-[#2C2623] bg-[#FAF6ED] dark:border-stone-500 dark:bg-stone-900">
                <div
                  className="flex h-full overflow-hidden transition-all duration-700"
                  style={{
                    width: `${egress.monthTotalBytes > 0 ? Math.max(4, egressUsedPct) : 0}%`,
                  }}
                >
                  <div
                    className="h-full border-r border-[#2C2623] bg-[#7CC4FA]"
                    style={{ width: `${dbSharePct}%` }}
                    title={`PostgreSQL & PostgREST: ${formatBytes(egress.monthDbBytes)}`}
                  />
                  {egress.monthExportBytes > 0 && (
                    <div
                      className="h-full border-r border-[#2C2623] bg-[#FDE68A]"
                      style={{ width: `${Math.max(2, exportSharePct)}%` }}
                      title={`Ekspor CSV/XLSX/PDF: ${formatBytes(egress.monthExportBytes)}`}
                    />
                  )}
                  {egress.monthStorageBytes > 0 && (
                    <div
                      className="h-full bg-[#C4B5FD]"
                      style={{ width: `${Math.max(2, storageSharePct)}%` }}
                      title={`Unduhan Storage & Backup: ${formatBytes(egress.monthStorageBytes)}`}
                    />
                  )}
                </div>
              </div>

              {/* Source breakdown pills */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="flex items-center justify-between gap-1.5 rounded-xl border border-[#2C2623]/30 bg-[#E0F2FE]/60 px-2.5 py-1.5 text-[11px] dark:border-stone-600 dark:bg-sky-950/40">
                  <span className="flex items-center gap-1.5 font-bold text-[#2C2623] dark:text-stone-100">
                    <span className="size-2.5 rounded-full border border-[#2C2623] bg-[#7CC4FA]" />
                    PostgreSQL
                  </span>
                  <span className="font-black text-[#2C2623] dark:text-sky-200">
                    {formatBytes(egress.monthDbBytes)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1.5 rounded-xl border border-[#2C2623]/30 bg-[#FEF3C7]/70 px-2.5 py-1.5 text-[11px] dark:border-stone-600 dark:bg-amber-950/40">
                  <span className="flex items-center gap-1.5 font-bold text-[#2C2623] dark:text-stone-100">
                    <span className="size-2.5 rounded-full border border-[#2C2623] bg-[#FDE68A]" />
                    Ekspor
                  </span>
                  <span className="font-black text-[#2C2623] dark:text-amber-200">
                    {formatBytes(egress.monthExportBytes)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1.5 rounded-xl border border-[#2C2623]/30 bg-[#EDE9FE]/70 px-2.5 py-1.5 text-[11px] dark:border-stone-600 dark:bg-violet-950/40">
                  <span className="flex items-center gap-1.5 font-bold text-[#2C2623] dark:text-stone-100">
                    <span className="size-2.5 rounded-full border border-[#2C2623] bg-[#C4B5FD]" />
                    Storage
                  </span>
                  <span className="font-black text-[#2C2623] dark:text-violet-200">
                    {formatBytes(egress.monthStorageBytes)}
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive 14-Day SVG Stacked Bar + Trend Line Chart */}
            <div className="space-y-2.5 rounded-2xl border-2 border-[#2C2623] bg-white p-3.5 shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-800/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-[#2C2623] dark:text-stone-100">
                  Tren Egress Harian (14 Hari Terakhir · WIB)
                </p>
                {selectedDay && (
                  <span className="rounded-full border border-[#2C2623] bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-amber-950/70 dark:text-amber-100">
                    {formatReadableWibDate(selectedDay.date)}: {formatBytes(selectedDay.totalEgressBytes)}
                  </span>
                )}
              </div>

              {series.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-xs">
                  Data tren harian belum tersedia.
                </p>
              ) : (
                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="h-44 w-full min-w-[430px] select-none"
                    role="img"
                    aria-label="Grafik batang dan garis tren egress PostgreSQL 14 hari terakhir"
                  >
                    {/* Horizontal Reference Gridlines (0%, 50%, 100%) */}
                    {[0, 0.5, 1].map((tick) => {
                      const y = baselineY - tick * plotHeight;
                      const label = tick === 0 ? "0 B" : formatBytes(maxDailyBytes * tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={padLeft}
                            y1={y}
                            x2={svgWidth - padRight}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity={tick === 0 ? 0.55 : 0.16}
                            strokeWidth={tick === 0 ? 2 : 1.2}
                            strokeDasharray={tick === 0 ? undefined : "4 4"}
                            className="text-[#2C2623] dark:text-stone-400"
                          />
                          <text
                            x={padLeft - 6}
                            y={y + 3.5}
                            textAnchor="end"
                            fontSize="9.5"
                            fontWeight="700"
                            fill="currentColor"
                            className="text-[#574E49] dark:text-stone-300"
                          >
                            {label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Daily Stacked Bars */}
                    {series.map((day, idx) => {
                      const isSelected = idx === safeDayIdx;
                      const centerX = padLeft + idx * stepX + stepX / 2;
                      const x = centerX - barWidth / 2;

                      const totalHeightRaw = (day.totalEgressBytes / maxDailyBytes) * plotHeight;
                      const totalHeight =
                        day.totalEgressBytes > 0 ? Math.max(4, totalHeightRaw) : 0;
                      const dbRatio =
                        day.totalEgressBytes > 0 ? day.dbEgressBytes / day.totalEgressBytes : 0;
                      const storageRatio =
                        day.totalEgressBytes > 0
                          ? day.storageEgressBytes / day.totalEgressBytes
                          : 0;

                      const hDb = totalHeight * dbRatio;
                      const hStorage = totalHeight * storageRatio;
                      const hExport = Math.max(0, totalHeight - hDb - hStorage);

                      const yDb = baselineY - hDb;
                      const yStorage = yDb - hStorage;
                      const yExport = yStorage - hExport;

                      const showXLabel =
                        idx === 0 || idx === series.length - 1 || idx % 2 === 1;

                      return (
                        <g
                          key={day.date}
                          className="cursor-pointer"
                          onMouseEnter={() => setSelectedDayIdx(idx)}
                          onClick={() => setSelectedDayIdx(idx)}
                        >
                          {/* Subtle active highlight column */}
                          {isSelected && (
                            <rect
                              x={padLeft + idx * stepX + 1}
                              y={padTop - 4}
                              width={Math.max(4, stepX - 2)}
                              height={plotHeight + 8}
                              rx="6"
                              fill="#FEF3C7"
                              fillOpacity="0.55"
                              stroke="#2C2623"
                              strokeOpacity="0.3"
                              strokeWidth="1"
                              strokeDasharray="3 3"
                            />
                          )}

                          {/* Stacked segments: DB (Sky) -> Storage (Lavender) -> Export (Butter) */}
                          {hDb > 0 && (
                            <rect
                              x={x}
                              y={yDb}
                              width={barWidth}
                              height={hDb}
                              rx="3"
                              fill="#7CC4FA"
                              stroke="#2C2623"
                              strokeWidth={isSelected ? 2 : 1.3}
                            />
                          )}
                          {hStorage > 0 && (
                            <rect
                              x={x}
                              y={yStorage}
                              width={barWidth}
                              height={Math.max(2, hStorage)}
                              rx="2.5"
                              fill="#C4B5FD"
                              stroke="#2C2623"
                              strokeWidth={isSelected ? 2 : 1.3}
                            />
                          )}
                          {hExport > 0 && (
                            <rect
                              x={x}
                              y={yExport}
                              width={barWidth}
                              height={Math.max(2, hExport)}
                              rx="2.5"
                              fill="#FDE68A"
                              stroke="#2C2623"
                              strokeWidth={isSelected ? 2 : 1.3}
                            />
                          )}

                          {/* Transparent hover target covering full column */}
                          <rect
                            x={padLeft + idx * stepX}
                            y={padTop}
                            width={stepX}
                            height={plotHeight + 22}
                            fill="transparent"
                          />

                          {showXLabel && (
                            <text
                              x={centerX}
                              y={baselineY + 15}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight={isSelected ? "900" : "700"}
                              fill="currentColor"
                              className={
                                isSelected
                                  ? "text-[#2C2623] dark:text-amber-200"
                                  : "text-[#574E49] dark:text-stone-400"
                              }
                            >
                              {formatShortWibDate(day.date)}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Trend Polyline Overlay */}
                    {series.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#2C2623"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={trendPoints}
                        className="pointer-events-none dark:stroke-stone-200"
                      />
                    )}
                    {series.map((day, idx) => {
                      const cx = padLeft + idx * stepX + stepX / 2;
                      const ratio = Math.min(
                        1,
                        Math.max(0, day.totalEgressBytes / maxDailyBytes),
                      );
                      const cy = baselineY - ratio * plotHeight;
                      const isSelected = idx === safeDayIdx;
                      return (
                        <circle
                          key={`node-${day.date}`}
                          cx={cx}
                          cy={cy}
                          r={isSelected ? 4.5 : 2.8}
                          fill={isSelected ? "#FDA4AF" : "#FFFDF7"}
                          stroke="#2C2623"
                          strokeWidth={isSelected ? 2 : 1.5}
                          className="pointer-events-none"
                        />
                      );
                    })}
                  </svg>
                </div>
              )}

              {/* Selected Day Inspector */}
              {selectedDay && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2C2623]/25 bg-[#FAF6ED]/80 px-3 py-2 text-[11px] dark:border-stone-600 dark:bg-stone-900/80">
                  <span className="font-bold text-[#2C2623] dark:text-stone-200">
                    Detail {formatReadableWibDate(selectedDay.date)}:
                  </span>
                  <div className="flex flex-wrap items-center gap-3 font-semibold text-[#463F3A] dark:text-stone-300">
                    <span>PG: {formatBytes(selectedDay.dbEgressBytes)}</span>
                    <span className="inline-flex items-center gap-1">
                      <FileSpreadsheet className="size-3" />
                      Ekspor: {formatBytes(selectedDay.exportEgressBytes)}
                    </span>
                    <span>Storage: {formatBytes(selectedDay.storageEgressBytes)}</span>
                    <span>{selectedDay.queryCount.toLocaleString("id-ID")} kueri</span>
                  </div>
                </div>
              )}
            </div>

            {/* PostgreSQL Engine Health Strip */}
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 [&>*]:min-w-0">
              <div className="rounded-2xl border-2 border-[#2C2623]/30 bg-[#D1FAE5]/65 px-3 py-2 text-center dark:border-stone-600 dark:bg-emerald-950/40">
                <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-[#574E49] dark:text-stone-300">
                  <Zap className="size-3 text-emerald-700 dark:text-emerald-300" />
                  RAM Cache Hit
                </p>
                <p className="mt-0.5 text-sm font-black text-[#2C2623] dark:text-stone-100">
                  {pgPerformance.cacheHitRatio.toFixed(2)}%
                </p>
              </div>
              <div className="rounded-2xl border-2 border-[#2C2623]/30 bg-[#E0F2FE]/65 px-3 py-2 text-center dark:border-stone-600 dark:bg-sky-950/40">
                <p className="text-[10px] font-bold text-[#574E49] dark:text-stone-300">
                  Transaksi Sukses
                </p>
                <p className="mt-0.5 text-sm font-black text-[#2C2623] dark:text-stone-100">
                  {pgPerformance.xactCommit.toLocaleString("id-ID")}
                </p>
              </div>
              <div className="rounded-2xl border-2 border-[#2C2623]/30 bg-[#EDE9FE]/65 px-3 py-2 text-center dark:border-stone-600 dark:bg-violet-950/40">
                <p className="text-[10px] font-bold text-[#574E49] dark:text-stone-300">
                  Baris Diambil
                </p>
                <p className="mt-0.5 text-sm font-black text-[#2C2623] dark:text-stone-100">
                  {pgPerformance.tupFetched.toLocaleString("id-ID")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
