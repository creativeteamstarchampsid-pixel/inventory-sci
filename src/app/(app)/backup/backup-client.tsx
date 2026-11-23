"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  CalendarClock,
  CheckCircle2,
  DatabaseBackup,
  FileJson,
  FileSpreadsheet,
  FileText,
  GitCompare,
  Loader2,
  Lock,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
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
import { ROLE_LABELS } from "@/lib/rbac";
import {
  formatBytes,
  sanitizeStorageFilename,
  scanAndValidateUploadFile,
} from "@/lib/upload-security";
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

type VerifiedRestoreJsonPreview = {
  safeFileName: string;
  fileSize: number;
  backupCode: string | null;
  backupType: string | null;
  periodYm: string | null;
  capturedAt: string | null;
  capturedByName: string | null;
  tableCounts: Record<string, number>;
  matchedVaultBackup: SystemBackup | null;
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

async function downloadFromEndpoint(url: string, fallbackFilename: string) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    let message = `Gagal mengunduh file (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Ignore non-JSON error body
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] || fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  return filename;
}

export function BackupClient({
  period,
  reconciliation: initialReconciliation,
  approverNames: initialApprovers,
  roomStats,
  backups,
}: BackupClientProps) {
  const router = useRouter();
  const { runWithFeedback, showError, showSuccess } = useCartoonFeedback();
  const { user, role, can } = useRole();
  const canExportFinancial = can("export.financial");
  const canSubmitOpname = can("reconciliation.submit");
  const canVerifyAdmin = can("reconciliation.verify_admin");
  const canApproveFinal = can("reconciliation.approve_final");
  const canViewBackups = can("backup.view");
  const canRunBackup = can("backup.run_manual");
  const canRestoreBackup = can("backup.restore");
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
  const [isScanningRestoreJson, setIsScanningRestoreJson] = useState(false);
  const [restoreJsonError, setRestoreJsonError] = useState<string | null>(null);
  const [restoreJsonPreview, setRestoreJsonPreview] =
    useState<VerifiedRestoreJsonPreview | null>(null);
  const restoreJsonInputRef = useRef<HTMLInputElement | null>(null);

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

  const checkedRoomCount = useMemo(
    () => OPNAME_ROOM_CODES.filter((code) => checklist[code]?.checked).length,
    [checklist],
  );

  const totalItemsAcrossRooms = useMemo(
    () => roomStats.reduce((sum, s) => sum + s.totalItems, 0),
    [roomStats],
  );

  const totalAnomaliesAcrossRooms = useMemo(
    () => roomStats.reduce((sum, s) => sum + s.anomalyCount, 0),
    [roomStats],
  );

  const handleDirectExport = (
    format: "csv" | "xlsx" | "pdf",
    url: string,
    fallbackFilename: string,
    label: string,
  ) => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const filename = await runWithFeedback(
          {
            mode: "batch",
            workingTitle: `Menyiapkan Ekspor ${label}... 📦`,
            workingMessage: `Tim mini lagi merangkai laporan ${label} periode ${period.periodLabel} biar lengkap dan rapi. Tunggu sebentar ya~`,
            successTitle: `Ekspor ${label} Siap! ♪`,
            successMessage: (name) =>
              `Yeay! Berkas ${name} sudah selesai diunduh ke perangkatmu~`,
            errorTitle: `Yah, Ekspor ${label} Gagal...`,
            errorMessage: (err) =>
              err instanceof Error
                ? err.message
                : `Gagal mengunduh laporan ${label}. Coba lagi ya!`,
          },
          () => downloadFromEndpoint(url, fallbackFilename),
        );
        setFeedback({
          type: "success",
          message: `Berkas ${filename} berhasil diunduh.`,
        });
      } catch (err) {
        setFeedback({
          type: "error",
          message:
            err instanceof Error
              ? err.message
              : `Gagal mengunduh laporan ${format.toUpperCase()}.`,
        });
      }
    });
  };

  const handleToggleRoom = (roomCode: LocationCode, checked: boolean) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: checked
            ? `Menandai Opname ${roomCode}... ✅`
            : `Membuka Checklist ${roomCode}... ✏️`,
          workingMessage: `Dino Joguman lagi mencatat status cek ruangan ${LOCATION_LABELS[roomCode]} biar progres bulan ini makin rapi~`,
          successTitle: checked
            ? `Ruang ${roomCode} Beres Dicek! ✨`
            : `Checklist ${roomCode} Diperbarui`,
          successMessage: (result) =>
            result.ok
              ? (result.message ?? `Opname ${roomCode} berhasil diperbarui.`)
              : "",
          errorTitle: `Gagal Memperbarui ${roomCode}`,
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          toggleOpnameRoomChecklist({
            periodYm: period.periodCode,
            roomCode,
            checked,
          }),
      );
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
    const isFinalLock = stage === "owner";
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: isFinalLock ? "batch" : "working",
          workingTitle: isFinalLock
            ? "Mengesahkan & Mengunci Periode! 🔒"
            : stage === "leader"
              ? "Mencatat Persetujuan Kepala Terapis..."
              : "Mencatat Verifikasi Admin...",
          workingMessage: isFinalLock
            ? `Tim mini lagi menyelesaikan pengesahan akhir Owner dan mengunci rekonsiliasi periode ${period.periodLabel} dengan aman~`
            : `Dino Joguman lagi membubuhkan stempel persetujuan bulanan periode ${period.periodLabel} nih~`,
          successTitle: isFinalLock
            ? "Periode Resmi Disahkan & Dikunci! 🎉"
            : "Persetujuan Tercatat! ♪",
          successMessage: (result) =>
            result.ok
              ? (result.message ?? "Persetujuan berhasil dicatat.")
              : "",
          errorTitle: "Gagal Mencatat Persetujuan",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          approveReconciliationStage({
            periodYm: period.periodCode,
            stage,
            notes,
          }),
      );
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
        setOwnerNotes("");
      }
      setFeedback({
        type: "success",
        message: res.message ?? "Persetujuan berhasil dicatat.",
      });
      router.refresh();
    });
  };

  const handleCreateBackup = (
    backupType: "PRE_UPDATE" | "MONTHLY_CUTOFF" | "MANUAL",
    notes?: string,
  ) => {
    setFeedback(null);
    const labelMap = {
      PRE_UPDATE: "Pre-Update Snapshot",
      MONTHLY_CUTOFF: "Cut-Off Bulanan",
      MANUAL: "Backup Manual",
    } as const;
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "batch",
          workingTitle: `Membuat ${labelMap[backupType]}... 🚀`,
          workingMessage:
            "Tim mini lagi lembur menyusun bundel JSON, Excel, CSV, PDF & menghitung diff perubahan sekaligus. Santai dulu ya~",
          successTitle: "Snapshot Backup Tersimpan! ✨",
          successMessage: (result) =>
            result.ok
              ? (result.message ?? "Backup lengkap berhasil diamankan di brankas!")
              : "",
          errorTitle: "Yah, Backup Gagal Dibuat...",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          createBackupSnapshotAction({
            backupType,
            periodYm: period.periodCode,
            notes,
          }),
      );
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
      router.refresh();
    });
  };

  const handleDownloadBackup = (
    backupId: string,
    fileType: "json" | "xlsx" | "csv" | "pdf",
  ) => {
    setFeedback(null);
    const extUpper = fileType.toUpperCase();
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "batch",
          workingTitle: `Menyiapkan Bundel .${extUpper}... 📦`,
          workingMessage: `Tim mini lagi mengambil berkas .${extUpper} dari brankas backup buat kamu unduh nih~`,
          successTitle: `Unduhan .${extUpper} Siap! ♪`,
          successMessage: `Tautan unduhan bundel .${extUpper} sudah dibuka di tab baru!`,
          errorTitle: `Gagal Mengunduh .${extUpper}`,
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () => getBackupDownloadUrlAction({ backupId, fileType }),
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  };

  const handleConfirmRestore = () => {
    if (!restoreBackup) return;
    const targetCode = restoreBackup.backup_code;
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "batch",
          workingTitle: "Menjalankan Point-in-Time Restore! 🔄",
          workingMessage: `Tim mini lagi bikin Pre-Restore Safety Backup dulu lalu memulihkan data ke snapshot ${targetCode}. Tunggu sampai beres ya~`,
          successTitle: "Pemulihan Data Selesai! 🎉",
          successMessage: (result) =>
            result.ok
              ? (result.message ?? "Point-in-Time Restore berhasil diselesaikan!")
              : "",
          errorTitle: "Yah, Restore Gagal...",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          restoreBackupPointInTimeAction({
            backupId: restoreBackup.id,
            confirmCode: restoreConfirmCode,
          }),
      );
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
      router.refresh();
    });
  };

  const handleClearRestoreJson = () => {
    setRestoreJsonPreview(null);
    setRestoreJsonError(null);
    if (restoreJsonInputRef.current) {
      restoreJsonInputRef.current.value = "";
    }
  };

  const handleRestoreJsonFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const inputEl = event.target;
    const file = inputEl.files?.[0] ?? null;
    if (!file) return;

    setRestoreJsonError(null);
    setRestoreJsonPreview(null);
    setIsScanningRestoreJson(true);

    try {
      const scan = await scanAndValidateUploadFile(file, "backup-json");
      if (!scan.ok) {
        inputEl.value = "";
        setRestoreJsonError(scan.error);
        showError({
          title: "File Restore JSON Ditolak 🛡️",
          message: scan.error,
        });
        return;
      }

      const rawText = (await file.text()).replace(/^\uFEFF/, "").trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const tablesRaw = parsed.tables;

      if (
        !tablesRaw ||
        typeof tablesRaw !== "object" ||
        Array.isArray(tablesRaw) ||
        !Array.isArray((tablesRaw as Record<string, unknown>).items_master)
      ) {
        const schemaMsg =
          "File JSON lolos pemindaian keamanan, tetapi tidak memiliki struktur snapshot StarOps (`tables.items_master` tidak ditemukan).";
        inputEl.value = "";
        setRestoreJsonError(schemaMsg);
        showError({
          title: "Struktur Snapshot Tidak Sesuai",
          message: schemaMsg,
        });
        return;
      }

      const tableCounts: Record<string, number> = {};
      for (const [tableName, rows] of Object.entries(
        tablesRaw as Record<string, unknown>,
      )) {
        if (Array.isArray(rows)) {
          tableCounts[tableName] = rows.length;
        }
      }

      const backupCode =
        typeof parsed.backup_code === "string" && parsed.backup_code.trim()
          ? parsed.backup_code.trim()
          : null;
      const backupType =
        typeof parsed.backup_type === "string" ? parsed.backup_type : null;
      const periodYm =
        typeof parsed.period_ym === "string" ? parsed.period_ym : null;
      const capturedAt =
        typeof parsed.captured_at === "string" ? parsed.captured_at : null;
      const capturedByRaw =
        parsed.captured_by &&
        typeof parsed.captured_by === "object" &&
        !Array.isArray(parsed.captured_by)
          ? (parsed.captured_by as Record<string, unknown>)
          : null;
      const capturedByName =
        capturedByRaw && typeof capturedByRaw.name === "string"
          ? capturedByRaw.name
          : null;

      const matchedVaultBackup = backupCode
        ? backups.find(
            (b) => b.backup_code.toUpperCase() === backupCode.toUpperCase(),
          ) ?? null
        : null;

      const safeFileName = sanitizeStorageFilename(
        file.name,
        "backup-snapshot",
      );

      setRestoreJsonPreview({
        safeFileName,
        fileSize: file.size,
        backupCode,
        backupType,
        periodYm,
        capturedAt,
        capturedByName,
        tableCounts,
        matchedVaultBackup,
      });

      showSuccess({
        title: "File Restore JSON Terverifikasi! 🛡️",
        message: backupCode
          ? `Snapshot ${backupCode} lolos pemindaian keamanan (${formatBytes(file.size)}) dan siap ditinjau.`
          : `Berkas "${safeFileName}" lolos pemindaian keamanan dan siap ditinjau.`,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal memverifikasi file backup JSON.";
      inputEl.value = "";
      setRestoreJsonError(msg);
      showError({
        title: "Gagal Memindai File Backup",
        message: msg,
      });
    } finally {
      setIsScanningRestoreJson(false);
    }
  };

  const selectedDiff = diffBackup ? parseDiffSummary(diffBackup.diff_summary_json) : null;

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        accent="sky"
        mascot="backup"
        badge={canViewBackups ? "Pusat Ekspor & Cadangan" : "Opname & Ekspor"}
        title={
          canViewBackups
            ? "Ekspor, Rekonsiliasi & Backup Center"
            : "Cek Ruangan & Ekspor Operasional"
        }
        description={
          canViewBackups
            ? canRestoreBackup
              ? "Pusat ekspor multi-format (.CSV / .XLSX / .PDF), siklus pengkinian data akhir bulan, cadangan data, dan Point-in-Time Restore."
              : "Pusat ekspor multi-format (.CSV / .XLSX / .PDF), siklus pengkinian data akhir bulan, dan cadangan data (backup)."
            : "Ekspor laporan operasional ruangan & alat terapi (tanpa data harga) serta checklist pengecekan ruangan bulanan."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={period.active ? "default" : "outline"}
              className="border-2 border-[#2C2623] bg-[#FFFBE6] px-3 py-1 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40 dark:bg-amber-950/60 dark:text-amber-100"
            >
              <CalendarClock className="mr-1.5 size-3.5" />
              {period.active
                ? `Pengkinian Aktif (${period.daysUntilCutoff} hari ke cut-off)`
                : `Periode ${period.periodLabel}`}
            </Badge>
            {isLocked && (
              <Badge
                variant="secondary"
                className="border-2 border-[#2C2623] bg-[#E8FBF1] px-3 py-1 text-xs font-extrabold text-[#14532D] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40 dark:bg-emerald-950/60 dark:text-emerald-200"
              >
                <Lock className="mr-1.5 size-3.5" />
                Dikunci Owner
              </Badge>
            )}
          </div>
        }
      />

      {/* Quick Pastel Overview Stats */}
      <div
        className={`grid gap-4 sm:grid-cols-2 ${canViewBackups ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
      >
        <KawaiiStatCard
          label="Progres Opname Ruangan"
          value={`${checkedRoomCount} / ${OPNAME_ROOM_CODES.length}`}
          hint={`${progressPct}% ruangan sudah diverifikasi`}
          accent="mint"
          icon={<CheckCircle2 className="size-4" />}
        />
        <KawaiiStatCard
          label="Total Aset & Item Aktif"
          value={totalItemsAcrossRooms}
          hint={
            totalAnomaliesAcrossRooms > 0
              ? `${totalAnomaliesAcrossRooms} item anomali perlu dicek`
              : "Semua ruangan bebas anomali!"
          }
          accent={totalAnomaliesAcrossRooms > 0 ? "peach" : "butter"}
          icon={
            totalAnomaliesAcrossRooms > 0 ? (
              <AlertTriangle className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )
          }
        />
        <KawaiiStatCard
          label="Status Periode"
          value={isLocked ? "Terkunci" : period.active ? "Aktif" : "Persiapan"}
          hint={`Periode ${period.periodLabel} (${period.periodCode})`}
          accent="sky"
          icon={isLocked ? <Lock className="size-4" /> : <CalendarClock className="size-4" />}
        />
        {canViewBackups && (
          <KawaiiStatCard
            label="Arsip Snapshot Vault"
            value={backups.length}
            hint={
              backups[0]
                ? `Terbaru: ${backups[0].backup_code}`
                : "Belum ada snapshot tersimpan"
            }
            accent="lavender"
            icon={<DatabaseBackup className="size-4" />}
          />
        )}
      </div>

      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          className={
            feedback.type === "error"
              ? "rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-rose-950/40"
              : "rounded-2xl border-2 border-[#2C2623] bg-[#E8FBF1] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-emerald-950/40"
          }
        >
          {feedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600" />
          )}
          <AlertTitle className="font-extrabold">
            {feedback.type === "error" ? "Operasi Gagal" : "Berhasil! ♪"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* 1. Multi-Format Export Engine */}
      <Can action="export.data">
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
          <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#E8F6FF]/65 dark:bg-sky-950/25">
            <CardTitle className="flex items-center gap-2 text-base font-extrabold">
              <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#7CC4FA] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                <ArrowDownToLine className="size-4" />
              </span>
              {canExportFinancial
                ? "Mesin Ekspor Multi-Format"
                : "Ekspor Data Operasional"}
            </CardTitle>
            <CardDescription>
              {canExportFinancial
                ? `Unduh laporan operasional & aset instan sesuai peran Anda (${ROLE_LABELS[role].title}). Kredensial Brankas Akun Digital selalu dimasking.`
                : `Unduh laporan operasional barang, anomali, dan arsip (tanpa data harga, pengiriman, brankas akun, atau audit) untuk peran ${ROLE_LABELS[role].title}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-5 md:grid-cols-3">
            {/* CSV Card */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border-2 border-[#2C2623] bg-[#E8FBF1]/85 p-4 shadow-[3px_3px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5E9D6]/35 dark:bg-emerald-950/30">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold">Ekspor .CSV</span>
                  <Badge
                    variant="outline"
                    className="border-[#2C2623] bg-[#FFFDF7] text-[11px] font-bold text-[#2C2623] dark:bg-emerald-900/50 dark:text-emerald-100"
                  >
                    PapaParse UTF-8
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Format tabular ringan dengan UTF-8 BOM untuk Microsoft Excel &amp;
                  analisis data.
                </p>
              </div>
              <div className="space-y-2.5">
                <Select value={csvScope} onValueChange={setCsvScope}>
                  <SelectTrigger
                    className="w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-medium dark:bg-background"
                    size="sm"
                  >
                    <SelectValue placeholder="Pilih cakupan CSV" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {canExportFinancial
                        ? "Semua Modul (Bundel)"
                        : "Semua Modul Operasional"}
                    </SelectItem>
                    <SelectItem value="inventory">
                      {canExportFinancial
                        ? "Inventaris & Part Mainan"
                        : "Barang & Alat Terapi (Tanpa Harga)"}
                    </SelectItem>
                    <SelectItem value="anomalies">Anomali Stok &amp; Sanitasi</SelectItem>
                    <SelectItem value="archives">Arsip Berkas &amp; SOP</SelectItem>
                    {canExportFinancial && (
                      <>
                        <SelectItem value="subscriptions">
                          Brankas Akun Digital
                        </SelectItem>
                        <SelectItem value="deliveries">Log Pengiriman</SelectItem>
                        <SelectItem value="audit">Riwayat Aktivitas (Audit)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full bg-[#FFFDF7] font-bold dark:bg-background"
                  disabled={isPending}
                  onClick={() =>
                    handleDirectExport(
                      "csv",
                      `/api/exports/csv?scope=${encodeURIComponent(csvScope)}`,
                      `starops-${csvScope}-${period.periodCode}.csv`,
                      ".CSV",
                    )
                  }
                >
                  <ArrowDownToLine className="mr-1.5 size-3.5" />
                  Unduh .CSV
                </Button>
              </div>
            </div>

            {/* XLSX Card */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6]/90 p-4 shadow-[3px_3px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5E9D6]/35 dark:bg-amber-950/30">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold">Workbook .XLSX</span>
                  <Badge
                    variant="outline"
                    className="border-[#2C2623] bg-[#FFFDF7] text-[11px] font-bold text-[#2C2623] dark:bg-amber-900/50 dark:text-amber-100"
                  >
                    {canExportFinancial ? "ExcelJS 5 Tab" : "ExcelJS Operasional"}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {canExportFinancial
                    ? "Tab: Ringkasan, Inventaris & Part Mainan, Brankas Akun Digital (masked), Arsip Berkas, dan Log Pengiriman."
                    : "Tab operasional: Ringkasan (termasuk anomali), Barang & Alat Terapi (tanpa harga), dan Arsip Berkas."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full bg-[#FFFDF7] font-bold dark:bg-background"
                disabled={isPending}
                onClick={() =>
                  handleDirectExport(
                    "xlsx",
                    "/api/exports/xlsx",
                    `starops-laporan-${period.periodCode}.xlsx`,
                    "Excel .XLSX",
                  )
                }
              >
                <FileSpreadsheet className="mr-1.5 size-3.5" />
                Unduh Laporan .XLSX
              </Button>
            </div>

            {/* PDF Card */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5]/90 p-4 shadow-[3px_3px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5E9D6]/35 dark:bg-pink-950/30">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold">Laporan Resmi .PDF</span>
                  <Badge
                    variant="outline"
                    className="border-[#2C2623] bg-[#FFFDF7] text-[11px] font-bold text-[#2C2623] dark:bg-pink-900/50 dark:text-pink-100"
                  >
                    Star Champs Official
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {canExportFinancial
                    ? "Header resmi Star Champs, statistik eksekutif, tabel anomali stok, dan blok tanda tangan 3 kolom."
                    : "Header resmi Star Champs, ringkasan operasional ruangan, tabel anomali alat terapi, dan blok tanda tangan."}
                </p>
              </div>
              <Button
                size="sm"
                className="w-full font-bold"
                disabled={isPending}
                onClick={() =>
                  handleDirectExport(
                    "pdf",
                    "/api/exports/pdf",
                    `starops-laporan-bulanan-${period.periodCode}.pdf`,
                    "Laporan .PDF",
                  )
                }
              >
                <FileText className="mr-1.5 size-3.5" />
                Unduh Laporan .PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </Can>

      {/* 2. Siklus Pengkinian Data Minggu Terakhir */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
        <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#FFFBE6]/70 dark:bg-amber-950/25">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <ShieldCheck className="size-4" />
                </span>
                <span>
                  Siklus Pengkinian Data Minggu Terakhir — {period.periodLabel} (
                  <span className="font-mono">{period.periodCode}</span>)
                </span>
              </CardTitle>
              <CardDescription className="mt-1">
                Berjalan mulai tanggal 24 tiap bulan hingga cut-off pukul 23:59 WIB di
                akhir bulan.
              </CardDescription>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#2C2623] bg-[#E8FBF1] px-3.5 py-1 text-sm font-extrabold text-[#14532D] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-emerald-950/60 dark:text-emerald-200">
              <PackageCheck className="size-4" />
              {progressPct}% Opname
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          {/* Chunky Comic Progress Bar */}
          <div className="space-y-2 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-4 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5E9D6]/30 dark:bg-card">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Progres Checklist Ruangan</span>
              <span className="font-mono">
                {checkedRoomCount} dari {OPNAME_ROOM_CODES.length} ruang
              </span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full border-2 border-[#2C2623] bg-[#F5E9D6]/60 dark:bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#34D399] via-[#2AB673] to-[#7CC4FA] transition-all duration-300"
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-extrabold">
                <span className="inline-flex size-6 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#A7F3D0] text-xs font-black text-[#2C2623]">
                  1
                </span>
                Tahap 1 — Checklist Stock Opname Per Ruangan (R01–R06, ADM, GDG)
              </h3>
              {!canSubmitOpname && (
                <Badge variant="outline" className="text-[11px]">
                  Mode Baca Saja
                </Badge>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {OPNAME_ROOM_CODES.map((roomCode) => {
                const entry = checklist[roomCode];
                const stat = roomStatMap.get(roomCode);
                const checked = Boolean(entry?.checked);
                const canToggle = canSubmitOpname && !isLocked;

                return (
                  <label
                    key={roomCode}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-[#2C2623] p-3.5 transition-all dark:border-[#F5E9D6]/35 ${
                      checked
                        ? "bg-[#E8FBF1] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-emerald-950/35"
                        : "bg-[#FFFDF7] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FFFBE6]/70 dark:bg-card dark:hover:bg-muted/40"
                    } ${!canToggle ? "cursor-not-allowed opacity-85 hover:translate-y-0" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!canToggle || isPending}
                      onCheckedChange={(val) =>
                        handleToggleRoom(roomCode, val === true)
                      }
                      className="mt-0.5 border-2 border-[#2C2623]"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#2C2623] bg-[#FFFDF7] px-2 py-0.5 font-mono text-[11px] font-extrabold text-[#2C2623] dark:bg-background dark:text-foreground">
                          {roomCode}
                        </span>
                        {checked && (
                          <span className="rounded-full bg-[#2AB673] px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                            ✓ Beres
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs font-extrabold">
                        {LOCATION_LABELS[roomCode]}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground text-[11px] font-medium">
                          {stat?.totalItems ?? 0} item aktif
                        </span>
                        {(stat?.anomalyCount ?? 0) > 0 && (
                          <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                            {stat?.anomalyCount} anomali
                          </Badge>
                        )}
                      </div>
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

          {/* Stage Approvals (no disabled cross-role buttons) */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-extrabold">
              <span className="inline-flex size-6 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#7CC4FA] text-xs font-black text-[#2C2623]">
                2
              </span>
              Alur Persetujuan &amp; Pengesahan Bulanan (3 Tahap)
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Approval 1: Team Leader */}
              <div className="flex flex-col justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#E8F6FF]/85 p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5E9D6]/35 dark:bg-sky-950/30">
                <div>
                  <p className="text-muted-foreground text-[11px] font-extrabold tracking-wide uppercase">
                    1 · Pemeriksaan {ROLE_LABELS.TEAM_LEADER.title}
                  </p>
                  <p className="mt-1.5 text-sm font-extrabold">
                    {reconciliation?.approved_by_leader
                      ? approvers.leaderName ?? ROLE_LABELS.TEAM_LEADER.title
                      : "Belum disetujui"}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {reconciliation?.approved_by_leader_at
                      ? formatDateWIB(reconciliation.approved_by_leader_at, true)
                      : `Menunggu konfirmasi opname ${ROLE_LABELS.TEAM_LEADER.title}`}
                  </p>
                </div>
                {reconciliation?.approved_by_leader ? (
                  <Badge
                    variant="secondary"
                    className="w-fit border-[#2C2623] bg-[#E8FBF1] text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200"
                  >
                    <CheckCircle2 className="mr-1 size-3.5 text-emerald-600" />
                    Sudah Disetujui
                  </Badge>
                ) : (role === "TEAM_LEADER" || role === "OWNER") && !isLocked ? (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleApproveStage("leader")}
                  >
                    Setujui ({ROLE_LABELS[role].title})
                  </Button>
                ) : (
                  <Badge variant="outline" className="w-fit bg-[#FFFDF7] dark:bg-background">
                    {isLocked
                      ? "Periode Terkunci"
                      : `Menunggu ${ROLE_LABELS.TEAM_LEADER.title}`}
                  </Badge>
                )}
              </div>

              {/* Approval 2: Super Admin */}
              <div className="flex flex-col justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#F3EEFF]/85 p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5E9D6]/35 dark:bg-violet-950/30">
                <div>
                  <p className="text-muted-foreground text-[11px] font-extrabold tracking-wide uppercase">
                    2 · Verifikasi {ROLE_LABELS.SUPER_ADMIN.title}
                  </p>
                  <p className="mt-1.5 text-sm font-extrabold">
                    {reconciliation?.verified_by_admin
                      ? approvers.adminName ?? ROLE_LABELS.SUPER_ADMIN.title
                      : "Belum diverifikasi"}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {reconciliation?.verified_by_admin_at
                      ? formatDateWIB(reconciliation.verified_by_admin_at, true)
                      : `Menunggu verifikasi data ${ROLE_LABELS.SUPER_ADMIN.title}`}
                  </p>
                </div>
                {reconciliation?.verified_by_admin ? (
                  <Badge
                    variant="secondary"
                    className="w-fit border-[#2C2623] bg-[#E8FBF1] text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200"
                  >
                    <CheckCircle2 className="mr-1 size-3.5 text-emerald-600" />
                    Sudah Diverifikasi
                  </Badge>
                ) : canVerifyAdmin && !isLocked ? (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleApproveStage("admin")}
                  >
                    Verifikasi ({ROLE_LABELS[role].title})
                  </Button>
                ) : (
                  <Badge variant="outline" className="w-fit bg-[#FFFDF7] dark:bg-background">
                    {isLocked
                      ? "Periode Terkunci"
                      : `Menunggu ${ROLE_LABELS.SUPER_ADMIN.title}`}
                  </Badge>
                )}
              </div>

              {/* Approval 3: Owner Lock */}
              <div className="flex flex-col justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFF3E8]/90 p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5E9D6]/35 dark:bg-orange-950/30">
                <div>
                  <p className="text-muted-foreground text-[11px] font-extrabold tracking-wide uppercase">
                    3 · Pengesahan Akhir &amp; Kunci
                  </p>
                  <p className="mt-1.5 text-sm font-extrabold">
                    {reconciliation?.approved_by_owner
                      ? approvers.ownerName ?? ROLE_LABELS.OWNER.title
                      : "Menunggu Pengesahan"}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {reconciliation?.locked_at
                      ? `Dikunci: ${formatDateWIB(reconciliation.locked_at, true)}`
                      : "Mengunci periode rekonsiliasi bulan ini"}
                  </p>
                </div>
                {isLocked ? (
                  <Badge
                    variant="secondary"
                    className="w-fit border-[#2C2623] bg-[#FFFBE6] text-[#2C2623] dark:bg-amber-950/60 dark:text-amber-200"
                  >
                    <Lock className="mr-1 size-3.5" />
                    Periode Terkunci
                  </Badge>
                ) : canApproveFinal ? (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => setOwnerLockDialogOpen(true)}
                  >
                    <Lock className="mr-1.5 size-3.5" />
                    Sahkan &amp; Kunci ({ROLE_LABELS.OWNER.title})
                  </Button>
                ) : (
                  <Badge variant="outline" className="w-fit bg-[#FFFDF7] dark:bg-background">
                    Menunggu Pengesahan {ROLE_LABELS.OWNER.title}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Stage 2 & Stage 3 Backup Snapshot Controls (OWNER & Admin Operasional) */}
          <Can action="backup.run_manual">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border-2 border-dashed border-[#2C2623] bg-[#F3EEFF]/80 p-4 shadow-[3px_3px_0px_0px_#2C2623] sm:flex-row sm:items-center dark:border-[#F5E9D6]/40 dark:bg-violet-950/25">
              <div className="space-y-1">
                <p className="text-sm font-extrabold">
                  Tahap 2 &amp; 3 — Snapshot Cadangan &amp; Cut-Off Bulanan
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Membuat bundel JSON + .XLSX + .CSV + .PDF ke bucket privat{" "}
                  <code className="rounded bg-[#FFFDF7] px-1.5 py-0.5 font-mono font-bold dark:bg-background">
                    backups
                  </code>{" "}
                  beserta perhitungan diff otomatis.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-[#FFFDF7] font-bold dark:bg-background"
                  disabled={isPending}
                  onClick={() =>
                    handleCreateBackup(
                      "PRE_UPDATE",
                      `Pre-Update Snapshot periode ${period.periodLabel}`,
                    )
                  }
                >
                  <DatabaseBackup className="mr-1.5 size-3.5" />
                  Pre-Update (BKP-PRE-{period.periodCode})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-[#FFFDF7] font-bold dark:bg-background"
                  disabled={isPending}
                  onClick={() =>
                    handleCreateBackup(
                      "MONTHLY_CUTOFF",
                      `Cut-Off Snapshot akhir bulan ${period.periodLabel}`,
                    )
                  }
                >
                  <ShieldCheck className="mr-1.5 size-3.5" />
                  Cut-Off (BKP-FINAL-{period.periodCode})
                </Button>
                <Button
                  size="sm"
                  className="font-bold"
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

      {/* 3. Backup Vault List (OWNER & Admin Operasional) */}
      <Can action="backup.view">
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
          <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#E8FBF1]/60 dark:bg-emerald-950/25">
            <CardTitle className="flex items-center gap-2 text-base font-extrabold">
              <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                <DatabaseBackup className="size-4" />
              </span>
              <span>
                Backup Vault (<code className="font-mono text-sm">system_backups</code>)
              </span>
            </CardTitle>
            <CardDescription>
              {canRestoreBackup
                ? "Riwayat seluruh snapshot, bundel laporan, perbandingan perubahan (Diff Viewer), dan pemulihan Point-in-Time Restore."
                : "Riwayat seluruh snapshot cadangan data, bundel laporan, dan perbandingan perubahan (Diff Viewer)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {/* Secure Local Restore JSON Scanner & Preview (Security Checks #19 & #20) */}
            <div className="space-y-3 rounded-2xl border-2 border-dashed border-[#2C2623] bg-[#F0F9FF]/80 p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5E9D6]/35 dark:bg-sky-950/25 dark:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-extrabold">
                      <FileJson className="size-4 text-[#0284C7] dark:text-sky-300" />
                      Verifikasi &amp; Pratinjau File Restore (.JSON)
                    </span>
                    <Badge
                      variant="outline"
                      className="rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] px-2 py-0 text-[10px] font-extrabold text-[#14532D] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-emerald-400/50 dark:bg-emerald-950/70 dark:text-emerald-200 dark:shadow-none"
                    >
                      <ShieldCheck className="size-3" />
                      Scan UTF-8, Anti-XSS &amp; Maks 15 MB
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Unggah file cadangan <code>.json</code> lokal untuk dipindai
                    keamanannya sebelum menampilkan pratinjau isi tabel atau
                    menjalankan Point-in-Time Restore.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Label
                    htmlFor="restore-json-file"
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] px-3.5 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5E9D6]/40 dark:bg-background dark:text-foreground dark:shadow-none"
                  >
                    {isScanningRestoreJson ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" />
                    )}
                    {isScanningRestoreJson
                      ? "Memindai JSON..."
                      : "Pilih File Backup .JSON"}
                  </Label>
                  <input
                    id="restore-json-file"
                    ref={restoreJsonInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    disabled={isPending || isScanningRestoreJson}
                    onChange={handleRestoreJsonFileChange}
                  />
                  {restoreJsonPreview && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleClearRestoreJson}
                      className="h-9 rounded-xl px-2.5 text-xs font-bold hover:bg-[#FFE4E6] dark:hover:bg-rose-950/50"
                    >
                      <X className="size-3.5" />
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              {restoreJsonError && (
                <Alert
                  variant="destructive"
                  className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] dark:border-rose-500/40 dark:bg-rose-950/50"
                >
                  <AlertTriangle className="size-4" />
                  <AlertTitle className="text-xs font-extrabold">
                    Pemindaian File Restore Gagal
                  </AlertTitle>
                  <AlertDescription className="text-xs">
                    {restoreJsonError}
                  </AlertDescription>
                </Alert>
              )}

              {restoreJsonPreview && (
                <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#E8FBF1]/90 p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-emerald-400/40 dark:bg-emerald-950/30 dark:shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#14532D] dark:text-emerald-200">
                        <ShieldCheck className="size-4" />
                        Lolos Scan Keamanan ·{" "}
                        <span className="font-mono">
                          {restoreJsonPreview.safeFileName}
                        </span>{" "}
                        ({formatBytes(restoreJsonPreview.fileSize)})
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        Kode:{" "}
                        <strong className="font-mono text-foreground">
                          {restoreJsonPreview.backupCode ?? "Tidak tercantum"}
                        </strong>{" "}
                        · Periode:{" "}
                        <strong className="font-mono text-foreground">
                          {restoreJsonPreview.periodYm ?? "-"}
                        </strong>
                        {restoreJsonPreview.capturedAt
                          ? ` · Dibuat ${formatDateWIB(restoreJsonPreview.capturedAt, true)}`
                          : ""}
                        {restoreJsonPreview.capturedByName
                          ? ` oleh ${restoreJsonPreview.capturedByName}`
                          : ""}
                      </p>
                    </div>

                    {restoreJsonPreview.matchedVaultBackup && canRestoreBackup ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => {
                          setRestoreBackup(restoreJsonPreview.matchedVaultBackup);
                          setRestoreConfirmCode("");
                        }}
                        className="rounded-xl border-2 border-[#2C2623] font-extrabold shadow-[2px_2px_0px_0px_#2C2623]"
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        Lanjutkan Restore ({restoreJsonPreview.matchedVaultBackup.backup_code})
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="rounded-full border-[#2C2623] bg-[#FFFDF7] text-[10px] font-bold text-[#2C2623] dark:bg-background dark:text-foreground"
                      >
                        {restoreJsonPreview.matchedVaultBackup
                          ? "Cocok di Vault (Restore Khusus Owner)"
                          : "Pratinjau Offline Terverifikasi"}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                    {Object.entries(restoreJsonPreview.tableCounts).map(
                      ([tbl, count]) => (
                        <div
                          key={tbl}
                          className="flex items-center justify-between gap-1 rounded-xl border border-[#2C2623]/50 bg-[#FFFDF7] px-2.5 py-1.5 dark:border-emerald-500/30 dark:bg-background"
                        >
                          <span className="truncate font-mono text-[11px]">
                            {tbl}
                          </span>
                          <span className="font-extrabold">{count}</span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>

            {backups.length === 0 ? (
              <KawaiiEmptyState
                mascot="backup"
                title="Brankas Snapshot Masih Kosong"
                description="Belum ada snapshot backup tersimpan. Gunakan tombol Pre-Update atau Backup Manual di atas untuk membuat cadangan data pertama."
                action={
                  canRunBackup ? (
                    <Button size="sm" onClick={() => setManualDialogOpen(true)}>
                      <DatabaseBackup className="mr-1.5 size-3.5" />
                      Buat Backup Manual
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/35">
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
                          <TableCell className="font-mono text-xs font-extrabold">
                            {bkp.backup_code}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="bg-[#FFFBE6] text-[#2C2623] dark:bg-amber-950/50 dark:text-amber-100"
                            >
                              {BACKUP_TYPE_LABELS[bkp.backup_type]}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">
                            {bkp.period_ym}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatDateWIB(bkp.created_at, true)}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="font-semibold">{counts.items_master ?? 0}</span> item ·{" "}
                            <span className="font-semibold">
                              {counts.subscriptions_vault ?? 0}
                            </span>{" "}
                            vault ·{" "}
                            <span className="font-semibold">{counts.archives_hybrid ?? 0}</span>{" "}
                            arsip
                          </TableCell>
                          <TableCell>
                            <Can action="backup.download">
                              <div className="flex flex-wrap gap-1">
                                {(["xlsx", "csv", "pdf", "json"] as const).map((ext) => (
                                  <Button
                                    key={ext}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-lg bg-[#FFFDF7] px-2 font-mono text-[11px] font-bold uppercase dark:bg-background"
                                    disabled={isPending}
                                    onClick={() => handleDownloadBackup(bkp.id, ext)}
                                  >
                                    .{ext}
                                  </Button>
                                ))}
                              </div>
                            </Can>
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
              </div>
            )}
          </CardContent>
        </Card>
      </Can>

      {/* Snapshot Diff Viewer Dialog (OWNER & Admin Operasional) */}
      {canViewBackups && (
        <Dialog
          open={Boolean(diffBackup)}
          onOpenChange={(open) => !open && setDiffBackup(null)}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold">
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
                  <div className="rounded-2xl border-2 border-[#2C2623] bg-[#E8FBF1]/80 p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:bg-emerald-950/30">
                    <p className="text-muted-foreground text-xs font-bold">
                      Item Baru Ditambahkan
                    </p>
                    <p className="text-lg font-extrabold">
                      {selectedDiff.new_items_count} item
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Item dihapus/keluar: {selectedDiff.removed_items_count}
                    </p>
                  </div>
                  <div className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5]/85 p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:bg-pink-950/30">
                    <p className="text-muted-foreground text-xs font-bold">
                      Anomali Part Kurang (PART_KURANG)
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold">
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

                <div className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6]/90 p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-950/30">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-muted-foreground text-xs font-bold">
                        Estimasi Biaya Langganan Brankas Digital / Bulan
                      </p>
                      <p className="text-base font-extrabold">
                        {formatRupiah(selectedDiff.subscription_monthly_cost_current)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground text-xs font-bold">Delta Biaya</p>
                      {formatDeltaBadge(selectedDiff.subscription_cost_delta, true)}
                    </div>
                  </div>
                </div>

                {selectedDiff.new_items.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-extrabold uppercase">
                      Daftar Item Baru (maks. 50)
                    </p>
                    <div className="max-h-36 overflow-y-auto rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-2.5 text-xs dark:bg-card">
                      {selectedDiff.new_items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-1"
                        >
                          <span>
                            <span className="font-mono font-bold">{item.item_code}</span> —{" "}
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
                    <p className="text-xs font-extrabold uppercase">
                      Item Berstatus PART_KURANG
                    </p>
                    <div className="max-h-36 overflow-y-auto rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-2.5 text-xs dark:bg-card">
                      {selectedDiff.part_kurang_items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-1"
                        >
                          <span>
                            <span className="font-mono font-bold">{item.item_code}</span> —{" "}
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
                  <p className="text-xs font-extrabold uppercase">Perubahan Jumlah Baris</p>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    {Object.entries(selectedDiff.row_deltas).map(([table, info]) => (
                      <div
                        key={table}
                        className="flex items-center justify-between rounded-xl border-2 border-[#2C2623]/70 bg-[#FFFDF7] px-2.5 py-1.5 dark:bg-card"
                      >
                        <span className="truncate font-mono">{table}</span>
                        <span className="font-extrabold">
                          {info.current} ({info.delta >= 0 ? `+${info.delta}` : info.delta})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <KawaiiEmptyState
                mascot="backup"
                title="Data Diff Belum Tersedia"
                description="Data ringkasan diff belum tersedia untuk snapshot ini."
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Point-in-Time Restore Dialog (OWNER only) */}
      {canRestoreBackup && (
        <Dialog
          open={Boolean(restoreBackup)}
          onOpenChange={(open) => !open && setRestoreBackup(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2 font-extrabold">
                <RotateCcw className="size-4" />
                Point-in-Time Restore (Khusus Owner)
              </DialogTitle>
              <DialogDescription>
                Sistem akan otomatis membuat <strong>Pre-Restore Safety Backup</strong>{" "}
                terlebih dahulu, lalu memulihkan data ke kondisi snapshot{" "}
                <code className="font-semibold">{restoreBackup?.backup_code}</code>. Item
                yang dibuat setelah snapshot akan dipindahkan ke Recycle Bin (soft-delete).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="confirm-restore-code" className="font-bold">
                Ketik ulang kode backup{" "}
                <code className="rounded bg-[#FFF0F5] px-1.5 py-0.5 font-mono font-bold text-[#881337] dark:bg-rose-950/60 dark:text-rose-200">
                  {restoreBackup?.backup_code}
                </code>{" "}
                untuk konfirmasi:
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
      )}

      {/* Manual Backup Dialog (OWNER & Admin Operasional) */}
      {canRunBackup && (
        <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-extrabold">
                Buat Backup Manual Sekarang
              </DialogTitle>
              <DialogDescription>
                Menyimpan dump JSON lengkap (tanpa secret plaintext/encrypted) beserta
                bundel .XLSX, .CSV, dan .PDF ke storage privat <code>backups</code>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="manual-backup-notes" className="font-bold">
                Catatan Backup (Opsional)
              </Label>
              <Textarea
                id="manual-backup-notes"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Contoh: Snapshot sebelum audit eksternal / migrasi rak"
                className="rounded-xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/40"
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
      )}

      {/* Owner Final Approval & Lock Dialog (OWNER only) */}
      {canApproveFinal && (
        <Dialog open={ownerLockDialogOpen} onOpenChange={setOwnerLockDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-extrabold">
                Pengesahan Akhir &amp; Kunci Periode ({period.periodCode})
              </DialogTitle>
              <DialogDescription>
                Setelah dikunci oleh Owner, daftar opname dan persetujuan periode{" "}
                <strong>{period.periodLabel}</strong> tidak dapat diubah lagi.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="owner-lock-notes" className="font-bold">
                Catatan Pengesahan Owner (Opsional)
              </Label>
              <Textarea
                id="owner-lock-notes"
                value={ownerNotes}
                onChange={(e) => setOwnerNotes(e.target.value)}
                placeholder="Contoh: Disetujui sesuai hasil opname akhir bulan."
                className="rounded-xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/40"
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
      )}
    </div>
  );
}
