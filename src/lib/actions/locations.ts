"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { LOCATION_GROUP_LABELS } from "@/lib/constants";
import {
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeTextInput,
} from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import type { LocationGroup, LocationMaster } from "@/types/database";

export type LocationActionResult<T = unknown> =
  | { ok: true; data: T; message: string }
  | { ok: false; error: string };

export type CreateLocationInput = {
  code: string;
  name: string;
  location_group: LocationGroup;
  description?: string | null;
  pic_name?: string | null;
  include_in_opname?: boolean;
  is_active?: boolean;
  sort_order?: number;
};

export type UpdateLocationInput = {
  code: string;
  name: string;
  location_group: LocationGroup;
  description?: string | null;
  pic_name?: string | null;
  include_in_opname?: boolean;
  is_active?: boolean;
  sort_order?: number;
};

const LOCATION_CODE_REGEX = /^[A-Z0-9]{2,8}$/;
const CREATABLE_GROUPS = new Set<LocationGroup>(["THERAPY", "OFFICE", "ARCHIVE"]);

type LocationAuditAction =
  | "LOCATION_CREATED"
  | "LOCATION_RENAMED"
  | "LOCATION_UPDATED"
  | "LOCATION_DELETED";

function normalizeCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

function normalizeSortOrder(raw: unknown, fallback = 100): number {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(9999, Math.trunc(numeric)));
}

function formatLocationDbError(
  err: unknown,
  fallback: string,
  context: string,
): string {
  const safeMsg = sanitizeSafeError(err, fallback, context);
  const errCode =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  if (errCode === "42P01") {
    return "Tabel master ruangan belum tersedia di database. Jalankan migrasi 20261124_locations_master.sql di Supabase SQL Editor terlebih dahulu.";
  }
  return safeMsg;
}

function revalidateLocationPaths() {
  revalidatePath("/", "layout");
  revalidatePath("/rooms");
  revalidatePath("/inventory");
  revalidatePath("/archives");
  revalidatePath("/kits");
  revalidatePath("/scan");
  revalidatePath("/deliveries");
  revalidatePath("/barcode-studio");
  revalidatePath("/backup");
  revalidatePath("/dashboard");
  revalidatePath("/recycle-bin");
  revalidatePath("/settings");
  revalidatePath("/audit-log");
}

async function insertLocationAuditLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: Awaited<ReturnType<typeof requireAction>>,
  params: {
    action: LocationAuditAction;
    code: string;
    summary: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actor.id,
    actor_name: actor.fullName,
    actor_role: actor.role,
    action: params.action,
    entity_type: "locations_master",
    entity_id: params.code,
    entity_code: params.code,
    summary: params.summary,
    old_data: null,
    new_data: null,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.error("[locations/audit]", error.message);
  }
}

export async function createLocationAction(
  input: CreateLocationInput,
): Promise<LocationActionResult<LocationMaster>> {
  const actor = await requireAction("locations.manage");

  const code = normalizeCode(input.code);
  if (!LOCATION_CODE_REGEX.test(code)) {
    return {
      ok: false,
      error:
        "Kode lokasi harus terdiri dari 2–8 karakter huruf kapital atau angka (A–Z, 0–9) tanpa spasi.",
    };
  }

  if (code === "DIG" || input.location_group === "DIGITAL") {
    return {
      ok: false,
      error:
        "Lokasi baru tidak dapat dibuat di grup Digital Vault. Pilih Ruang Terapi, Kantor & Gudang, atau Lemari Arsip.",
    };
  }

  if (!CREATABLE_GROUPS.has(input.location_group)) {
    return {
      ok: false,
      error: "Grup lokasi harus Ruang Terapi, Kantor & Gudang, atau Lemari Arsip.",
    };
  }

  const name = sanitizeTextInput(input.name, 80);
  if (name.length < 2 || name.length > 80) {
    return {
      ok: false,
      error: "Nama lokasi wajib diisi (minimal 2 karakter, maksimal 80 karakter).",
    };
  }

  const description = sanitizeOptionalText(input.description, 300);
  const picName = sanitizeOptionalText(input.pic_name, 100);
  const sortOrder = normalizeSortOrder(input.sort_order, 100);
  const includeInOpname = Boolean(input.include_in_opname);
  const isActive = input.is_active !== false;

  const supabase = await createClient();

  const { data: duplicate, error: dupErr } = await supabase
    .from("locations_master")
    .select("code, name")
    .eq("code", code)
    .maybeSingle();

  if (dupErr) {
    return {
      ok: false,
      error: formatLocationDbError(
        dupErr,
        "Gagal memeriksa ketersediaan kode lokasi.",
        "locations/createCheckDup",
      ),
    };
  }

  if (duplicate) {
    return {
      ok: false,
      error: `Kode lokasi "${code}" sudah terdaftar untuk "${duplicate.name}". Gunakan kode lain.`,
    };
  }

  const { data, error } = await supabase
    .from("locations_master")
    .insert({
      code,
      name,
      location_group: input.location_group,
      description,
      pic_name: picName,
      include_in_opname: includeInOpname,
      is_active: isActive,
      is_system: false,
      sort_order: sortOrder,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: formatLocationDbError(
        error,
        "Gagal menambahkan lokasi baru.",
        "locations/create",
      ),
    };
  }

  const created = data as LocationMaster;

  await insertLocationAuditLog(supabase, actor, {
    action: "LOCATION_CREATED",
    code: created.code,
    summary: `Menambahkan lokasi baru ${created.code} — ${created.name} (${LOCATION_GROUP_LABELS[created.location_group]})`,
    metadata: {
      location_group: created.location_group,
      include_in_opname: created.include_in_opname,
      is_active: created.is_active,
      pic_name: created.pic_name,
    },
  });

  revalidateLocationPaths();

  return {
    ok: true,
    data: created,
    message: `Lokasi ${created.code} (${created.name}) berhasil ditambahkan.`,
  };
}

export async function updateLocationAction(
  input: UpdateLocationInput,
): Promise<LocationActionResult<LocationMaster>> {
  const actor = await requireAction("locations.manage");

  const code = normalizeCode(input.code);
  if (!LOCATION_CODE_REGEX.test(code)) {
    return {
      ok: false,
      error: "Kode lokasi tidak valid.",
    };
  }

  const name = sanitizeTextInput(input.name, 80);
  if (name.length < 2 || name.length > 80) {
    return {
      ok: false,
      error: "Nama lokasi wajib diisi (minimal 2 karakter, maksimal 80 karakter).",
    };
  }

  const description = sanitizeOptionalText(input.description, 300);
  const picName = sanitizeOptionalText(input.pic_name, 100);

  const supabase = await createClient();

  const { data: existingRow, error: fetchErr } = await supabase
    .from("locations_master")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      error: formatLocationDbError(
        fetchErr,
        "Gagal memuat data lokasi.",
        "locations/updateFetch",
      ),
    };
  }

  if (!existingRow) {
    return {
      ok: false,
      error: `Lokasi "${code}" tidak ditemukan.`,
    };
  }

  const existing = existingRow as LocationMaster;
  const isDigitalLocation =
    existing.code === "DIG" || existing.location_group === "DIGITAL";

  if (isDigitalLocation) {
    if (input.location_group !== "DIGITAL") {
      return {
        ok: false,
        error: "Grup lokasi Digital Vault (DIG) tidak dapat diubah.",
      };
    }
    if (input.is_active === false) {
      return {
        ok: false,
        error: "Lokasi Digital Vault (DIG) tidak dapat dinonaktifkan.",
      };
    }
  } else {
    if (!CREATABLE_GROUPS.has(input.location_group)) {
      return {
        ok: false,
        error:
          "Grup lokasi harus Ruang Terapi, Kantor & Gudang, atau Lemari Arsip.",
      };
    }
  }

  // Prevent moving an archive cabinet out of ARCHIVE if archives reference it.
  if (existing.location_group === "ARCHIVE" && input.location_group !== "ARCHIVE") {
    const [activeArchRes, totalArchRes] = await Promise.all([
      supabase
        .from("archives_hybrid")
        .select("id", { count: "exact", head: true })
        .eq("cabinet_code", code)
        .is("deleted_at", null),
      supabase
        .from("archives_hybrid")
        .select("id", { count: "exact", head: true })
        .eq("cabinet_code", code),
    ]);

    if (activeArchRes.error || totalArchRes.error) {
      return {
        ok: false,
        error: formatLocationDbError(
          activeArchRes.error ?? totalArchRes.error,
          "Gagal memeriksa berkas arsip di lemari ini.",
          "locations/updateCheckArchives",
        ),
      };
    }

    const activeCount = activeArchRes.count ?? 0;
    const totalCount = totalArchRes.count ?? 0;
    const trashedCount = Math.max(0, totalCount - activeCount);

    if (totalCount > 0) {
      const countParts: string[] = [];
      if (activeCount > 0) countParts.push(`${activeCount} arsip aktif`);
      if (trashedCount > 0) {
        countParts.push(`${trashedCount} arsip di tempat sampah`);
      }
      const detail =
        countParts.length > 0
          ? ` (${countParts.join(", ")}; total ${totalCount} berkas)`
          : ` (${totalCount} berkas)`;

      return {
        ok: false,
        error: `Lemari ini masih memiliki berkas arsip sehingga grupnya harus tetap Lemari Arsip.${detail}`,
      };
    }
  }

  const nextGroup: LocationGroup = isDigitalLocation
    ? "DIGITAL"
    : input.location_group;
  const nextIncludeOpname = isDigitalLocation
    ? false
    : typeof input.include_in_opname === "boolean"
      ? input.include_in_opname
      : existing.include_in_opname;
  const nextIsActive = isDigitalLocation
    ? true
    : typeof input.is_active === "boolean"
      ? input.is_active
      : existing.is_active;
  const nextSortOrder = normalizeSortOrder(input.sort_order, existing.sort_order);

  const { data: updatedRow, error: updateErr } = await supabase
    .from("locations_master")
    .update({
      name,
      location_group: nextGroup,
      description,
      pic_name: picName,
      include_in_opname: nextIncludeOpname,
      is_active: nextIsActive,
      sort_order: nextSortOrder,
      updated_by: actor.id,
    })
    .eq("code", code)
    .select("*")
    .single();

  if (updateErr || !updatedRow) {
    return {
      ok: false,
      error: formatLocationDbError(
        updateErr,
        "Gagal memperbarui data lokasi.",
        "locations/update",
      ),
    };
  }

  const updated = updatedRow as LocationMaster;
  const nameChanged = existing.name !== updated.name;
  const changedFields: string[] = [];
  if (nameChanged) changedFields.push("nama");
  if (existing.location_group !== updated.location_group) changedFields.push("grup");
  if ((existing.pic_name ?? null) !== (updated.pic_name ?? null)) {
    changedFields.push("PIC");
  }
  if ((existing.description ?? null) !== (updated.description ?? null)) {
    changedFields.push("deskripsi");
  }
  if (existing.include_in_opname !== updated.include_in_opname) {
    changedFields.push("cek opname");
  }
  if (existing.is_active !== updated.is_active) changedFields.push("status aktif");
  if (existing.sort_order !== updated.sort_order) changedFields.push("urutan");

  const auditAction: LocationAuditAction = nameChanged
    ? "LOCATION_RENAMED"
    : "LOCATION_UPDATED";

  const summary = nameChanged
    ? `Mengganti nama lokasi ${code} dari "${existing.name}" menjadi "${updated.name}"`
    : changedFields.length > 0
      ? `Memperbarui lokasi ${code} (${updated.name}): ${changedFields.join(", ")}`
      : `Menyimpan ulang detail lokasi ${code} (${updated.name})`;

  await insertLocationAuditLog(supabase, actor, {
    action: auditAction,
    code,
    summary,
    metadata: {
      previous_name: existing.name,
      new_name: updated.name,
      previous_group: existing.location_group,
      new_group: updated.location_group,
      include_in_opname: updated.include_in_opname,
      is_active: updated.is_active,
    },
  });

  revalidateLocationPaths();

  return {
    ok: true,
    data: updated,
    message: nameChanged
      ? `Nama lokasi ${code} berhasil diubah menjadi "${updated.name}".`
      : `Data lokasi ${code} (${updated.name}) berhasil diperbarui.`,
  };
}

export async function toggleLocationActiveAction(input: {
  code: string;
  is_active: boolean;
}): Promise<LocationActionResult<LocationMaster>> {
  const actor = await requireAction("locations.manage");

  const code = normalizeCode(input.code);
  if (!LOCATION_CODE_REGEX.test(code)) {
    return { ok: false, error: "Kode lokasi tidak valid." };
  }

  const nextActive = Boolean(input.is_active);
  const supabase = await createClient();

  const { data: existingRow, error: fetchErr } = await supabase
    .from("locations_master")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      error: formatLocationDbError(
        fetchErr,
        "Gagal memuat data lokasi.",
        "locations/toggleActiveFetch",
      ),
    };
  }

  if (!existingRow) {
    return { ok: false, error: `Lokasi "${code}" tidak ditemukan.` };
  }

  const existing = existingRow as LocationMaster;
  if (
    (existing.code === "DIG" || existing.location_group === "DIGITAL") &&
    !nextActive
  ) {
    return {
      ok: false,
      error: "Lokasi Digital Vault (DIG) wajib selalu aktif dan tidak dapat dinonaktifkan.",
    };
  }

  const { data: updatedRow, error: updateErr } = await supabase
    .from("locations_master")
    .update({
      is_active: nextActive,
      updated_by: actor.id,
    })
    .eq("code", code)
    .select("*")
    .single();

  if (updateErr || !updatedRow) {
    return {
      ok: false,
      error: formatLocationDbError(
        updateErr,
        "Gagal mengubah status aktif lokasi.",
        "locations/toggleActive",
      ),
    };
  }

  const updated = updatedRow as LocationMaster;

  await insertLocationAuditLog(supabase, actor, {
    action: "LOCATION_UPDATED",
    code,
    summary: `${nextActive ? "Mengaktifkan" : "Menonaktifkan"} lokasi ${code} (${updated.name})`,
    metadata: {
      is_active: updated.is_active,
    },
  });

  revalidateLocationPaths();

  return {
    ok: true,
    data: updated,
    message: `Lokasi ${code} (${updated.name}) ${nextActive ? "diaktifkan" : "dinonaktifkan"}.`,
  };
}

export async function toggleLocationOpnameAction(input: {
  code: string;
  include_in_opname: boolean;
}): Promise<LocationActionResult<LocationMaster>> {
  const actor = await requireAction("locations.manage");

  const code = normalizeCode(input.code);
  if (!LOCATION_CODE_REGEX.test(code)) {
    return { ok: false, error: "Kode lokasi tidak valid." };
  }

  const nextOpname = Boolean(input.include_in_opname);
  const supabase = await createClient();

  const { data: existingRow, error: fetchErr } = await supabase
    .from("locations_master")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      error: formatLocationDbError(
        fetchErr,
        "Gagal memuat data lokasi.",
        "locations/toggleOpnameFetch",
      ),
    };
  }

  if (!existingRow) {
    return { ok: false, error: `Lokasi "${code}" tidak ditemukan.` };
  }

  const existing = existingRow as LocationMaster;
  if (
    (existing.code === "DIG" || existing.location_group === "DIGITAL") &&
    nextOpname
  ) {
    return {
      ok: false,
      error: "Lokasi Digital Vault (DIG) tidak termasuk dalam cek opname fisik bulanan.",
    };
  }

  const { data: updatedRow, error: updateErr } = await supabase
    .from("locations_master")
    .update({
      include_in_opname: nextOpname,
      updated_by: actor.id,
    })
    .eq("code", code)
    .select("*")
    .single();

  if (updateErr || !updatedRow) {
    return {
      ok: false,
      error: formatLocationDbError(
        updateErr,
        "Gagal mengubah status opname lokasi.",
        "locations/toggleOpname",
      ),
    };
  }

  const updated = updatedRow as LocationMaster;

  await insertLocationAuditLog(supabase, actor, {
    action: "LOCATION_UPDATED",
    code,
    summary: nextOpname
      ? `Menyertakan lokasi ${code} (${updated.name}) ke daftar cek opname bulanan`
      : `Mengeluarkan lokasi ${code} (${updated.name}) dari daftar cek opname bulanan`,
    metadata: {
      include_in_opname: updated.include_in_opname,
    },
  });

  revalidateLocationPaths();

  return {
    ok: true,
    data: updated,
    message: nextOpname
      ? `Lokasi ${code} (${updated.name}) kini masuk checklist opname bulanan.`
      : `Lokasi ${code} (${updated.name}) dikeluarkan dari checklist opname bulanan.`,
  };
}

export async function deleteLocationAction(
  rawCode: string,
): Promise<LocationActionResult<{ code: string }>> {
  const actor = await requireAction("locations.manage");

  const code = normalizeCode(rawCode);
  if (!LOCATION_CODE_REGEX.test(code)) {
    return { ok: false, error: "Kode lokasi tidak valid." };
  }

  const supabase = await createClient();

  const { data: existingRow, error: fetchErr } = await supabase
    .from("locations_master")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      error: formatLocationDbError(
        fetchErr,
        "Gagal memuat data lokasi.",
        "locations/deleteFetch",
      ),
    };
  }

  if (!existingRow) {
    return { ok: false, error: `Lokasi "${code}" tidak ditemukan.` };
  }

  const existing = existingRow as LocationMaster;

  if (existing.is_system === true || existing.code === "DIG") {
    return {
      ok: false,
      error:
        "Lokasi bawaan sistem tidak dapat dihapus, namun Anda dapat mengganti namanya atau menonaktifkannya.",
    };
  }

  const [itemsRes, kitsRes, borrowsRes, archivesRes] = await Promise.all([
    supabase
      .from("items_master")
      .select("id", { count: "exact", head: true })
      .eq("room_code", code),
    supabase
      .from("item_kits")
      .select("id", { count: "exact", head: true })
      .eq("assigned_room", code),
    supabase
      .from("borrow_transactions")
      .select("id", { count: "exact", head: true })
      .eq("room_code", code),
    supabase
      .from("archives_hybrid")
      .select("id", { count: "exact", head: true })
      .eq("cabinet_code", code),
  ]);

  const refErr =
    itemsRes.error ?? kitsRes.error ?? borrowsRes.error ?? archivesRes.error;
  if (refErr) {
    return {
      ok: false,
      error: formatLocationDbError(
        refErr,
        "Gagal memeriksa keterkaitan data lokasi.",
        "locations/deleteCheckRefs",
      ),
    };
  }

  const itemsCount = itemsRes.count ?? 0;
  const kitsCount = kitsRes.count ?? 0;
  const borrowsCount = borrowsRes.count ?? 0;
  const archivesCount = archivesRes.count ?? 0;

  if (itemsCount + kitsCount + borrowsCount + archivesCount > 0) {
    const refs: string[] = [];
    if (itemsCount > 0) refs.push(`${itemsCount} barang inventaris`);
    if (kitsCount > 0) refs.push(`${kitsCount} paket alat (kit)`);
    if (borrowsCount > 0) refs.push(`${borrowsCount} riwayat peminjaman`);
    if (archivesCount > 0) refs.push(`${archivesCount} berkas arsip`);

    return {
      ok: false,
      error: `Lokasi ${code} (${existing.name}) tidak dapat dihapus karena masih digunakan oleh: ${refs.join(", ")}. Pindahkan data tersebut atau nonaktifkan lokasi ini sebagai gantinya.`,
    };
  }

  const { error: deleteErr } = await supabase
    .from("locations_master")
    .delete()
    .eq("code", code);

  if (deleteErr) {
    return {
      ok: false,
      error: formatLocationDbError(
        deleteErr,
        "Gagal menghapus lokasi.",
        "locations/delete",
      ),
    };
  }

  await insertLocationAuditLog(supabase, actor, {
    action: "LOCATION_DELETED",
    code,
    summary: `Menghapus lokasi ${code} (${existing.name})`,
    metadata: {
      deleted_name: existing.name,
      deleted_group: existing.location_group,
    },
  });

  revalidateLocationPaths();

  return {
    ok: true,
    data: { code },
    message: `Lokasi ${code} (${existing.name}) berhasil dihapus.`,
  };
}
