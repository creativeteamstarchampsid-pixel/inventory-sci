"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownToLine,
  Eye,
  Filter,
  Radio,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { useRole } from "@/components/rbac/role-provider";
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
import { ROLE_LABELS, type Role } from "@/lib/rbac";
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
  system_exports: "Ekspor Data",
};

function actionBadgeVariant(
  action: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (action === "PURGE" || action === "SOFT_DELETE" || action === "BACKUP_RESTORE") {
    return "destructive";
  }
  if (action === "VAULT_REVEAL" || action === "CRON_MONTHLY_BACKUP") {
    return "default";
  }
  if (action === "RESTORE" || action === "INSERT") {
    return "secondary";
  }
  return "outline";
}

function redactAuditForRole(log: AuditLog, role: Role): AuditLog {
  const redactData = (data: Json | null): Json | null => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    const clone: Record<string, Json | undefined> = { ...data };
    delete clone.password_encrypted;
    delete clone.pin_recovery_encrypted;
    if (role === "TEAM_LEADER" && log.entity_type === "subscriptions_vault") {
      delete clone.cost;
      delete clone.currency;
      delete clone.payment_method;
      delete clone.payment_account_label;
      delete clone.notes;
    }
    return clone;
  };
  return {
    ...log,
    old_data: redactData(log.old_data),
    new_data: redactData(log.new_data),
  };
}

export function AuditLogClient({
  initialLogs,
  actors,
  initialFilters,
}: AuditLogClientProps) {
  const router = useRouter();
  const { role } = useRole();
  const [isPending, startTransition] = useTransition();

  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "subscribed" | "offline"
  >("connecting");

  const [actionFilter, setActionFilter] = useState(initialFilters.action || "ALL");
  const [entityFilter, setEntityFilter] = useState(initialFilters.entityType || "ALL");
  const [actorFilter, setActorFilter] = useState(initialFilters.actor || "ALL");
  const [searchTerm, setSearchTerm] = useState(initialFilters.search || "");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

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
          if (role === "TEAM_LEADER" && raw.entity_type === "subscriptions_vault") {
            return;
          }
          const safeLog = redactAuditForRole(raw, role);
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
  }, [liveEnabled, role]);

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

  const applyServerSearch = () => {
    const params = new URLSearchParams();
    if (actionFilter !== "ALL") params.set("action", actionFilter);
    if (entityFilter !== "ALL") params.set("entity", entityFilter);
    if (actorFilter !== "ALL") params.set("actor", actorFilter);
    if (searchTerm.trim()) params.set("q", searchTerm.trim());

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
    startTransition(() => {
      router.push("/audit-log");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Log Aktivitas & Jejak Audit
          </h1>
          <p className="text-muted-foreground text-sm">
            Aliran kronologis real-time seluruh perubahan data operasional, vault
            reveal, rekonsiliasi, dan pemulihan sistem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
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
                  : "Menghubungkan Stream..."
                : "Stream Dijeda"}
            </span>
            <Switch checked={liveEnabled} onCheckedChange={setLiveEnabled} />
          </div>

          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => router.refresh())}
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${isPending ? "animate-spin" : ""}`} />
            Muat Ulang
          </Button>

          <Button asChild size="sm" variant="outline">
            <a href="/api/exports/csv?scope=audit" download>
              <ArrowDownToLine className="mr-1.5 size-3.5" />
              Ekspor .CSV
            </a>
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="size-4" />
            Filter Jejak Audit
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyServerSearch()}
              placeholder="Cari kode item, ringkasan, atau nama aktor..."
              className="pl-8"
            />
          </div>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full">
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
            <SelectTrigger className="w-full">
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
            <SelectTrigger className="w-full">
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

          <div className="flex flex-wrap gap-2 md:col-span-5">
            <Button size="sm" onClick={applyServerSearch} disabled={isPending}>
              Cari di Database
            </Button>
            <Button size="sm" variant="ghost" onClick={resetFilters} disabled={isPending}>
              <X className="mr-1 size-3.5" />
              Reset Filter
            </Button>
            <span className="text-muted-foreground ml-auto self-center text-xs">
              Menampilkan {filteredLogs.length} dari {logs.length} entri termuat
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Activity Stream Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" />
            Aliran Aktivitas Kronologis
          </CardTitle>
          <CardDescription>
            Catatan bersifat append-only (tidak dapat diubah atau dihapus). Klik detail
            untuk memeriksa perubahan payload JSON.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Tidak ada catatan audit yang cocok dengan filter saat ini.
            </p>
          ) : (
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
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateWIB(log.created_at, true)}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">
                        {log.actor_name || "Sistem"}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {log.actor_role
                          ? ROLE_LABELS[log.actor_role]?.title ?? log.actor_role
                          : "SYSTEM"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionBadgeVariant(log.action)}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.entity_type}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.entity_code || "-"}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal text-xs">
                      {log.summary}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="mr-1 size-3.5" />
                        Lihat
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <DialogTitle className="flex items-center gap-2 text-base">
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
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                <div>
                  <span className="text-muted-foreground">Aktor: </span>
                  <span className="font-medium">
                    {selectedLog.actor_name || "Sistem"} (
                    {selectedLog.actor_role ?? "SYSTEM"})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Entitas: </span>
                  <span className="font-mono">
                    {selectedLog.entity_type} / {selectedLog.entity_code || selectedLog.entity_id || "-"}
                  </span>
                </div>
              </div>

              {selectedLog.old_data && (
                <div className="space-y-1">
                  <p className="font-semibold uppercase">Data Sebelumnya (`old_data`)</p>
                  <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 font-mono text-[11px]">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_data && (
                <div className="space-y-1">
                  <p className="font-semibold uppercase">Data Sesudahnya (`new_data`)</p>
                  <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 font-mono text-[11px]">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.metadata &&
                typeof selectedLog.metadata === "object" &&
                !Array.isArray(selectedLog.metadata) &&
                Object.keys(selectedLog.metadata).length > 0 && (
                  <div className="space-y-1">
                    <p className="font-semibold uppercase">Metadata</p>
                    <pre className="bg-muted max-h-40 overflow-auto rounded-md p-3 font-mono text-[11px]">
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
