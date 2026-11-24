"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownToLine,
  Clock,
  Eye,
  Filter,
  LayoutList,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Table2,
  UserCircle2,
  Users,
  X,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
import { Can } from "@/components/rbac/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateWIB } from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { AuditLog, Json } from "@/types/database";

type ActorOption = {
  id: string;
  label: string;
};

type AuditLogClientProps = {
  initialLogs: AuditLog[];
  actors: ActorOption[];
  initialFilters: {
    action: string;
    entityType: string;
    actor: string;
    search: string;
  };
};

const ACTION_OPTIONS = [
  "ALL",
  "INSERT",
  "UPDATE",
  "SOFT_DELETE",
  "RESTORE",
  "PURGE",
  "VAULT_REVEAL",
  "EXPORT_DATA",
  "BACKUP_RESTORE",
  "CRON_MONTHLY_BACKUP",
  "USER_CREATED",
  "USER_INVITED",
  "LOCATION_CREATED",
  "LOCATION_RENAMED",
  "LOCATION_UPDATED",
  "LOCATION_DELETED",
] as const;

const ENTITY_LABELS: Record<string, string> = {
  items_master: "Inventaris (items_master)",
  item_kits: "Kit Barang (item_kits)",
  borrow_transactions: "Peminjaman (borrow_transactions)",
  subscriptions_vault: "Vault Langganan (subscriptions_vault)",
  archives_hybrid: "Arsip Hybrid (archives_hybrid)",
  deliveries_log: "Pengiriman (deliveries_log)",
  internal_requests: "Tiket Internal (internal_requests)",
  system_backups: "Backup Sistem (system_backups)",
  monthly_reconciliations: "Rekonsiliasi Bulanan",
  profiles: "Profil & Pengguna (profiles)",
  locations_master: "Ruangan & Lemari (locations_master)",
  system_exports: "Ekspor Data",
};

const CRITICAL_ACTIONS = new Set([
  "PURGE",
  "SOFT_DELETE",
  "BACKUP_RESTORE",
  "VAULT_REVEAL",
  "LOCATION_DELETED",
]);

function actionBadgeVariant(
  action: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (
    action === "PURGE" ||
    action === "SOFT_DELETE" ||
    action === "BACKUP_RESTORE" ||
    action === "LOCATION_DELETED"
  ) {
    return "destructive";
  }
  if (action === "VAULT_REVEAL" || action === "CRON_MONTHLY_BACKUP") {
    return "default";
  }
  if (action === "RESTORE" || action === "INSERT" || action === "LOCATION_CREATED") {
    return "secondary";
  }
  return "outline";
}

function getActionPastelStyle(action: string): {
  nodeBg: string;
  pillClass: string;
  cardTint: string;
  symbol: string;
} {
  if (
    action === "PURGE" ||
    action === "SOFT_DELETE" ||
    action === "BACKUP_RESTORE" ||
    action === "LOCATION_DELETED"
  ) {
    return {
      nodeBg: "bg-[#FDA4AF]",
      pillClass:
        "border-[#2C2623] bg-[#FFE4E6] text-[#881337] dark:bg-rose-950/60 dark:text-rose-200",
      cardTint: "border-l-[#FDA4AF]",
      symbol: "!",
    };
  }
  if (
    action === "INSERT" ||
    action === "RESTORE" ||
    action === "USER_CREATED" ||
    action === "USER_INVITED" ||
    action === "LOCATION_CREATED"
  ) {
    return {
      nodeBg: "bg-[#A7F3D0]",
      pillClass:
        "border-[#2C2623] bg-[#E8FBF1] text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200",
      cardTint: "border-l-[#34D399]",
      symbol: "+",
    };
  }
  if (action === "VAULT_REVEAL" || action === "EXPORT_DATA") {
    return {
      nodeBg: "bg-[#FDE68A]",
      pillClass:
        "border-[#2C2623] bg-[#FFFBE6] text-[#78350F] dark:bg-amber-950/60 dark:text-amber-200",
      cardTint: "border-l-[#FBBF24]",
      symbol: "★",
    };
  }
  if (action === "CRON_MONTHLY_BACKUP") {
    return {
      nodeBg: "bg-[#DDD6FE]",
      pillClass:
        "border-[#2C2623] bg-[#F3EEFF] text-[#4C1D95] dark:bg-violet-950/60 dark:text-violet-200",
      cardTint: "border-l-[#A78BFA]",
      symbol: "☁",
    };
  }
  return {
    nodeBg: "bg-[#BAE6FD]",
    pillClass:
      "border-[#2C2623] bg-[#E8F6FF] text-[#0C4A6E] dark:bg-sky-950/60 dark:text-sky-200",
    cardTint: "border-l-[#7CC4FA]",
    symbol: "✎",
  };
}

function redactAuditSecrets(log: AuditLog): AuditLog {
  const redactData = (data: Json | null): Json | null => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    const clone: Record<string, Json | undefined> = { ...data };
    delete clone.password_encrypted;
    delete clone.pin_recovery_encrypted;
    return clone;
  };
  return {
    ...log,
    old_data: redactData(log.old_data),
    new_data: redactData(log.new_data),
  };
}

function parseContentDispositionFilename(
  disposition: string,
  fallbackFilename: string,
): string {
  const utf8Match =
    /filename\*\s*=\s*(?:[^';\r\n]*'[^';\r\n]*')?([^;\r\n]+)/i.exec(
      disposition,
    );
  if (utf8Match?.[1]) {
    const raw = utf8Match[1].trim().replace(/^["']|["']$/g, "");
    try {
      const decoded = decodeURIComponent(raw).trim();
      if (decoded) return decoded;
    } catch {
      if (raw) return raw;
    }
  }

  const quotedMatch = /filename\s*=\s*"([^"]+)"/i.exec(disposition);
  if (quotedMatch?.[1]?.trim()) {
    return quotedMatch[1].trim();
  }

  const plainMatch = /filename\s*=\s*([^;\r\n]+)/i.exec(disposition);
  if (plainMatch?.[1]?.trim()) {
    const cleaned = plainMatch[1].trim().replace(/^["']|["']$/g, "");
    if (cleaned) return cleaned;
  }

  return fallbackFilename;
}

async function downloadAuditCsv() {
  const response = await fetch("/api/exports/csv?scope=audit", {
    credentials: "same-origin",
  });
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();

  if (!response.ok) {
    let message =
      response.status === 401 || response.redirected
        ? "Sesi Anda telah berakhir. Silakan muat ulang halaman dan masuk kembali."
        : `Gagal mengunduh ekspor audit (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Ignore non-JSON body
    }
    throw new Error(message);
  }

  if (response.redirected || contentType.includes("text/html")) {
    throw new Error(
      "Sesi Anda telah berakhir. Silakan muat ulang halaman dan masuk kembali.",
    );
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("Berkas ekspor kosong. Silakan coba lagi.");
  }
  if (blob.type.toLowerCase().includes("text/html")) {
    throw new Error(
      "Sesi Anda telah berakhir. Silakan muat ulang halaman dan masuk kembali.",
    );
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = parseContentDispositionFilename(
    disposition,
    "starops-audit.csv",
  );

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  return filename;
}

export function AuditLogClient({
  initialLogs,
  actors,
  initialFilters,
}: AuditLogClientProps) {
  const router = useRouter();
  const { showNavigating, hide, runWithFeedback } = useCartoonFeedback();
  const [isPending, startTransition] = useTransition();
  const navigatingActiveRef = useRef(false);

  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "subscribed" | "offline"
  >("connecting");
  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");

  const [actionFilter, setActionFilter] = useState(initialFilters.action || "ALL");
  const [entityFilter, setEntityFilter] = useState(initialFilters.entityType || "ALL");
  const [actorFilter, setActorFilter] = useState(initialFilters.actor || "ALL");
  const [searchTerm, setSearchTerm] = useState(initialFilters.search || "");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  useEffect(() => {
    if (!isPending && navigatingActiveRef.current) {
      navigatingActiveRef.current = false;
      hide();
    }
  }, [isPending, hide]);

  useEffect(() => {
    if (!liveEnabled) {
      setRealtimeStatus("offline");
      return;
    }

    const supabase = createBrowserClient();
    const channel = supabase
      .channel("audit-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        (payload) => {
          const raw = payload.new as AuditLog;
          if (!raw?.id) return;
          const safeLog = redactAuditSecrets(raw);
          setLogs((prev) => {
            if (prev.some((item) => item.id === safeLog.id)) return prev;
            return [safeLog, ...prev].slice(0, 300);
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("subscribed");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("offline");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [liveEnabled]);

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== "ALL" && log.action !== actionFilter) return false;
      if (entityFilter !== "ALL" && log.entity_type !== entityFilter) return false;
      if (actorFilter !== "ALL") {
        if (actorFilter === "__SYSTEM__") {
          if (log.actor_id !== null) return false;
        } else if (log.actor_id !== actorFilter) {
          return false;
        }
      }
      if (q) {
        const hay = [
          log.summary,
          log.entity_code,
          log.actor_name,
          log.action,
          log.entity_type,
          log.entity_id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, actionFilter, entityFilter, actorFilter, searchTerm]);

  const criticalCount = useMemo(
    () => filteredLogs.filter((l) => CRITICAL_ACTIONS.has(l.action)).length,
    [filteredLogs],
  );

  const uniqueActorCount = useMemo(() => {
    const set = new Set<string>();
    for (const l of filteredLogs) {
      set.add(l.actor_id || l.actor_name || "__SYSTEM__");
    }
    return set.size;
  }, [filteredLogs]);

  const applyServerSearch = () => {
    const params = new URLSearchParams();
    if (actionFilter !== "ALL") params.set("action", actionFilter);
    if (entityFilter !== "ALL") params.set("entity", entityFilter);
    if (actorFilter !== "ALL") params.set("actor", actorFilter);
    if (searchTerm.trim()) params.set("q", searchTerm.trim());

    navigatingActiveRef.current = true;
    showNavigating({
      title: "Menyaring Jejak Audit... 🔍",
      message:
        "Bentar ya... lagi menelusuri catatan aktivitas dari database sesuai filter pilihanmu~",
    });
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `/audit-log?${qs}` : "/audit-log");
      router.refresh();
    });
  };

  const resetFilters = () => {
    setActionFilter("ALL");
    setEntityFilter("ALL");
    setActorFilter("ALL");
    setSearchTerm("");
    navigatingActiveRef.current = true;
    showNavigating({
      title: "Mereset Filter Audit... ✨",
      message: "Menampilkan kembali seluruh aliran aktivitas terbaru buat kamu~",
    });
    startTransition(() => {
      router.push("/audit-log");
      router.refresh();
    });
  };

  const handleRefresh = () => {
    navigatingActiveRef.current = true;
    showNavigating({
      title: "Menyegarkan Log Aktivitas... 🔄",
      message: "Lagi mengambil catatan jejak audit paling baru dari server nih~",
    });
    startTransition(() => {
      router.refresh();
    });
  };

  const handleExportAuditCsv = () => {
    startTransition(async () => {
      try {
        await runWithFeedback(
          {
            mode: "batch",
            workingTitle: "Mengekspor Jejak Audit .CSV... 📋",
            workingMessage:
              "Tim mini lagi merangkum catatan jejak audit ke berkas .CSV UTF-8 buat kamu unduh~",
            successTitle: "Ekspor Audit .CSV Siap! ♪",
            successMessage: (filename) =>
              `Yeay! Berkas ${filename} berhasil diunduh ke perangkatmu~`,
            errorTitle: "Yah, Ekspor Audit Gagal...",
            errorMessage: (err) =>
              err instanceof Error ? err.message : "Gagal mengekspor data audit.",
          },
          () => downloadAuditCsv(),
        );
      } catch {
        // Error popup already displayed by runWithFeedback
      }
    });
  };

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        accent="lavender"
        mascot="history"
        badge="Jejak Aktivitas Real-Time"
        title="Log Aktivitas & Jejak Audit"
        description="Aliran kronologis real-time seluruh perubahan data operasional, vault reveal, rekonsiliasi, dan pemulihan sistem."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40 dark:bg-card">
              <Radio
                className={`size-3.5 ${
                  realtimeStatus === "subscribed" && liveEnabled
                    ? "animate-pulse text-emerald-600"
                    : "text-muted-foreground"
                }`}
              />
              <span>
                {liveEnabled
                  ? realtimeStatus === "subscribed"
                    ? "Live Stream Aktif"
                    : "Menghubungkan..."
                  : "Stream Dijeda"}
              </span>
              <Switch checked={liveEnabled} onCheckedChange={setLiveEnabled} />
            </div>

            <Button
              size="sm"
              variant="outline"
              className="bg-[#FFFDF7] font-bold dark:bg-card"
              disabled={isPending}
              onClick={handleRefresh}
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${isPending ? "animate-spin" : ""}`} />
              Muat Ulang
            </Button>

            <Can action="export.financial">
              <Button
                size="sm"
                className="font-bold"
                disabled={isPending}
                onClick={handleExportAuditCsv}
              >
                <ArrowDownToLine className="mr-1.5 size-3.5" />
                Ekspor .CSV
              </Button>
            </Can>
          </div>
        }
      />

      {/* Pastel Audit KPI Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KawaiiStatCard
          label="Catatan Ditampilkan"
          value={filteredLogs.length}
          hint={`Dari ${logs.length} entri termuat terbaru`}
          accent="lavender"
          icon={<Activity className="size-4" />}
        />
        <KawaiiStatCard
          label="Aksi Sensitif / Kritis"
          value={criticalCount}
          hint="Soft-delete, purge, restore & vault reveal"
          accent={criticalCount > 0 ? "pink" : "mint"}
          icon={<ShieldAlert className="size-4" />}
        />
        <KawaiiStatCard
          label="Status Aliran Live"
          value={
            liveEnabled
              ? realtimeStatus === "subscribed"
                ? "Aktif"
                : "Menyambung"
              : "Dijeda"
          }
          hint={
            liveEnabled
              ? "Perubahan baru muncul otomatis"
              : "Aktifkan sakelar live di atas"
          }
          accent="mint"
          icon={<Radio className="size-4" />}
        />
        <KawaiiStatCard
          label="Aktor Tercatat"
          value={uniqueActorCount}
          hint="Pengguna & cron sistem pada daftar ini"
          accent="butter"
          icon={<Users className="size-4" />}
        />
      </div>

      {/* Filter Bar */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
        <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#F3EEFF]/70 pb-3 dark:bg-violet-950/25">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold">
            <span className="inline-flex size-7 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#DDD6FE] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
              <Filter className="size-3.5" />
            </span>
            Filter Jejak Audit
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyServerSearch()}
              placeholder="Cari kode item, ringkasan, atau nama aktor..."
              className="pl-9"
            />
          </div>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/40">
              <SelectValue placeholder="Semua Aksi" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((act) => (
                <SelectItem key={act} value={act}>
                  {act === "ALL" ? "Semua Aksi" : act}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/40">
              <SelectValue placeholder="Semua Entitas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Entitas</SelectItem>
              {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={actorFilter} onValueChange={setActorFilter}>
            <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/40">
              <SelectValue placeholder="Semua Aktor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Aktor</SelectItem>
              <SelectItem value="__SYSTEM__">Sistem / Cron Otomatis</SelectItem>
              {actors.map((actor) => (
                <SelectItem key={actor.id} value={actor.id}>
                  {actor.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center gap-2 md:col-span-5">
            <Button size="sm" onClick={applyServerSearch} disabled={isPending}>
              <Search className="mr-1.5 size-3.5" />
              Cari di Database
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={resetFilters}
              disabled={isPending}
            >
              <X className="mr-1 size-3.5" />
              Reset Filter
            </Button>
            <span className="text-muted-foreground ml-auto self-center text-xs font-semibold">
              Menampilkan {filteredLogs.length} dari {logs.length} entri termuat
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Activity Stream Card: Cute Pastel Timeline + Compact Table Toggle */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
        <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#FFFBE6]/70 dark:bg-amber-950/20">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <Activity className="size-4" />
                </span>
                Aliran Aktivitas Kronologis
              </CardTitle>
              <CardDescription className="mt-1">
                Catatan bersifat append-only (tidak dapat diubah atau dihapus). Klik detail
                untuk memeriksa perubahan payload JSON.
              </CardDescription>
            </div>

            <div className="inline-flex rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40 dark:bg-card">
              <button
                type="button"
                onClick={() => setViewMode("timeline")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
                  viewMode === "timeline"
                    ? "border-2 border-[#2C2623] bg-[#DDD6FE] text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutList className="size-3.5" />
                Timeline Pastel
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
                  viewMode === "table"
                    ? "border-2 border-[#2C2623] bg-[#BAE6FD] text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Table2 className="size-3.5" />
                Tabel Ringkas
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          {filteredLogs.length === 0 ? (
            <KawaiiEmptyState
              mascot="history"
              title="Belum Ada Jejak Audit yang Cocok"
              description="Tidak ada catatan audit yang cocok dengan filter saat ini. Coba ubah kata kunci atau reset filter ya~"
              action={
                <Button size="sm" variant="outline" onClick={resetFilters}>
                  <X className="mr-1.5 size-3.5" />
                  Reset Filter
                </Button>
              }
            />
          ) : viewMode === "timeline" ? (
            <div className="relative ml-3 space-y-4 border-l-2 border-dashed border-[#2C2623]/35 pl-6 dark:border-[#F5E9D6]/30">
              {filteredLogs.map((log) => {
                const style = getActionPastelStyle(log.action);
                const roleLabel = log.actor_role
                  ? ROLE_LABELS[log.actor_role]?.title ?? log.actor_role
                  : "Sistem";

                return (
                  <div key={log.id} className="relative">
                    {/* Cute Comic Timeline Node */}
                    <span
                      aria-hidden
                      className={`absolute top-3.5 -left-[35px] flex size-6 items-center justify-center rounded-full border-2 border-[#2C2623] text-[11px] font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] ${style.nodeBg}`}
                    >
                      {style.symbol}
                    </span>

                    <div
                      className={`rounded-2xl border-2 border-[#2C2623] border-l-[6px] bg-[#FFFDF7] p-4 shadow-[3px_3px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5E9D6]/35 dark:bg-card ${style.cardTint}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={actionBadgeVariant(log.action)}
                            className={`border font-extrabold ${style.pillClass}`}
                          >
                            {log.action}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="bg-[#FFFDF7] font-mono text-[11px] dark:bg-background"
                          >
                            {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                          </Badge>
                          {log.entity_code && (
                            <span className="rounded-full border border-[#2C2623]/50 bg-[#FFFBE6] px-2 py-0.5 font-mono text-[11px] font-bold text-[#2C2623] dark:bg-amber-950/50 dark:text-amber-100">
                              {log.entity_code}
                            </span>
                          )}
                        </div>
                        <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px] font-semibold">
                          <Clock className="size-3" />
                          {formatDateWIB(log.created_at, true)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm leading-relaxed font-semibold">
                        {log.summary}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[#2C2623]/20 pt-2.5 dark:border-[#F5E9D6]/20">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#2C2623]/30 bg-[#F3EEFF]/60 px-2.5 py-0.5 text-xs dark:bg-violet-950/40">
                          <UserCircle2 className="size-3.5 text-violet-700 dark:text-violet-300" />
                          <span className="font-bold">{log.actor_name || "Sistem"}</span>
                          <span className="text-muted-foreground">· {roleLabel}</span>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-xl bg-[#FFFDF7] px-2.5 text-xs font-bold dark:bg-background"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="mr-1 size-3.5" />
                          Lihat Payload
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/35">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu (WIB)</TableHead>
                    <TableHead>Aktor</TableHead>
                    <TableHead>Aksi</TableHead>
                    <TableHead>Entitas</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Ringkasan</TableHead>
                    <TableHead className="text-right">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const style = getActionPastelStyle(log.action);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDateWIB(log.created_at, true)}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-bold">
                            {log.actor_name || "Sistem"}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {log.actor_role
                              ? ROLE_LABELS[log.actor_role]?.title ?? log.actor_role
                              : "Sistem"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={actionBadgeVariant(log.action)}
                            className={`border font-bold ${style.pillClass}`}
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.entity_type}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold">
                          {log.entity_code || "-"}
                        </TableCell>
                        <TableCell className="max-w-md whitespace-normal text-xs">
                          {log.summary}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="mr-1 size-3.5" />
                            Lihat
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payload Diff Dialog */}
      <Dialog
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-extrabold">
              Detail Audit —{" "}
              <Badge variant={actionBadgeVariant(selectedLog?.action ?? "")}>
                {selectedLog?.action}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.summary} ·{" "}
              {selectedLog ? formatDateWIB(selectedLog.created_at, true) : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-2 rounded-2xl border-2 border-[#2C2623] bg-[#F3EEFF]/75 p-3.5 shadow-[2px_2px_0px_0px_#2C2623] sm:grid-cols-2 dark:bg-violet-950/30">
                <div>
                  <span className="text-muted-foreground font-bold">Aktor: </span>
                  <span className="font-extrabold">
                    {selectedLog.actor_name || "Sistem"} (
                    {selectedLog.actor_role
                      ? ROLE_LABELS[selectedLog.actor_role]?.title ??
                        selectedLog.actor_role
                      : "Sistem"}
                    )
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground font-bold">Entitas: </span>
                  <span className="font-mono font-bold">
                    {selectedLog.entity_type} /{" "}
                    {selectedLog.entity_code || selectedLog.entity_id || "-"}
                  </span>
                </div>
              </div>

              {selectedLog.old_data && (
                <div className="space-y-1.5">
                  <p className="inline-flex rounded-full border border-[#2C2623] bg-[#FFE4E6] px-2.5 py-0.5 text-[11px] font-extrabold text-[#881337] uppercase dark:bg-rose-950/60 dark:text-rose-200">
                    Data Sebelumnya (`old_data`)
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-3 font-mono text-[11px] dark:bg-muted">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_data && (
                <div className="space-y-1.5">
                  <p className="inline-flex rounded-full border border-[#2C2623] bg-[#E8FBF1] px-2.5 py-0.5 text-[11px] font-extrabold text-[#14532D] uppercase dark:bg-emerald-950/60 dark:text-emerald-200">
                    Data Sesudahnya (`new_data`)
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-3 font-mono text-[11px] dark:bg-muted">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.metadata &&
                typeof selectedLog.metadata === "object" &&
                !Array.isArray(selectedLog.metadata) &&
                Object.keys(selectedLog.metadata).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="inline-flex rounded-full border border-[#2C2623] bg-[#FFFBE6] px-2.5 py-0.5 text-[11px] font-extrabold text-[#78350F] uppercase dark:bg-amber-950/60 dark:text-amber-200">
                      Metadata
                    </p>
                    <pre className="max-h-40 overflow-auto rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-3 font-mono text-[11px] dark:bg-muted">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
