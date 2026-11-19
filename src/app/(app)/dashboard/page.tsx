import type { Metadata } from "next";
import {
  AlertTriangle,
  Archive,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth";
import { formatJakartaDate, getJakartaGreeting, getMonthlyUpdatePeriod } from "@/lib/period";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog, MonthlyReconciliation, SubscriptionDirectoryRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Dashboard",
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {user.fullName}
          </h1>
          <p className="text-muted-foreground text-sm">
            Ringkasan operasional Star Champs Indonesia · {todayLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={user.role} showSubtitle />
          <Badge variant="outline">Periode {period.periodLabel}</Badge>
        </div>
      </div>

      {!metrics.schemaReady && (
        <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-100">
              <AlertTriangle className="size-4 shrink-0" />
              Skema Database Supabase Belum Diterapkan
            </CardTitle>
            <CardDescription className="text-amber-800 dark:text-amber-200">
              Jalankan file <code>supabase/schema.sql</code> di Supabase SQL Editor untuk mengaktifkan
              seluruh tabel inti, auto-coding, RLS, dan audit log.
            </CardDescription>
          </CardHeader>
          {metrics.schemaError && (
            <CardContent className="pt-0 text-xs text-amber-900/80 dark:text-amber-200/80">
              Detail: <code>{metrics.schemaError}</code>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Total Item Aktif</span>
              <Package className="text-muted-foreground size-4" />
            </CardDescription>
            <CardTitle className="text-2xl">{metrics.totalItems}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {metrics.activeBorrowsCount} transaksi pinjam aktif saat ini
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Part Kurang & Low-Stock</span>
              <AlertTriangle className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{metrics.partKurangCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {metrics.lowStockCount} barang habis pakai di bawah batas minimum
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Perlu Sanitasi</span>
              <Sparkles className="text-muted-foreground size-4" />
            </CardDescription>
            <CardTitle className="text-2xl">{metrics.needsSanitationCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Mainan terapi berstatus perlu dicuci / sedang disanitasi
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Tiket & Arsip</span>
              <ClipboardCheck className="text-muted-foreground size-4" />
            </CardDescription>
            <CardTitle className="text-2xl">{metrics.pendingRequests}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Menunggu approval · {metrics.totalArchives} berkas di direktori arsip
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {can(user.role, "vault.view_limited") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4" />
                Pengingat Perpanjangan Subscription Vault (H-7)
              </CardTitle>
              <CardDescription>
                Akun digital operasional yang akan jatuh tempo dalam 7 hari ke depan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.expiringSubscriptions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Belum ada langganan yang jatuh tempo dalam 7 hari ke depan.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {metrics.expiringSubscriptions.map((sub) => {
                    const days = daysUntilDate(sub.renewal_date);
                    return (
                      <li
                        key={sub.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
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
                          {days !== null && days <= 0 ? "Jatuh Tempo" : `H-${days}`}
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DatabaseBackup className="size-4" />
                Rekonsiliasi & Siklus Backup ({period.periodLabel})
              </CardTitle>
              <CardDescription>
                Kode Periode <span className="font-mono">{period.periodCode}</span> · Mode pengkinian
                otomatis aktif tiap tanggal 24 pukul 00:00 WIB.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status Pengkinian Data</span>
                <Badge variant={period.active ? "default" : "outline"}>
                  {period.active ? "Aktif (H-7 Akhir Bulan)" : `Jadwal Tanggal 24`}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Progres Stock Opname</span>
                <span className="font-medium">
                  {metrics.reconciliation?.opname_progress_pct ?? 0}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pre-Update Snapshot</span>
                <span className="font-mono text-xs">
                  {metrics.reconciliation?.pre_update_backup_id ? "Tersimpan" : "Belum dibuat"}
                </span>
              </div>
              {can(user.role, "delivery.view") && (
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Truck className="size-3.5" />
                    Pengiriman Berjalan
                  </span>
                  <span className="font-medium">{metrics.activeDeliveries} paket</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!can(user.role, "vault.view_limited") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" />
                Akses Peran {ROLE_LABELS[user.role].title}
              </CardTitle>
              <CardDescription>
                Ringkasan hak akses operasional sesuai matriks RBAC StarOps.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <p>• Scan barcode peminjaman & pengembalian mainan terapi maupun kit.</p>
              <p>• Perbarui status sanitasi/kebersihan mainan dan kelengkapan kepingan.</p>
              <p>• Akses SOP dan dokumen publik di Arsip Hibrida serta buat tiket permintaan.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {can(user.role, "audit.view") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" />
              Aktivitas Terbaru (Audit Trail)
            </CardTitle>
            <CardDescription>
              Log perubahan data real-time dari trigger database Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.recentAudits.length === 0 ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Archive className="size-4" />
                <span>Belum ada catatan aktivitas pada database.</span>
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
                        Oleh {log.actor_name || "Sistem"} ·{" "}
                        <span className="font-mono">{log.action}</span>
                        {log.entity_code ? ` · ${log.entity_code}` : ""}
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
