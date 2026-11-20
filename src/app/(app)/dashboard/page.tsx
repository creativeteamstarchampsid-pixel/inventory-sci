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

import { KawaiiEmptyState, KawaiiStatCard } from "@/components/cartoon/kawaii-decor";
import { KawaiiMascotSvg, type KawaiiMascotType } from "@/components/cartoon/kawaii-icons";
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
    heroBg: string;
    bubbleBg: string;
    bubbleTailBg: string;
    pillBg: string;
    heroMascot: KawaiiMascotType;
    bubbleMascot: KawaiiMascotType;
    cheerLabel: string;
    summary: string;
    actions: { label: string; href: string }[];
  }
> = {
  OWNER: {
    heroBg:
      "bg-gradient-to-br from-[#FEF3C7] via-[#FFEDD5] to-[#FFFDF7] dark:from-amber-950/60 dark:via-orange-950/40 dark:to-stone-900",
    bubbleBg:
      "bg-gradient-to-r from-[#FEF3C7]/90 via-[#FFFDF7] to-[#FFEDD5]/85 dark:from-amber-950/45 dark:via-stone-900 dark:to-orange-950/35",
    bubbleTailBg: "bg-[#FEF3C7] dark:bg-amber-950/60",
    pillBg: "bg-[#FDE68A] text-[#2C2623] dark:bg-amber-900/70 dark:text-amber-100",
    heroMascot: "star",
    bubbleMascot: "chiikawa",
    cheerLabel: "Mode Kendali Penuh ✨",
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
    heroBg:
      "bg-gradient-to-br from-[#EDE9FE] via-[#FFE4E6]/70 to-[#FFFDF7] dark:from-violet-950/60 dark:via-rose-950/30 dark:to-stone-900",
    bubbleBg:
      "bg-gradient-to-r from-[#EDE9FE]/90 via-[#FFFDF7] to-[#FFE4E6]/80 dark:from-violet-950/45 dark:via-stone-900 dark:to-rose-950/30",
    bubbleTailBg: "bg-[#EDE9FE] dark:bg-violet-950/60",
    pillBg: "bg-[#DDD6FE] text-[#2C2623] dark:bg-violet-900/70 dark:text-violet-100",
    heroMascot: "chiikawa",
    bubbleMascot: "dino",
    cheerLabel: "Siap Kelola Operasional! ♪",
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
    heroBg:
      "bg-gradient-to-br from-[#E0F2FE] via-[#D1FAE5]/70 to-[#FFFDF7] dark:from-sky-950/60 dark:via-emerald-950/35 dark:to-stone-900",
    bubbleBg:
      "bg-gradient-to-r from-[#E0F2FE]/90 via-[#FFFDF7] to-[#D1FAE5]/80 dark:from-sky-950/45 dark:via-stone-900 dark:to-emerald-950/30",
    bubbleTailBg: "bg-[#E0F2FE] dark:bg-sky-950/60",
    pillBg: "bg-[#BAE6FD] text-[#2C2623] dark:bg-sky-900/70 dark:text-sky-100",
    heroMascot: "cat",
    bubbleMascot: "dino",
    cheerLabel: "Semangat Koordinasi Tim! 🌟",
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
    heroBg:
      "bg-gradient-to-br from-[#D1FAE5] via-[#FEF3C7]/65 to-[#FFFDF7] dark:from-emerald-950/60 dark:via-amber-950/30 dark:to-stone-900",
    bubbleBg:
      "bg-gradient-to-r from-[#D1FAE5]/90 via-[#FFFDF7] to-[#FEF3C7]/75 dark:from-emerald-950/45 dark:via-stone-900 dark:to-amber-950/30",
    bubbleTailBg: "bg-[#D1FAE5] dark:bg-emerald-950/60",
    pillBg: "bg-[#A7F3D0] text-[#2C2623] dark:bg-emerald-900/70 dark:text-emerald-100",
    heroMascot: "dino",
    bubbleMascot: "chiikawa",
    cheerLabel: "Semangat Sesi Terapi! 💚",
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

type QuickShortcutTile = {
  href: string;
  label: string;
  hint: string;
  mascot: KawaiiMascotType;
  tileBg: string;
};

function getQuickShortcutTiles(role: Role): QuickShortcutTile[] {
  const isStaff = role === "STAFF";
  const isTeamLeader = role === "TEAM_LEADER";
  const isAdmin = can(role, "backup.view");

  const tiles: QuickShortcutTile[] = [
    {
      href: "/scan",
      label: isTeamLeader ? "Scan & Opname" : "Pinjam & Kembali",
      hint: "Scan barcode cepat",
      mascot: "scan",
      tileBg: "bg-[#D1FAE5] dark:bg-emerald-950/55",
    },
    {
      href: "/inventory",
      label: "Barang & Alat",
      hint: "Stok & sanitasi",
      mascot: "box",
      tileBg: "bg-[#E0F2FE] dark:bg-sky-950/55",
    },
    {
      href: "/kits",
      label: "Paket Alat (Kit)",
      hint: "Kotak siap pakai",
      mascot: "star",
      tileBg: "bg-[#FEF3C7] dark:bg-amber-950/55",
    },
    {
      href: "/requests",
      label: isStaff ? "Pengajuan Saya" : "Pengajuan Tim",
      hint: isStaff ? "Lapor & ajukan" : "Persetujuan cepat",
      mascot: "clipboard",
      tileBg: "bg-[#FFE4E6] dark:bg-rose-950/55",
    },
    {
      href: "/archives",
      label: isStaff ? "Panduan SOP" : "Arsip & SOP",
      hint: "Dokumen resmi",
      mascot: "folder",
      tileBg: "bg-[#EDE9FE] dark:bg-violet-950/55",
    },
    {
      href: "/barcode-studio",
      label: "Stiker Barcode",
      hint: "Cetak label rapi",
      mascot: "barcode",
      tileBg: "bg-[#FFEDD5] dark:bg-orange-950/55",
    },
    {
      href: "/deliveries",
      label: "Pengiriman",
      hint: "Paket & surat jalan",
      mascot: "truck",
      tileBg: "bg-[#FEF3C7] dark:bg-amber-950/55",
    },
    {
      href: "/vault",
      label: "Brankas Digital",
      hint: "Akun langganan",
      mascot: "vault",
      tileBg: "bg-[#E0F2FE] dark:bg-sky-950/55",
    },
    {
      href: "/backup",
      label: isTeamLeader ? "Cek Ruangan" : "Laporan & Backup",
      hint: isTeamLeader ? "Opname & ekspor" : "Cadangan & kunci",
      mascot: "backup",
      tileBg: "bg-[#D1FAE5] dark:bg-emerald-950/55",
    },
    {
      href: "/audit-log",
      label: "Riwayat Tim",
      hint: "Jejak aktivitas",
      mascot: "history",
      tileBg: "bg-[#EDE9FE] dark:bg-violet-950/55",
    },
    {
      href: "/recycle-bin",
      label: "Tempat Sampah",
      hint: "Pulihkan 30 hari",
      mascot: "trash",
      tileBg: "bg-[#FFE4E6] dark:bg-rose-950/55",
    },
    {
      href: "/settings",
      label: isAdmin ? "Tim & Pengaturan" : "Profil Saya",
      hint: isAdmin ? "Kelola akun tim" : "Info akun pribadi",
      mascot: "gear",
      tileBg: "bg-[#FFEDD5] dark:bg-orange-950/55",
    },
  ];

  return tiles.filter((tile) => canAccessRoute(role, tile.href));
}

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
  const quickShortcuts = getQuickShortcutTiles(user.role);

  const isStaff = user.role === "STAFF";
  const isTeamLeader = user.role === "TEAM_LEADER";
  const isOwner = user.role === "OWNER";
  const isAdmin = can(user.role, "backup.view");
  const opnameProgress = Math.min(100, Math.max(0, metrics.reconciliation?.opname_progress_pct ?? 0));

  return (
    <div className="space-y-6 pb-4">
      {/* 2D Japanese Cartoon Storybook Greeting Hero Banner */}
      <section
        className={`relative overflow-hidden rounded-3xl border-2 border-[#2C2623] p-5 shadow-[4px_4px_0px_0px_#2C2623] sm:p-6 dark:border-stone-500 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)] ${roleTip.heroBg}`}
      >
        {/* Hand-drawn doodle clouds & sparkles decoration */}
        <svg
          aria-hidden
          viewBox="0 0 220 90"
          className="animate-cloud-2d pointer-events-none absolute -top-2 right-4 hidden w-44 opacity-70 sm:block dark:opacity-25 print:hidden"
        >
          <path
            d="M36 66h86a19 19 0 0 0 3-37.7A27 27 0 0 0 72 20a24 24 0 0 0-30 19.6A17 17 0 0 0 36 66Z"
            fill="#FFFDF7"
            stroke="#2C2623"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M174 22l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z"
            fill="#FDE68A"
            stroke="#2C2623"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M198 52l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"
            fill="#FDA4AF"
            stroke="#2C2623"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="150" cy="60" r="4" fill="#7CC4FA" stroke="#2C2623" strokeWidth="1.8" />
        </svg>

        <div className="relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* Cute Mascot Sticker Frame */}
            <div className="relative shrink-0">
              <div className="flex size-20 -rotate-2 items-center justify-center rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] p-2 shadow-[3px_3px_0px_0px_#2C2623] transition-transform hover:rotate-2 dark:border-stone-500 dark:bg-stone-900">
                <KawaiiMascotSvg type={roleTip.heroMascot} className="animate-float-2d-slow size-16" />
              </div>
              <span className="absolute -right-2 -bottom-2 inline-flex items-center rounded-full border-2 border-[#2C2623] bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-500">
                Halo! ♪
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border-2 border-[#2C2623] px-3 py-0.5 text-xs font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 ${roleTip.pillBg}`}
                >
                  <Sparkles className="size-3.5" />
                  <span>{roleTip.cheerLabel}</span>
                </span>
                <span className="inline-flex items-center rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-3 py-0.5 text-xs font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100">
                  Bulan {period.periodLabel}
                </span>
              </div>

              <h1 className="text-2xl font-black tracking-tight text-[#2C2623] sm:text-3xl dark:text-stone-100">
                {greeting}, {user.fullName} 👋
              </h1>
              <p className="text-sm font-medium text-[#574E49] dark:text-stone-300">
                Ringkasan kegiatan Star Champs Indonesia · {todayLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 lg:flex-col lg:items-end">
            <RoleBadge
              role={user.role}
              showSubtitle
              className="border-2 border-[#2C2623] px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500"
            />
            <Button
              asChild
              size="sm"
              className="gap-1.5 rounded-2xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#239c62] active:translate-y-0 dark:border-stone-500"
            >
              <Link href="/guide">
                <BookOpen className="size-4" />
                <span>Panduan Peran Saya</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Role Quick-Tips Speech-Bubble Card */}
      <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
        {/* Mini Buddy Avatar next to Speech Bubble */}
        <div className="hidden shrink-0 flex-col items-center gap-1 lg:flex">
          <div className="flex size-16 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] p-2 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
            <KawaiiMascotSvg type={roleTip.bubbleMascot} className="size-12" />
          </div>
          <span className="rounded-full border border-[#2C2623] bg-[#FFE4E6] px-2 py-0.5 text-[10px] font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-rose-950/70 dark:text-rose-100">
            Tips!
          </span>
        </div>

        {/* Speech Bubble Container */}
        <div
          className={`relative flex-1 rounded-3xl border-2 border-[#2C2623] p-5 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)] ${roleTip.bubbleBg}`}
        >
          {/* Speech Bubble Comic Tail (Desktop) */}
          <span
            aria-hidden
            className={`absolute top-1/2 -left-2.5 hidden size-5 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-[#2C2623] lg:block dark:border-stone-500 ${roleTip.bubbleTailBg}`}
          />

          <div className="relative z-10 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-3 py-0.5 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100">
                  💬 Peran Anda: {ROLE_LABELS[user.role].title} ({ROLE_LABELS[user.role].subtitle})
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed font-medium text-[#463F3A] dark:text-stone-200">
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
                  className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <Link href={act.href}>
                    <span>{act.label}</span>
                    <ArrowRight className="ml-1 size-3.5" />
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Role-Specific 4 Pastel Comic KPI Stat Cards */}
      {isStaff && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KawaiiStatCard
            label="Pinjaman Aktif Anda"
            value={metrics.activeBorrowsCount}
            hint="Alat atau paket kit yang sedang Anda pinjam"
            accent="sky"
            href="/scan"
            icon={<ArrowLeftRight className="size-4" />}
          />
          <KawaiiStatCard
            label="Perlu Dicuci / Disanitasi"
            value={metrics.needsSanitationCount}
            hint="Mainan terapi yang perlu dibersihkan sebelum sesi"
            accent="mint"
            href="/inventory"
            icon={<Sparkles className="size-4" />}
          />
          <KawaiiStatCard
            label="Kepingan Kurang / Rusak"
            value={metrics.damagedCount}
            hint={`${metrics.partKurangCount} mainan berstatus kepingan kurang`}
            accent="butter"
            href="/inventory"
            icon={<AlertTriangle className="size-4" />}
          />
          <KawaiiStatCard
            label="Pengajuan Saya & SOP"
            value={metrics.pendingRequests}
            hint={`Pengajuan aktif · ${metrics.totalArchives} Panduan SOP tersedia`}
            accent="pink"
            href="/requests"
            icon={<ClipboardCheck className="size-4" />}
          />
        </div>
      )}

      {isTeamLeader && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KawaiiStatCard
            label="Menunggu Persetujuan Anda"
            value={metrics.pendingLeaderRequests}
            hint={`Dari total ${metrics.pendingRequests} pengajuan tim yang aktif`}
            accent="pink"
            href="/requests"
            icon={<ClipboardCheck className="size-4" />}
          />
          <KawaiiStatCard
            label="Alat Sedang Dipinjam"
            value={metrics.activeBorrowsCount}
            hint={`${metrics.overdueBorrowsCount} terlambat · ${metrics.totalItems} total alat aktif`}
            accent="sky"
            href="/scan"
            icon={<ArrowLeftRight className="size-4" />}
          />
          <KawaiiStatCard
            label="Kepingan Kurang & Rusak"
            value={metrics.damagedCount}
            hint={`${metrics.partKurangCount} mainan perlu cek kelengkapan kepingan`}
            accent="butter"
            href="/inventory"
            icon={<AlertTriangle className="size-4" />}
          />
          <KawaiiStatCard
            label="Perlu Dicuci / Disanitasi"
            value={metrics.needsSanitationCount}
            hint="Mainan terapi yang belum berstatus Steril"
            accent="mint"
            href="/inventory"
            icon={<Sparkles className="size-4" />}
          />
        </div>
      )}

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isOwner ? (
            <KawaiiStatCard
              label="Menunggu Pengesahan Owner"
              value={metrics.pendingOwnerRequests}
              hint={`Dari total ${metrics.pendingRequests} pengajuan aktif tim`}
              accent="butter"
              href="/requests"
              icon={<ShieldCheck className="size-4" />}
            />
          ) : (
            <KawaiiStatCard
              label="Total Barang & Alat"
              value={metrics.totalItems}
              hint={`${metrics.activeBorrowsCount} alat sedang dipinjam saat ini`}
              accent="sky"
              href="/inventory"
              icon={<Package className="size-4" />}
            />
          )}

          {isOwner ? (
            <KawaiiStatCard
              label="Total Barang & Alat"
              value={metrics.totalItems}
              hint={`${metrics.activeBorrowsCount} dipinjam · ${metrics.partKurangCount} part kurang`}
              accent="sky"
              href="/inventory"
              icon={<Package className="size-4" />}
            />
          ) : (
            <KawaiiStatCard
              label="Kepingan Kurang & Stok Tipis"
              value={metrics.partKurangCount}
              hint={`${metrics.lowStockCount} barang habis pakai perlu diisi ulang`}
              accent="peach"
              href="/inventory"
              icon={<AlertTriangle className="size-4" />}
            />
          )}

          <KawaiiStatCard
            label={isOwner ? "Stok Tipis & Sanitasi" : "Perlu Dicuci / Dibersihkan"}
            value={isOwner ? metrics.lowStockCount : metrics.needsSanitationCount}
            hint={
              isOwner
                ? `Habis pakai menipis · ${metrics.needsSanitationCount} mainan perlu cuci`
                : "Mainan terapi yang perlu dicuci sebelum dipakai lagi"
            }
            accent="mint"
            href="/inventory"
            icon={<Sparkles className="size-4" />}
          />

          {isOwner ? (
            <KawaiiStatCard
              label="Status Penguncian Bulanan"
              value={
                metrics.reconciliation?.locked_at
                  ? "Terkunci"
                  : `${metrics.reconciliation?.opname_progress_pct ?? 0}%`
              }
              hint={
                metrics.reconciliation?.locked_at
                  ? `Periode ${period.periodLabel} telah disahkan Owner`
                  : `Progres opname ${period.periodLabel} · ${metrics.totalArchives} dokumen arsip`
              }
              accent="lavender"
              href="/backup"
              icon={<Lock className="size-4" />}
            />
          ) : (
            <KawaiiStatCard
              label="Antrean Verifikasi Admin"
              value={metrics.pendingAdminRequests}
              hint={`Total ${metrics.pendingRequests} pengajuan aktif · ${metrics.totalArchives} dokumen arsip`}
              accent="pink"
              href="/requests"
              icon={<ClipboardCheck className="size-4" />}
            />
          )}
        </div>
      )}

      {/* Cartoon Quick-Shortcut Sticker Tiles for Allowed Menus */}
      {quickShortcuts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FEF3C7] px-3 py-1 text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-amber-950/70 dark:text-amber-100">
                <span>✨ Pintas Cepat Menu</span>
              </span>
              <span className="text-muted-foreground hidden text-xs font-medium sm:inline">
                Klik stiker di bawah untuk langsung meluncur ke menu pilihanmu!
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {quickShortcuts.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className={`group flex flex-col items-center gap-2 rounded-2xl border-2 border-[#2C2623] p-3 text-center shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-1 hover:shadow-[4px_5px_0px_0px_#2C2623] active:translate-y-0 dark:border-stone-500 dark:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.45)] ${tile.tileBg}`}
              >
                <div className="flex size-12 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1.5 shadow-[2px_2px_0px_0px_#2C2623] transition-transform group-hover:scale-105 group-hover:-rotate-3 dark:border-stone-500 dark:bg-stone-900">
                  <KawaiiMascotSvg type={tile.mascot} className="size-9" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-extrabold text-[#2C2623] dark:text-stone-100">
                    {tile.label}
                  </p>
                  <p className="truncate text-[11px] font-medium text-[#574E49] dark:text-stone-300">
                    {tile.hint}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Role-Specific Operational Widgets (Balanced 2-Column Grid) */}
      {isStaff && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE] px-5 py-4 dark:border-stone-500 dark:bg-sky-950/55">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                  <span className="flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-sky-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-sky-300">
                    <ArrowLeftRight className="size-4" />
                  </span>
                  Pinjaman Aktif Anda Saat Ini
                </CardTitle>
                <Button
                  asChild
                  size="sm"
                  variant="secondary"
                  className="rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-xs font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                >
                  <Link href="/scan">Buka Scanner →</Link>
                </Button>
              </div>
              <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
                Daftar alat atau paket kit yang sedang atas nama Anda dan belum dikembalikan.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {metrics.myActiveBorrows.length === 0 ? (
                <KawaiiEmptyState
                  mascot="scan"
                  title="Belum Ada Pinjaman Aktif"
                  description="Tidak ada alat terapi yang sedang Anda pinjam saat ini. Yuk mulai scan saat mau mengambil alat!"
                  action={
                    <Button
                      asChild
                      size="sm"
                      className="rounded-2xl border-2 border-[#2C2623] bg-[#2AB673] font-bold text-white shadow-[2.5px_2.5px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#239c62] dark:border-stone-500"
                    >
                      <Link href="/scan">
                        <ArrowLeftRight className="mr-1.5 size-3.5" />
                        Mulai Scan Pinjam Alat
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {metrics.myActiveBorrows.map((borrow) => (
                    <li
                      key={borrow.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623] bg-white px-3.5 py-2.5 shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 dark:border-stone-500 dark:bg-stone-800/80"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[#2C2623] dark:text-stone-100">
                          {borrow.name}{" "}
                          <span className="rounded-md border border-[#2C2623]/30 bg-[#E0F2FE] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#2C2623] dark:border-stone-500 dark:bg-sky-950/70 dark:text-sky-200">
                            {borrow.code}
                          </span>
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs font-medium">
                          {borrow.room_code ? LOCATION_LABELS[borrow.room_code] : "Ruang Terapi"} ·{" "}
                          {formatDateWIB(borrow.borrowed_at, true)}
                        </p>
                      </div>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FDE68A] dark:border-stone-500 dark:bg-amber-950/60 dark:text-amber-100"
                      >
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

          <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#D1FAE5] px-5 py-4 dark:border-stone-500 dark:bg-emerald-950/55">
              <CardTitle className="flex items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                <span className="flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-emerald-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-emerald-300">
                  <CalendarClock className="size-4" />
                </span>
                Checklist Harian {ROLE_LABELS.STAFF.title}
              </CardTitle>
              <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
                Langkah praktis yang paling sering Anda gunakan di ruang terapi:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-5 text-sm">
              <div className="flex items-start gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5]/65 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-emerald-950/35">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] text-emerald-700 dark:border-stone-500 dark:bg-stone-900 dark:text-emerald-300">
                  <ArrowLeftRight className="size-3.5" />
                </span>
                <p className="text-[#2C2623] dark:text-stone-100">
                  <strong>Pinjam &amp; Kembalikan Alat:</strong> Scan stiker barcode sebelum membawa
                  mainan ke ruang terapi dan saat mengembalikannya ke rak.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#E0F2FE]/65 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-sky-950/35">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] text-sky-700 dark:border-stone-500 dark:bg-stone-900 dark:text-sky-300">
                  <Boxes className="size-3.5" />
                </span>
                <p className="text-[#2C2623] dark:text-stone-100">
                  <strong>Cek Kepingan &amp; Kebersihan:</strong> Hitung jumlah kepingan mainan
                  selesai sesi dan ubah statusnya menjadi <em>Perlu Dicuci</em> bila sudah dipakai.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7]/75 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-amber-950/35">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] text-amber-700 dark:border-stone-500 dark:bg-stone-900 dark:text-amber-300">
                  <Archive className="size-3.5" />
                </span>
                <p className="text-[#2C2623] dark:text-stone-100">
                  <strong>Panduan SOP &amp; Pengajuan:</strong> Baca dokumen resmi di menu{" "}
                  <Link href="/archives" className="font-extrabold underline underline-offset-2">
                    Panduan SOP
                  </Link>{" "}
                  atau laporkan alat rusak di{" "}
                  <Link href="/requests" className="font-extrabold underline underline-offset-2">
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
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#EDE9FE] px-5 py-4 dark:border-stone-500 dark:bg-violet-950/55">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                  <span className="flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-violet-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-violet-300">
                    <DatabaseBackup className="size-4" />
                  </span>
                  Cek Ruangan Akhir Bulan ({period.periodLabel})
                </CardTitle>
                <Button
                  asChild
                  size="sm"
                  variant="secondary"
                  className="rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-xs font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                >
                  <Link href="/backup">Buka Checklist →</Link>
                </Button>
              </div>
              <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
                Setiap tanggal 24 hingga akhir bulan, pastikan seluruh ruangan terapi telah dicek
                kelengkapan alatnya.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5 p-5 text-sm">
              <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/20 bg-white px-3.5 py-2.5 dark:border-stone-700 dark:bg-stone-800/60">
                <span className="text-muted-foreground font-medium">Status Jadwal Bulan Ini</span>
                <Badge
                  variant={period.active ? "default" : "outline"}
                  className="border-2 border-[#2C2623] font-bold dark:border-stone-500"
                >
                  {period.active ? "Sedang Berjalan (Minggu Terakhir)" : "Dimulai Setiap Tanggal 24"}
                </Badge>
              </div>

              <div className="space-y-2 rounded-2xl border-2 border-[#2C2623]/20 bg-white px-3.5 py-3 dark:border-stone-700 dark:bg-stone-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">Kelengkapan Cek Ruangan</span>
                  <span className="font-black text-[#2C2623] dark:text-stone-100">
                    {opnameProgress}% Ruangan Selesai
                  </span>
                </div>
                <div className="h-3.5 w-full overflow-hidden rounded-full border-2 border-[#2C2623] bg-[#FEF3C7]/60 dark:border-stone-500 dark:bg-stone-900">
                  <div
                    className="h-full rounded-full bg-[#2AB673] transition-all"
                    style={{ width: `${opnameProgress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/20 bg-white px-3.5 py-2.5 dark:border-stone-700 dark:bg-stone-800/60">
                <span className="text-muted-foreground font-medium">
                  Persetujuan Kepala Terapis
                </span>
                <Badge
                  variant={metrics.reconciliation?.approved_by_leader ? "secondary" : "outline"}
                  className="border-2 border-[#2C2623] font-bold dark:border-stone-500"
                >
                  {metrics.reconciliation?.approved_by_leader
                    ? "Sudah Disetujui"
                    : "Belum Disetujui"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE] px-5 py-4 dark:border-stone-500 dark:bg-sky-950/55">
              <CardTitle className="flex items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                <span className="flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-sky-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-sky-300">
                  <CheckCircle2 className="size-4" />
                </span>
                Fokus Koordinasi {ROLE_LABELS.TEAM_LEADER.title}
              </CardTitle>
              <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
                Tugas harian utama untuk menjaga operasional ruang terapi berjalan tertib:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-5 text-sm">
              <div className="flex items-start gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6]/75 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-rose-950/35">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] text-rose-600 dark:border-stone-500 dark:bg-stone-900 dark:text-rose-300">
                  <ClipboardCheck className="size-3.5" />
                </span>
                <p className="text-[#2C2623] dark:text-stone-100">
                  <strong>Persetujuan Tahap 1:</strong> Tinjau pengajuan dari tim terapis di menu{" "}
                  <Link href="/requests" className="font-extrabold underline underline-offset-2">
                    Pengajuan &amp; Persetujuan
                  </Link>{" "}
                  ({metrics.pendingLeaderRequests} menunggu).
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5]/75 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-emerald-950/35">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] text-emerald-700 dark:border-stone-500 dark:bg-stone-900 dark:text-emerald-300">
                  <ArrowLeftRight className="size-3.5" />
                </span>
                <p className="text-[#2C2623] dark:text-stone-100">
                  <strong>Stock Opname &amp; Pengembalian:</strong> Gunakan{" "}
                  <Link href="/scan" className="font-extrabold underline underline-offset-2">
                    Pinjam, Kembali &amp; Opname
                  </Link>{" "}
                  untuk memvalidasi kelengkapan kepingan &amp; kebersihan ruangan.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#E0F2FE]/75 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-sky-950/35">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] text-sky-700 dark:border-stone-500 dark:bg-stone-900 dark:text-sky-300">
                  <Archive className="size-3.5" />
                </span>
                <p className="text-[#2C2623] dark:text-stone-100">
                  <strong>Dokumen &amp; Ekspor Operasional:</strong> Akses{" "}
                  <Link href="/archives" className="font-extrabold underline underline-offset-2">
                    Lemari Arsip &amp; SOP
                  </Link>{" "}
                  ({metrics.totalArchives} dokumen) dan unduh ekspor operasional di{" "}
                  <Link href="/backup" className="font-extrabold underline underline-offset-2">
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
        <div className="grid gap-5 lg:grid-cols-2">
          {can(user.role, "vault.view_limited") && (
            <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE] px-5 py-4 dark:border-stone-500 dark:bg-sky-950/55">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                    <span className="flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-sky-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-sky-300">
                      <KeyRound className="size-4" />
                    </span>
                    Pengingat Tagihan Langganan Digital (7 Hari)
                  </CardTitle>
                  <Button
                    asChild
                    size="sm"
                    variant="secondary"
                    className="rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-xs font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <Link href="/vault">Buka Brankas →</Link>
                  </Button>
                </div>
                <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
                  Daftar akun aplikasi kantor yang masa berlakunya segera habis dalam 7 hari.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                {metrics.expiringSubscriptions.length === 0 ? (
                  <KawaiiEmptyState
                    mascot="vault"
                    title="Semua Langganan Aman! ✨"
                    description="Tidak ada langganan aplikasi yang jatuh tempo dalam 7 hari ke depan."
                  />
                ) : (
                  <ul className="space-y-2.5 text-sm">
                    {metrics.expiringSubscriptions.map((sub) => {
                      const days = daysUntilDate(sub.renewal_date);
                      return (
                        <li
                          key={sub.id}
                          className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623] bg-white px-3.5 py-2.5 shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 dark:border-stone-500 dark:bg-stone-800/80"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-bold text-[#2C2623] dark:text-stone-100">
                              {sub.service_name}{" "}
                              <span className="rounded-md border border-[#2C2623]/30 bg-[#FEF3C7] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#2C2623] dark:border-stone-500 dark:bg-amber-950/70 dark:text-amber-200">
                                {sub.sub_code}
                              </span>
                            </p>
                            <p className="text-muted-foreground truncate text-xs font-medium">
                              {sub.login_email}
                            </p>
                          </div>
                          <Badge
                            variant={days !== null && days <= 1 ? "destructive" : "secondary"}
                            className="shrink-0 border-2 border-[#2C2623] font-extrabold dark:border-stone-500"
                          >
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
            <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-[#EDE9FE] px-5 py-4 dark:border-stone-500 dark:bg-violet-950/55">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                    <span className="flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-violet-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-violet-300">
                      <DatabaseBackup className="size-4" />
                    </span>
                    Akhir Bulan &amp; Cadangan Data ({period.periodLabel})
                  </CardTitle>
                  <Button
                    asChild
                    size="sm"
                    variant="secondary"
                    className="rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-xs font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <Link href="/backup">Buka Laporan →</Link>
                  </Button>
                </div>
                <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
                  Rekonsiliasi opname ruangan, status pengesahan, cadangan data &amp; logistik
                  aktif.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-5 text-sm">
                <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/20 bg-white px-3.5 py-2 dark:border-stone-700 dark:bg-stone-800/60">
                  <span className="text-muted-foreground font-medium">Status Jadwal Bulan Ini</span>
                  <Badge
                    variant={period.active ? "default" : "outline"}
                    className="border-2 border-[#2C2623] font-bold dark:border-stone-500"
                  >
                    {period.active
                      ? "Sedang Berjalan (Minggu Terakhir)"
                      : "Dimulai Setiap Tanggal 24"}
                  </Badge>
                </div>

                <div className="space-y-1.5 rounded-2xl border-2 border-[#2C2623]/20 bg-white px-3.5 py-2.5 dark:border-stone-700 dark:bg-stone-800/60">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-medium">
                      Kelengkapan Cek Ruangan
                    </span>
                    <span className="font-black text-[#2C2623] dark:text-stone-100">
                      {opnameProgress}% Ruangan Selesai
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[#2C2623] bg-[#FEF3C7]/60 dark:border-stone-500 dark:bg-stone-900">
                    <div
                      className="h-full rounded-full bg-[#2AB673] transition-all"
                      style={{ width: `${opnameProgress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/20 bg-white px-3.5 py-2 dark:border-stone-700 dark:bg-stone-800/60">
                  <span className="text-muted-foreground font-medium">Cadangan Data Awal</span>
                  <span className="rounded-full border border-[#2C2623]/40 bg-[#D1FAE5] px-2.5 py-0.5 text-xs font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-emerald-950/70 dark:text-emerald-200">
                    {metrics.reconciliation?.pre_update_backup_id
                      ? "Sudah Tersimpan"
                      : "Belum Dibuat"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/20 bg-white px-3.5 py-2 dark:border-stone-700 dark:bg-stone-800/60">
                  <span className="text-muted-foreground font-medium">Status Kunci Owner</span>
                  <Badge
                    variant={metrics.reconciliation?.locked_at ? "secondary" : "outline"}
                    className="border-2 border-[#2C2623] font-bold dark:border-stone-500"
                  >
                    {metrics.reconciliation?.locked_at ? "Sudah Dikunci Owner" : "Belum Dikunci"}
                  </Badge>
                </div>

                {can(user.role, "delivery.view") && (
                  <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623] bg-[#FFEDD5] px-3.5 py-2.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-orange-950/45">
                    <span className="flex items-center gap-2 font-bold text-[#2C2623] dark:text-orange-100">
                      <Truck className="size-4 text-orange-600 dark:text-orange-300" />
                      Paket Pengiriman Sedang Jalan
                    </span>
                    <Link
                      href="/deliveries"
                      className="rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-3 py-0.5 text-xs font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                    >
                      {metrics.activeDeliveries} paket →
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
        <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
          <CardHeader className="border-b-2 border-[#2C2623] bg-[#FFE4E6] px-5 py-4 dark:border-stone-500 dark:bg-rose-950/50">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2.5 text-base font-black text-[#2C2623] dark:text-stone-100">
                <span className="flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-rose-700 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-rose-300">
                  <History className="size-4" />
                </span>
                Kegiatan Terbaru Tim
              </CardTitle>
              <Button
                asChild
                size="sm"
                variant="secondary"
                className="rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-xs font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
              >
                <Link href="/audit-log">Lihat Semua Riwayat →</Link>
              </Button>
            </div>
            <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
              Catatan otomatis setiap ada anggota tim yang menambah, meminjam, atau memperbarui
              data.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            {metrics.recentAudits.length === 0 ? (
              <KawaiiEmptyState
                mascot="history"
                title="Belum Ada Kegiatan Tercatat"
                description="Belum ada kegiatan yang tercatat hari ini. Semua catatan aktivitas tim akan muncul di sini."
              />
            ) : (
              <ul className="space-y-2.5 text-sm">
                {metrics.recentAudits.map((log, idx) => {
                  const dotColors = [
                    "bg-[#D1FAE5]",
                    "bg-[#E0F2FE]",
                    "bg-[#FEF3C7]",
                    "bg-[#FFE4E6]",
                    "bg-[#EDE9FE]",
                  ];
                  const dotBg = dotColors[idx % dotColors.length];

                  return (
                    <li
                      key={log.id}
                      className="flex flex-col justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/20 bg-white px-3.5 py-2.5 transition-all hover:border-[#2C2623] hover:shadow-[2px_2px_0px_0px_#2C2623] sm:flex-row sm:items-center dark:border-stone-700 dark:bg-stone-800/60 dark:hover:border-stone-400"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className={`mt-1.5 size-3 shrink-0 rounded-full border-2 border-[#2C2623] dark:border-stone-400 ${dotBg}`}
                        />
                        <div>
                          <p className="font-bold text-[#2C2623] dark:text-stone-100">
                            {log.summary}
                          </p>
                          <p className="text-muted-foreground text-xs font-medium">
                            Oleh{" "}
                            <strong className="text-foreground">
                              {log.actor_name || "Sistem Otomatis"}
                            </strong>
                            {log.entity_code ? ` · Kode: ${log.entity_code}` : ""}
                          </p>
                        </div>
                      </div>
                      <time className="shrink-0 self-start rounded-full border border-[#2C2623]/30 bg-[#FFFDF7] px-2.5 py-0.5 text-[11px] font-bold text-[#574E49] sm:self-center dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300">
                        {new Intl.DateTimeFormat("id-ID", {
                          timeZone: "Asia/Jakarta",
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(log.created_at))}{" "}
                        WIB
                      </time>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
