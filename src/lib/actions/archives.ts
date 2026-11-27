"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAction, requireRouteAccess } from "@/lib/auth";
import { validateLocationCode } from "@/lib/locations";
import {
  isSafeHttpUrl,
  isValidUuid,
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeStoragePath,
  sanitizeTextInput,
} from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { recordStorageObjectEgress } from "@/lib/telemetry";
import type { ArchivePhysicalStatus, Database, LocationCode } from "@/types/database";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ArchiveCabinetCode = LocationCode;

export type CreateArchiveInput = {
  title: string;
  category: string;
  branch_building?: string;
  cabinet_code: ArchiveCabinetCode;
  drawer_no: string;
  folder_code?: string | null;
  physical_status: ArchivePhysicalStatus;
  borrowed_by?: string | null;
  digital_file_url?: string | null;
  digital_file_name?: string | null;
  drive_link?: string | null;
  is_sop_public_to_staff: boolean;
  notes?: string | null;
};

export type UpdateArchiveInput = CreateArchiveInput & {
  id: string;
  change_notes?: string | null;
};

export type ArchiveVersionItem = {
  id: string;
  archive_id: string;
  version_no: number;
  digital_file_url: string | null;
  digital_file_name: string | null;
  drive_link: string | null;
  change_notes: string | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
};

const VALID_PHYSICAL_STATUSES: readonly ArchivePhysicalStatus[] = [
  "TERSEDIA_DI_LEMARI",
  "DIPINJAM",
  "ARSIP_LAMA",
];

function formatArchiveDbError(
  error: unknown,
  cabinetCode: string,
  fallback: string,
  context: string,
): string {
  const errObj =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : null;
  const code = typeof errObj?.code === "string" ? errObj.code.trim() : "";
  const safeMsg = sanitizeSafeError(error, fallback, context);
  if (code === "23514" || code === "22P02") {
    return `Database menolak kode lemari "${cabinetCode}" karena batasan pada archives_hybrid.cabinet_code saat ini hanya mengizinkan L01–L04 hingga migrasi 20261124_locations_master.sql dijalankan di Supabase SQL Editor.`;
  }
  return safeMsg;
}

function revalidateArchivePaths(includeRecycleBin = false) {
  revalidatePath("/archives");
  revalidatePath("/rooms");
  revalidatePath("/dashboard");
  if (includeRecycleBin) {
    revalidatePath("/recycle-bin");
  }
}

const BLOCKED_EXTENSIONS = new Set([
  "html",
  "htm",
  "svg",
  "js",
  "mjs",
  "cjs",
  "exe",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "php",
  "msi",
  "dll",
  "scr",
  "vbs",
  "jar",
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".");
  return cleaned.slice(-100) || "dokumen-arsip";
}

function validateDigitalFileReference(
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const cleaned = sanitizeOptionalText(raw, 512);
  if (!cleaned) return { ok: true, value: null };
  if (/^https?:\/\//i.test(cleaned)) {
    if (!isSafeHttpUrl(cleaned)) {
      return { ok: false, error: "Tautan file digital tidak valid." };
    }
    return { ok: true, value: cleaned };
  }
  const safePath = sanitizeStoragePath(cleaned, "docs/");
  if (!safePath) {
    return { ok: false, error: "Path file digital di storage tidak valid." };
  }
  return { ok: true, value: safePath };
}

async function validateArchiveFields(
  supabase: SupabaseClient<Database>,
  input: CreateArchiveInput,
  allowExistingCode?: string | null,
): Promise<{ ok: true; cabinetCode: string } | { ok: false; error: string }> {
  const title = sanitizeTextInput(input.title, 200);
  if (!title) {
    return { ok: false, error: "Judul dokumen arsip wajib diisi." };
  }
  const category = sanitizeTextInput(input.category, 100);
  if (!category) {
    return { ok: false, error: "Kategori dokumen wajib diisi." };
  }
  const drawerNo = sanitizeTextInput(input.drawer_no, 50);
  if (!drawerNo) {
    return { ok: false, error: "Nomor laci wajib diisi." };
  }
  if (!VALID_PHYSICAL_STATUSES.includes(input.physical_status)) {
    return { ok: false, error: "Status fisik arsip tidak valid." };
  }
  if (
    input.physical_status === "DIPINJAM" &&
    input.borrowed_by &&
    !isValidUuid(input.borrowed_by)
  ) {
    return { ok: false, error: "Peminjam arsip tidak valid." };
  }
  const driveLink = sanitizeOptionalText(input.drive_link, 2048);
  if (driveLink && !isSafeHttpUrl(driveLink)) {
    return {
      ok: false,
      error: "Tautan Google Drive harus berupa URL valid (https://...).",
    };
  }
  const fileRefCheck = validateDigitalFileReference(input.digital_file_url);
  if (!fileRefCheck.ok) {
    return { ok: false, error: fileRefCheck.error };
  }

  const cabinetCheck = await validateLocationCode(supabase, input.cabinet_code, {
    requireArchiveGroup: true,
    allowExistingCode,
  });
  if (!cabinetCheck.ok) {
    return { ok: false, error: cabinetCheck.error };
  }

  return { ok: true, cabinetCode: cabinetCheck.location.code };
}

/**
 * Generates a short-lived signed upload URL & token for the private `archives` bucket
 * so large documents upload directly without exceeding Server Action payload limits.
 */
export async function createArchiveUploadUrlAction(input: {
  fileName: string;
  fileSize: number;
}): Promise<ActionResult<{ path: string; token: string; originalName: string }>> {
  await requireAction("archive.manage");

  const originalName = sanitizeTextInput(input.fileName, 255);
  if (!originalName) {
    return { ok: false, error: "Nama file tidak valid." };
  }
  const ext = originalName.includes(".")
    ? originalName.split(".").pop()?.toLowerCase() ?? ""
    : "";
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: "Tipe file ini diblokir demi keamanan (skrip/eksekutabel/SVG tidak diizinkan).",
    };
  }
  if (
    typeof input.fileSize !== "number" ||
    !Number.isFinite(input.fileSize) ||
    input.fileSize <= 0
  ) {
    return { ok: false, error: "Ukuran file tidak valid." };
  }
  if (input.fileSize > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: "Ukuran file melebihi batas maksimal 10 MB.",
    };
  }

  const safeName = sanitizeFileName(originalName);
  const path = `docs/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("archives")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(
        error,
        "Gagal menyiapkan unggahan file ke bucket arsip privat.",
        "archives/createUploadUrl",
      ),
    };
  }

  return {
    ok: true,
    data: {
      path: data.path,
      token: data.token,
      originalName,
    },
  };
}

/**
 * Generates a signed download/preview URL for an archive's active file or historical version.
 * Respects `archives_hybrid` RLS (STAFF only allowed on `is_sop_public_to_staff = true`).
 */
export async function getArchiveSignedUrlAction(input: {
  archiveId: string;
  versionId?: string | null;
  download?: boolean;
}): Promise<ActionResult<{ signedUrl: string; fileName: string }>> {
  const user = await requireRouteAccess("/archives");
  await requireAction("archive.view");

  if (!isValidUuid(input.archiveId)) {
    return { ok: false, error: "ID dokumen arsip tidak valid." };
  }

  const supabase = await createClient();
  const { data: archive, error: archiveErr } = await supabase
    .from("archives_hybrid")
    .select("id, title, digital_file_url, digital_file_name, is_sop_public_to_staff")
    .eq("id", input.archiveId)
    .is("deleted_at", null)
    .maybeSingle();

  if (archiveErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        archiveErr,
        "Gagal memuat dokumen arsip.",
        "archives/getSignedUrl",
      ),
    };
  }
  if (!archive || (user.role === "STAFF" && !archive.is_sop_public_to_staff)) {
    return {
      ok: false,
      error: "Dokumen arsip tidak ditemukan atau Anda tidak memiliki akses.",
    };
  }

  let targetUrl = archive.digital_file_url;
  let targetName = archive.digital_file_name ?? archive.title;

  if (input.versionId) {
    if (!isValidUuid(input.versionId)) {
      return { ok: false, error: "ID versi arsip tidak valid." };
    }
    const { data: versionRow, error: verErr } = await supabase
      .from("archive_versions")
      .select("id, digital_file_url, digital_file_name")
      .eq("id", input.versionId)
      .eq("archive_id", archive.id)
      .maybeSingle();

    if (verErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          verErr,
          "Gagal memuat versi arsip.",
          "archives/getSignedUrlVersion",
        ),
      };
    }
    if (!versionRow) {
      return { ok: false, error: "Versi arsip tidak ditemukan." };
    }

    if (
      user.role === "STAFF" &&
      versionRow.digital_file_url !== archive.digital_file_url
    ) {
      return {
        ok: false,
        error:
          "Unduhan file versi historis hanya tersedia untuk Kepala Terapis, Admin Operasional, atau Owner.",
      };
    }

    targetUrl = versionRow.digital_file_url;
    targetName = versionRow.digital_file_name ?? archive.title;
  }

  if (!targetUrl) {
    return {
      ok: false,
      error: "Versi ini tidak memiliki file digital di storage.",
    };
  }

  if (/^https?:\/\//i.test(targetUrl)) {
    if (!isSafeHttpUrl(targetUrl)) {
      return { ok: false, error: "Tautan file digital tidak valid." };
    }
    return {
      ok: true,
      data: { signedUrl: targetUrl, fileName: targetName },
    };
  }

  const safePath = sanitizeStoragePath(targetUrl);
  if (!safePath) {
    return { ok: false, error: "Path file digital di storage tidak valid." };
  }

  const { data: signedData, error: signErr } = await supabase.storage
    .from("archives")
    .createSignedUrl(
      safePath,
      120,
      input.download ? { download: targetName || true } : undefined,
    );

  if (signErr || !signedData?.signedUrl) {
    return {
      ok: false,
      error: sanitizeSafeError(
        signErr,
        "Gagal membuat tautan unduhan sementara dari bucket privat.",
        "archives/createSignedUrl",
      ),
    };
  }

  await recordStorageObjectEgress("archives", safePath, 250_000);

  return {
    ok: true,
    data: {
      signedUrl: signedData.signedUrl,
      fileName: targetName,
    },
  };
}

/**
 * Fetches version history rows from `archive_versions` for a given document.
 * STAFF only sees the active SOP document — historical versions and old Drive links are hidden.
 */
export async function getArchiveVersionsAction(
  archiveId: string,
): Promise<ActionResult<ArchiveVersionItem[]>> {
  const user = await requireRouteAccess("/archives");
  await requireAction("archive.view");

  if (!isValidUuid(archiveId)) {
    return { ok: false, error: "ID dokumen arsip tidak valid." };
  }

  if (user.role === "STAFF") {
    return { ok: true, data: [] };
  }

  const supabase = await createClient();
  const { data: versions, error } = await supabase
    .from("archive_versions")
    .select("*")
    .eq("archive_id", archiveId)
    .order("version_no", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: sanitizeSafeError(
        error,
        "Gagal memuat riwayat versi dokumen.",
        "archives/getVersions",
      ),
    };
  }

  const rows = versions ?? [];
  const uploaderIds = Array.from(
    new Set(
      rows
        .map((v) => v.uploaded_by)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const profileMap = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", uploaderIds);
    for (const p of profiles ?? []) {
      if (p.full_name) profileMap.set(p.id, p.full_name);
    }
  }

  const enriched: ArchiveVersionItem[] = rows.map((v) => ({
    ...v,
    uploader_name: v.uploaded_by ? profileMap.get(v.uploaded_by) ?? null : null,
  }));

  return { ok: true, data: enriched };
}

/**
 * Creates a new hybrid archive record (OWNER & SUPER_ADMIN via `archive.manage`).
 */
export async function createArchiveAction(
  input: CreateArchiveInput,
): Promise<ActionResult<{ id: string; doc_code: string }>> {
  const user = await requireAction("archive.manage");
  const supabase = await createClient();

  const validation = await validateArchiveFields(supabase, input);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const fileRef = validateDigitalFileReference(input.digital_file_url);
  if (!fileRef.ok) return fileRef;

  const fileUrl = fileRef.value;
  const fileName = fileUrl ? sanitizeOptionalText(input.digital_file_name, 255) : null;
  const driveLink = sanitizeOptionalText(input.drive_link, 2048);
  const borrowedBy =
    input.physical_status === "DIPINJAM" && isValidUuid(input.borrowed_by)
      ? input.borrowed_by.trim()
      : null;

  const { data, error } = await supabase
    .from("archives_hybrid")
    .insert({
      title: sanitizeTextInput(input.title, 200),
      category: sanitizeTextInput(input.category, 100),
      branch_building: sanitizeOptionalText(input.branch_building, 100) ?? "Pusat",
      cabinet_code: validation.cabinetCode,
      drawer_no: sanitizeTextInput(input.drawer_no, 50),
      folder_code: sanitizeOptionalText(input.folder_code, 50),
      physical_status: input.physical_status,
      borrowed_by: borrowedBy,
      digital_file_url: fileUrl,
      digital_file_name: fileName,
      drive_link: driveLink,
      version_no: 1,
      is_sop_public_to_staff: Boolean(input.is_sop_public_to_staff),
      notes: sanitizeOptionalText(input.notes, 2000, { multiline: true }),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, doc_code")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: formatArchiveDbError(
        error,
        validation.cabinetCode,
        "Gagal menyimpan dokumen arsip.",
        "archives/create",
      ),
    };
  }

  revalidateArchivePaths();
  return { ok: true, data };
}

/**
 * Updates an archive record. When `digital_file_url` or `drive_link` changes,
 * snapshots the previous version into `archive_versions` and increments `version_no`.
 */
export async function updateArchiveAction(
  input: UpdateArchiveInput,
): Promise<ActionResult<{ id: string; doc_code: string; version_no: number }>> {
  const user = await requireAction("archive.manage");

  if (!isValidUuid(input.id)) {
    return { ok: false, error: "ID dokumen arsip tidak valid." };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("archives_hybrid")
    .select("*")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        fetchErr,
        "Gagal memuat dokumen arsip.",
        "archives/updateFetch",
      ),
    };
  }
  if (!existing) {
    return {
      ok: false,
      error: "Dokumen arsip tidak ditemukan atau sudah dihapus.",
    };
  }

  const validation = await validateArchiveFields(
    supabase,
    input,
    existing.cabinet_code,
  );
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const fileRef = validateDigitalFileReference(input.digital_file_url);
  if (!fileRef.ok) return fileRef;

  const nextFileUrl = fileRef.value;
  const nextFileName = nextFileUrl
    ? sanitizeOptionalText(input.digital_file_name, 255)
    : null;
  const nextDriveLink = sanitizeOptionalText(input.drive_link, 2048);

  const prevFileUrl = sanitizeOptionalText(existing.digital_file_url, 512);
  const prevDriveLink = sanitizeOptionalText(existing.drive_link, 2048);

  const hasDigitalChange =
    nextFileUrl !== prevFileUrl || nextDriveLink !== prevDriveLink;

  let nextVersionNo = existing.version_no;

  if (hasDigitalChange) {
    const rawChangeNote = sanitizeOptionalText(input.change_notes, 500, {
      multiline: true,
    });
    const { error: verErr } = await supabase.from("archive_versions").insert({
      archive_id: existing.id,
      version_no: existing.version_no,
      digital_file_url: prevFileUrl,
      digital_file_name: existing.digital_file_name,
      drive_link: prevDriveLink,
      change_notes:
        rawChangeNote ?? `Diperbarui ke versi ${existing.version_no + 1}`,
      uploaded_by: existing.updated_by ?? existing.created_by ?? user.id,
    });

    if (verErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          verErr,
          "Gagal mencatat versi sebelumnya ke riwayat versi.",
          "archives/insertVersion",
        ),
      };
    }

    nextVersionNo = existing.version_no + 1;
  }

  const borrowedBy =
    input.physical_status === "DIPINJAM" && isValidUuid(input.borrowed_by)
      ? input.borrowed_by.trim()
      : null;

  const { data: updated, error: updErr } = await supabase
    .from("archives_hybrid")
    .update({
      title: sanitizeTextInput(input.title, 200),
      category: sanitizeTextInput(input.category, 100),
      branch_building: sanitizeOptionalText(input.branch_building, 100) ?? "Pusat",
      cabinet_code: validation.cabinetCode,
      drawer_no: sanitizeTextInput(input.drawer_no, 50),
      folder_code: sanitizeOptionalText(input.folder_code, 50),
      physical_status: input.physical_status,
      borrowed_by: borrowedBy,
      digital_file_url: nextFileUrl,
      digital_file_name: nextFileName,
      drive_link: nextDriveLink,
      version_no: nextVersionNo,
      is_sop_public_to_staff: Boolean(input.is_sop_public_to_staff),
      notes: sanitizeOptionalText(input.notes, 2000, { multiline: true }),
      updated_by: user.id,
    })
    .eq("id", existing.id)
    .is("deleted_at", null)
    .select("id, doc_code, version_no")
    .maybeSingle();

  if (updErr || !updated) {
    return {
      ok: false,
      error: formatArchiveDbError(
        updErr,
        validation.cabinetCode,
        "Gagal memperbarui dokumen arsip.",
        "archives/update",
      ),
    };
  }

  revalidateArchivePaths();
  return { ok: true, data: updated };
}

/**
 * Quick update for physical shelf/borrowing status without modifying digital version.
 */
export async function updateArchivePhysicalStatusAction(input: {
  id: string;
  physical_status: ArchivePhysicalStatus;
  borrowed_by?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireAction("archive.manage");

  if (!isValidUuid(input.id)) {
    return { ok: false, error: "ID dokumen arsip tidak valid." };
  }
  if (!VALID_PHYSICAL_STATUSES.includes(input.physical_status)) {
    return { ok: false, error: "Status fisik arsip tidak valid." };
  }
  if (
    input.physical_status === "DIPINJAM" &&
    input.borrowed_by &&
    !isValidUuid(input.borrowed_by)
  ) {
    return { ok: false, error: "Peminjam arsip tidak valid." };
  }

  const borrowedBy =
    input.physical_status === "DIPINJAM" && isValidUuid(input.borrowed_by)
      ? input.borrowed_by.trim()
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("archives_hybrid")
    .update({
      physical_status: input.physical_status,
      borrowed_by: borrowedBy,
      updated_by: user.id,
    })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(
        error,
        "Gagal memperbarui status fisik arsip.",
        "archives/updateStatus",
      ),
    };
  }

  revalidateArchivePaths();
  return { ok: true, data: { id: data.id } };
}

/**
 * Soft-deletes an archive document (moves to 30-day Recycle Bin).
 */
export async function softDeleteArchiveAction(
  archiveId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAction("archive.manage");

  if (!isValidUuid(archiveId)) {
    return { ok: false, error: "ID dokumen arsip tidak valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("archives_hybrid")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      updated_by: user.id,
    })
    .eq("id", archiveId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: sanitizeSafeError(
        error,
        "Gagal menghapus dokumen arsip.",
        "archives/softDelete",
      ),
    };
  }

  if (!data) {
    return {
      ok: false,
      error: "Dokumen arsip tidak ditemukan atau sudah dihapus.",
    };
  }

  revalidateArchivePaths(true);
  return { ok: true, data: { id: data.id } };
}
