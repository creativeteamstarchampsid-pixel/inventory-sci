import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  DatabaseBackup,
  History,
  KeyRound,
  Package,
  Sparkles,
  Truck,
} from "lucide-react";

import { RoleBadge } from "@/components/layout/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth";
import { formatJakartaDate, getJakartaGreeting, getMonthlyUpdatePeriod } from "@/lib/period";
import { can, ROLE_LABELS, type Role } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog, MonthlyReconciliation, SubscriptionDirectoryRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Beranda",
};

type DashboardMetrics = {
  schemaReady: boolean;
  schemaError?: string;
  totalItems: number;
  partKurangCount: number;
  needsSanitationCount: number;
  lowStockCount: number;
  activeBorrowsCount: number;
  totalArchives: number;
  activeDeliveries: number;
  pendingRequests: number;
  expiringSubscriptions: SubscriptionDirectoryRow[];
  reconciliation: MonthlyReconciliation | null;
  recentAudits: Pick<
    AuditLog,
    "id" | "actor_name" | "action" | "entity_type" | "entity_code" | "summary" | "created_at"
  >[];
};

function daysUntilDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00+07:00`).getTime();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
  const today = new Date(`${todayStr}T00:00:00+07:00`).getTime();
  return Math.round((target - today) / 86_400_000);
}

const ROLE_QUICK_TIPS: Record<
  Role,
  {
    bannerBg: string;
    summary: string;
    actions: { label: string; href: string }[];
  }
> = {
  OWNER: {
    bannerBg:
      "border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-yellow-50/80 dark:border-amber-900/50 dark:from-amber-950/40 dark:to-orange-950/30",
    summary:
      "Sebagai Owner, Anda dapat memantau seluruh kondisi barang, menyetujui pengajuan pembelian atau penghapusan barang rusak berat, serta mengesahkan laporan akhir bulan.",
    actions: [
      { label: "Cek Pengajuan Menunggu", href: "/requests" },
      { label: "Laporan Akhir Bulan", href: "/backup" },
      { label: "Brankas Akun Digital", href: "/vault" },
      { label: "Kelola Tim", href: "/settings" },
    ],
  },
  SUPER_ADMIN: {
    bannerBg:
      "border-violet-200/80 bg-gradient-to-r from-violet-50/90 via-indigo-50/60 to-fuchsia-50/80 dark:border-violet-900/50 dark:from-violet-950/40 dark:to-indigo-950/30",
    summary:
      "Sebagai Admin Operasional, Anda mengelola daftar barang & alat terapi, mencetak stiker barcode, mencatat pengiriman paket, mengatur Brankas Akun Digital, serta membuat akun anggota tim.",
    actions: [
      { label: "Kelola Barang & Alat", href: "/inventory" },
      { label: "Cetak Stiker Barcode", href: "/barcode-studio" },
      { label: "Catat Paket Kiriman", href: "/deliveries" },
      { label: "Tambah Anggota Tim", href: "/settings" },
    ],
  },
  TEAM_LEADER: {
    bannerBg:
      "border-sky-200/80 bg-gradient-to-r from-sky-50/90 via-cyan-50/60 to-blue-50/80 dark:border-sky-900/50 dark:from-sky-950/40 dark:to-cyan-950/30",
    summary:
      "Sebagai Kepala Terapis, Anda mendampingi tim terapis: menyetujui pengajuan dari terapis, memastikan pengecekan alat di ruangan terapi selesai tepat waktu, dan memantau kelengkapan mainan.",
    actions: [
      { label: "Setujui Pengajuan Tim", href: "/requests" },
      { label: "Pinjam & Cek Ruangan", href: "/scan" },
      { label: "Cek Kondisi Alat Terapi", href: "/inventory" },
      { label: "Unduh Laporan Bulanan", href: "/backup" },
    ],
  },
  STAFF: {
    bannerBg:
      "border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-green-50/80 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-teal-950/30",
    summary:
      "Sebagai Terapis, gunakan menu Pinjam & Kembalikan setiap mengambil atau menaruh alat terapi, perbarui status cuci/bersih mainan selesai sesi, dan lapor jika ada kepingan mainan yang kurang.",
    actions: [
      { label: "Pinjam / Kembalikan Alat", href: "/scan" },
      { label: "Lihat Alat & Mainan", href: "/inventory" },
      { label: "Pinjam Paket Kit", href: "/kits" },
      { label: "Buat Pengajuan / Lapor Rusak", href: "/requests" },
    ],
  },
};

async function loadDashboardMetrics(role: Parameters<typeof can>[0], periodCode: string) {
  const supabase = await createClient();

  const itemsQuery = supabase
    .from("items_master")
    .select("id, asset_type, condition, hygiene_status, stock_qty, min_stock_threshold", {
      count: "exact",
    })
    .is("deleted_at", null);

  const borrowsQuery = supabase
    .from("borrow_transactions")
    .select("id", { count: "exact", head: true })
    .in("status", ["DIPINJAM", "TERLAMBAT"]);

  const archivesQuery = supabase
    .from("archives_hybrid")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const requestsQuery = supabase
    .from("internal_requests")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .in("status", ["MENUNGGU_TEAM_LEADER", "MENUNGGU_ADMIN", "MENUNGGU_OWNER"]);

  const [itemsRes, borrowsRes, archivesRes, requestsRes] = await Promise.all([
    itemsQuery,
    borrowsQuery,
    archivesQuery,
    requestsQuery,
  ]);

  if (itemsRes.error) {
    return {
      schemaReady: false,
      schemaError: itemsRes.error.message,
      totalItems: 0,
      partKurangCount: 0,
      needsSanitationCount: 0,
      lowStockCount: 0,
      activeBorrowsCount: 0,
      totalArchives: 0,
      activeDeliveries: 0,
      pendingRequests: 0,
      expiringSubscriptions: [],
      reconciliation: null,
      recentAudits: [],
    } satisfies DashboardMetrics;
  }

  const items = itemsRes.data ?? [];
  const partKurangCount = items.filter((item) => item.condition === "PART_KURANG").length;
  const needsSanitationCount = items.filter(
    (item) => item.asset_type === "THERAPY_TOY" && item.hygiene_status !== "STERIL",
  ).length;
  const lowStockCount = items.filter(
    (item) =>
      item.asset_type === "CONSUMABLE" &&
      item.min_stock_threshold > 0 &&
      item.stock_qty <= item.min_stock_threshold,
  ).length;

  let activeDeliveries = 0;
  if (can(role, "delivery.view")) {
    const delRes = await supabase
      .from("deliveries_log")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["DRAFT", "DIKEMAS", "DALAM_PERJALANAN"]);
    activeDeliveries = delRes.count ?? 0;
  }

  let expiringSubscriptions: SubscriptionDirectoryRow[] = [];
  if (can(role, "vault.view_limited")) {
    const subRes = await supabase
      .from("subscriptions_vault_directory")
      .select("*")
      .eq("is_active", true)
      .order("renewal_date", { ascending: true });
    expiringSubscriptions = (subRes.data ?? []).filter((sub) => {
      const diff = daysUntilDate(sub.renewal_date);
      return diff !== null && diff <= 7;
    });
  }

  let reconciliation: MonthlyReconciliation | null = null;
  if (can(role, "export.data")) {
    const recRes = await supabase
      .from("monthly_reconciliations")
      .select("*")
      .eq("period_ym", periodCode)
      .maybeSingle();
    reconciliation = recRes.data ?? null;
  }

  let recentAudits: DashboardMetrics["recentAudits"] = [];
  if (can(role, "audit.view")) {
    const auditRes = await supabase
      .from("audit_logs")
      .select("id, actor_name, action, entity_type, entity_code, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    recentAudits = auditRes.data ?? [];
  }

  return {
    schemaReady: true,
    totalItems: itemsRes.count ?? items.length,
    partKurangCount,
    needsSanitationCount,
    lowStockCount,
    activeBorrowsCount: borrowsRes.count ?? 0,
    totalArchives: archivesRes.count ?? 0,
    activeDeliveries,
    pendingRequests: requestsRes.count ?? 0,
    expiringSubscriptions,
    reconciliation,
    recentAudits,
  } satisfies DashboardMetrics;
}

export default async function DashboardPage() {
  const user = await requireRouteAccess("/dashboard");
  const period = getMonthlyUpdatePeriod();
  const greeting = getJakartaGreeting();
  const todayLabel = formatJakartaDate();
  const metrics = await loadDashboardMetrics(user.role, period.periodCode);
  const roleTip = ROLE_QUICK_TIPS[user.role];

  return (
    <div className="space-y-6">
      {/* Greeting Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, {user.fullName} 👋
          </h1>
          <p className="text-muted-foreground text-sm">
            Ringkasan kegiatan Star Champs Indonesia · {todayLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={user.role} showSubtitle />
          <Badge variant="outline" className="bg-white/80 dark:bg-slate-900">
            Bulan {period.periodLabel}
          </Badge>
        </div>
      </div>

      {/* Role Welcome & Quick Action Bar */}
      <Card className={roleTip.bannerBg}>
        <CardContent className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                Peran Anda: {ROLE_LABELS[user.role].title} ({ROLE_LABELS[user.role].subtitle})
              </span>
            </div>
            <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
              {roleTip.summary}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {roleTip.actions.map((act) => (
              <Button
                key={act.href}
                asChild
                size="sm"
                variant="secondary"
                className="bg-white/90 shadow-2xs hover:bg-white dark:bg-slate-900/80"
              >
                <Link href={act.href}>
                  <span>{act.label}</span>
                  <ArrowRight className="ml-1 size-3.5 opacity-70" />
                </Link>
              </Button>
            ))}
            <Button asChild size="sm" className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700">
              <Link href="/guide">
                <BookOpen className="size-3.5" />
                <span>Baca Panduan Lengkap</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 4 Colorful Minimalist Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/inventory" className="group block">
          <Card className="h-full border-sky-200/70 bg-gradient-to-br from-sky-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-sky-900/40 dark:from-sky-950/30 dark:via-slate-900 dark:to-slate-900">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between font-medium text-sky-900/80 dark:text-sky-200">
                <span>Total Barang & Alat</span>
                <span className="flex size-8 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-300">
                  <Package className="size-4" />
                </span>
              </CardDescription>
              <CardTitle className="text-3xl font-bold text-sky-950 dark:text-sky-100">
                {metrics.totalItems}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">
              <strong>{metrics.activeBorrowsCount}</strong> alat sedang dipinjam saat ini
            </CardContent>
          </Card>
        </Link>

        <Link href="/inventory" className="group block">
          <Card className="h-full border-amber-200/70 bg-gradient-to-br from-amber-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-amber-900/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between font-medium text-amber-900/80 dark:text-amber-200">
                <span>Kepingan Kurang & Stok Tipis</span>
                <span className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
                  <AlertTriangle className="size-4" />
                </span>
              </CardDescription>
              <CardTitle className="text-3xl font-bold text-amber-950 dark:text-amber-100">
                {metrics.partKurangCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">
              <strong>{metrics.lowStockCount}</strong> barang habis pakai perlu diisi ulang
            </CardContent>
          </Card>
        </Link>

        <Link href="/inventory" className="group block">
          <Card className="h-full border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between font-medium text-emerald-900/80 dark:text-emerald-200">
                <span>Perlu Dicuci / Dibersihkan</span>
                <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
                  <Sparkles className="size-4" />
                </span>
              </CardDescription>
              <CardTitle className="text-3xl font-bold text-emerald-950 dark:text-emerald-100">
                {metrics.needsSanitationCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">
              Mainan terapi yang perlu dicuci sebelum dipakai lagi
            </CardContent>
          </Card>
        </Link>

        <Link href="/requests" className="group block">
          <Card className="h-full border-rose-200/70 bg-gradient-to-br from-rose-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-rose-900/40 dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-900">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between font-medium text-rose-900/80 dark:text-rose-200">
                <span>Pengajuan & Dokumen SOP</span>
                <span className="flex size-8 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300">
                  <ClipboardCheck className="size-4" />
                </span>
              </CardDescription>
              <CardTitle className="text-3xl font-bold text-rose-950 dark:text-rose-100">
                {metrics.pendingRequests}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">
              Menunggu persetujuan · <strong>{metrics.totalArchives}</strong> dokumen di Lemari Arsip
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Operational Widgets */}
      <div className="grid gap-4 lg:grid-cols-2">
        {can(user.role, "vault.view_limited") && (
          <Card className="border-cyan-200/60 dark:border-cyan-900/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                  <KeyRound className="size-4" />
                </span>
                Pengingat Tagihan Langganan Digital (7 Hari ke Depan)
              </CardTitle>
              <CardDescription>
                Daftar akun aplikasi kantor yang masa berlakunya segera habis dalam 7 hari.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.expiringSubscriptions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aman! Tidak ada langganan aplikasi yang jatuh tempo dalam 7 hari ke depan.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {metrics.expiringSubscriptions.map((sub) => {
                    const days = daysUntilDate(sub.renewal_date);
                    return (
                      <li
                        key={sub.id}
                        className="flex items-center justify-between rounded-xl border px-3 py-2"
                      >
                        <div>
                          <p className="font-medium">
                            {sub.service_name}{" "}
                            <span className="text-muted-foreground font-mono text-xs">
                              ({sub.sub_code})
                            </span>
                          </p>
                          <p className="text-muted-foreground text-xs">{sub.login_email}</p>
                        </div>
                        <Badge variant={days !== null && days <= 1 ? "destructive" : "secondary"}>
                          {days !== null && days <= 0 ? "Jatuh Tempo" : `${days} hari lagi`}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {can(user.role, "export.data") && (
          <Card className="border-indigo-200/60 dark:border-indigo-900/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  <DatabaseBackup className="size-4" />
                </span>
                Pengecekan Akhir Bulan & Cadangan Data ({period.periodLabel})
              </CardTitle>
              <CardDescription>
                Setiap tanggal 24 hingga akhir bulan, tim melakukan pengecekan kelengkapan barang di
                seluruh ruangan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status Jadwal Bulan Ini</span>
                <Badge variant={period.active ? "default" : "outline"}>
                  {period.active ? "Sedang Berjalan (Minggu Terakhir)" : "Dimulai Setiap Tanggal 24"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Kelengkapan Cek Ruangan</span>
                <span className="font-semibold">
                  {metrics.reconciliation?.opname_progress_pct ?? 0}% Ruangan Selesai
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cadangan Data Awal</span>
                <span className="text-xs font-medium">
                  {metrics.reconciliation?.pre_update_backup_id ? "Sudah Tersimpan" : "Belum Dibuat"}
                </span>
              </div>
              {can(user.role, "delivery.view") && (
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Truck className="size-3.5 text-orange-500" />
                    Paket Pengiriman Sedang Jalan
                  </span>
                  <span className="font-medium">{metrics.activeDeliveries} paket</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!can(user.role, "vault.view_limited") && (
          <Card className="border-emerald-200/60 dark:border-emerald-900/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CalendarClock className="size-4" />
                </span>
                Hal Penting untuk {ROLE_LABELS[user.role].title} Hari Ini
              </CardTitle>
              <CardDescription>
                Langkah praktis yang paling sering Anda gunakan sehari-hari:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50/60 p-2.5 dark:bg-emerald-950/30">
                <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  <strong>Pinjam & Kembalikan Alat:</strong> Scan stiker barcode sebelum membawa
                  mainan ke ruang terapi dan saat mengembalikannya ke rak.
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-sky-50/60 p-2.5 dark:bg-sky-950/30">
                <Boxes className="mt-0.5 size-4 shrink-0 text-sky-600" />
                <p>
                  <strong>Cek Kepingan & Kebersihan:</strong> Hitung jumlah kepingan mainan selesai
                  sesi dan ubah statusnya menjadi <em>Perlu Dicuci</em> bila sudah dipakai.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Activity */}
      {can(user.role, "audit.view") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-7 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                <History className="size-4" />
              </span>
              Kegiatan Terbaru Tim
            </CardTitle>
            <CardDescription>
              Catatan otomatis setiap ada anggota tim yang menambah, meminjam, atau memperbarui data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.recentAudits.length === 0 ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Archive className="size-4" />
                <span>Belum ada kegiatan yang tercatat hari ini.</span>
              </div>
            ) : (
              <ul className="divide-y text-sm">
                {metrics.recentAudits.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-col justify-between gap-1 py-2.5 sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-medium">{log.summary}</p>
                      <p className="text-muted-foreground text-xs">
                        Oleh <strong>{log.actor_name || "Sistem Otomatis"}</strong>
                        {log.entity_code ? ` · Kode: ${log.entity_code}` : ""}
                      </p>
                    </div>
                    <time className="text-muted-foreground shrink-0 text-xs">
                      {new Intl.DateTimeFormat("id-ID", {
                        timeZone: "Asia/Jakarta",
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(log.created_at))}{" "}
                      WIB
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
