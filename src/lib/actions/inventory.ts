"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type {
  AssetType,
  BarcodeFormat,
  CodeCategoryPrefix,
  HygieneStatus,
  ItemCondition,
  ItemMaster,
  LocationCode,
} from "@/types/database";

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

export type CreateItemInput = {
  parent_item_id?: string | null;
  barcode_format?: BarcodeFormat;
  name: string;
  description?: string | null;
  category_prefix: CodeCategoryPrefix;
  category: string;
  asset_type: AssetType;
  room_code: LocationCode;
  rack_location?: string | null;
  pic_name?: string | null;
  photo_url?: string | null;
  acquisition_date?: string | null;
  purchase_price?: number;
  useful_life_months?: number | null;
  residual_value?: number;
  total_parts?: number;
  current_parts?: number;
  unit_label?: string;
  stock_qty?: number;
  min_stock_threshold?: number;
  condition?: ItemCondition;
  hygiene_status?: HygieneStatus;
};

export type UpdateItemInput = Partial<Omit<CreateItemInput, "parent_item_id">> & {
  parent_item_id?: string | null;
};

const VALID_CATEGORY_PREFIXES: readonly CodeCategoryPrefix[] = [
  "SNS",
  "MTR",
  "WCR",
  "ELK",
  "FRN",
  "ATK",
  "HBP",
  "DOC",
  "SUB",
];

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

const VALID_ASSET_TYPES: readonly AssetType[] = ["THERAPY_TOY", "FIXED_ASSET", "CONSUMABLE"];
const VALID_BARCODE_FORMATS: readonly BarcodeFormat[] = ["CODE128", "QR", "COMBO"];
const VALID_CONDITIONS: readonly ItemCondition[] = [
  "BAIK",
  "PART_KURANG",
  "RUSAK_RINGAN",
  "RUSAK_BERAT",
  "DALAM_PERBAIKAN",
  "DIHAPUSBUKU",
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

function cleanOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanPhotoPathOrUrl(value: string | null | undefined): string | null {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.includes("..") || /^[a-z]+:/i.test(cleaned)) return null;
  return cleaned;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toSafeInt(value: unknown, fallback = 0): number {
  return Math.trunc(toSafeNumber(value, fallback));
}

function sanitizeItemForRole(item: ItemMaster, role: Role): ItemMaster {
  if (can(role, "inventory.view_valuation")) return item;
  return {
    ...item,
    purchase_price: 0,
    residual_value: 0,
    useful_life_months: null,
    acquisition_date: null,
  };
}

function revalidateInventoryPaths(itemId?: string) {
  revalidatePath("/inventory");
  if (itemId) revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/dashboard");
  revalidatePath("/kits");
  revalidatePath("/scan");
  revalidatePath("/barcode-studio");
  revalidatePath("/recycle-bin");
}

export async function createItemAction(
  input: CreateItemInput,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.create");

  const name = input.name?.trim() ?? "";
  const category = input.category?.trim() ?? "";
  if (!name) {
    return { ok: false, error: "Nama barang wajib diisi." };
  }
  if (!category) {
    return { ok: false, error: "Kategori wajib diisi." };
  }
  if (!VALID_CATEGORY_PREFIXES.includes(input.category_prefix)) {
    return { ok: false, error: "Prefix kode kategori tidak valid." };
  }
  if (!VALID_LOCATIONS.includes(input.room_code)) {
    return { ok: false, error: "Kode lokasi ruangan tidak valid." };
  }
  if (!VALID_ASSET_TYPES.includes(input.asset_type)) {
    return { ok: false, error: "Tipe aset tidak valid." };
  }

  const barcodeFormat =
    input.barcode_format && VALID_BARCODE_FORMATS.includes(input.barcode_format)
      ? input.barcode_format
      : "CODE128";
  const totalParts = Math.max(1, toSafeInt(input.total_parts, 1));
  const currentParts = Math.min(
    totalParts,
    Math.max(0, toSafeInt(input.current_parts, totalParts)),
  );
  const stockQty = Math.max(0, toSafeInt(input.stock_qty, 1));
  const minStockThreshold = Math.max(0, toSafeInt(input.min_stock_threshold, 0));
  const purchasePrice = Math.max(0, toSafeNumber(input.purchase_price, 0));
  const residualValue = Math.max(0, toSafeNumber(input.residual_value, 0));
  const usefulLifeMonths =
    input.useful_life_months !== undefined &&
    input.useful_life_months !== null &&
    toSafeInt(input.useful_life_months, 0) > 0
      ? toSafeInt(input.useful_life_months, 0)
      : null;

  let condition: ItemCondition =
    input.condition && VALID_CONDITIONS.includes(input.condition) ? input.condition : "BAIK";
  if (condition === "DIHAPUSBUKU" && !can(user.role, "writeoff.approve")) {
    return {
      ok: false,
      error: "Hanya Owner yang dapat menetapkan status Dihapusbuku.",
    };
  }
  if (totalParts > 1 && currentParts < totalParts && condition === "BAIK") {
    condition = "PART_KURANG";
  }

  const hygieneStatus: HygieneStatus =
    input.hygiene_status && VALID_HYGIENE_STATUSES.includes(input.hygiene_status)
      ? input.hygiene_status
      : "STERIL";

  const supabase = await createClient();

  const parentId = cleanOptionalText(input.parent_item_id);
  if (parentId) {
    const { data: parent, error: parentErr } = await supabase
      .from("items_master")
      .select("id")
      .eq("id", parentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (parentErr || !parent) {
      return { ok: false, error: "Item induk (parent) tidak ditemukan atau sudah dihapus." };
    }
  }

  const isSterilTherapyToy =
    input.asset_type === "THERAPY_TOY" && hygieneStatus === "STERIL";

  const { data, error } = await supabase
    .from("items_master")
    .insert({
      parent_item_id: parentId,
      barcode_format: barcodeFormat,
      name,
      description: cleanOptionalText(input.description),
      category_prefix: input.category_prefix,
      category,
      asset_type: input.asset_type,
      room_code: input.room_code,
      rack_location: cleanOptionalText(input.rack_location),
      pic_name: cleanOptionalText(input.pic_name),
      photo_url: cleanPhotoPathOrUrl(input.photo_url),
      acquisition_date: cleanOptionalText(input.acquisition_date),
      purchase_price: purchasePrice,
      useful_life_months: usefulLifeMonths,
      residual_value: residualValue,
      total_parts: totalParts,
      current_parts: currentParts,
      unit_label: cleanOptionalText(input.unit_label) ?? "Pcs",
      stock_qty: stockQty,
      min_stock_threshold: minStockThreshold,
      condition,
      hygiene_status: hygieneStatus,
      last_sanitized_at: isSterilTherapyToy ? new Date().toISOString() : null,
      next_sanitization_due: isSterilTherapyToy ? getWibDateString(7) : null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal menyimpan item inventaris baru.",
    };
  }

  revalidateInventoryPaths(data.id);
  return {
    ok: true,
    data,
    message: `Item ${data.item_code} berhasil ditambahkan.`,
  };
}

export async function updateItemAction(
  id: string,
  input: UpdateItemInput,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.update");
  if (!id) {
    return { ok: false, error: "ID item tidak valid." };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("items_master")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, error: "Item inventaris tidak ditemukan." };
  }

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const category = input.category !== undefined ? input.category.trim() : existing.category;
  if (!name) {
    return { ok: false, error: "Nama barang wajib diisi." };
  }
  if (!category) {
    return { ok: false, error: "Kategori wajib diisi." };
  }

  const categoryPrefix = input.category_prefix ?? existing.category_prefix;
  const roomCode = input.room_code ?? existing.room_code;
  const assetType = input.asset_type ?? existing.asset_type;
  if (!VALID_CATEGORY_PREFIXES.includes(categoryPrefix)) {
    return { ok: false, error: "Prefix kode kategori tidak valid." };
  }
  if (!VALID_LOCATIONS.includes(roomCode)) {
    return { ok: false, error: "Kode lokasi ruangan tidak valid." };
  }
  if (!VALID_ASSET_TYPES.includes(assetType)) {
    return { ok: false, error: "Tipe aset tidak valid." };
  }

  const totalParts =
    input.total_parts !== undefined
      ? Math.max(1, toSafeInt(input.total_parts, existing.total_parts))
      : existing.total_parts;
  const rawCurrentParts =
    input.current_parts !== undefined
      ? toSafeInt(input.current_parts, existing.current_parts)
      : existing.current_parts;
  const currentParts = Math.min(totalParts, Math.max(0, rawCurrentParts));

  let condition = input.condition ?? existing.condition;
  if (!VALID_CONDITIONS.includes(condition)) {
    return { ok: false, error: "Kondisi barang tidak valid." };
  }
  if (
    condition !== existing.condition &&
    (condition === "DIHAPUSBUKU" || existing.condition === "DIHAPUSBUKU") &&
    !can(user.role, "writeoff.approve")
  ) {
    return {
      ok: false,
      error: "Hanya Owner yang dapat mengubah status Dihapusbuku.",
    };
  }
  if (totalParts > 1 && currentParts < totalParts && condition === "BAIK") {
    condition = "PART_KURANG";
  } else if (
    currentParts === totalParts &&
    existing.condition === "PART_KURANG" &&
    condition === "PART_KURANG"
  ) {
    condition = "BAIK";
  }

  const hygieneStatus = input.hygiene_status ?? existing.hygiene_status;
  if (!VALID_HYGIENE_STATUSES.includes(hygieneStatus)) {
    return { ok: false, error: "Status sanitasi tidak valid." };
  }

  const parentId =
    input.parent_item_id !== undefined
      ? cleanOptionalText(input.parent_item_id)
      : existing.parent_item_id;
  if (parentId === id) {
    return { ok: false, error: "Item tidak boleh menjadi induk dari dirinya sendiri." };
  }

  const usefulLifeMonths =
    input.useful_life_months !== undefined
      ? input.useful_life_months !== null && toSafeInt(input.useful_life_months, 0) > 0
        ? toSafeInt(input.useful_life_months, 0)
        : null
      : existing.useful_life_months;

  const switchingToSteril =
    assetType === "THERAPY_TOY" &&
    hygieneStatus === "STERIL" &&
    (existing.hygiene_status !== "STERIL" || existing.asset_type !== "THERAPY_TOY");

  const { data, error } = await supabase
    .from("items_master")
    .update({
      parent_item_id: parentId,
      barcode_format: input.barcode_format ?? existing.barcode_format,
      name,
      description:
        input.description !== undefined
          ? cleanOptionalText(input.description)
          : existing.description,
      category_prefix: categoryPrefix,
      category,
      asset_type: assetType,
      room_code: roomCode,
      rack_location:
        input.rack_location !== undefined
          ? cleanOptionalText(input.rack_location)
          : existing.rack_location,
      pic_name:
        input.pic_name !== undefined ? cleanOptionalText(input.pic_name) : existing.pic_name,
      photo_url:
        input.photo_url !== undefined ? cleanPhotoPathOrUrl(input.photo_url) : existing.photo_url,
      acquisition_date:
        input.acquisition_date !== undefined
          ? cleanOptionalText(input.acquisition_date)
          : existing.acquisition_date,
      purchase_price:
        input.purchase_price !== undefined
          ? Math.max(0, toSafeNumber(input.purchase_price, existing.purchase_price))
          : existing.purchase_price,
      useful_life_months: usefulLifeMonths,
      residual_value:
        input.residual_value !== undefined
          ? Math.max(0, toSafeNumber(input.residual_value, existing.residual_value))
          : existing.residual_value,
      total_parts: totalParts,
      current_parts: currentParts,
      unit_label:
        input.unit_label !== undefined
          ? cleanOptionalText(input.unit_label) ?? "Pcs"
          : existing.unit_label,
      stock_qty:
        input.stock_qty !== undefined
          ? Math.max(0, toSafeInt(input.stock_qty, existing.stock_qty))
          : existing.stock_qty,
      min_stock_threshold:
        input.min_stock_threshold !== undefined
          ? Math.max(0, toSafeInt(input.min_stock_threshold, existing.min_stock_threshold))
          : existing.min_stock_threshold,
      condition,
      hygiene_status: hygieneStatus,
      ...(switchingToSteril
        ? {
            last_sanitized_at: new Date().toISOString(),
            next_sanitization_due: getWibDateString(7),
          }
        : {}),
      updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal memperbarui data item inventaris.",
    };
  }

  revalidateInventoryPaths(data.id);
  return {
    ok: true,
    data,
    message: `Item ${data.item_code} berhasil diperbarui.`,
  };
}

export async function softDeleteItemAction(
  id: string,
): Promise<ActionResult<{ id: string; item_code: string }>> {
  const user = await requireAction("inventory.delete");
  if (!id) {
    return { ok: false, error: "ID item tidak valid." };
  }

  const supabase = await createClient();

  const { data: activeBorrows } = await supabase
    .from("borrow_transactions")
    .select("id")
    .eq("item_id", id)
    .in("status", ["DIPINJAM", "TERLAMBAT"])
    .limit(1);

  if (activeBorrows && activeBorrows.length > 0) {
    return {
      ok: false,
      error: "Item sedang dipinjam dan tidak dapat dihapus sebelum dikembalikan.",
    };
  }

  const { data, error } = await supabase
    .from("items_master")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, item_code")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal menghapus item atau item tidak ditemukan.",
    };
  }

  revalidateInventoryPaths(id);
  return {
    ok: true,
    data,
    message: `Item ${data.item_code} dipindahkan ke Recycle Bin (dapat dipulihkan dalam 30 hari).`,
  };
}

export async function updateItemHygieneAction(
  id: string,
  hygieneStatus: HygieneStatus,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.update_hygiene");
  if (!id) {
    return { ok: false, error: "ID item tidak valid." };
  }
  if (!VALID_HYGIENE_STATUSES.includes(hygieneStatus)) {
    return { ok: false, error: "Status sanitasi tidak valid." };
  }

  const supabase = await createClient();

  const updatePayload: {
    hygiene_status: HygieneStatus;
    updated_by: string;
    last_sanitized_at?: string;
    next_sanitization_due?: string;
  } = {
    hygiene_status: hygieneStatus,
    updated_by: user.id,
  };

  // Explicitly reset schedule whenever marked STERIL so overdue dates refresh cleanly.
  if (hygieneStatus === "STERIL") {
    updatePayload.last_sanitized_at = new Date().toISOString();
    updatePayload.next_sanitization_due = getWibDateString(7);
  }

  const { data, error } = await supabase
    .from("items_master")
    .update(updatePayload)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal memperbarui status sanitasi.",
    };
  }

  revalidateInventoryPaths(id);
  return {
    ok: true,
    data: sanitizeItemForRole(data, user.role),
    message: `Status sanitasi ${data.item_code} diperbarui.`,
  };
}

export async function updateItemPartsAction(
  id: string,
  currentParts: number,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.report_issue");
  if (!id) {
    return { ok: false, error: "ID item tidak valid." };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("items_master")
    .select("id, item_code, total_parts, condition")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, error: "Item inventaris tidak ditemukan." };
  }

  const safeParts = Math.trunc(Number(currentParts));
  if (!Number.isFinite(safeParts) || safeParts < 0 || safeParts > existing.total_parts) {
    return {
      ok: false,
      error: `Jumlah kepingan harus antara 0 dan ${existing.total_parts}.`,
    };
  }

  let nextCondition = existing.condition;
  if (existing.total_parts > 1 && safeParts < existing.total_parts) {
    if (nextCondition === "BAIK") {
      nextCondition = "PART_KURANG";
    }
  } else if (safeParts === existing.total_parts && existing.condition === "PART_KURANG") {
    nextCondition = "BAIK";
  }

  const { data, error } = await supabase
    .from("items_master")
    .update({
      current_parts: safeParts,
      condition: nextCondition,
      updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal memperbarui jumlah part/kepingan.",
    };
  }

  revalidateInventoryPaths(id);
  return {
    ok: true,
    data: sanitizeItemForRole(data, user.role),
    message: `Part ${data.item_code} diperbarui (${data.current_parts}/${data.total_parts}).`,
  };
}

export async function updateItemConditionAction(
  id: string,
  condition: ItemCondition,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.report_issue");
  if (!id) {
    return { ok: false, error: "ID item tidak valid." };
  }
  if (!VALID_CONDITIONS.includes(condition)) {
    return { ok: false, error: "Status kondisi tidak valid." };
  }
  if (condition === "DIHAPUSBUKU" && !can(user.role, "writeoff.approve")) {
    return {
      ok: false,
      error: "Hanya Owner yang dapat mengubah kondisi menjadi Dihapusbuku.",
    };
  }

  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("items_master")
    .select("condition")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, error: "Item inventaris tidak ditemukan." };
  }
  if (
    existing.condition === "DIHAPUSBUKU" &&
    condition !== "DIHAPUSBUKU" &&
    !can(user.role, "writeoff.approve")
  ) {
    return {
      ok: false,
      error: "Hanya Owner yang dapat mengubah status item Dihapusbuku.",
    };
  }

  const { data, error } = await supabase
    .from("items_master")
    .update({
      condition,
      updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal memperbarui kondisi barang.",
    };
  }

  revalidateInventoryPaths(id);
  return {
    ok: true,
    data: sanitizeItemForRole(data, user.role),
    message: `Kondisi ${data.item_code} diperbarui.`,
  };
}

export async function updateConsumableStockAction(
  id: string,
  stockQty: number,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.update");
  if (!id) {
    return { ok: false, error: "ID item tidak valid." };
  }

  const safeQty = Math.trunc(Number(stockQty));
  if (!Number.isFinite(safeQty) || safeQty < 0) {
    return { ok: false, error: "Stok tidak boleh bernilai negatif." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items_master")
    .update({
      stock_qty: safeQty,
      updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal memperbarui stok barang.",
    };
  }

  revalidateInventoryPaths(id);
  return {
    ok: true,
    data,
    message: `Stok ${data.item_code} diperbarui menjadi ${data.stock_qty} ${data.unit_label}.`,
  };
}

export async function getInventoryPhotoSignedUrlAction(
  photoPath: string,
): Promise<ActionResult<string>> {
  await requireAction("inventory.view");
  const clean = photoPath.trim();
  if (!clean) {
    return { ok: false, error: "Path foto kosong." };
  }
  if (/^https?:\/\//i.test(clean)) {
    return { ok: true, data: clean };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("inventory-photos")
    .createSignedUrl(clean, 3600);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: error?.message || "Gagal membuat tautan pratinjau foto.",
    };
  }

  return { ok: true, data: data.signedUrl };
}
