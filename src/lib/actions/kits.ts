"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import {
  isValidUuid,
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeTextInput,
} from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import type {
  BorrowTransaction,
  HygieneStatus,
  ItemKit,
  KitStatus,
  LocationCode,
} from "@/types/database";
import type { ActionResult } from "./inventory";

export type CreateKitInput = {
  kit_name: string;
  description?: string | null;
  bundled_item_ids: string[];
  assigned_room?: LocationCode | null;
  status?: KitStatus;
};

export type UpdateKitInput = CreateKitInput;

export type KitReturnItemUpdate = {
  itemId: string;
  currentParts: number;
  hygieneStatus?: HygieneStatus;
};

const VALID_LOCATIONS: readonly LocationCode[] = [
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "ADM",
  "FO",
  "GDG",
  "L01",
  "L02",
  "L03",
  "L04",
  "DIG",
];

const VALID_KIT_STATUSES: readonly KitStatus[] = [
  "TERSEDIA",
  "DIPINJAM",
  "TIDAK_LENGKAP",
  "NONAKTIF",
];

const VALID_HYGIENE_STATUSES: readonly HygieneStatus[] = [
  "STERIL",
  "PERLU_DICUCI",
  "SEDANG_DISANITASI",
];

function getWibDateString(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

function deduplicateValidUuids(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(
    new Set(
      ids
        .filter((id): id is string => isValidUuid(id))
        .map((id) => id.trim()),
    ),
  );
}

function revalidateKitPaths() {
  revalidatePath("/kits");
  revalidatePath("/scan");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/recycle-bin");
}

export async function createKitAction(
  input: CreateKitInput,
): Promise<ActionResult<ItemKit>> {
  const user = await requireAction("kits.manage");

  const kitName = sanitizeTextInput(input.kit_name, 150);
  if (!kitName) {
    return { ok: false, error: "Nama kit wajib diisi." };
  }

  const rawIds = Array.isArray(input.bundled_item_ids) ? input.bundled_item_ids : [];
  if (rawIds.length > 100) {
    return { ok: false, error: "Maksimal 100 item dapat dimasukkan dalam satu kit." };
  }
  const bundledIds = deduplicateValidUuids(rawIds);
  if (bundledIds.length === 0 || bundledIds.length !== new Set(rawIds.map((v) => String(v).trim()).filter(Boolean)).size) {
    return { ok: false, error: "Pilih minimal satu item inventaris yang valid untuk kit." };
  }

  const assignedRoom = input.assigned_room ?? null;
  if (assignedRoom && !VALID_LOCATIONS.includes(assignedRoom)) {
    return { ok: false, error: "Ruangan penempatan kit tidak valid." };
  }

  const supabase = await createClient();
  const { data: items, error: itemsErr } = await supabase
    .from("items_master")
    .select("id, condition, current_parts, total_parts")
    .in("id", bundledIds)
    .is("deleted_at", null);

  if (itemsErr || !items || items.length !== bundledIds.length) {
    return {
      ok: false,
      error: "Sebagian item yang dipilih tidak ditemukan atau sudah dihapus.",
    };
  }

  const hasIncompleteItem = items.some(
    (item) =>
      item.condition === "PART_KURANG" ||
      (item.total_parts > 1 && item.current_parts < item.total_parts),
  );

  const initialStatus: KitStatus =
    input.status && VALID_KIT_STATUSES.includes(input.status)
      ? input.status
      : hasIncompleteItem
        ? "TIDAK_LENGKAP"
        : "TERSEDIA";

  const { data, error } = await supabase
    .from("item_kits")
    .insert({
      kit_name: kitName,
      description: sanitizeOptionalText(input.description, 1000, { multiline: true }),
      bundled_item_ids: bundledIds,
      assigned_room: assignedRoom,
      status: initialStatus,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(error, "Gagal membuat kit baru.", "kits/create"),
    };
  }

  revalidateKitPaths();
  return {
    ok: true,
    data,
    message: `Kit ${data.kit_code} berhasil dibuat.`,
  };
}

export async function updateKitAction(
  id: string,
  input: UpdateKitInput,
): Promise<ActionResult<ItemKit>> {
  const user = await requireAction("kits.manage");
  if (!isValidUuid(id)) {
    return { ok: false, error: "ID kit tidak valid." };
  }

  const kitName = sanitizeTextInput(input.kit_name, 150);
  if (!kitName) {
    return { ok: false, error: "Nama kit wajib diisi." };
  }

  const rawIds = Array.isArray(input.bundled_item_ids) ? input.bundled_item_ids : [];
  if (rawIds.length > 100) {
    return { ok: false, error: "Maksimal 100 item dapat dimasukkan dalam satu kit." };
  }
  const bundledIds = deduplicateValidUuids(rawIds);
  if (bundledIds.length === 0 || bundledIds.length !== new Set(rawIds.map((v) => String(v).trim()).filter(Boolean)).size) {
    return { ok: false, error: "Kit harus memiliki minimal satu item inventaris yang valid." };
  }

  const assignedRoom = input.assigned_room ?? null;
  if (assignedRoom && !VALID_LOCATIONS.includes(assignedRoom)) {
    return { ok: false, error: "Ruangan penempatan kit tidak valid." };
  }

  const supabase = await createClient();
  const { data: existing, error: existingErr } = await supabase
    .from("item_kits")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingErr || !existing) {
    return { ok: false, error: "Kit tidak ditemukan." };
  }

  const { data: items, error: itemsErr } = await supabase
    .from("items_master")
    .select("id")
    .in("id", bundledIds)
    .is("deleted_at", null);

  if (itemsErr || !items || items.length !== bundledIds.length) {
    return {
      ok: false,
      error: "Sebagian item yang dipilih tidak valid atau sudah dihapus.",
    };
  }

  const status =
    input.status && VALID_KIT_STATUSES.includes(input.status)
      ? input.status
      : existing.status;

  const { data, error } = await supabase
    .from("item_kits")
    .update({
      kit_name: kitName,
      description: sanitizeOptionalText(input.description, 1000, { multiline: true }),
      bundled_item_ids: bundledIds,
      assigned_room: assignedRoom,
      status,
      updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(error, "Gagal memperbarui data kit.", "kits/update"),
    };
  }

  revalidateKitPaths();
  return {
    ok: true,
    data,
    message: `Kit ${data.kit_code} berhasil diperbarui.`,
  };
}

export async function softDeleteKitAction(
  id: string,
): Promise<ActionResult<{ id: string; kit_code: string }>> {
  const user = await requireAction("kits.manage");
  if (!isValidUuid(id)) {
    return { ok: false, error: "ID kit tidak valid." };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("item_kits")
    .select("id, kit_code, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { ok: false, error: "Kit tidak ditemukan." };
  }

  if (existing.status === "DIPINJAM") {
    return {
      ok: false,
      error: "Kit sedang dipinjam dan harus dikembalikan sebelum dihapus.",
    };
  }

  const { data, error } = await supabase
    .from("item_kits")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, kit_code")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(error, "Gagal menghapus kit.", "kits/softDelete"),
    };
  }

  revalidateKitPaths();
  return {
    ok: true,
    data,
    message: `Kit ${data.kit_code} dipindahkan ke Recycle Bin.`,
  };
}

export async function checkoutKitAction(
  kitId: string,
  options?: {
    roomCode?: LocationCode | null;
    notes?: string | null;
  },
): Promise<ActionResult<{ kit: ItemKit; transaction: BorrowTransaction }>> {
  const user = await requireAction("kits.checkout");
  if (!isValidUuid(kitId)) {
    return { ok: false, error: "ID kit tidak valid." };
  }
  if (options?.roomCode && !VALID_LOCATIONS.includes(options.roomCode)) {
    return { ok: false, error: "Kode ruangan tujuan tidak valid." };
  }

  const supabase = await createClient();
  const { data: kit, error: kitErr } = await supabase
    .from("item_kits")
    .select("*")
    .eq("id", kitId)
    .is("deleted_at", null)
    .maybeSingle();

  if (kitErr || !kit) {
    return { ok: false, error: "Kit tidak ditemukan." };
  }

  if (kit.status === "NONAKTIF") {
    return { ok: false, error: `Kit ${kit.kit_code} sedang nonaktif.` };
  }
  if (kit.status === "DIPINJAM") {
    return { ok: false, error: `Kit ${kit.kit_code} sedang dipinjam.` };
  }

  const { data: activeBorrow } = await supabase
    .from("borrow_transactions")
    .select("id")
    .eq("kit_id", kit.id)
    .in("status", ["DIPINJAM", "TERLAMBAT"])
    .limit(1);

  if (activeBorrow && activeBorrow.length > 0) {
    return {
      ok: false,
      error: `Kit ${kit.kit_code} masih memiliki transaksi pinjam aktif.`,
    };
  }

  let partsBefore = 0;
  if (kit.bundled_item_ids.length > 0) {
    const { data: items } = await supabase
      .from("items_master")
      .select("id, current_parts")
      .in("id", kit.bundled_item_ids)
      .is("deleted_at", null);

    partsBefore = (items ?? []).reduce((acc, item) => acc + item.current_parts, 0);
  }

  const targetRoom = options?.roomCode ?? kit.assigned_room ?? null;

  const { data: transaction, error: trxErr } = await supabase
    .from("borrow_transactions")
    .insert({
      kit_id: kit.id,
      item_id: null,
      borrower_id: user.id,
      room_code: targetRoom,
      parts_before: partsBefore,
      status: "DIPINJAM",
      borrowed_at: new Date().toISOString(),
      notes: sanitizeOptionalText(options?.notes, 1000, { multiline: true }),
    })
    .select("*")
    .single();

  if (trxErr || !transaction) {
    return {
      ok: false,
      error: sanitizeSafeError(
        trxErr,
        "Gagal mencatat transaksi check-out kit.",
        "kits/checkoutTrx",
      ),
    };
  }

  const { data: updatedKit, error: updateErr } = await supabase
    .from("item_kits")
    .update({
      status: "DIPINJAM",
      updated_by: user.id,
    })
    .eq("id", kit.id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (updateErr || !updatedKit) {
    return {
      ok: false,
      error: sanitizeSafeError(
        updateErr,
        "Transaksi tercatat, tetapi gagal memperbarui status kit.",
        "kits/checkoutUpdate",
      ),
    };
  }

  revalidateKitPaths();
  return {
    ok: true,
    data: { kit: updatedKit, transaction },
    message: `Kit ${updatedKit.kit_code} berhasil di-check-out (${transaction.transaction_code}).`,
  };
}

export async function returnKitAction(
  kitId: string,
  options?: {
    isComplete?: boolean;
    hygieneStatus?: HygieneStatus;
    itemUpdates?: KitReturnItemUpdate[];
    notes?: string | null;
  },
): Promise<ActionResult<{ kit: ItemKit; transaction: BorrowTransaction | null }>> {
  const user = await requireAction("kits.checkout");
  if (!isValidUuid(kitId)) {
    return { ok: false, error: "ID kit tidak valid." };
  }

  const supabase = await createClient();
  const { data: kit, error: kitErr } = await supabase
    .from("item_kits")
    .select("*")
    .eq("id", kitId)
    .is("deleted_at", null)
    .maybeSingle();

  if (kitErr || !kit) {
    return { ok: false, error: "Kit tidak ditemukan." };
  }

  const { data: activeBorrow } = await supabase
    .from("borrow_transactions")
    .select("*")
    .eq("kit_id", kit.id)
    .in("status", ["DIPINJAM", "TERLAMBAT"])
    .order("borrowed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (user.role === "STAFF") {
    if (!activeBorrow) {
      return {
        ok: false,
        error:
          "Tidak ada transaksi peminjaman aktif pada kit ini untuk Anda kembalikan.",
      };
    }
    if (activeBorrow.borrower_id !== user.id) {
      return {
        ok: false,
        error:
          "Terapis hanya dapat mengembalikan kit yang dipinjam oleh akun sendiri.",
      };
    }
  }

  const itemUpdateMap = new Map<string, KitReturnItemUpdate>();
  for (const upd of options?.itemUpdates ?? []) {
    if (isValidUuid(upd.itemId)) {
      itemUpdateMap.set(upd.itemId, upd);
    }
  }

  const requestedHygiene =
    options?.hygieneStatus && VALID_HYGIENE_STATUSES.includes(options.hygieneStatus)
      ? options.hygieneStatus
      : undefined;

  let partsAfter = 0;
  let hasMissingParts = options?.isComplete === false;

  if (kit.bundled_item_ids.length > 0) {
    const { data: bundledItems } = await supabase
      .from("items_master")
      .select("id, asset_type, total_parts, current_parts, condition, hygiene_status")
      .in("id", kit.bundled_item_ids)
      .is("deleted_at", null);

    for (const item of bundledItems ?? []) {
      const override = itemUpdateMap.get(item.id);
      const rawParts =
        override !== undefined && Number.isFinite(Number(override.currentParts))
          ? Math.trunc(Number(override.currentParts))
          : item.current_parts;
      const nextParts = Math.min(item.total_parts, Math.max(0, rawParts));

      partsAfter += nextParts;
      if (item.total_parts > 1 && nextParts < item.total_parts) {
        hasMissingParts = true;
      }

      const nextHygiene =
        override?.hygieneStatus && VALID_HYGIENE_STATUSES.includes(override.hygieneStatus)
          ? override.hygieneStatus
          : requestedHygiene;

      const needsPartUpdate = nextParts !== item.current_parts;
      const needsHygieneUpdate =
        nextHygiene !== undefined &&
        (nextHygiene !== item.hygiene_status || nextHygiene === "STERIL");

      if (needsPartUpdate || needsHygieneUpdate) {
        let nextCondition = item.condition;
        if (item.total_parts > 1 && nextParts < item.total_parts && nextCondition === "BAIK") {
          nextCondition = "PART_KURANG";
        } else if (nextParts === item.total_parts && item.condition === "PART_KURANG") {
          nextCondition = "BAIK";
        }

        const itemPayload: {
          current_parts?: number;
          condition?: typeof nextCondition;
          hygiene_status?: HygieneStatus;
          last_sanitized_at?: string;
          next_sanitization_due?: string;
          updated_by: string;
        } = {
          updated_by: user.id,
        };

        if (needsPartUpdate) {
          itemPayload.current_parts = nextParts;
          itemPayload.condition = nextCondition;
        }
        if (nextHygiene) {
          itemPayload.hygiene_status = nextHygiene;
          if (nextHygiene === "STERIL") {
            itemPayload.last_sanitized_at = new Date().toISOString();
            itemPayload.next_sanitization_due = getWibDateString(7);
          }
        }

        await supabase
          .from("items_master")
          .update(itemPayload)
          .eq("id", item.id)
          .is("deleted_at", null);
      }
    }
  }

  let updatedBorrow: BorrowTransaction | null = null;
  if (activeBorrow) {
    const returnNote = sanitizeOptionalText(options?.notes, 1000, { multiline: true });
    const mergedNotes = returnNote
      ? activeBorrow.notes
        ? `${activeBorrow.notes} | Kembali: ${returnNote}`
        : returnNote
      : activeBorrow.notes;

    const { data: trxData, error: trxErr } = await supabase
      .from("borrow_transactions")
      .update({
        parts_after: partsAfter,
        returned_at: new Date().toISOString(),
        returned_by: user.id,
        status: hasMissingParts ? "HILANG_PART" : "DIKEMBALIKAN",
        notes: mergedNotes,
      })
      .eq("id", activeBorrow.id)
      .select("*")
      .single();

    if (trxErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          trxErr,
          "Gagal memperbarui transaksi pengembalian kit.",
          "kits/returnTrx",
        ),
      };
    }
    updatedBorrow = trxData;
  }

  const nextKitStatus: KitStatus = hasMissingParts ? "TIDAK_LENGKAP" : "TERSEDIA";
  const { data: updatedKit, error: kitUpdateErr } = await supabase
    .from("item_kits")
    .update({
      status: nextKitStatus,
      updated_by: user.id,
    })
    .eq("id", kit.id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (kitUpdateErr || !updatedKit) {
    return {
      ok: false,
      error: sanitizeSafeError(
        kitUpdateErr,
        "Gagal memperbarui status kit setelah pengembalian.",
        "kits/returnUpdate",
      ),
    };
  }

  revalidateKitPaths();
  return {
    ok: true,
    data: { kit: updatedKit, transaction: updatedBorrow },
    message: hasMissingParts
      ? `Kit ${updatedKit.kit_code} dikembalikan dengan status Tidak Lengkap (Part Kurang).`
      : `Kit ${updatedKit.kit_code} berhasil dikembalikan dan siap digunakan.`,
  };
}
