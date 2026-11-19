"use server";

import { revalidatePath } from "next/cache";

import { requireAction, requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ArchivePhysicalStatus, LocationCode } from "@/types/database";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ArchiveCabinetCode = Extract<LocationCode, "L01" | "L02" | "L03" | "L04">;

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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_CABINETS: readonly ArchiveCabinetCode[] = ["L01", "L02", "L03", "L04"];

const VALID_PHYSICAL_STATUSES: readonly ArchivePhysicalStatus[] = [
  "TERSEDIA_DI_LEMARI",
  "DIPINJAM",
  "ARSIP_LAMA",
];

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return cleaned.slice(-100) || "dokumen-arsip";
}

function validateHttpUrl(value: string | null): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateArchiveFields(input: CreateArchiveInput): string | null {
  if (!input.title || input.title.trim().length === 0) {
    return "Judul dokumen arsip wajib diisi.";
  }
  if (!input.category || input.category.trim().length === 0) {
    return "Kategori dokumen wajib diisi.";
  }
  if (!VALID_CABINETS.includes(input.cabinet_code)) {
    return "Kode lemari arsip harus L01, L02, L03, atau L04.";
  }
  if (!input.drawer_no || input.drawer_no.trim().length === 0) {
    return "Nomor laci wajib diisi.";
  }
  if (!VALID_PHYSICAL_STATUSES.includes(input.physical_status)) {
    return "Status fisik arsip tidak valid.";
  }
  if (
    input.physical_status === "DIPINJAM" &&
    input.borrowed_by &&
    !isValidUuid(input.borrowed_by)
  ) {
    return "Peminjam arsip tidak valid.";
  }
  const driveLink = normalizeOptionalText(input.drive_link);
  if (driveLink && !validateHttpUrl(driveLink)) {
    return "Tautan Google Drive harus berupa URL valid (https://...).";
  }
  return null;
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

  const originalName = input.fileName?.trim();
  if (!originalName) {
    return { ok: false, error: "Nama file tidak valid." };
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
      error: "Ukuran file melebihi batas maksimal 25 MB.",
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
      error:
        error?.message ||
        "Gagal menyiapkan unggahan file ke bucket arsip privat.",
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

  if (!input.archiveId || !isValidUuid(input.archiveId)) {
    return { ok: false, error: "ID dokumen arsip tidak valid." };
  }

  const supabase = await createClient();
  const { data: archive, error: archiveErr } = await supabase
    .from("archives_hybrid")
    .select("id, title, digital_file_url, digital_file_name")
    .eq("id", input.archiveId)
    .is("deleted_at", null)
    .maybeSingle();

  if (archiveErr || !archive) {
    return {
      ok: false,
      error:
        archiveErr?.message ||
        "Dokumen arsip tidak ditemukan atau Anda tidak memiliki akses.",
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

    if (verErr || !versionRow) {
      return {
        ok: false,
        error: verErr?.message || "Versi arsip tidak ditemukan.",
      };
    }

    if (
      user.role === "STAFF" &&
      versionRow.digital_file_url !== archive.digital_file_url
    ) {
      return {
        ok: false,
        error:
          "Unduhan file versi historis hanya tersedia untuk Team Leader, Super Admin, atau Owner.",
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

  if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
    return {
      ok: true,
      data: { signedUrl: targetUrl, fileName: targetName },
    };
  }

  const { data: signedData, error: signErr } = await supabase.storage
    .from("archives")
    .createSignedUrl(
      targetUrl,
      120,
      input.download ? { download: targetName || true } : undefined,
    );

  if (signErr || !signedData?.signedUrl) {
    return {
      ok: false,
      error:
        signErr?.message ||
        "Gagal membuat tautan unduhan sementara dari bucket privat.",
    };
  }

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
 */
export async function getArchiveVersionsAction(
  archiveId: string,
): Promise<ActionResult<ArchiveVersionItem[]>> {
  await requireRouteAccess("/archives");
  await requireAction("archive.view");

  if (!archiveId || !isValidUuid(archiveId)) {
    return { ok: false, error: "ID dokumen arsip tidak valid." };
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
      error: error.message || "Gagal memuat riwayat versi dokumen.",
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

  const validationError = validateArchiveFields(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const fileUrl = normalizeOptionalText(input.digital_file_url);
  const fileName = fileUrl ? normalizeOptionalText(input.digital_file_name) : null;
  const driveLink = normalizeOptionalText(input.drive_link);
  const borrowedBy =
    input.physical_status === "DIPINJAM"
      ? normalizeOptionalText(input.borrowed_by)
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("archives_hybrid")
    .insert({
      title: input.title.trim(),
      category: input.category.trim(),
      branch_building: normalizeOptionalText(input.branch_building) ?? "Pusat",
      cabinet_code: input.cabinet_code,
      drawer_no: input.drawer_no.trim(),
      folder_code: normalizeOptionalText(input.folder_code),
      physical_status: input.physical_status,
      borrowed_by: borrowedBy,
      digital_file_url: fileUrl,
      digital_file_name: fileName,
      drive_link: driveLink,
      version_no: 1,
      is_sop_public_to_staff: Boolean(input.is_sop_public_to_staff),
      notes: normalizeOptionalText(input.notes),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, doc_code")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal menyimpan dokumen arsip.",
    };
  }

  revalidatePath("/archives");
  revalidatePath("/dashboard");
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

  if (!input.id || !isValidUuid(input.id)) {
    return { ok: false, error: "ID dokumen arsip tidak valid." };
  }

  const validationError = validateArchiveFields(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("archives_hybrid")
    .select("*")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !existing) {
    return {
      ok: false,
      error:
        fetchErr?.message ||
        "Dokumen arsip tidak ditemukan atau sudah dihapus.",
    };
  }

  const nextFileUrl = normalizeOptionalText(input.digital_file_url);
  const nextFileName = nextFileUrl
    ? normalizeOptionalText(input.digital_file_name)
    : null;
  const nextDriveLink = normalizeOptionalText(input.drive_link);

  const prevFileUrl = normalizeOptionalText(existing.digital_file_url);
  const prevDriveLink = normalizeOptionalText(existing.drive_link);

  const hasDigitalChange =
    nextFileUrl !== prevFileUrl || nextDriveLink !== prevDriveLink;

  let nextVersionNo = existing.version_no;

  if (hasDigitalChange) {
    const rawChangeNote = normalizeOptionalText(input.change_notes);
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
        error:
          verErr.message ||
          "Gagal mencatat versi sebelumnya ke riwayat versi.",
      };
    }

    nextVersionNo = existing.version_no + 1;
  }

  const borrowedBy =
    input.physical_status === "DIPINJAM"
      ? normalizeOptionalText(input.borrowed_by)
      : null;

  const { data: updated, error: updErr } = await supabase
    .from("archives_hybrid")
    .update({
      title: input.title.trim(),
      category: input.category.trim(),
      branch_building: normalizeOptionalText(input.branch_building) ?? "Pusat",
      cabinet_code: input.cabinet_code,
      drawer_no: input.drawer_no.trim(),
      folder_code: normalizeOptionalText(input.folder_code),
      physical_status: input.physical_status,
      borrowed_by: borrowedBy,
      digital_file_url: nextFileUrl,
      digital_file_name: nextFileName,
      drive_link: nextDriveLink,
      version_no: nextVersionNo,
      is_sop_public_to_staff: Boolean(input.is_sop_public_to_staff),
      notes: normalizeOptionalText(input.notes),
      updated_by: user.id,
    })
    .eq("id", existing.id)
    .is("deleted_at", null)
    .select("id, doc_code, version_no")
    .maybeSingle();

  if (updErr || !updated) {
    return {
      ok: false,
      error: updErr?.message || "Gagal memperbarui dokumen arsip.",
    };
  }

  revalidatePath("/archives");
  revalidatePath("/dashboard");
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

  if (!input.id || !isValidUuid(input.id)) {
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
    input.physical_status === "DIPINJAM"
      ? normalizeOptionalText(input.borrowed_by)
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
      error: error?.message || "Gagal memperbarui status fisik arsip.",
    };
  }

  revalidatePath("/archives");
  return { ok: true, data: { id: data.id } };
}

/**
 * Soft-deletes an archive document (moves to 30-day Recycle Bin).
 */
export async function softDeleteArchiveAction(
  archiveId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAction("archive.manage");

  if (!archiveId || !isValidUuid(archiveId)) {
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
      error: error.message || "Gagal menghapus dokumen arsip.",
    };
  }

  if (!data) {
    return {
      ok: false,
      error: "Dokumen arsip tidak ditemukan atau sudah dihapus.",
    };
  }

  revalidatePath("/archives");
  revalidatePath("/dashboard");
  revalidatePath("/recycle-bin");
  return { ok: true, data: { id: data.id } };
}
