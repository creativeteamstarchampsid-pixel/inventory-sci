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
  CheckCircle2,
  ClipboardCheck,
  DatabaseBackup,
  History,
  KeyRound,
  Lock,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";

import { RoleBadge } from "@/components/layout/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth";
import { formatDateWIB, LOCATION_LABELS } from "@/lib/constants";
import { formatJakartaDate, getJakartaGreeting, getMonthlyUpdatePeriod } from "@/lib/period";
import { can, canAccessRoute, ROLE_LABELS, type Role } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type {
  AuditLog,
  BorrowStatus,
  LocationCode,
  MonthlyReconciliation,
  SubscriptionDirectoryRow,
} from "@/types/database";

export const metadata: Metadata = {
  title: "Beranda",
};

type ActiveBorrowPreview = {
  id: string;
  transaction_code: string;
  code: string;
  name: string;
  room_code: LocationCode | null;
  borrowed_at: string;
  status: BorrowStatus;
};

type DashboardMetrics = {
  schemaReady: boolean;
  schemaError?: string;
  totalItems: number;
  partKurangCount: number;
  damagedCount: number;
  needsSanitationCount: number;
  lowStockCount: number;
  activeBorrowsCount: number;
  overdueBorrowsCount: number;
  myActiveBorrows: ActiveBorrowPreview[];
  totalArchives: number;
  activeDeliveries: number;
  pendingRequests: number;
  pendingLeaderRequests: number;
  pendingAdminRequests: number;
  pendingOwnerRequests: number;
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
      "Sebagai Owner, Anda memegang kendali penuh operasional serta wewenang pengesahan akhir untuk pembelian beranggaran, penghapusan aset, penguncian laporan bulanan, pemulihan database, dan manajemen seluruh tim.",
    actions: [
      { label: "Pengesahan Menunggu Owner", href: "/requests" },
      { label: "Laporan & Penguncian Bulanan", href: "/backup" },
      { label: "Brankas Akun Digital", href: "/vault" },
      { label: "Kelola Seluruh Tim", href: "/settings" },
    ],
  },
  SUPER_ADMIN: {
    bannerBg:
      "border-violet-200/80 bg-gradient-to-r from-violet-50/90 via-indigo-50/60 to-fuchsia-50/80 dark:border-violet-900/50 dark:from-violet-950/40 dark:to-indigo-950/30",
    summary:
      "Sebagai Admin Operasional, Anda mengelola daftar barang & alat terapi, mencetak stiker barcode, mencatat pengiriman paket, mengatur Brankas Akun Digital, membuat cadangan data, dan mengelola akun Terapis & Kepala Terapis.",
    actions: [
      { label: "Kelola Barang & Alat", href: "/inventory" },
      { label: "Cetak Stiker Barcode", href: "/barcode-studio" },
      { label: "Paket & Pengiriman", href: "/deliveries" },
      { label: "Kelola Akun Tim", href: "/settings" },
    ],
  },
  TEAM_LEADER: {
    bannerBg:
      "border-sky-200/80 bg-gradient-to-r from-sky-50/90 via-cyan-50/60 to-blue-50/80 dark:border-sky-900/50 dark:from-sky-950/40 dark:to-cyan-950/30",
    summary:
      "Sebagai Kepala Terapis, Anda mendampingi tim terapis: meninjau pengajuan tahap pertama, memantau kondisi & kebersihan alat, melakukan stock opname ruangan, serta mengekspor laporan operasional.",
    actions: [
      { label: "Setujui Pengajuan Tim", href: "/requests" },
      { label: "Scan & Opname Ruangan", href: "/scan" },
      { label: "Cek Ruangan & Ekspor", href: "/backup" },
      { label: "Lemari Arsip & SOP", href: "/archives" },
    ],
  },
  STAFF: {
    bannerBg:
      "border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-green-50/80 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-teal-950/30",
    summary:
      "Sebagai Terapis, gunakan menu Pinjam & Kembalikan setiap mengambil atau mengembalikan alat terapi, perbarui status kebersihan selesai sesi, baca Panduan SOP, dan buat pengajuan bila ada alat rusak atau kepingan kurang.",
    actions: [
      { label: "Pinjam / Kembalikan Alat", href: "/scan" },
      { label: "Lihat Alat & Mainan", href: "/inventory" },
      { label: "Paket Alat (Kit)", href: "/kits" },
      { label: "Pengajuan Saya", href: "/requests" },
      { label: "Panduan SOP", href: "/archives" },
    ],
  },
};

async function loadDashboardMetrics(
  userId: string,
  role: Role,
  periodCode: string,
): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const isStaff = role === "STAFF";

  const itemsQuery = supabase
    .from("items_master")
    .select("id, asset_type, condition, hygiene_status, stock_qty, min_stock_threshold", {
      count: "exact",
    })
    .is("deleted_at", null);

  const borrowsBase = supabase
    .from("borrow_transactions")
    .select("id, transaction_code, item_id, kit_id, room_code, borrowed_at, status", {
      count: "exact",
    })
    .in("status", ["DIPINJAM", "TERLAMBAT"])
    .order("borrowed_at", { ascending: false });

  const borrowsQuery = isStaff ? borrowsBase.eq("borrower_id", userId).limit(5) : borrowsBase;

  const archivesQuery = supabase
    .from("archives_hybrid")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const requestsBase = supabase
    .from("internal_requests")
    .select("id, status")
    .is("deleted_at", null)
    .in("status", ["MENUNGGU_TEAM_LEADER", "MENUNGGU_ADMIN", "MENUNGGU_OWNER"]);

  const requestsQuery = isStaff ? requestsBase.eq("requested_by", userId) : requestsBase;

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
      damagedCount: 0,
      needsSanitationCount: 0,
      lowStockCount: 0,
      activeBorrowsCount: 0,
      overdueBorrowsCount: 0,
      myActiveBorrows: [],
      totalArchives: 0,
      activeDeliveries: 0,
      pendingRequests: 0,
      pendingLeaderRequests: 0,
      pendingAdminRequests: 0,
      pendingOwnerRequests: 0,
      expiringSubscriptions: [],
      reconciliation: null,
      recentAudits: [],
    };
  }

  const items = itemsRes.data ?? [];
  const partKurangCount = items.filter((item) => item.condition === "PART_KURANG").length;
  const damagedCount = items.filter(
    (item) =>
      item.condition === "PART_KURANG" ||
      item.condition === "RUSAK_RINGAN" ||
      item.condition === "RUSAK_BERAT",
  ).length;
  const needsSanitationCount = items.filter(
    (item) => item.asset_type === "THERAPY_TOY" && item.hygiene_status !== "STERIL",
  ).length;
  const lowStockCount = items.filter(
    (item) =>
      item.asset_type === "CONSUMABLE" &&
      item.min_stock_threshold > 0 &&
      item.stock_qty <= item.min_stock_threshold,
  ).length;

  const activeBorrows = borrowsRes.data ?? [];
  const overdueBorrowsCount = activeBorrows.filter((b) => b.status === "TERLAMBAT").length;

  let myActiveBorrows: ActiveBorrowPreview[] = [];
  if (isStaff && activeBorrows.length > 0) {
    const itemIds = Array.from(
      new Set(activeBorrows.map((b) => b.item_id).filter((id): id is string => Boolean(id))),
    );
    const kitIds = Array.from(
      new Set(activeBorrows.map((b) => b.kit_id).filter((id): id is string => Boolean(id))),
    );
    const [bItemsRes, bKitsRes] = await Promise.all([
      itemIds.length > 0
        ? supabase.from("items_master").select("id, item_code, name").in("id", itemIds)
        : Promise.resolve({ data: [] }),
      kitIds.length > 0
        ? supabase.from("item_kits").select("id, kit_code, kit_name").in("id", kitIds)
        : Promise.resolve({ data: [] }),
    ]);

    const itemMap = new Map((bItemsRes.data ?? []).map((i) => [i.id, i]));
    const kitMap = new Map((bKitsRes.data ?? []).map((k) => [k.id, k]));

    myActiveBorrows = activeBorrows.map((b) => {
      const it = b.item_id ? itemMap.get(b.item_id) : undefined;
      const kt = b.kit_id ? kitMap.get(b.kit_id) : undefined;
      return {
        id: b.id,
        transaction_code: b.transaction_code,
        code: it?.item_code ?? kt?.kit_code ?? "-",
        name: it?.name ?? kt?.kit_name ?? "Alat / Paket Terapi",
        room_code: b.room_code,
        borrowed_at: b.borrowed_at,
        status: b.status,
      };
    });
  }

  const pendingReqRows = requestsRes.data ?? [];
  const pendingLeaderRequests = pendingReqRows.filter(
    (r) => r.status === "MENUNGGU_TEAM_LEADER",
  ).length;
  const pendingAdminRequests = pendingReqRows.filter((r) => r.status === "MENUNGGU_ADMIN").length;
  const pendingOwnerRequests = pendingReqRows.filter((r) => r.status === "MENUNGGU_OWNER").length;

  const [activeDeliveries, expiringSubscriptions, reconciliation, recentAudits] = await Promise.all([
    can(role, "delivery.view")
      ? supabase
          .from("deliveries_log")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .in("status", ["DRAFT", "DIKEMAS", "DALAM_PERJALANAN"])
          .then((res) => res.count ?? 0)
      : Promise.resolve(0),
    can(role, "vault.view_limited")
      ? supabase
          .from("subscriptions_vault_directory")
          .select("*")
          .eq("is_active", true)
          .order("renewal_date", { ascending: true })
          .then((res) =>
            (res.data ?? []).filter((sub) => {
              const diff = daysUntilDate(sub.renewal_date);
              return diff !== null && diff <= 7;
            }),
          )
      : Promise.resolve([] as SubscriptionDirectoryRow[]),
    can(role, "reconciliation.submit")
      ? supabase
          .from("monthly_reconciliations")
          .select("*")
          .eq("period_ym", periodCode)
          .maybeSingle()
          .then((res) => res.data ?? null)
      : Promise.resolve(null as MonthlyReconciliation | null),
    can(role, "audit.view")
      ? supabase
          .from("audit_logs")
          .select("id, actor_name, action, entity_type, entity_code, summary, created_at")
          .order("created_at", { ascending: false })
          .limit(8)
          .then((res) => res.data ?? [])
      : Promise.resolve([] as DashboardMetrics["recentAudits"]),
  ]);

  return {
    schemaReady: true,
    totalItems: itemsRes.count ?? items.length,
    partKurangCount,
    damagedCount,
    needsSanitationCount,
    lowStockCount,
    activeBorrowsCount: borrowsRes.count ?? activeBorrows.length,
    overdueBorrowsCount,
    myActiveBorrows,
    totalArchives: archivesRes.count ?? 0,
    activeDeliveries,
    pendingRequests: pendingReqRows.length,
    pendingLeaderRequests,
    pendingAdminRequests,
    pendingOwnerRequests,
    expiringSubscriptions,
    reconciliation,
    recentAudits,
  };
}

export default async function DashboardPage() {
  const user = await requireRouteAccess("/dashboard");
  const period = getMonthlyUpdatePeriod();
  const greeting = getJakartaGreeting();
  const todayLabel = formatJakartaDate();
  const metrics = await loadDashboardMetrics(user.id, user.role, period.periodCode);
  const roleTip = ROLE_QUICK_TIPS[user.role];
  const visibleActions = roleTip.actions.filter((act) => canAccessRoute(user.role, act.href));

  const isStaff = user.role === "STAFF";
  const isTeamLeader = user.role === "TEAM_LEADER";
  const isOwner = user.role === "OWNER";
  const isAdmin = can(user.role, "backup.view");

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
            {visibleActions.map((act) => (
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
            <Button
              asChild
              size="sm"
              className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Link href="/guide">
                <BookOpen className="size-3.5" />
                <span>Panduan Peran Saya</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Role-Specific 4 Summary KPI Cards */}
      {isStaff && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/scan" className="group block">
            <Card className="h-full border-sky-200/70 bg-gradient-to-br from-sky-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-sky-900/40 dark:from-sky-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-sky-900/80 dark:text-sky-200">
                  <span>Pinjaman Aktif Anda</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-300">
                    <ArrowLeftRight className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-sky-950 dark:text-sky-100">
                  {metrics.activeBorrowsCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                Alat atau paket kit yang sedang Anda pinjam
              </CardContent>
            </Card>
          </Link>

          <Link href="/inventory" className="group block">
            <Card className="h-full border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-emerald-900/80 dark:text-emerald-200">
                  <span>Perlu Dicuci / Disanitasi</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
                    <Sparkles className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-emerald-950 dark:text-emerald-100">
                  {metrics.needsSanitationCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                Mainan terapi yang perlu dibersihkan sebelum sesi
              </CardContent>
            </Card>
          </Link>

          <Link href="/inventory" className="group block">
            <Card className="h-full border-amber-200/70 bg-gradient-to-br from-amber-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-amber-900/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-amber-900/80 dark:text-amber-200">
                  <span>Kepingan Kurang / Rusak</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
                    <AlertTriangle className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-amber-950 dark:text-amber-100">
                  {metrics.damagedCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                <strong>{metrics.partKurangCount}</strong> mainan berstatus kepingan kurang
              </CardContent>
            </Card>
          </Link>

          <Link href="/requests" className="group block">
            <Card className="h-full border-rose-200/70 bg-gradient-to-br from-rose-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-rose-900/40 dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-rose-900/80 dark:text-rose-200">
                  <span>Pengajuan Saya &amp; SOP</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300">
                    <ClipboardCheck className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-rose-950 dark:text-rose-100">
                  {metrics.pendingRequests}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                Pengajuan aktif · <strong>{metrics.totalArchives}</strong> Panduan SOP tersedia
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {isTeamLeader && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/requests" className="group block">
            <Card className="h-full border-rose-200/70 bg-gradient-to-br from-rose-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-rose-900/40 dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-rose-900/80 dark:text-rose-200">
                  <span>Menunggu Persetujuan Anda</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300">
                    <ClipboardCheck className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-rose-950 dark:text-rose-100">
                  {metrics.pendingLeaderRequests}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                Dari total <strong>{metrics.pendingRequests}</strong> pengajuan tim yang aktif
              </CardContent>
            </Card>
          </Link>

          <Link href="/scan" className="group block">
            <Card className="h-full border-sky-200/70 bg-gradient-to-br from-sky-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-sky-900/40 dark:from-sky-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-sky-900/80 dark:text-sky-200">
                  <span>Alat Sedang Dipinjam</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-300">
                    <ArrowLeftRight className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-sky-950 dark:text-sky-100">
                  {metrics.activeBorrowsCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                <strong>{metrics.overdueBorrowsCount}</strong> terlambat · {metrics.totalItems} total
                alat aktif
              </CardContent>
            </Card>
          </Link>

          <Link href="/inventory" className="group block">
            <Card className="h-full border-amber-200/70 bg-gradient-to-br from-amber-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-amber-900/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-amber-900/80 dark:text-amber-200">
                  <span>Kepingan Kurang &amp; Rusak</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
                    <AlertTriangle className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-amber-950 dark:text-amber-100">
                  {metrics.damagedCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                <strong>{metrics.partKurangCount}</strong> mainan perlu cek kelengkapan kepingan
              </CardContent>
            </Card>
          </Link>

          <Link href="/inventory" className="group block">
            <Card className="h-full border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-emerald-900/80 dark:text-emerald-200">
                  <span>Perlu Dicuci / Disanitasi</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
                    <Sparkles className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-emerald-950 dark:text-emerald-100">
                  {metrics.needsSanitationCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                Mainan terapi yang belum berstatus Steril
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isOwner ? (
            <Link href="/requests" className="group block">
              <Card className="h-full border-amber-300/80 bg-gradient-to-br from-amber-50/80 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-amber-800/50 dark:from-amber-950/40 dark:via-slate-900 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center justify-between font-medium text-amber-900/90 dark:text-amber-200">
                    <span>Menunggu Pengesahan Owner</span>
                    <span className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                      <ShieldCheck className="size-4" />
                    </span>
                  </CardDescription>
                  <CardTitle className="text-3xl font-bold text-amber-950 dark:text-amber-100">
                    {metrics.pendingOwnerRequests}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-xs">
                  Dari total <strong>{metrics.pendingRequests}</strong> pengajuan aktif tim
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Link href="/inventory" className="group block">
              <Card className="h-full border-sky-200/70 bg-gradient-to-br from-sky-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-sky-900/40 dark:from-sky-950/30 dark:via-slate-900 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center justify-between font-medium text-sky-900/80 dark:text-sky-200">
                    <span>Total Barang &amp; Alat</span>
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
          )}

          {isOwner ? (
            <Link href="/inventory" className="group block">
              <Card className="h-full border-sky-200/70 bg-gradient-to-br from-sky-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-sky-900/40 dark:from-sky-950/30 dark:via-slate-900 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center justify-between font-medium text-sky-900/80 dark:text-sky-200">
                    <span>Total Barang &amp; Alat</span>
                    <span className="flex size-8 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-300">
                      <Package className="size-4" />
                    </span>
                  </CardDescription>
                  <CardTitle className="text-3xl font-bold text-sky-950 dark:text-sky-100">
                    {metrics.totalItems}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-xs">
                  <strong>{metrics.activeBorrowsCount}</strong> dipinjam ·{" "}
                  <strong>{metrics.partKurangCount}</strong> part kurang
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Link href="/inventory" className="group block">
              <Card className="h-full border-amber-200/70 bg-gradient-to-br from-amber-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-amber-900/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center justify-between font-medium text-amber-900/80 dark:text-amber-200">
                    <span>Kepingan Kurang &amp; Stok Tipis</span>
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
          )}

          <Link href="/inventory" className="group block">
            <Card className="h-full border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between font-medium text-emerald-900/80 dark:text-emerald-200">
                  <span>{isOwner ? "Stok Tipis & Sanitasi" : "Perlu Dicuci / Dibersihkan"}</span>
                  <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
                    <Sparkles className="size-4" />
                  </span>
                </CardDescription>
                <CardTitle className="text-3xl font-bold text-emerald-950 dark:text-emerald-100">
                  {isOwner ? metrics.lowStockCount : metrics.needsSanitationCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                {isOwner ? (
                  <>
                    Habis pakai menipis · <strong>{metrics.needsSanitationCount}</strong> mainan
                    perlu cuci
                  </>
                ) : (
                  "Mainan terapi yang perlu dicuci sebelum dipakai lagi"
                )}
              </CardContent>
            </Card>
          </Link>

          {isOwner ? (
            <Link href="/backup" className="group block">
              <Card className="h-full border-indigo-200/70 bg-gradient-to-br from-indigo-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-indigo-900/40 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center justify-between font-medium text-indigo-900/80 dark:text-indigo-200">
                    <span>Status Penguncian Bulanan</span>
                    <span className="flex size-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-300">
                      <Lock className="size-4" />
                    </span>
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold text-indigo-950 dark:text-indigo-100">
                    {metrics.reconciliation?.locked_at
                      ? "Terkunci"
                      : `${metrics.reconciliation?.opname_progress_pct ?? 0}%`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-xs">
                  {metrics.reconciliation?.locked_at
                    ? `Periode ${period.periodLabel} telah disahkan Owner`
                    : `Progres opname ${period.periodLabel} · ${metrics.totalArchives} dokumen arsip`}
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Link href="/requests" className="group block">
              <Card className="h-full border-rose-200/70 bg-gradient-to-br from-rose-50/70 via-white to-white transition-all group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-rose-900/40 dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center justify-between font-medium text-rose-900/80 dark:text-rose-200">
                    <span>Antrean Verifikasi Admin</span>
                    <span className="flex size-8 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300">
                      <ClipboardCheck className="size-4" />
                    </span>
                  </CardDescription>
                  <CardTitle className="text-3xl font-bold text-rose-950 dark:text-rose-100">
                    {metrics.pendingAdminRequests}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-xs">
                  Total <strong>{metrics.pendingRequests}</strong> pengajuan aktif ·{" "}
                  <strong>{metrics.totalArchives}</strong> dokumen arsip
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* Role-Specific Operational Widgets (Balanced 2-Column Grid) */}
      {isStaff && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-sky-200/60 dark:border-sky-900/40">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    <ArrowLeftRight className="size-4" />
                  </span>
                  Pinjaman Aktif Anda Saat Ini
                </CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/scan">Buka Scanner →</Link>
                </Button>
              </div>
              <CardDescription>
                Daftar alat atau paket kit yang sedang atas nama Anda dan belum dikembalikan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.myActiveBorrows.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-start gap-3 rounded-xl border border-dashed p-4 text-sm">
                  <p>Tidak ada alat terapi yang sedang Anda pinjam saat ini.</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/scan">
                      <ArrowLeftRight className="mr-1.5 size-3.5" />
                      Mulai Scan Pinjam Alat
                    </Link>
                  </Button>
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {metrics.myActiveBorrows.map((borrow) => (
                    <li
                      key={borrow.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {borrow.name}{" "}
                          <span className="text-muted-foreground font-mono text-xs">
                            ({borrow.code})
                          </span>
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {borrow.room_code ? LOCATION_LABELS[borrow.room_code] : "Ruang Terapi"} ·{" "}
                          {formatDateWIB(borrow.borrowed_at, true)}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/scan?code=${encodeURIComponent(borrow.code)}`}>
                          Kembalikan
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-200/60 dark:border-emerald-900/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CalendarClock className="size-4" />
                </span>
                Checklist Harian {ROLE_LABELS.STAFF.title}
              </CardTitle>
              <CardDescription>
                Langkah praktis yang paling sering Anda gunakan di ruang terapi:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50/60 p-2.5 dark:bg-emerald-950/30">
                <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  <strong>Pinjam &amp; Kembalikan Alat:</strong> Scan stiker barcode sebelum membawa
                  mainan ke ruang terapi dan saat mengembalikannya ke rak.
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-sky-50/60 p-2.5 dark:bg-sky-950/30">
                <Boxes className="mt-0.5 size-4 shrink-0 text-sky-600" />
                <p>
                  <strong>Cek Kepingan &amp; Kebersihan:</strong> Hitung jumlah kepingan mainan
                  selesai sesi dan ubah statusnya menjadi <em>Perlu Dicuci</em> bila sudah dipakai.
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-teal-50/60 p-2.5 dark:bg-teal-950/30">
                <Archive className="mt-0.5 size-4 shrink-0 text-teal-600" />
                <p>
                  <strong>Panduan SOP &amp; Pengajuan:</strong> Baca dokumen resmi di menu{" "}
                  <Link href="/archives" className="font-semibold underline underline-offset-2">
                    Panduan SOP
                  </Link>{" "}
                  atau laporkan alat rusak di{" "}
                  <Link href="/requests" className="font-semibold underline underline-offset-2">
                    Pengajuan Saya
                  </Link>
                  .
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isTeamLeader && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-indigo-200/60 dark:border-indigo-900/40">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    <DatabaseBackup className="size-4" />
                  </span>
                  Cek Ruangan Akhir Bulan ({period.periodLabel})
                </CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/backup">Buka Checklist →</Link>
                </Button>
              </div>
              <CardDescription>
                Setiap tanggal 24 hingga akhir bulan, pastikan seluruh ruangan terapi telah dicek
                kelengkapan alatnya.
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
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-muted-foreground">Persetujuan Kepala Terapis</span>
                <Badge variant={metrics.reconciliation?.approved_by_leader ? "secondary" : "outline"}>
                  {metrics.reconciliation?.approved_by_leader
                    ? "Sudah Disetujui"
                    : "Belum Disetujui"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sky-200/60 dark:border-sky-900/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  <CheckCircle2 className="size-4" />
                </span>
                Fokus Koordinasi {ROLE_LABELS.TEAM_LEADER.title}
              </CardTitle>
              <CardDescription>
                Tugas harian utama untuk menjaga operasional ruang terapi berjalan tertib:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2.5 rounded-xl bg-rose-50/60 p-2.5 dark:bg-rose-950/30">
                <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-rose-600" />
                <p>
                  <strong>Persetujuan Tahap 1:</strong> Tinjau pengajuan dari tim terapis di menu{" "}
                  <Link href="/requests" className="font-semibold underline underline-offset-2">
                    Pengajuan &amp; Persetujuan
                  </Link>{" "}
                  ({metrics.pendingLeaderRequests} menunggu).
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50/60 p-2.5 dark:bg-emerald-950/30">
                <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  <strong>Stock Opname &amp; Pengembalian:</strong> Gunakan{" "}
                  <Link href="/scan" className="font-semibold underline underline-offset-2">
                    Pinjam, Kembali &amp; Opname
                  </Link>{" "}
                  untuk memvalidasi kelengkapan kepingan &amp; kebersihan ruangan.
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-sky-50/60 p-2.5 dark:bg-sky-950/30">
                <Archive className="mt-0.5 size-4 shrink-0 text-sky-600" />
                <p>
                  <strong>Dokumen &amp; Ekspor Operasional:</strong> Akses{" "}
                  <Link href="/archives" className="font-semibold underline underline-offset-2">
                    Lemari Arsip &amp; SOP
                  </Link>{" "}
                  ({metrics.totalArchives} dokumen) dan unduh ekspor operasional di{" "}
                  <Link href="/backup" className="font-semibold underline underline-offset-2">
                    Cek Ruangan &amp; Ekspor
                  </Link>
                  .
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isAdmin && (
        <div className="grid gap-4 lg:grid-cols-2">
          {can(user.role, "vault.view_limited") && (
            <Card className="border-cyan-200/60 dark:border-cyan-900/40">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                      <KeyRound className="size-4" />
                    </span>
                    Pengingat Tagihan Langganan Digital (7 Hari)
                  </CardTitle>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/vault">Buka Brankas →</Link>
                  </Button>
                </div>
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

          {can(user.role, "backup.view") && (
            <Card className="border-indigo-200/60 dark:border-indigo-900/40">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      <DatabaseBackup className="size-4" />
                    </span>
                    Akhir Bulan &amp; Cadangan Data ({period.periodLabel})
                  </CardTitle>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/backup">Buka Laporan →</Link>
                  </Button>
                </div>
                <CardDescription>
                  Rekonsiliasi opname ruangan, status pengesahan, cadangan data &amp; logistik
                  aktif.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status Jadwal Bulan Ini</span>
                  <Badge variant={period.active ? "default" : "outline"}>
                    {period.active
                      ? "Sedang Berjalan (Minggu Terakhir)"
                      : "Dimulai Setiap Tanggal 24"}
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
                    {metrics.reconciliation?.pre_update_backup_id
                      ? "Sudah Tersimpan"
                      : "Belum Dibuat"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status Kunci Owner</span>
                  <Badge variant={metrics.reconciliation?.locked_at ? "secondary" : "outline"}>
                    {metrics.reconciliation?.locked_at
                      ? "Sudah Dikunci Owner"
                      : "Belum Dikunci"}
                  </Badge>
                </div>
                {can(user.role, "delivery.view") && (
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Truck className="size-3.5 text-orange-500" />
                      Paket Pengiriman Sedang Jalan
                    </span>
                    <Link
                      href="/deliveries"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {metrics.activeDeliveries} paket
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recent Activity (ADMINS only — Owner & Admin Operasional) */}
      {can(user.role, "audit.view") && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  <History className="size-4" />
                </span>
                Kegiatan Terbaru Tim
              </CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link href="/audit-log">Lihat Semua Riwayat →</Link>
              </Button>
            </div>
            <CardDescription>
              Catatan otomatis setiap ada anggota tim yang menambah, meminjam, atau memperbarui
              data.
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
