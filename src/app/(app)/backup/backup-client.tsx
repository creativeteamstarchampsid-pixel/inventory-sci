"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  CalendarClock,
  CheckCircle2,
  DatabaseBackup,
  FileSpreadsheet,
  FileText,
  GitCompare,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  approveReconciliationStage,
  createBackupSnapshotAction,
  getBackupDownloadUrlAction,
  restoreBackupPointInTimeAction,
  toggleOpnameRoomChecklist,
  type OpnameChecklistMap,
} from "@/lib/actions/backup";
import {
  BACKUP_TYPE_LABELS,
  LOCATION_LABELS,
  OPNAME_ROOM_CODES,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import type { BackupDiffSummary } from "@/lib/exports/csv";
import type { MonthlyUpdatePeriod } from "@/lib/period";
import type {
  Json,
  LocationCode,
  MonthlyReconciliation,
  SystemBackup,
} from "@/types/database";

export type RoomSummaryStat = {
  roomCode: LocationCode;
  totalItems: number;
  anomalyCount: number;
};

type BackupClientProps = {
  period: MonthlyUpdatePeriod;
  reconciliation: MonthlyReconciliation | null;
  approverNames: {
    adminName: string | null;
    leaderName: string | null;
    ownerName: string | null;
  };
  roomStats: RoomSummaryStat[];
  backups: SystemBackup[];
};

function parseOpnameChecklist(json: Json | null | undefined): OpnameChecklistMap {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const map: OpnameChecklistMap = {};
  for (const room of OPNAME_ROOM_CODES) {
    const val = (json as Record<string, Json | undefined>)[room];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const rec = val as Record<string, Json | undefined>;
      map[room] = {
        checked: Boolean(rec.checked),
        checked_by_id:
          typeof rec.checked_by_id === "string" ? rec.checked_by_id : null,
        checked_by_name:
          typeof rec.checked_by_name === "string" ? rec.checked_by_name : null,
        checked_at: typeof rec.checked_at === "string" ? rec.checked_at : null,
        notes: typeof rec.notes === "string" ? rec.notes : undefined,
        anomaly_count:
          typeof rec.anomaly_count === "number" ? rec.anomaly_count : undefined,
      };
    }
  }
  return map;
}

function parseDiffSummary(json: Json | null | undefined): BackupDiffSummary | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const obj = json as Record<string, Json | undefined>;
  if (typeof obj.part_kurang_count !== "number") return null;
  return json as unknown as BackupDiffSummary;
}

function parseRowCounts(json: Json | null | undefined): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(json)) {
    if (typeof v === "number") result[k] = v;
  }
  return result;
}

function formatDeltaBadge(delta: number, isCurrency = false) {
  if (delta === 0) return <Badge variant="outline">0</Badge>;
  const sign = delta > 0 ? "+" : "-";
  const absText = isCurrency ? formatRupiah(Math.abs(delta)) : String(Math.abs(delta));
  return (
    <Badge variant={delta > 0 ? "secondary" : "destructive"}>
      {sign}
      {absText}
    </Badge>
  );
}

export function BackupClient({
  period,
  reconciliation: initialReconciliation,
  approverNames: initialApprovers,
  roomStats,
  backups,
}: BackupClientProps) {
  const { user, role, can } = useRole();
  const [isPending, startTransition] = useTransition();
  const [reconciliation, setReconciliation] = useState<MonthlyReconciliation | null>(
    initialReconciliation,
  );
  const [approvers, setApprovers] = useState(initialApprovers);
  const [csvScope, setCsvScope] = useState<string>("all");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Dialog states
  const [diffBackup, setDiffBackup] = useState<SystemBackup | null>(null);
  const [restoreBackup, setRestoreBackup] = useState<SystemBackup | null>(null);
  const [restoreConfirmCode, setRestoreConfirmCode] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [ownerLockDialogOpen, setOwnerLockDialogOpen] = useState(false);
  const [ownerNotes, setOwnerNotes] = useState("");

  const checklist = useMemo(
    () => parseOpnameChecklist(reconciliation?.opname_checklist_json),
    [reconciliation],
  );
  const isLocked = Boolean(reconciliation?.locked_at);
  const progressPct = Number(reconciliation?.opname_progress_pct ?? 0);

  const roomStatMap = useMemo(() => {
    const m = new Map<LocationCode, RoomSummaryStat>();
    for (const s of roomStats) m.set(s.roomCode, s);
    return m;
  }, [roomStats]);

  const handleToggleRoom = (roomCode: LocationCode, checked: boolean) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await toggleOpnameRoomChecklist({
        periodYm: period.periodCode,
        roomCode,
        checked,
      });
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setReconciliation(res.data);
      setFeedback({
        type: "success",
        message: res.message ?? `Opname ${roomCode} diperbarui.`,
      });
    });
  };

  const handleApproveStage = (
    stage: "leader" | "admin" | "owner",
    notes?: string,
  ) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await approveReconciliationStage({
        periodYm: period.periodCode,
        stage,
        notes,
      });
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setReconciliation(res.data);
      if (stage === "leader") {
        setApprovers((prev) => ({ ...prev, leaderName: user.fullName }));
      } else if (stage === "admin") {
        setApprovers((prev) => ({ ...prev, adminName: user.fullName }));
      } else {
        setApprovers((prev) => ({ ...prev, ownerName: user.fullName }));
        setOwnerLockDialogOpen(false);
      }
      setFeedback({
        type: "success",
        message: res.message ?? "Persetujuan berhasil dicatat.",
      });
    });
  };

  const handleCreateBackup = (
    backupType: "PRE_UPDATE" | "MONTHLY_CUTOFF" | "MANUAL",
    notes?: string,
  ) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await createBackupSnapshotAction({
        backupType,
        periodYm: period.periodCode,
        notes,
      });
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setManualDialogOpen(false);
      setManualNotes("");
      const warnSuffix =
        res.data.storageWarnings.length > 0
          ? ` (Catatan storage: ${res.data.storageWarnings.join(", ")})`
          : "";
      setFeedback({
        type: "success",
        message: `${res.message ?? "Backup berhasil dibuat."}${warnSuffix}`,
      });
    });
  };

  const handleDownloadBackup = (
    backupId: string,
    fileType: "json" | "xlsx" | "csv" | "pdf",
  ) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await getBackupDownloadUrlAction({ backupId, fileType });
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  };

  const handleConfirmRestore = () => {
    if (!restoreBackup) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await restoreBackupPointInTimeAction({
        backupId: restoreBackup.id,
        confirmCode: restoreConfirmCode,
      });
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setRestoreBackup(null);
      setRestoreConfirmCode("");
      const warnText =
        res.data.warnings.length > 0
          ? ` Peringatan: ${res.data.warnings.slice(0, 3).join("; ")}`
          : "";
      setFeedback({
        type: "success",
        message: `${res.message ?? "Point-in-Time Restore selesai."}${warnText}`,
      });
    });
  };

  const selectedDiff = diffBackup ? parseDiffSummary(diffBackup.diff_summary_json) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ekspor, Rekonsiliasi & Backup Center
          </h1>
          <p className="text-muted-foreground text-sm">
            Pusat ekspor multi-format (.CSV / .XLSX / .PDF), siklus pengkinian data
            minggu terakhir, dan snapshot Point-in-Time Restore.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={period.active ? "default" : "outline"}>
            <CalendarClock className="mr-1 size-3.5" />
            {period.active
              ? `Pengkinian Aktif (${period.daysUntilCutoff} hari ke cut-off)`
              : `Periode ${period.periodLabel}`}
          </Badge>
          {isLocked && (
            <Badge variant="secondary">
              <Lock className="mr-1 size-3.5" />
              Dikunci Owner
            </Badge>
          )}
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600" />
          )}
          <AlertTitle>
            {feedback.type === "error" ? "Operasi Gagal" : "Berhasil"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* 1. Multi-Format Export Engine */}
      <Can action="export.data">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownToLine className="size-4" />
              Mesin Ekspor Multi-Format
            </CardTitle>
            <CardDescription>
              Unduh laporan operasional instan. Kredensial Subscription Vault selalu
              dimasking dan data biaya dibatasi sesuai peran Anda ({role}).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col justify-between gap-3 rounded-lg border p-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Ekspor .CSV</span>
                  <Badge variant="outline">PapaParse UTF-8</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  Format tabular ringan dengan UTF-8 BOM untuk Microsoft Excel &
                  analisis data.
                </p>
              </div>
              <div className="space-y-2">
                <Select value={csvScope} onValueChange={setCsvScope}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="Pilih cakupan CSV" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Modul (Bundel)</SelectItem>
                    <SelectItem value="inventory">Inventaris & Part Mainan</SelectItem>
                    <SelectItem value="anomalies">Anomali Stok & Sanitasi</SelectItem>
                    <SelectItem value="subscriptions">Vault Langganan</SelectItem>
                    <SelectItem value="archives">Arsip Berkas</SelectItem>
                    <SelectItem value="deliveries">Log Pengiriman</SelectItem>
                    <SelectItem value="audit">Log Aktivitas (Audit)</SelectItem>
                  </SelectContent>
                </Select>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <a
                    href={`/api/exports/csv?scope=${encodeURIComponent(csvScope)}`}
                    download
                  >
                    <ArrowDownToLine className="mr-1.5 size-3.5" />
                    Unduh .CSV
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-lg border p-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Workbook .XLSX</span>
                  <Badge variant="outline">ExcelJS 5 Tab</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  Tab: Ringkasan, Inventaris & Part Mainan, Vault Langganan (masked),
                  Arsip Berkas, dan Log Pengiriman.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="w-full">
                <a href="/api/exports/xlsx" download>
                  <FileSpreadsheet className="mr-1.5 size-3.5" />
                  Unduh Laporan .XLSX
                </a>
              </Button>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-lg border p-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Laporan Resmi .PDF</span>
                  <Badge variant="outline">Star Champs Official</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  Header resmi Star Champs, statistik eksekutif, tabel anomali stok, dan
                  blok tanda tangan 3 kolom.
                </p>
              </div>
              <Button asChild size="sm" className="w-full">
                <a href="/api/exports/pdf" download>
                  <FileText className="mr-1.5 size-3.5" />
                  Unduh Laporan .PDF
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Can>

      {/* 2. Siklus Pengkinian Data Minggu Terakhir */}
      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" />
                Siklus Pengkinian Data Minggu Terakhir — {period.periodLabel} (
                <span className="font-mono">{period.periodCode}</span>)
              </CardTitle>
              <CardDescription>
                Berjalan mulai tanggal 24 tiap bulan hingga cut-off pukul 23:59 WIB di
                akhir bulan.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{progressPct}% Opname</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {period.active
                ? `Hari ke-${period.day} dari ${period.lastDay} · ${period.daysUntilCutoff === 0 ? "Cut-off akhir bulan hari ini (23:59 WIB)" : `${period.daysUntilCutoff} hari menuju cut-off`}.`
                : `Saat ini tanggal ${period.day}. Checklist tetap dapat disiapkan sebelum jendela resmi tanggal 24 dimulai.`}
            </p>
          </div>

          {/* Stage 1: Room-by-Room Opname Checklist */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Tahap 1 — Checklist Stock Opname Per Ruangan (R01–R06, ADM, GDG)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {OPNAME_ROOM_CODES.map((roomCode) => {
                const entry = checklist[roomCode];
                const stat = roomStatMap.get(roomCode);
                const checked = Boolean(entry?.checked);
                const canToggle = can("reconciliation.submit") && !isLocked;

                return (
                  <label
                    key={roomCode}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      checked
                        ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20"
                        : "hover:bg-muted/40"
                    } ${!canToggle ? "cursor-not-allowed opacity-85" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!canToggle || isPending}
                      onCheckedChange={(val) =>
                        handleToggleRoom(roomCode, val === true)
                      }
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-semibold">
                          {roomCode}
                        </span>
                        {(stat?.anomalyCount ?? 0) > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            {stat?.anomalyCount} anomali
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs font-medium">
                        {LOCATION_LABELS[roomCode]}
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        {stat?.totalItems ?? 0} item aktif
                      </p>
                      {entry?.checked_at && (
                        <p className="text-muted-foreground truncate text-[10px]">
                          {checked ? "Dicek" : "Diubah"} oleh{" "}
                          {entry.checked_by_name ?? "Petugas"} ·{" "}
                          {formatDateWIB(entry.checked_at, true)}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Stage 1 Approvals */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  Pemeriksaan Kepala Terapis
                </p>
                <p className="mt-1 font-medium">
                  {reconciliation?.approved_by_leader
                    ? approvers.leaderName ?? "Team Leader"
                    : "Belum disetujui"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {reconciliation?.approved_by_leader_at
                    ? formatDateWIB(reconciliation.approved_by_leader_at, true)
                    : "Menunggu konfirmasi opname Team Leader"}
                </p>
              </div>
              <Button
                size="sm"
                variant={reconciliation?.approved_by_leader ? "outline" : "default"}
                disabled={
                  role !== "TEAM_LEADER" ||
                  isLocked ||
                  isPending ||
                  Boolean(reconciliation?.approved_by_leader)
                }
                onClick={() => handleApproveStage("leader")}
              >
                {reconciliation?.approved_by_leader
                  ? "Sudah Disetujui Leader"
                  : "Setujui (Team Leader)"}
              </Button>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  Verifikasi Admin Ops
                </p>
                <p className="mt-1 font-medium">
                  {reconciliation?.verified_by_admin
                    ? approvers.adminName ?? "Super Admin"
                    : "Belum diverifikasi"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {reconciliation?.verified_by_admin_at
                    ? formatDateWIB(reconciliation.verified_by_admin_at, true)
                    : "Menunggu verifikasi data & snapshot Super Admin"}
                </p>
              </div>
              <Button
                size="sm"
                variant={reconciliation?.verified_by_admin ? "outline" : "default"}
                disabled={
                  role !== "SUPER_ADMIN" ||
                  isLocked ||
                  isPending ||
                  Boolean(reconciliation?.verified_by_admin)
                }
                onClick={() => handleApproveStage("admin")}
              >
                {reconciliation?.verified_by_admin
                  ? "Sudah Diverifikasi Admin"
                  : "Verifikasi (Super Admin)"}
              </Button>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  Pengesahan Akhir & Kunci
                </p>
                <p className="mt-1 font-medium">
                  {reconciliation?.approved_by_owner
                    ? approvers.ownerName ?? "Owner"
                    : "Menunggu Pengesahan"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {reconciliation?.locked_at
                    ? `Dikunci: ${formatDateWIB(reconciliation.locked_at, true)}`
                    : "Mengunci periode rekonsiliasi bulan ini"}
                </p>
              </div>
              <Button
                size="sm"
                variant={isLocked ? "secondary" : "default"}
                disabled={role !== "OWNER" || isLocked || isPending}
                onClick={() => setOwnerLockDialogOpen(true)}
              >
                <Lock className="mr-1.5 size-3.5" />
                {isLocked ? "Periode Terkunci" : "Sahkan & Kunci (Owner)"}
              </Button>
            </div>
          </div>

          {/* Stage 2 & Stage 3 Backup Snapshot Controls */}
          <Can action="backup.run_manual">
            <div className="bg-muted/30 flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">
                  Tahap 2 & 3 — Snapshot Otomatis & Cut-Off Bulanan (Khusus Super Admin)
                </p>
                <p className="text-muted-foreground text-xs">
                  Membuat bundel JSON + .XLSX + .CSV + .PDF ke bucket privat{" "}
                  <code>backups</code> beserta perhitungan diff otomatis.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    handleCreateBackup(
                      "PRE_UPDATE",
                      `Pre-Update Snapshot periode ${period.periodLabel}`,
                    )
                  }
                >
                  <DatabaseBackup className="mr-1.5 size-3.5" />
                  Pre-Update (`BKP-PRE-{period.periodCode}`)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    handleCreateBackup(
                      "MONTHLY_CUTOFF",
                      `Cut-Off Snapshot akhir bulan ${period.periodLabel}`,
                    )
                  }
                >
                  <ShieldCheck className="mr-1.5 size-3.5" />
                  Cut-Off (`BKP-FINAL-{period.periodCode}`)
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => setManualDialogOpen(true)}
                >
                  <RefreshCw className="mr-1.5 size-3.5" />
                  Backup Manual
                </Button>
              </div>
            </div>
          </Can>
        </CardContent>
      </Card>

      {/* 3. Backup Vault List (OWNER & SUPER_ADMIN) */}
      <Can action="backup.view">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseBackup className="size-4" />
              Backup Vault (`system_backups`)
            </CardTitle>
            <CardDescription>
              Riwayat seluruh snapshot, bundel laporan, perbandingan perubahan (Diff
              Viewer), dan pemulihan Point-in-Time Restore.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {backups.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Belum ada snapshot backup tersimpan. Super Admin dapat memicu Pre-Update
                atau Backup Manual di atas.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode Backup</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Waktu Dibuat</TableHead>
                    <TableHead>Ringkasan Baris</TableHead>
                    <TableHead>Unduhan Bundel</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((bkp) => {
                    const counts = parseRowCounts(bkp.row_counts_json);
                    return (
                      <TableRow key={bkp.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {bkp.backup_code}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {BACKUP_TYPE_LABELS[bkp.backup_type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {bkp.period_ym}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDateWIB(bkp.created_at, true)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {counts.items_master ?? 0} item ·{" "}
                          {counts.subscriptions_vault ?? 0} vault ·{" "}
                          {counts.archives_hybrid ?? 0} arsip
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(["xlsx", "csv", "pdf", "json"] as const).map((ext) => (
                              <Button
                                key={ext}
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 font-mono text-xs uppercase"
                                disabled={isPending}
                                onClick={() => handleDownloadBackup(bkp.id, ext)}
                              >
                                .{ext}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDiffBackup(bkp)}
                            >
                              <GitCompare className="mr-1 size-3.5" />
                              Diff
                            </Button>
                            <Can action="backup.restore">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setRestoreBackup(bkp);
                                  setRestoreConfirmCode("");
                                }}
                              >
                                <RotateCcw className="mr-1 size-3.5" />
                                Restore
                              </Button>
                            </Can>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Can>

      {/* Snapshot Diff Viewer Dialog */}
      <Dialog
        open={Boolean(diffBackup)}
        onOpenChange={(open) => !open && setDiffBackup(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="size-4" />
              Snapshot Diff Viewer —{" "}
              <span className="font-mono">{diffBackup?.backup_code}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedDiff?.previous_backup_code
                ? `Dibandingkan terhadap snapshot sebelumnya: ${selectedDiff.previous_backup_code} (${formatDateWIB(selectedDiff.previous_created_at, true)})`
                : "Snapshot awal (belum ada backup pembanding sebelumnya)."}
            </DialogDescription>
          </DialogHeader>

          {selectedDiff ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Item Baru Ditambahkan</p>
                  <p className="text-lg font-semibold">
                    {selectedDiff.new_items_count} item
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Item dihapus/keluar: {selectedDiff.removed_items_count}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">
                    Anomali Part Kurang (PART_KURANG)
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">
                      {selectedDiff.part_kurang_count} item
                    </span>
                    {formatDeltaBadge(selectedDiff.part_kurang_delta)}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Stok rendah: {selectedDiff.low_stock_count} · Perlu sanitasi:{" "}
                    {selectedDiff.needs_sanitization_count}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-xs">
                      Estimasi Biaya Langganan Vault / Bulan
                    </p>
                    <p className="text-base font-semibold">
                      {formatRupiah(selectedDiff.subscription_monthly_cost_current)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Delta Biaya</p>
                    {formatDeltaBadge(selectedDiff.subscription_cost_delta, true)}
                  </div>
                </div>
              </div>

              {selectedDiff.new_items.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase">
                    Daftar Item Baru (maks. 50)
                  </p>
                  <div className="max-h-36 overflow-y-auto rounded-md border p-2 text-xs">
                    {selectedDiff.new_items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-1"
                      >
                        <span>
                          <span className="font-mono">{item.item_code}</span> —{" "}
                          {item.name}
                        </span>
                        <Badge variant="outline">{item.room_code}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDiff.part_kurang_items.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase">
                    Item Berstatus PART_KURANG
                  </p>
                  <div className="max-h-36 overflow-y-auto rounded-md border p-2 text-xs">
                    {selectedDiff.part_kurang_items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-1"
                      >
                        <span>
                          <span className="font-mono">{item.item_code}</span> —{" "}
                          {item.name} ({item.room_code})
                        </span>
                        <Badge variant="destructive">
                          {item.current_parts}/{item.total_parts} part
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase">Perubahan Jumlah Baris</p>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {Object.entries(selectedDiff.row_deltas).map(([table, info]) => (
                    <div
                      key={table}
                      className="flex items-center justify-between rounded border px-2.5 py-1.5"
                    >
                      <span className="truncate font-mono">{table}</span>
                      <span className="font-semibold">
                        {info.current} ({info.delta >= 0 ? `+${info.delta}` : info.delta})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Data ringkasan diff belum tersedia untuk snapshot ini.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Point-in-Time Restore Dialog (SUPER_ADMIN only) */}
      <Dialog
        open={Boolean(restoreBackup)}
        onOpenChange={(open) => !open && setRestoreBackup(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <RotateCcw className="size-4" />
              Point-in-Time Restore (Super Admin)
            </DialogTitle>
            <DialogDescription>
              Sistem akan otomatis membuat <strong>Pre-Restore Safety Backup</strong>{" "}
              terlebih dahulu, lalu memulihkan data ke kondisi snapshot{" "}
              <code className="font-semibold">{restoreBackup?.backup_code}</code>. Item
              yang dibuat setelah snapshot akan dipindahkan ke Recycle Bin (soft-delete).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirm-restore-code">
              Ketik ulang kode backup{" "}
              <code className="font-semibold">{restoreBackup?.backup_code}</code> untuk
              konfirmasi:
            </Label>
            <Input
              id="confirm-restore-code"
              value={restoreConfirmCode}
              onChange={(e) => setRestoreConfirmCode(e.target.value)}
              placeholder={restoreBackup?.backup_code ?? ""}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestoreBackup(null)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={
                isPending ||
                !restoreBackup ||
                restoreConfirmCode.trim().toUpperCase() !==
                  restoreBackup.backup_code.toUpperCase()
              }
              onClick={handleConfirmRestore}
            >
              {isPending ? "Memulihkan..." : "Jalankan Restore Aman"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Backup Dialog */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Backup Manual Sekarang</DialogTitle>
            <DialogDescription>
              Menyimpan dump JSON lengkap (tanpa secret plaintext/encrypted) beserta
              bundel .XLSX, .CSV, dan .PDF ke storage privat <code>backups</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="manual-backup-notes">Catatan Backup (Opsional)</Label>
            <Textarea
              id="manual-backup-notes"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Contoh: Snapshot sebelum audit eksternal / migrasi rak"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setManualDialogOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              disabled={isPending}
              onClick={() => handleCreateBackup("MANUAL", manualNotes)}
            >
              {isPending ? "Memproses..." : "Buat Snapshot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Owner Final Approval & Lock Dialog */}
      <Dialog open={ownerLockDialogOpen} onOpenChange={setOwnerLockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pengesahan Akhir & Kunci Periode ({period.periodCode})</DialogTitle>
            <DialogDescription>
              Setelah dikunci oleh Owner, daftar opname dan persetujuan periode{" "}
              <strong>{period.periodLabel}</strong> tidak dapat diubah lagi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="owner-lock-notes">Catatan Pengesahan Owner (Opsional)</Label>
            <Textarea
              id="owner-lock-notes"
              value={ownerNotes}
              onChange={(e) => setOwnerNotes(e.target.value)}
              placeholder="Contoh: Disetujui sesuai hasil opname akhir bulan."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOwnerLockDialogOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              disabled={isPending}
              onClick={() => handleApproveStage("owner", ownerNotes)}
            >
              {isPending ? "Mengunci..." : "Sahkan & Kunci Periode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
