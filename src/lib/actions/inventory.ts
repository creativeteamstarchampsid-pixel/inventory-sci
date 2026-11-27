"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { validateLocationCode } from "@/lib/locations";
import { can, type Role } from "@/lib/rbac";
import {
  isSafeHttpUrl,
  isValidIsoDate,
  isValidUuid,
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeStoragePath,
  sanitizeTextInput,
} from "@/lib/security";
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

export type SubItemFormInput = {
  id?: string;
  name: string;
  unit_label: string;
  stock_qty: number;
  total_parts?: number;
  current_parts?: number;
  condition?: ItemCondition;
  hygiene_status?: HygieneStatus;
  description?: string | null;
};

export type CreateItemInput = {
  parent_item_id?: string | null;
  has_sub_items?: boolean;
  sub_items?: SubItemFormInput[];
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

function cleanPhotoPathOrUrl(value: string | null | undefined): string | null {
  const cleaned = sanitizeOptionalText(value, 512);
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) {
    return isSafeHttpUrl(cleaned) ? cleaned : null;
  }
  return sanitizeStoragePath(cleaned);
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

function formatInventoryDbError(
  error: unknown,
  roomCode: string,
  fallback: string,
  context: string,
): string {
  const errObj =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : null;
  const code = typeof errObj?.code === "string" ? errObj.code.trim() : "";
  const msg = typeof errObj?.message === "string" ? errObj.message.toLowerCase() : "";
  const safeMsg = sanitizeSafeError(error, fallback, context);
  if (code === "22P02" && (!msg || msg.includes("location_code") || msg.includes("enum"))) {
    return `Kode lokasi "${roomCode}" belum didukung oleh enum database saat ini. Jalankan migrasi 20261124_locations_master.sql di Supabase SQL Editor terlebih dahulu.`;
  }
  return safeMsg;
}

function revalidateInventoryPaths(itemId?: string) {
  revalidatePath("/inventory");
  if (itemId) revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/rooms");
  revalidatePath("/dashboard");
  revalidatePath("/kits");
  revalidatePath("/scan");
  revalidatePath("/stock-opname");
  revalidatePath("/barcode-studio");
  revalidatePath("/recycle-bin");
}

type NormalizedSubItem = {
  id?: string;
  name: string;
  unit_label: string;
  stock_qty: number;
  total_parts: number;
  current_parts: number;
  condition: ItemCondition;
  hygiene_status: HygieneStatus;
  description: string | null;
};

function normalizeSubItemInputs(
  rawSubItems: SubItemFormInput[] | undefined,
  defaults: {
    unitLabel: string;
    hygieneStatus: HygieneStatus;
    canApproveWriteoff: boolean;
  },
): { ok: true; items: NormalizedSubItem[] } | { ok: false; error: string } {
  if (!rawSubItems) return { ok: true, items: [] };
  if (!Array.isArray(rawSubItems)) {
    return { ok: false, error: "Format daftar Sub-Item tidak valid." };
  }

  const normalized: NormalizedSubItem[] = [];
  for (let idx = 0; idx < rawSubItems.length; idx += 1) {
    const entry = rawSubItems[idx];
    const subId = entry.id ? sanitizeOptionalText(entry.id, 64) : null;
    if (subId && !isValidUuid(subId)) {
      return { ok: false, error: `ID Sub-Item pada baris ${idx + 1} tidak valid.` };
    }

    const subName = sanitizeTextInput(entry.name, 200);
    if (!subName) {
      return {
        ok: false,
        error: `Nama varian Sub-Item pada baris ${idx + 1} wajib diisi.`,
      };
    }

    const subUnit = sanitizeOptionalText(entry.unit_label, 40) ?? defaults.unitLabel;
    const subStock = Math.max(0, toSafeInt(entry.stock_qty, 0));
    const subTotalParts = Math.max(1, toSafeInt(entry.total_parts, 1));
    const subCurrentParts = Math.min(
      subTotalParts,
      Math.max(0, toSafeInt(entry.current_parts, subTotalParts)),
    );

    let subCondition: ItemCondition =
      entry.condition && VALID_CONDITIONS.includes(entry.condition)
        ? entry.condition
        : "BAIK";
    if (subCondition === "DIHAPUSBUKU" && !defaults.canApproveWriteoff) {
      return {
        ok: false,
        error: "Hanya Owner yang dapat menetapkan status Dihapusbuku pada Sub-Item.",
      };
    }
    if (subTotalParts > 1 && subCurrentParts < subTotalParts && subCondition === "BAIK") {
      subCondition = "PART_KURANG";
    }

    const subHygiene: HygieneStatus =
      entry.hygiene_status && VALID_HYGIENE_STATUSES.includes(entry.hygiene_status)
        ? entry.hygiene_status
        : defaults.hygieneStatus;

    normalized.push({
      ...(subId ? { id: subId } : {}),
      name: subName,
      unit_label: subUnit,
      stock_qty: subStock,
      total_parts: subTotalParts,
      current_parts: subCurrentParts,
      condition: subCondition,
      hygiene_status: subHygiene,
      description: sanitizeOptionalText(entry.description, 2000, { multiline: true }),
    });
  }

  return { ok: true, items: normalized };
}

export async function createItemAction(
  input: CreateItemInput,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.create");

  const name = sanitizeTextInput(input.name, 200);
  const category = sanitizeTextInput(input.category, 100);
  if (!name) {
    return { ok: false, error: "Nama barang wajib diisi." };
  }
  if (!category) {
    return { ok: false, error: "Kategori wajib diisi." };
  }
  if (!VALID_CATEGORY_PREFIXES.includes(input.category_prefix)) {
    return { ok: false, error: "Prefix kode kategori tidak valid." };
  }
  if (!VALID_ASSET_TYPES.includes(input.asset_type)) {
    return { ok: false, error: "Tipe aset tidak valid." };
  }

  const acquisitionDate = sanitizeOptionalText(input.acquisition_date, 20);
  if (acquisitionDate && !isValidIsoDate(acquisitionDate)) {
    return { ok: false, error: "Format tanggal perolehan harus YYYY-MM-DD." };
  }

  if (input.photo_url && !cleanPhotoPathOrUrl(input.photo_url)) {
    return { ok: false, error: "Path atau tautan foto barang tidak valid." };
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

  const roomCheck = await validateLocationCode(supabase, input.room_code, {
    allowDigital: false,
  });
  if (!roomCheck.ok) {
    return { ok: false, error: roomCheck.error };
  }
  const roomCode = roomCheck.location.code;

  const parentId = sanitizeOptionalText(input.parent_item_id, 64);
  if (parentId && input.has_sub_items) {
    return {
      ok: false,
      error: "Sub-Item tidak dapat ditandai sebagai Memiliki Sub-Item (maksimal 2 level hierarki).",
    };
  }

  const hasSubItems = Boolean(input.has_sub_items) && !parentId;
  const unitLabel = sanitizeOptionalText(input.unit_label, 40) ?? "Pcs";
  const rackLocation = sanitizeOptionalText(input.rack_location, 100);
  const picName = sanitizeOptionalText(input.pic_name, 120);

  const normalizedSubs = hasSubItems
    ? normalizeSubItemInputs(input.sub_items, {
        unitLabel,
        hygieneStatus,
        canApproveWriteoff: can(user.role, "writeoff.approve"),
      })
    : { ok: true as const, items: [] as NormalizedSubItem[] };

  if (!normalizedSubs.ok) {
    return { ok: false, error: normalizedSubs.error };
  }

  if (parentId) {
    if (!isValidUuid(parentId)) {
      return { ok: false, error: "ID item induk (parent) tidak valid." };
    }
    const { data: parent, error: parentErr } = await supabase
      .from("items_master")
      .select("id, parent_item_id")
      .eq("id", parentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (parentErr || !parent) {
      return { ok: false, error: "Item induk (parent) tidak ditemukan atau sudah dihapus." };
    }
    if (parent.parent_item_id !== null) {
      return {
        ok: false,
        error: "Parent Item yang dipilih merupakan Sub-Item. Sub-Item tidak dapat memiliki turunan.",
      };
    }
  }

  const isSterilTherapyToy =
    input.asset_type === "THERAPY_TOY" && hygieneStatus === "STERIL";

  const initialParentStock = hasSubItems
    ? normalizedSubs.items
        .filter((s) => s.condition !== "DIHAPUSBUKU")
        .reduce((sum, s) => sum + s.stock_qty, 0)
    : stockQty;

  const { data, error } = await supabase
    .from("items_master")
    .insert({
      parent_item_id: parentId,
      has_sub_items: hasSubItems,
      barcode_format: barcodeFormat,
      name,
      description: sanitizeOptionalText(input.description, 2000, { multiline: true }),
      category_prefix: input.category_prefix,
      category,
      asset_type: input.asset_type,
      room_code: roomCode,
      rack_location: rackLocation,
      pic_name: picName,
      photo_url: cleanPhotoPathOrUrl(input.photo_url),
      acquisition_date: acquisitionDate,
      purchase_price: purchasePrice,
      useful_life_months: usefulLifeMonths,
      residual_value: residualValue,
      total_parts: totalParts,
      current_parts: currentParts,
      unit_label: unitLabel,
      stock_qty: initialParentStock,
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
      error: formatInventoryDbError(
        error,
        roomCode,
        "Gagal menyimpan item inventaris baru.",
        "inventory/create",
      ),
    };
  }

  let finalData = data;
  if (hasSubItems && normalizedSubs.items.length > 0) {
    const nowIso = new Date().toISOString();
    const dueWib = getWibDateString(7);
    const subPayloads = normalizedSubs.items.map((sub) => {
      const subSteril =
        input.asset_type === "THERAPY_TOY" && sub.hygiene_status === "STERIL";
      return {
        parent_item_id: data.id,
        has_sub_items: false,
        barcode_format: barcodeFormat,
        name: sub.name,
        description: sub.description,
        category_prefix: input.category_prefix,
        category,
        asset_type: input.asset_type,
        room_code: roomCode,
        rack_location: rackLocation,
        pic_name: picName,
        total_parts: sub.total_parts,
        current_parts: sub.current_parts,
        unit_label: sub.unit_label,
        stock_qty: sub.stock_qty,
        min_stock_threshold: 0,
        condition: sub.condition,
        hygiene_status: sub.hygiene_status,
        last_sanitized_at: subSteril ? nowIso : null,
        next_sanitization_due: subSteril ? dueWib : null,
        created_by: user.id,
        updated_by: user.id,
      };
    });

    const { error: subErr } = await supabase.from("items_master").insert(subPayloads);
    if (subErr) {
      await supabase
        .from("items_master")
        .update({ deleted_at: nowIso, deleted_by: user.id, updated_by: user.id })
        .eq("id", data.id);
      return {
        ok: false,
        error: formatInventoryDbError(
          subErr,
          roomCode,
          "Gagal menyimpan daftar Sub-Item.",
          "inventory/createSubItems",
        ),
      };
    }

    const { data: refreshedParent } = await supabase
      .from("items_master")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (refreshedParent) {
      finalData = refreshedParent;
    }
  }

  revalidateInventoryPaths(finalData.id);
  return {
    ok: true,
    data: finalData,
    message:
      hasSubItems && normalizedSubs.items.length > 0
        ? `Parent Item ${finalData.item_code} beserta ${normalizedSubs.items.length} Sub-Item berhasil ditambahkan.`
        : `Item ${finalData.item_code} berhasil ditambahkan.`,
  };
}

export async function updateItemAction(
  id: string,
  input: UpdateItemInput,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.update");
  if (!isValidUuid(id)) {
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

  const name =
    input.name !== undefined ? sanitizeTextInput(input.name, 200) : existing.name;
  const category =
    input.category !== undefined
      ? sanitizeTextInput(input.category, 100)
      : existing.category;
  if (!name) {
    return { ok: false, error: "Nama barang wajib diisi." };
  }
  if (!category) {
    return { ok: false, error: "Kategori wajib diisi." };
  }

  const categoryPrefix = input.category_prefix ?? existing.category_prefix;
  const rawRoomCode = input.room_code ?? existing.room_code;
  const assetType = input.asset_type ?? existing.asset_type;
  const barcodeFormat = input.barcode_format ?? existing.barcode_format;
  if (!VALID_CATEGORY_PREFIXES.includes(categoryPrefix)) {
    return { ok: false, error: "Prefix kode kategori tidak valid." };
  }
  if (!VALID_ASSET_TYPES.includes(assetType)) {
    return { ok: false, error: "Tipe aset tidak valid." };
  }
  if (!VALID_BARCODE_FORMATS.includes(barcodeFormat)) {
    return { ok: false, error: "Format barcode tidak valid." };
  }

  const roomCheck = await validateLocationCode(supabase, rawRoomCode, {
    allowDigital: false,
    allowExistingCode: existing.room_code,
  });
  if (!roomCheck.ok) {
    return { ok: false, error: roomCheck.error };
  }
  const roomCode = roomCheck.location.code;

  const acquisitionDate =
    input.acquisition_date !== undefined
      ? sanitizeOptionalText(input.acquisition_date, 20)
      : existing.acquisition_date;
  if (acquisitionDate && !isValidIsoDate(acquisitionDate)) {
    return { ok: false, error: "Format tanggal perolehan harus YYYY-MM-DD." };
  }

  if (
    input.photo_url !== undefined &&
    input.photo_url !== null &&
    input.photo_url.trim().length > 0 &&
    !cleanPhotoPathOrUrl(input.photo_url)
  ) {
    return { ok: false, error: "Path atau tautan foto barang tidak valid." };
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
      ? sanitizeOptionalText(input.parent_item_id, 64)
      : existing.parent_item_id;

  const { data: existingChildren } = await supabase
    .from("items_master")
    .select("id, item_code, name, hygiene_status, asset_type")
    .eq("parent_item_id", id)
    .is("deleted_at", null);
  const activeChildren = existingChildren ?? [];

  if (parentId) {
    if (!isValidUuid(parentId)) {
      return { ok: false, error: "ID item induk (parent) tidak valid." };
    }
    if (parentId === id) {
      return { ok: false, error: "Item tidak boleh menjadi induk dari dirinya sendiri." };
    }
    if (input.has_sub_items) {
      return {
        ok: false,
        error: "Sub-Item tidak dapat ditandai sebagai Memiliki Sub-Item.",
      };
    }
    if (activeChildren.length > 0) {
      return {
        ok: false,
        error: "Item yang sudah memiliki Sub-Item tidak dapat dijadikan Sub-Item dari item lain.",
      };
    }
    const { data: parentRow, error: parentErr } = await supabase
      .from("items_master")
      .select("id, parent_item_id")
      .eq("id", parentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (parentErr || !parentRow) {
      return { ok: false, error: "Item induk (parent) tidak ditemukan atau sudah dihapus." };
    }
    if (parentRow.parent_item_id !== null) {
      return {
        ok: false,
        error: "Parent Item yang dipilih merupakan Sub-Item. Sub-Item tidak dapat memiliki turunan.",
      };
    }
  }

  const nextHasSubItems = parentId
    ? false
    : input.has_sub_items !== undefined
      ? Boolean(input.has_sub_items)
      : existing.has_sub_items;

  if (!nextHasSubItems && activeChildren.length > 0) {
    return {
      ok: false,
      error: `Masih terdapat ${activeChildren.length} Sub-Item aktif pada item ini. Hapus semua Sub-Item terlebih dahulu sebelum menonaktifkan mode Sub-Item.`,
    };
  }

  const unitLabel =
    input.unit_label !== undefined
      ? sanitizeOptionalText(input.unit_label, 40) ?? "Pcs"
      : existing.unit_label;
  const rackLocation =
    input.rack_location !== undefined
      ? sanitizeOptionalText(input.rack_location, 100)
      : existing.rack_location;
  const picName =
    input.pic_name !== undefined
      ? sanitizeOptionalText(input.pic_name, 120)
      : existing.pic_name;

  const hasSubItemsPayload = nextHasSubItems && !parentId && input.sub_items !== undefined;
  const normalizedSubs = hasSubItemsPayload
    ? normalizeSubItemInputs(input.sub_items, {
        unitLabel,
        hygieneStatus,
        canApproveWriteoff: can(user.role, "writeoff.approve"),
      })
    : { ok: true as const, items: [] as NormalizedSubItem[] };

  if (!normalizedSubs.ok) {
    return { ok: false, error: normalizedSubs.error };
  }

  const existingChildIdSet = new Set(activeChildren.map((c) => c.id));
  const toUpdateSubs = normalizedSubs.items.filter((s) => s.id && existingChildIdSet.has(s.id));
  const toInsertSubs = normalizedSubs.items.filter((s) => !s.id);
  const keptSubIdSet = new Set(toUpdateSubs.map((s) => s.id as string));
  const removedSubIds = hasSubItemsPayload
    ? activeChildren.filter((c) => !keptSubIdSet.has(c.id)).map((c) => c.id)
    : [];

  if (removedSubIds.length > 0) {
    const { data: activeSubBorrows } = await supabase
      .from("borrow_transactions")
      .select("id")
      .in("item_id", removedSubIds)
      .in("status", ["DIPINJAM", "TERLAMBAT"])
      .limit(1);
    if (activeSubBorrows && activeSubBorrows.length > 0) {
      return {
        ok: false,
        error: "Salah satu Sub-Item yang ingin dihapus sedang dipinjam dan belum dikembalikan.",
      };
    }
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

  const nextStockQty = nextHasSubItems
    ? existing.stock_qty
    : input.stock_qty !== undefined
      ? Math.max(0, toSafeInt(input.stock_qty, existing.stock_qty))
      : existing.stock_qty;

  const { data, error } = await supabase
    .from("items_master")
    .update({
      parent_item_id: parentId,
      has_sub_items: nextHasSubItems,
      barcode_format: barcodeFormat,
      name,
      description:
        input.description !== undefined
          ? sanitizeOptionalText(input.description, 2000, { multiline: true })
          : existing.description,
      category_prefix: categoryPrefix,
      category,
      asset_type: assetType,
      room_code: roomCode,
      rack_location: rackLocation,
      pic_name: picName,
      photo_url:
        input.photo_url !== undefined
          ? cleanPhotoPathOrUrl(input.photo_url)
          : existing.photo_url,
      acquisition_date: acquisitionDate,
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
      unit_label: unitLabel,
      stock_qty: nextStockQty,
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
      error: formatInventoryDbError(
        error,
        roomCode,
        "Gagal memperbarui data item inventaris.",
        "inventory/update",
      ),
    };
  }

  let finalData = data;
  if (hasSubItemsPayload) {
    const nowIso = new Date().toISOString();
    const dueWib = getWibDateString(7);
    const existingChildById = new Map(activeChildren.map((c) => [c.id, c]));

    for (const sub of toUpdateSubs) {
      const subId = sub.id as string;
      const prevChild = existingChildById.get(subId);
      const subSwitchingToSteril =
        assetType === "THERAPY_TOY" &&
        sub.hygiene_status === "STERIL" &&
        (prevChild?.hygiene_status !== "STERIL" || prevChild?.asset_type !== "THERAPY_TOY");

      const { error: subUpdErr } = await supabase
        .from("items_master")
        .update({
          name: sub.name,
          unit_label: sub.unit_label,
          stock_qty: sub.stock_qty,
          total_parts: sub.total_parts,
          current_parts: sub.current_parts,
          condition: sub.condition,
          hygiene_status: sub.hygiene_status,
          description: sub.description,
          category_prefix: categoryPrefix,
          category,
          asset_type: assetType,
          room_code: roomCode,
          rack_location: rackLocation,
          barcode_format: barcodeFormat,
          ...(subSwitchingToSteril
            ? {
                last_sanitized_at: nowIso,
                next_sanitization_due: dueWib,
              }
            : {}),
          updated_by: user.id,
        })
        .eq("id", subId)
        .eq("parent_item_id", id)
        .is("deleted_at", null);

      if (subUpdErr) {
        return {
          ok: false,
          error: formatInventoryDbError(
            subUpdErr,
            roomCode,
            `Gagal memperbarui Sub-Item "${sub.name}".`,
            "inventory/updateSubItem",
          ),
        };
      }
    }

    if (toInsertSubs.length > 0) {
      const insertPayloads = toInsertSubs.map((sub) => {
        const subSteril =
          assetType === "THERAPY_TOY" && sub.hygiene_status === "STERIL";
        return {
          parent_item_id: id,
          has_sub_items: false,
          barcode_format: barcodeFormat,
          name: sub.name,
          description: sub.description,
          category_prefix: categoryPrefix,
          category,
          asset_type: assetType,
          room_code: roomCode,
          rack_location: rackLocation,
          pic_name: picName,
          total_parts: sub.total_parts,
          current_parts: sub.current_parts,
          unit_label: sub.unit_label,
          stock_qty: sub.stock_qty,
          min_stock_threshold: 0,
          condition: sub.condition,
          hygiene_status: sub.hygiene_status,
          last_sanitized_at: subSteril ? nowIso : null,
          next_sanitization_due: subSteril ? dueWib : null,
          created_by: user.id,
          updated_by: user.id,
        };
      });

      const { error: subInsErr } = await supabase.from("items_master").insert(insertPayloads);
      if (subInsErr) {
        return {
          ok: false,
          error: formatInventoryDbError(
            subInsErr,
            roomCode,
            "Gagal menambahkan Sub-Item baru.",
            "inventory/insertSubItems",
          ),
        };
      }
    }

    if (removedSubIds.length > 0) {
      const { error: subDelErr } = await supabase
        .from("items_master")
        .update({
          deleted_at: nowIso,
          deleted_by: user.id,
          updated_by: user.id,
        })
        .in("id", removedSubIds)
        .eq("parent_item_id", id)
        .is("deleted_at", null);

      if (subDelErr) {
        return {
          ok: false,
          error: sanitizeSafeError(
            subDelErr,
            "Gagal menghapus Sub-Item yang dilepas.",
            "inventory/deleteSubItems",
          ),
        };
      }
    }

    const { data: refreshedParent } = await supabase
      .from("items_master")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (refreshedParent) {
      finalData = refreshedParent;
    }
  }

  revalidateInventoryPaths(finalData.id);
  return {
    ok: true,
    data: finalData,
    message: `Item ${finalData.item_code} berhasil diperbarui.`,
  };
}

export async function softDeleteItemAction(
  id: string,
): Promise<ActionResult<{ id: string; item_code: string }>> {
  const user = await requireAction("inventory.delete");
  if (!isValidUuid(id)) {
    return { ok: false, error: "ID item tidak valid." };
  }

  const supabase = await createClient();

  const { data: childRows } = await supabase
    .from("items_master")
    .select("id")
    .eq("parent_item_id", id)
    .is("deleted_at", null);
  const childIds = (childRows ?? []).map((c) => c.id);
  const allTargetIds = [id, ...childIds];

  const { data: activeBorrows } = await supabase
    .from("borrow_transactions")
    .select("id")
    .in("item_id", allTargetIds)
    .in("status", ["DIPINJAM", "TERLAMBAT"])
    .limit(1);

  if (activeBorrows && activeBorrows.length > 0) {
    return {
      ok: false,
      error:
        childIds.length > 0
          ? "Item induk atau salah satu Sub-Item-nya sedang dipinjam dan tidak dapat dihapus sebelum dikembalikan."
          : "Item sedang dipinjam dan tidak dapat dihapus sebelum dikembalikan.",
    };
  }

  const nowIso = new Date().toISOString();
  if (childIds.length > 0) {
    const { error: childDeleteErr } = await supabase
      .from("items_master")
      .update({
        deleted_at: nowIso,
        deleted_by: user.id,
        updated_by: user.id,
      })
      .in("id", childIds)
      .is("deleted_at", null);

    if (childDeleteErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          childDeleteErr,
          "Gagal menghapus Sub-Item terkait.",
          "inventory/softDeleteChildren",
        ),
      };
    }
  }

  const { data, error } = await supabase
    .from("items_master")
    .update({
      deleted_at: nowIso,
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
      error: sanitizeSafeError(
        error,
        "Gagal menghapus item atau item tidak ditemukan.",
        "inventory/softDelete",
      ),
    };
  }

  revalidateInventoryPaths(id);
  return {
    ok: true,
    data,
    message:
      childIds.length > 0
        ? `Item ${data.item_code} beserta ${childIds.length} Sub-Item dipindahkan ke Recycle Bin (dapat dipulihkan dalam 30 hari).`
        : `Item ${data.item_code} dipindahkan ke Recycle Bin (dapat dipulihkan dalam 30 hari).`,
  };
}

export async function updateItemHygieneAction(
  id: string,
  hygieneStatus: HygieneStatus,
): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.update_hygiene");
  if (!isValidUuid(id)) {
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
      error: sanitizeSafeError(
        error,
        "Gagal memperbarui status sanitasi.",
        "inventory/updateHygiene",
      ),
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
  if (!isValidUuid(id)) {
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
      error: sanitizeSafeError(
        error,
        "Gagal memperbarui jumlah part/kepingan.",
        "inventory/updateParts",
      ),
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
  if (!isValidUuid(id)) {
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
      error: sanitizeSafeError(
        error,
        "Gagal memperbarui kondisi barang.",
        "inventory/updateCondition",
      ),
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
  if (!isValidUuid(id)) {
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
      error: sanitizeSafeError(
        error,
        "Gagal memperbarui stok barang.",
        "inventory/updateStock",
      ),
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
  const clean = typeof photoPath === "string" ? photoPath.trim() : "";
  if (!clean) {
    return { ok: false, error: "Path foto kosong." };
  }
  if (/^https?:\/\//i.test(clean)) {
    if (!isSafeHttpUrl(clean)) {
      return { ok: false, error: "Tautan foto tidak valid." };
    }
    return { ok: true, data: clean };
  }

  const safePath = sanitizeStoragePath(clean);
  if (!safePath) {
    return { ok: false, error: "Path penyimpanan foto tidak valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("inventory-photos")
    .createSignedUrl(safePath, 3600);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: sanitizeSafeError(
        error,
        "Gagal membuat tautan pratinjau foto.",
        "inventory/photoSignedUrl",
      ),
    };
  }

  return { ok: true, data: data.signedUrl };
}
