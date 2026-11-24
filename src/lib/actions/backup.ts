"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { fetchLocationsDirectoryWithClient } from "@/lib/locations";
import {
  captureFullBackupSnapshot,
  computeBackupDiffSummary,
  generateCsvString,
  loadExportDataset,
  persistBackupBundle,
  type BackupSnapshotPayload,
} from "@/lib/exports/csv";
import { getJakartaDateParts, getMonthlyUpdatePeriod } from "@/lib/period";
import {
  isValidPeriodYm,
  isValidUuid,
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeStoragePath,
} from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  BackupType,
  Json,
  LocationCode,
  MonthlyReconciliation,
  SystemBackup,
} from "@/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

export type RoomOpnameEntry = {
  checked: boolean;
  checked_by_id?: string | null;
  checked_by_name?: string | null;
  checked_at?: string | null;
  notes?: string;
  anomaly_count?: number;
};

export type OpnameChecklistMap = Partial<Record<LocationCode, RoomOpnameEntry>>;

const VALID_BACKUP_TYPES = new Set<BackupType>([
  "MANUAL",
  "PRE_UPDATE",
  "MONTHLY_CUTOFF",
]);

const VALID_FILE_TYPES = new Set(["json", "xlsx", "csv", "pdf"]);

function parseChecklist(
  json: Json | null | undefined,
  opnameRoomCodes: readonly LocationCode[] = [],
): OpnameChecklistMap {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {};
  }
  const record = json as Record<string, Json | undefined>;
  const keys = new Set<string>([...opnameRoomCodes, ...Object.keys(record)]);
  const result: OpnameChecklistMap = {};
  for (const room of keys) {
    const raw = record[room];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const entry = raw as Record<string, Json | undefined>;
      result[room] = {
        checked: Boolean(entry.checked),
        checked_by_id:
          typeof entry.checked_by_id === "string" ? entry.checked_by_id : null,
        checked_by_name:
          typeof entry.checked_by_name === "string" ? entry.checked_by_name : null,
        checked_at: typeof entry.checked_at === "string" ? entry.checked_at : null,
        notes: typeof entry.notes === "string" ? entry.notes : undefined,
        anomaly_count:
          typeof entry.anomaly_count === "number" ? entry.anomaly_count : undefined,
      };
    }
  }
  return result;
}

export async function toggleOpnameRoomChecklist(input: {
  periodYm: string;
  roomCode: LocationCode;
  checked: boolean;
  notes?: string;
}): Promise<ActionResult<MonthlyReconciliation>> {
  const user = await requireAction("reconciliation.submit");

  if (!isValidPeriodYm(input.periodYm)) {
    return {
      ok: false,
      error: "Format periode opname tidak valid (gunakan YYYYMM atau YYYY-MM).",
    };
  }

  const supabase = await createClient();
  const dir = await fetchLocationsDirectoryWithClient(supabase);
  const normalizedRoomCode =
    typeof input.roomCode === "string"
      ? input.roomCode.trim().toUpperCase()
      : "";

  if (!normalizedRoomCode || !dir.opnameRoomCodes.includes(normalizedRoomCode)) {
    return {
      ok: false,
      error: "Kode ruangan opname tidak valid.",
    };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("monthly_reconciliations")
    .select("*")
    .eq("period_ym", input.periodYm)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        fetchErr,
        "Gagal memuat data rekonsiliasi bulanan.",
        "backup/toggleChecklistFetch",
      ),
    };
  }

  if (existing?.locked_at) {
    return {
      ok: false,
      error: "Periode rekonsiliasi ini sudah dikunci oleh Owner dan tidak dapat diubah.",
    };
  }

  // Count active anomalies in this room for visibility
  const { data: roomItems } = await supabase
    .from("items_master")
    .select("condition, asset_type, hygiene_status, stock_qty, min_stock_threshold, total_parts, current_parts")
    .eq("room_code", normalizedRoomCode)
    .is("deleted_at", null);

  const anomalyCount = (roomItems ?? []).filter(
    (item) =>
      item.condition === "PART_KURANG" ||
      item.condition === "RUSAK_RINGAN" ||
      item.condition === "RUSAK_BERAT" ||
      (item.total_parts > 1 && item.current_parts < item.total_parts) ||
      (item.asset_type === "THERAPY_TOY" && item.hygiene_status !== "STERIL") ||
      (item.asset_type === "CONSUMABLE" &&
        item.min_stock_threshold > 0 &&
        item.stock_qty <= item.min_stock_threshold),
  ).length;

  const cleanNotes = sanitizeOptionalText(input.notes, 500, { multiline: true });
  const checklist = parseChecklist(
    existing?.opname_checklist_json,
    dir.opnameRoomCodes,
  );
  checklist[normalizedRoomCode] = {
    checked: Boolean(input.checked),
    checked_by_id: user.id,
    checked_by_name: user.fullName,
    checked_at: new Date().toISOString(),
    notes: cleanNotes ?? checklist[normalizedRoomCode]?.notes,
    anomaly_count: anomalyCount,
  };

  const completedRooms = dir.opnameRoomCodes.filter(
    (code) => checklist[code]?.checked === true,
  ).length;
  const progressPct =
    dir.opnameRoomCodes.length > 0
      ? Math.round((completedRooms / dir.opnameRoomCodes.length) * 10000) / 100
      : 0;

  let saved: MonthlyReconciliation | null = null;
  if (existing) {
    const { data, error } = await supabase
      .from("monthly_reconciliations")
      .update({
        opname_checklist_json: checklist as unknown as Json,
        opname_progress_pct: progressPct,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      return {
        ok: false,
        error: sanitizeSafeError(
          error,
          "Gagal memperbarui checklist opname.",
          "backup/toggleChecklistUpdate",
        ),
      };
    }
    saved = data;
  } else {
    const { data, error } = await supabase
      .from("monthly_reconciliations")
      .insert({
        period_ym: input.periodYm,
        opname_checklist_json: checklist as unknown as Json,
        opname_progress_pct: progressPct,
      })
      .select("*")
      .single();
    if (error) {
      return {
        ok: false,
        error: sanitizeSafeError(
          error,
          "Gagal menyimpan checklist opname.",
          "backup/toggleChecklistInsert",
        ),
      };
    }
    saved = data;
  }

  revalidatePath("/backup");
  revalidatePath("/dashboard");
  return {
    ok: true,
    data: saved,
    message: `Checklist opname ${normalizedRoomCode} diperbarui (${progressPct}%).`,
  };
}

export async function approveReconciliationStage(input: {
  periodYm: string;
  stage: "leader" | "admin" | "owner";
  notes?: string;
}): Promise<ActionResult<MonthlyReconciliation>> {
  await requireAction("reconciliation.submit");
  if (!isValidPeriodYm(input.periodYm)) {
    return {
      ok: false,
      error: "Format periode rekonsiliasi tidak valid (gunakan YYYYMM atau YYYY-MM).",
    };
  }
  if (input.stage !== "leader" && input.stage !== "admin" && input.stage !== "owner") {
    return { ok: false, error: "Tahap persetujuan rekonsiliasi tidak valid." };
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const cleanNotes =
    input.notes !== undefined
      ? sanitizeOptionalText(input.notes, 1000, { multiline: true })
      : undefined;

  if (input.stage === "owner") {
    const user = await requireAction("reconciliation.approve_final");
    const { data: existing, error: fetchErr } = await supabase
      .from("monthly_reconciliations")
      .select("*")
      .eq("period_ym", input.periodYm)
      .maybeSingle();

    if (fetchErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          fetchErr,
          "Gagal memuat data rekonsiliasi.",
          "backup/approveOwnerFetch",
        ),
      };
    }
    if (existing?.locked_at) {
      return { ok: false, error: "Periode rekonsiliasi ini sudah dikunci." };
    }

    if (existing) {
      const { data, error } = await supabase
        .from("monthly_reconciliations")
        .update({
          approved_by_owner: user.id,
          approved_by_owner_at: nowIso,
          locked_at: nowIso,
          ...(cleanNotes !== undefined ? { notes: cleanNotes } : {}),
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) {
        return {
          ok: false,
          error: sanitizeSafeError(
            error,
            "Gagal mengesahkan laporan bulanan.",
            "backup/approveOwnerUpdate",
          ),
        };
      }
      revalidatePath("/backup");
      revalidatePath("/dashboard");
      revalidatePath("/audit-log");
      return {
        ok: true,
        data,
        message: "Laporan bulanan disahkan & dikunci oleh Owner.",
      };
    }

    const { data, error } = await supabase
      .from("monthly_reconciliations")
      .insert({
        period_ym: input.periodYm,
        approved_by_owner: user.id,
        approved_by_owner_at: nowIso,
        locked_at: nowIso,
        notes: cleanNotes ?? null,
      })
      .select("*")
      .single();
    if (error) {
      return {
        ok: false,
        error: sanitizeSafeError(
          error,
          "Gagal mengesahkan laporan bulanan.",
          "backup/approveOwnerInsert",
        ),
      };
    }
    revalidatePath("/backup");
    revalidatePath("/dashboard");
    revalidatePath("/audit-log");
    return {
      ok: true,
      data,
      message: "Laporan bulanan disahkan & dikunci oleh Owner.",
    };
  }

  if (input.stage === "admin") {
    const user = await requireAction("reconciliation.verify_admin");
    const { data: existing, error: fetchErr } = await supabase
      .from("monthly_reconciliations")
      .select("*")
      .eq("period_ym", input.periodYm)
      .maybeSingle();

    if (fetchErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          fetchErr,
          "Gagal memuat data rekonsiliasi.",
          "backup/approveAdminFetch",
        ),
      };
    }
    if (existing?.locked_at) {
      return {
        ok: false,
        error: "Periode rekonsiliasi sudah dikunci oleh Owner.",
      };
    }

    const patch = {
      verified_by_admin: user.id,
      verified_by_admin_at: nowIso,
      ...(cleanNotes !== undefined ? { notes: cleanNotes } : {}),
    };

    let saved: MonthlyReconciliation | null = null;
    if (existing) {
      const { data, error } = await supabase
        .from("monthly_reconciliations")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) {
        return {
          ok: false,
          error: sanitizeSafeError(
            error,
            "Gagal mencatat verifikasi Admin Operasional.",
            "backup/approveAdminUpdate",
          ),
        };
      }
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("monthly_reconciliations")
        .insert({
          period_ym: input.periodYm,
          ...patch,
        })
        .select("*")
        .single();
      if (error) {
        return {
          ok: false,
          error: sanitizeSafeError(
            error,
            "Gagal mencatat verifikasi Admin Operasional.",
            "backup/approveAdminInsert",
          ),
        };
      }
      saved = data;
    }

    revalidatePath("/backup");
    revalidatePath("/dashboard");
    revalidatePath("/audit-log");
    return {
      ok: true,
      data: saved,
      message: "Verifikasi Admin Operasional berhasil dicatat.",
    };
  }

  const user = await requireAction("reconciliation.submit");
  if (user.role !== "TEAM_LEADER" && user.role !== "OWNER") {
    return {
      ok: false,
      error:
        "Persetujuan pemeriksaan Kepala Terapis hanya untuk peran Kepala Terapis atau Owner.",
    };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("monthly_reconciliations")
    .select("*")
    .eq("period_ym", input.periodYm)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        fetchErr,
        "Gagal memuat data rekonsiliasi.",
        "backup/approveLeaderFetch",
      ),
    };
  }
  if (existing?.locked_at) {
    return {
      ok: false,
      error: "Periode rekonsiliasi sudah dikunci oleh Owner.",
    };
  }

  const patch = {
    approved_by_leader: user.id,
    approved_by_leader_at: nowIso,
    ...(cleanNotes !== undefined ? { notes: cleanNotes } : {}),
  };

  let saved: MonthlyReconciliation | null = null;
  if (existing) {
    const { data, error } = await supabase
      .from("monthly_reconciliations")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      return {
        ok: false,
        error: sanitizeSafeError(
          error,
          "Gagal mencatat persetujuan Kepala Terapis.",
          "backup/approveLeaderUpdate",
        ),
      };
    }
    saved = data;
  } else {
    const { data, error } = await supabase
      .from("monthly_reconciliations")
      .insert({
        period_ym: input.periodYm,
        ...patch,
      })
      .select("*")
      .single();
    if (error) {
      return {
        ok: false,
        error: sanitizeSafeError(
          error,
          "Gagal mencatat persetujuan Kepala Terapis.",
          "backup/approveLeaderInsert",
        ),
      };
    }
    saved = data;
  }

  revalidatePath("/backup");
  revalidatePath("/dashboard");
  revalidatePath("/audit-log");
  return {
    ok: true,
    data: saved,
    message: "Persetujuan Kepala Terapis berhasil dicatat.",
  };
}

export async function createBackupSnapshotAction(input: {
  backupType: BackupType;
  periodYm?: string;
  notes?: string;
}): Promise<ActionResult<{ backup: SystemBackup; storageWarnings: string[] }>> {
  const user = await requireAction("backup.run_manual");
  if (!VALID_BACKUP_TYPES.has(input.backupType)) {
    return { ok: false, error: "Jenis backup tidak valid." };
  }
  if (input.periodYm && !isValidPeriodYm(input.periodYm)) {
    return {
      ok: false,
      error: "Format periode backup tidak valid (gunakan YYYYMM atau YYYY-MM).",
    };
  }

  const supabase = await createClient();
  const period = getMonthlyUpdatePeriod();
  const periodYm = input.periodYm ?? period.periodCode;
  const cleanNotes = sanitizeOptionalText(input.notes, 1000, { multiline: true });

  try {
    const { count } = await supabase
      .from("system_backups")
      .select("id", { count: "exact", head: true })
      .eq("period_ym", periodYm)
      .eq("backup_type", input.backupType);

    const existingCount = count ?? 0;
    const parts = getJakartaDateParts();
    const timeSuffix = `${String(parts.day).padStart(2, "0")}${String(parts.hour).padStart(2, "0")}${String(parts.minute).padStart(2, "0")}${String(new Date().getUTCSeconds()).padStart(2, "0")}`;

    let backupCode: string;
    if (input.backupType === "PRE_UPDATE") {
      backupCode =
        existingCount === 0
          ? `BKP-PRE-${periodYm}`
          : `BKP-PRE-${periodYm}-V${existingCount + 1}`;
    } else if (input.backupType === "MONTHLY_CUTOFF") {
      backupCode =
        existingCount === 0
          ? `BKP-FINAL-${periodYm}`
          : `BKP-FINAL-${periodYm}-V${existingCount + 1}`;
    } else {
      backupCode = `BKP-MAN-${periodYm}-${timeSuffix}`;
    }

    const dataset = await loadExportDataset(supabase, {
      actorName: user.fullName,
      actorRole: user.role,
      periodCode: periodYm,
    });

    const csvContent = generateCsvString(dataset, "all");
    const [{ generateXlsxBuffer }, { generatePdfBuffer }] = await Promise.all([
      import("@/lib/exports/xlsx"),
      import("@/lib/exports/pdf"),
    ]);
    const [xlsxBuffer, pdfBuffer, snapshot] = await Promise.all([
      generateXlsxBuffer(dataset),
      generatePdfBuffer(dataset),
      captureFullBackupSnapshot(supabase, {
        backupCode,
        backupType: input.backupType,
        periodYm,
        actorId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        notes: cleanNotes,
      }),
    ]);

    const { diffSummary, rowCounts } = await computeBackupDiffSummary(
      supabase,
      snapshot,
    );

    const result = await persistBackupBundle(supabase, {
      backupCode,
      backupType: input.backupType,
      periodYm,
      actorId: user.id,
      snapshot,
      diffSummary,
      rowCounts,
      csvContent,
      xlsxBuffer,
      pdfBuffer,
      notes: cleanNotes,
    });

    // Link backup to monthly_reconciliations if unlocked
    if (
      input.backupType === "PRE_UPDATE" ||
      input.backupType === "MONTHLY_CUTOFF"
    ) {
      const { data: rec } = await supabase
        .from("monthly_reconciliations")
        .select("id, locked_at")
        .eq("period_ym", periodYm)
        .maybeSingle();

      if (rec && !rec.locked_at) {
        await supabase
          .from("monthly_reconciliations")
          .update(
            input.backupType === "PRE_UPDATE"
              ? { pre_update_backup_id: result.backup.id }
              : { final_backup_id: result.backup.id },
          )
          .eq("id", rec.id);
      } else if (!rec) {
        await supabase.from("monthly_reconciliations").insert({
          period_ym: periodYm,
          ...(input.backupType === "PRE_UPDATE"
            ? { pre_update_backup_id: result.backup.id }
            : { final_backup_id: result.backup.id }),
        });
      }
    }

    revalidatePath("/backup");
    revalidatePath("/dashboard");
    revalidatePath("/audit-log");
    return {
      ok: true,
      data: result,
      message: `Backup ${backupCode} berhasil dibuat.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSafeError(
        err,
        "Gagal membuat backup snapshot.",
        "backup/createSnapshot",
      ),
    };
  }
}

export async function getBackupDownloadUrlAction(input: {
  backupId: string;
  fileType: "json" | "xlsx" | "csv" | "pdf";
}): Promise<ActionResult<{ url: string; isFallback: boolean }>> {
  await requireAction("backup.download");
  if (!isValidUuid(input.backupId)) {
    return { ok: false, error: "ID backup tidak valid." };
  }
  if (!VALID_FILE_TYPES.has(input.fileType)) {
    return { ok: false, error: "Format berkas unduhan tidak valid." };
  }

  const supabase = await createClient();

  const { data: backup, error } = await supabase
    .from("system_backups")
    .select("*")
    .eq("id", input.backupId)
    .maybeSingle();

  if (error || !backup) {
    return { ok: false, error: "Data backup tidak ditemukan." };
  }

  const pathMap: Record<typeof input.fileType, string | null> = {
    json: backup.snapshot_json_url,
    xlsx: backup.export_xlsx_url,
    csv: backup.export_csv_url,
    pdf: backup.export_pdf_url,
  };

  const rawStoragePath = pathMap[input.fileType];
  const safeStoragePath = sanitizeStoragePath(rawStoragePath);
  if (safeStoragePath) {
    const { data: signed, error: signErr } = await supabase.storage
      .from("backups")
      .createSignedUrl(safeStoragePath, 60, { download: true });

    if (!signErr && signed?.signedUrl) {
      return { ok: true, data: { url: signed.signedUrl, isFallback: false } };
    }
  }

  if (input.fileType === "json") {
    return {
      ok: false,
      error:
        "File snapshot JSON tidak tersedia di bucket backups. Jalankan backup baru terlebih dahulu.",
    };
  }

  return {
    ok: true,
    data: {
      url: `/api/exports/${input.fileType}?period=${encodeURIComponent(backup.period_ym)}`,
      isFallback: true,
    },
  };
}

function hasServiceRoleEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function omitKeys<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> {
  const clone = { ...obj };
  for (const key of keys) {
    delete clone[key];
  }
  return clone as Omit<T, K>;
}

export async function restoreBackupPointInTimeAction(input: {
  backupId: string;
  confirmCode: string;
}): Promise<
  ActionResult<{
    restoredFromCode: string;
    safetyBackupCode: string;
    summary: Record<string, number>;
    warnings: string[];
  }>
> {
  const user = await requireAction("backup.restore");
  if (!isValidUuid(input.backupId)) {
    return { ok: false, error: "ID backup tidak valid." };
  }

  const userClient = await createClient();

  const { data: target, error: targetErr } = await userClient
    .from("system_backups")
    .select("*")
    .eq("id", input.backupId)
    .is("deleted_at", null)
    .maybeSingle();

  if (targetErr || !target) {
    return { ok: false, error: "Backup target tidak ditemukan." };
  }

  if (
    typeof input.confirmCode !== "string" ||
    input.confirmCode.trim().toUpperCase() !== target.backup_code.toUpperCase()
  ) {
    return {
      ok: false,
      error: `Kode konfirmasi tidak cocok. Ketik persis: ${target.backup_code}`,
    };
  }

  const safeSnapshotPath = sanitizeStoragePath(target.snapshot_json_url);
  if (!safeSnapshotPath) {
    return {
      ok: false,
      error: "Backup ini tidak memiliki file snapshot.json yang valid untuk dipulihkan.",
    };
  }

  const { data: blob, error: dlErr } = await userClient.storage
    .from("backups")
    .download(safeSnapshotPath);

  if (dlErr || !blob) {
    return {
      ok: false,
      error: sanitizeSafeError(
        dlErr,
        "Gagal mengunduh file snapshot JSON backup.",
        "backup/restoreDownload",
      ),
    };
  }

  let snapshot: BackupSnapshotPayload;
  try {
    snapshot = JSON.parse(await blob.text()) as BackupSnapshotPayload;
    if (!snapshot?.tables?.items_master) {
      return { ok: false, error: "Struktur snapshot JSON tidak valid." };
    }
  } catch (err) {
    sanitizeSafeError(err, "Format snapshot JSON rusak.", "backup/restoreParse");
    return {
      ok: false,
      error: "Format snapshot JSON rusak atau tidak dapat dibaca.",
    };
  }

  // 1. Always create a Pre-Restore Safety Backup first
  const period = getMonthlyUpdatePeriod();
  const parts = getJakartaDateParts();
  const safetyCode = `BKP-SAFETY-${period.periodCode}-${String(parts.day).padStart(2, "0")}${String(parts.hour).padStart(2, "0")}${String(parts.minute).padStart(2, "0")}${String(new Date().getUTCSeconds()).padStart(2, "0")}`;

  let safetyBackupCode = safetyCode;
  try {
    const dataset = await loadExportDataset(userClient, {
      actorName: user.fullName,
      actorRole: user.role,
    });
    const csvContent = generateCsvString(dataset, "all");
    const [{ generateXlsxBuffer }, { generatePdfBuffer }] = await Promise.all([
      import("@/lib/exports/xlsx"),
      import("@/lib/exports/pdf"),
    ]);
    const [xlsxBuffer, pdfBuffer, currentSnapshot] = await Promise.all([
      generateXlsxBuffer(dataset),
      generatePdfBuffer(dataset),
      captureFullBackupSnapshot(userClient, {
        backupCode: safetyCode,
        backupType: "MANUAL",
        periodYm: period.periodCode,
        actorId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        notes: `Safety backup otomatis sebelum Point-in-Time Restore ke ${target.backup_code}`,
      }),
    ]);
    const { diffSummary, rowCounts } = await computeBackupDiffSummary(
      userClient,
      currentSnapshot,
    );
    const safety = await persistBackupBundle(userClient, {
      backupCode: safetyCode,
      backupType: "MANUAL",
      periodYm: period.periodCode,
      actorId: user.id,
      snapshot: currentSnapshot,
      diffSummary,
      rowCounts,
      csvContent,
      xlsxBuffer,
      pdfBuffer,
      notes: `Pre-Restore Safety Backup (target: ${target.backup_code})`,
    });
    safetyBackupCode = safety.backup.backup_code;
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSafeError(
        err,
        "Gagal membuat pre-restore safety backup. Pemulihan dibatalkan.",
        "backup/restoreSafetyBackup",
      ),
    };
  }

  // 2. Restore tables using admin client if available (handles immutable/workflow triggers cleanly), else userClient
  const db = hasServiceRoleEnv() ? createAdminClient() : userClient;
  const nowIso = new Date().toISOString();
  const warnings: string[] = [];
  const summary: Record<string, number> = {
    locations_master: 0,
    items_master: 0,
    item_kits: 0,
    archives_hybrid: 0,
    deliveries_log: 0,
    subscriptions_vault: 0,
    internal_requests: 0,
  };

  // Restore locations_master first so dynamic room/cabinet FKs resolve cleanly
  if (
    Array.isArray(snapshot.tables.locations_master) &&
    snapshot.tables.locations_master.length > 0
  ) {
    const { error: locErr } = await db
      .from("locations_master")
      .upsert(snapshot.tables.locations_master, { onConflict: "code" });
    if (locErr) {
      const msg = sanitizeSafeError(
        locErr,
        "gagal dipulihkan",
        "restore/locations_master",
      );
      warnings.push(`Master Lokasi: ${msg}`);
    } else {
      summary.locations_master = snapshot.tables.locations_master.length;
    }
  }

  // Restore items_master
  {
    const { data: currentRows } = await db.from("items_master").select("id, deleted_at");
    const existingIds = new Set((currentRows ?? []).map((r) => r.id));
    const snapshotIds = new Set(snapshot.tables.items_master.map((r) => r.id));

    for (const row of snapshot.tables.items_master) {
      if (existingIds.has(row.id)) {
        const mutable = omitKeys(row, ["id", "item_code", "created_at"]);
        const { error } = await db
          .from("items_master")
          .update({ ...mutable, updated_by: user.id })
          .eq("id", row.id);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal diperbarui", "restore/items_master");
          warnings.push(`Inventaris ${row.item_code}: ${msg}`);
        } else summary.items_master += 1;
      } else {
        const { error } = await db.from("items_master").insert(row);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal dipulihkan", "restore/items_master");
          warnings.push(`Inventaris ${row.item_code}: ${msg}`);
        } else summary.items_master += 1;
      }
    }

    const postSnapshotIds = (currentRows ?? [])
      .filter((r) => !r.deleted_at && !snapshotIds.has(r.id))
      .map((r) => r.id);
    if (postSnapshotIds.length > 0) {
      await db
        .from("items_master")
        .update({ deleted_at: nowIso, deleted_by: user.id })
        .in("id", postSnapshotIds);
    }
  }

  // Restore item_kits
  {
    const { data: currentRows } = await db.from("item_kits").select("id, deleted_at");
    const existingIds = new Set((currentRows ?? []).map((r) => r.id));
    const snapshotIds = new Set(snapshot.tables.item_kits.map((r) => r.id));

    for (const row of snapshot.tables.item_kits) {
      if (existingIds.has(row.id)) {
        const mutable = omitKeys(row, ["id", "kit_code", "created_at"]);
        const { error } = await db
          .from("item_kits")
          .update({ ...mutable, updated_by: user.id })
          .eq("id", row.id);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal diperbarui", "restore/item_kits");
          warnings.push(`Kit ${row.kit_code}: ${msg}`);
        } else summary.item_kits += 1;
      } else {
        const { error } = await db.from("item_kits").insert(row);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal dipulihkan", "restore/item_kits");
          warnings.push(`Kit ${row.kit_code}: ${msg}`);
        } else summary.item_kits += 1;
      }
    }

    const postSnapshotIds = (currentRows ?? [])
      .filter((r) => !r.deleted_at && !snapshotIds.has(r.id))
      .map((r) => r.id);
    if (postSnapshotIds.length > 0) {
      await db
        .from("item_kits")
        .update({ deleted_at: nowIso, deleted_by: user.id })
        .in("id", postSnapshotIds);
    }
  }

  // Restore archives_hybrid
  {
    const { data: currentRows } = await db.from("archives_hybrid").select("id, deleted_at");
    const existingIds = new Set((currentRows ?? []).map((r) => r.id));
    const snapshotIds = new Set(snapshot.tables.archives_hybrid.map((r) => r.id));

    for (const row of snapshot.tables.archives_hybrid) {
      if (existingIds.has(row.id)) {
        const mutable = omitKeys(row, ["id", "doc_code", "created_at"]);
        const { error } = await db
          .from("archives_hybrid")
          .update({ ...mutable, updated_by: user.id })
          .eq("id", row.id);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal diperbarui", "restore/archives_hybrid");
          warnings.push(`Arsip ${row.doc_code}: ${msg}`);
        } else summary.archives_hybrid += 1;
      } else {
        const { error } = await db.from("archives_hybrid").insert(row);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal dipulihkan", "restore/archives_hybrid");
          warnings.push(`Arsip ${row.doc_code}: ${msg}`);
        } else summary.archives_hybrid += 1;
      }
    }

    const postSnapshotIds = (currentRows ?? [])
      .filter((r) => !r.deleted_at && !snapshotIds.has(r.id))
      .map((r) => r.id);
    if (postSnapshotIds.length > 0) {
      await db
        .from("archives_hybrid")
        .update({ deleted_at: nowIso, deleted_by: user.id })
        .in("id", postSnapshotIds);
    }
  }

  // Restore deliveries_log
  {
    const { data: currentRows } = await db.from("deliveries_log").select("id, deleted_at");
    const existingIds = new Set((currentRows ?? []).map((r) => r.id));
    const snapshotIds = new Set(snapshot.tables.deliveries_log.map((r) => r.id));

    for (const row of snapshot.tables.deliveries_log) {
      if (existingIds.has(row.id)) {
        const mutable = omitKeys(row, ["id", "delivery_code", "created_at"]);
        const { error } = await db
          .from("deliveries_log")
          .update({ ...mutable, updated_by: user.id })
          .eq("id", row.id);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal diperbarui", "restore/deliveries_log");
          warnings.push(`Pengiriman ${row.delivery_code}: ${msg}`);
        } else summary.deliveries_log += 1;
      } else {
        const { error } = await db.from("deliveries_log").insert(row);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal dipulihkan", "restore/deliveries_log");
          warnings.push(`Pengiriman ${row.delivery_code}: ${msg}`);
        } else summary.deliveries_log += 1;
      }
    }

    const postSnapshotIds = (currentRows ?? [])
      .filter((r) => !r.deleted_at && !snapshotIds.has(r.id))
      .map((r) => r.id);
    if (postSnapshotIds.length > 0) {
      await db
        .from("deliveries_log")
        .update({ deleted_at: nowIso, deleted_by: user.id })
        .in("id", postSnapshotIds);
    }
  }

  // Restore subscriptions_vault metadata safely without overwriting encrypted bytea credentials
  {
    const { data: currentRows } = await db
      .from("subscriptions_vault")
      .select("id, deleted_at");
    const existingIds = new Set((currentRows ?? []).map((r) => r.id));
    const snapshotIds = new Set(snapshot.tables.subscriptions_vault.map((r) => r.id));
    let skippedHardDeleted = 0;

    for (const row of snapshot.tables.subscriptions_vault) {
      if (existingIds.has(row.id)) {
        const { error } = await db
          .from("subscriptions_vault")
          .update({
            service_name: row.service_name,
            plan_name: row.plan_name,
            login_email: row.login_email,
            billing_cycle: row.billing_cycle,
            cost: row.cost ?? 0,
            currency: row.currency ?? "IDR",
            payment_method: row.payment_method ?? "TRANSFER_BANK",
            payment_account_label: row.payment_account_label,
            renewal_date: row.renewal_date,
            auto_renew: row.auto_renew,
            max_slots: row.max_slots,
            assigned_users_json: row.assigned_users_json,
            notes: row.notes,
            is_active: row.is_active,
            deleted_at: row.deleted_at,
            deleted_by: row.deleted_by,
            updated_by: user.id,
          })
          .eq("id", row.id);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal diperbarui", "restore/subscriptions_vault");
          warnings.push(`Langganan ${row.sub_code}: ${msg}`);
        } else summary.subscriptions_vault += 1;
      } else {
        skippedHardDeleted += 1;
      }
    }

    if (skippedHardDeleted > 0) {
      warnings.push(
        `${skippedHardDeleted} entri Subscription Vault yang telah di-purge permanen tidak dipulihkan ulang karena kata sandi terenkripsi tidak disimpan di file snapshot.`,
      );
    }

    const postSnapshotIds = (currentRows ?? [])
      .filter((r) => !r.deleted_at && !snapshotIds.has(r.id))
      .map((r) => r.id);
    if (postSnapshotIds.length > 0) {
      await db
        .from("subscriptions_vault")
        .update({ deleted_at: nowIso, deleted_by: user.id })
        .in("id", postSnapshotIds);
    }
  }

  // Restore internal_requests
  {
    const { data: currentRows } = await db
      .from("internal_requests")
      .select("id, deleted_at");
    const existingIds = new Set((currentRows ?? []).map((r) => r.id));
    const snapshotIds = new Set(snapshot.tables.internal_requests.map((r) => r.id));

    for (const row of snapshot.tables.internal_requests) {
      if (existingIds.has(row.id)) {
        const mutable = omitKeys(row, ["id", "request_code", "created_at"]);
        const { error } = await db
          .from("internal_requests")
          .update(mutable)
          .eq("id", row.id);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal diperbarui", "restore/internal_requests");
          warnings.push(`Pengajuan ${row.request_code}: ${msg}`);
        } else summary.internal_requests += 1;
      } else {
        const { error } = await db.from("internal_requests").insert(row);
        if (error) {
          const msg = sanitizeSafeError(error, "gagal dipulihkan", "restore/internal_requests");
          warnings.push(`Pengajuan ${row.request_code}: ${msg}`);
        } else summary.internal_requests += 1;
      }
    }

    const postSnapshotIds = (currentRows ?? [])
      .filter((r) => !r.deleted_at && !snapshotIds.has(r.id))
      .map((r) => r.id);
    if (postSnapshotIds.length > 0) {
      await db
        .from("internal_requests")
        .update({ deleted_at: nowIso, deleted_by: user.id })
        .in("id", postSnapshotIds);
    }
  }

  // Explicit Audit Log entry for Point-in-Time Restore
  await userClient.from("audit_logs").insert({
    actor_id: user.id,
    actor_name: user.fullName,
    actor_role: user.role,
    action: "BACKUP_RESTORE",
    entity_type: "system_backups",
    entity_id: target.id,
    entity_code: target.backup_code,
    summary: `Point-in-Time Restore dari ${target.backup_code} (Safety Backup: ${safetyBackupCode})`,
    metadata: {
      target_backup_id: target.id,
      target_backup_code: target.backup_code,
      safety_backup_code: safetyBackupCode,
      restored_summary: summary,
      warnings,
    } as unknown as Json,
  });

  revalidatePath("/backup");
  revalidatePath("/rooms");
  revalidatePath("/inventory");
  revalidatePath("/kits");
  revalidatePath("/vault");
  revalidatePath("/archives");
  revalidatePath("/deliveries");
  revalidatePath("/requests");
  revalidatePath("/recycle-bin");
  revalidatePath("/audit-log");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: {
      restoredFromCode: target.backup_code,
      safetyBackupCode,
      summary,
      warnings,
    },
    message: `Pemulihan Point-in-Time dari ${target.backup_code} selesai. Safety backup: ${safetyBackupCode}.`,
  };
}
