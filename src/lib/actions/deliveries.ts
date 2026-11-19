"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  AssetType,
  BarcodeFormat,
  CodeCategoryPrefix,
  DeliveryDirection,
  DeliveryLog,
  DeliveryStatus,
  HygieneStatus,
  ItemCondition,
  Json,
  LocationCode,
  TablesInsert,
} from "@/types/database";

export type DeliveryPayloadItem = {
  id: string;
  name: string;
  item_code?: string | null;
  existing_item_id?: string | null;
  qty: number;
  unit_label: string;
  condition: ItemCondition;
  notes?: string | null;
  category_prefix: CodeCategoryPrefix;
  category: string;
  asset_type: AssetType;
  room_code: LocationCode;
  rack_location?: string | null;
  purchase_price?: number;
  useful_life_months?: number | null;
  residual_value?: number;
  total_parts?: number;
  min_stock_threshold?: number;
  barcode_format?: BarcodeFormat;
  hygiene_status?: HygieneStatus;
  split_units?: boolean;
};

export type DeliveryInput = {
  direction: DeliveryDirection;
  package_type: string;
  courier_name: string;
  tracking_number?: string | null;
  shipping_cost?: number;
  sender_name: string;
  sender_address?: string | null;
  receiver_name: string;
  receiver_address?: string | null;
  pic_name?: string | null;
  is_fragile?: boolean;
  items_payload_json: DeliveryPayloadItem[];
  status?: DeliveryStatus;
  shipped_at?: string | null;
  received_at?: string | null;
  notes?: string | null;
};

export type DeliveryActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ConvertedStockItem = {
  id: string;
  item_code: string;
  name: string;
  category_prefix: CodeCategoryPrefix;
  category: string;
  asset_type: AssetType;
  room_code: LocationCode;
  condition: ItemCondition;
  unit_label: string;
  stock_qty: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_DIRECTIONS = new Set<DeliveryDirection>(["INBOUND", "OUTBOUND"]);
const VALID_STATUSES = new Set<DeliveryStatus>([
  "DRAFT",
  "DIKEMAS",
  "DALAM_PERJALANAN",
  "DITERIMA",
  "SELESAI",
  "DIBATALKAN",
]);
const VALID_CATEGORY_PREFIXES = new Set<CodeCategoryPrefix>([
  "SNS",
  "MTR",
  "WCR",
  "ELK",
  "FRN",
  "ATK",
  "HBP",
  "DOC",
  "SUB",
]);
const VALID_ASSET_TYPES = new Set<AssetType>([
  "THERAPY_TOY",
  "FIXED_ASSET",
  "CONSUMABLE",
]);
const VALID_LOCATIONS = new Set<LocationCode>([
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
]);
const VALID_CONDITIONS = new Set<ItemCondition>([
  "BAIK",
  "PART_KURANG",
  "RUSAK_RINGAN",
  "RUSAK_BERAT",
  "DALAM_PERBAIKAN",
  "DIHAPUSBUKU",
]);
const VALID_BARCODE_FORMATS = new Set<BarcodeFormat>(["CODE128", "QR", "COMBO"]);
const VALID_HYGIENE = new Set<HygieneStatus>([
  "STERIL",
  "PERLU_DICUCI",
  "SEDANG_DISANITASI",
]);
const ALLOWED_IMAGE_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function trimOrNull(val: string | null | undefined): string | null {
  if (typeof val !== "string") return null;
  const t = val.trim();
  return t.length > 0 ? t : null;
}

function todayWibDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
}

function sanitizePayloadItems(
  rawItems: unknown,
): { ok: true; items: DeliveryPayloadItem[] } | { ok: false; error: string } {
  if (!Array.isArray(rawItems)) {
    return { ok: false, error: "Daftar isi paket harus berupa array." };
  }

  const sanitized: DeliveryPayloadItem[] = [];
  for (let i = 0; i < rawItems.length; i += 1) {
    const raw = rawItems[i];
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: `Format item ke-${i + 1} tidak valid.` };
    }
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) {
      return { ok: false, error: `Nama barang pada baris ke-${i + 1} wajib diisi.` };
    }

    const qtyNum = Number(r.qty ?? 1);
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      return { ok: false, error: `Jumlah (qty) pada "${name}" minimal 1.` };
    }
    const qty = Math.floor(qtyNum);

    const categoryPrefix = (
      typeof r.category_prefix === "string" ? r.category_prefix : "SNS"
    ) as CodeCategoryPrefix;
    if (!VALID_CATEGORY_PREFIXES.has(categoryPrefix)) {
      return {
        ok: false,
        error: `Prefix kategori pada "${name}" tidak valid.`,
      };
    }

    const assetType = (
      typeof r.asset_type === "string" ? r.asset_type : "THERAPY_TOY"
    ) as AssetType;
    if (!VALID_ASSET_TYPES.has(assetType)) {
      return { ok: false, error: `Tipe aset pada "${name}" tidak valid.` };
    }

    const roomCode = (
      typeof r.room_code === "string" ? r.room_code : "GDG"
    ) as LocationCode;
    if (!VALID_LOCATIONS.has(roomCode)) {
      return { ok: false, error: `Kode lokasi pada "${name}" tidak valid.` };
    }

    const condition = (
      typeof r.condition === "string" ? r.condition : "BAIK"
    ) as ItemCondition;
    if (!VALID_CONDITIONS.has(condition)) {
      return { ok: false, error: `Kondisi pada "${name}" tidak valid.` };
    }

    const barcodeFormat = (
      typeof r.barcode_format === "string" ? r.barcode_format : "CODE128"
    ) as BarcodeFormat;
    if (!VALID_BARCODE_FORMATS.has(barcodeFormat)) {
      return { ok: false, error: `Format barcode pada "${name}" tidak valid.` };
    }

    const hygieneStatus = (
      typeof r.hygiene_status === "string" ? r.hygiene_status : "STERIL"
    ) as HygieneStatus;
    if (!VALID_HYGIENE.has(hygieneStatus)) {
      return { ok: false, error: `Status higienitas pada "${name}" tidak valid.` };
    }

    const purchasePrice = Number(r.purchase_price ?? 0);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      return { ok: false, error: `Harga beli pada "${name}" tidak boleh negatif.` };
    }

    const residualValue = Number(r.residual_value ?? 0);
    if (!Number.isFinite(residualValue) || residualValue < 0) {
      return { ok: false, error: `Nilai residu pada "${name}" tidak boleh negatif.` };
    }

    const totalParts = Math.max(1, Math.floor(Number(r.total_parts ?? 1) || 1));
    const minStock = Math.max(0, Math.floor(Number(r.min_stock_threshold ?? 0) || 0));

    let usefulLifeMonths: number | null = null;
    if (r.useful_life_months !== undefined && r.useful_life_months !== null && r.useful_life_months !== "") {
      const parsedLife = Math.floor(Number(r.useful_life_months));
      if (!Number.isFinite(parsedLife) || parsedLife <= 0) {
        return { ok: false, error: `Masa manfaat (bulan) pada "${name}" harus > 0.` };
      }
      usefulLifeMonths = parsedLife;
    }

    const existingItemId =
      typeof r.existing_item_id === "string" && UUID_RE.test(r.existing_item_id)
        ? r.existing_item_id
        : null;

    sanitized.push({
      id: typeof r.id === "string" && r.id.trim() ? r.id.trim() : `item-${i + 1}`,
      name,
      item_code: trimOrNull(typeof r.item_code === "string" ? r.item_code : null),
      existing_item_id: existingItemId,
      qty,
      unit_label:
        typeof r.unit_label === "string" && r.unit_label.trim()
          ? r.unit_label.trim()
          : "Pcs",
      condition,
      notes: trimOrNull(typeof r.notes === "string" ? r.notes : null),
      category_prefix: categoryPrefix,
      category:
        typeof r.category === "string" && r.category.trim()
          ? r.category.trim()
          : "Sensorik",
      asset_type: assetType,
      room_code: roomCode,
      rack_location: trimOrNull(
        typeof r.rack_location === "string" ? r.rack_location : null,
      ),
      purchase_price: purchasePrice,
      useful_life_months: usefulLifeMonths,
      residual_value: residualValue,
      total_parts: totalParts,
      min_stock_threshold: minStock,
      barcode_format: barcodeFormat,
      hygiene_status: hygieneStatus,
      split_units: Boolean(r.split_units),
    });
  }

  return { ok: true, items: sanitized };
}

function validateDeliveryInput(input: DeliveryInput):
  | {
      ok: true;
      data: {
        direction: DeliveryDirection;
        package_type: string;
        courier_name: string;
        tracking_number: string | null;
        shipping_cost: number;
        sender_name: string;
        sender_address: string | null;
        receiver_name: string;
        receiver_address: string | null;
        pic_name: string | null;
        is_fragile: boolean;
        items_payload_json: DeliveryPayloadItem[];
        status: DeliveryStatus;
        shipped_at: string | null;
        received_at: string | null;
        notes: string | null;
      };
    }
  | { ok: false; error: string } {
  if (!VALID_DIRECTIONS.has(input.direction)) {
    return { ok: false, error: "Arah pengiriman tidak valid." };
  }

  const packageType = input.package_type?.trim() ?? "";
  if (!packageType) {
    return { ok: false, error: "Jenis paket / pengiriman wajib diisi." };
  }

  const courierName = input.courier_name?.trim() ?? "";
  if (!courierName) {
    return { ok: false, error: "Nama kurir / ekspedisi wajib diisi." };
  }

  const senderName = input.sender_name?.trim() ?? "";
  if (!senderName) {
    return { ok: false, error: "Nama pengirim / pihak pertama wajib diisi." };
  }

  const receiverName = input.receiver_name?.trim() ?? "";
  if (!receiverName) {
    return { ok: false, error: "Nama penerima / pihak kedua wajib diisi." };
  }

  const shippingCost = Number(input.shipping_cost ?? 0);
  if (!Number.isFinite(shippingCost) || shippingCost < 0) {
    return { ok: false, error: "Biaya pengiriman tidak boleh negatif." };
  }

  const status: DeliveryStatus = input.status ?? "DRAFT";
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, error: "Status pengiriman tidak valid." };
  }

  const payloadCheck = sanitizePayloadItems(input.items_payload_json);
  if (!payloadCheck.ok) {
    return payloadCheck;
  }

  return {
    ok: true,
    data: {
      direction: input.direction,
      package_type: packageType,
      courier_name: courierName,
      tracking_number: trimOrNull(input.tracking_number),
      shipping_cost: shippingCost,
      sender_name: senderName,
      sender_address: trimOrNull(input.sender_address),
      receiver_name: receiverName,
      receiver_address: trimOrNull(input.receiver_address),
      pic_name: trimOrNull(input.pic_name),
      is_fragile: input.is_fragile ?? true,
      items_payload_json: payloadCheck.items,
      status,
      shipped_at: trimOrNull(input.shipped_at),
      received_at: trimOrNull(input.received_at),
      notes: trimOrNull(input.notes),
    },
  };
}

function resolveTimestampsForStatus(
  status: DeliveryStatus,
  currentShippedAt: string | null,
  currentReceivedAt: string | null,
  requestedShippedAt?: string | null,
  requestedReceivedAt?: string | null,
): { shipped_at: string | null; received_at: string | null } {
  const nowIso = new Date().toISOString();
  let shippedAt = requestedShippedAt !== undefined ? requestedShippedAt : currentShippedAt;
  let receivedAt =
    requestedReceivedAt !== undefined ? requestedReceivedAt : currentReceivedAt;

  if (
    (status === "DALAM_PERJALANAN" || status === "DITERIMA" || status === "SELESAI") &&
    !shippedAt
  ) {
    shippedAt = nowIso;
  }
  if ((status === "DITERIMA" || status === "SELESAI") && !receivedAt) {
    receivedAt = nowIso;
  }

  return { shipped_at: shippedAt, received_at: receivedAt };
}

function revalidateLogisticsPaths() {
  revalidatePath("/deliveries");
  revalidatePath("/dashboard");
}

export async function createDeliveryAction(
  input: DeliveryInput,
): Promise<DeliveryActionResult<{ delivery: DeliveryLog }>> {
  const user = await requireAction("delivery.manage");

  const parsed = validateDeliveryInput(input);
  if (!parsed.ok) return parsed;

  try {
    const supabase = await createClient();
    const d = parsed.data;
    const timestamps = resolveTimestampsForStatus(
      d.status,
      null,
      null,
      d.shipped_at,
      d.received_at,
    );

    const { data, error } = await supabase
      .from("deliveries_log")
      .insert({
        direction: d.direction,
        package_type: d.package_type,
        courier_name: d.courier_name,
        tracking_number: d.tracking_number,
        shipping_cost: d.shipping_cost,
        sender_name: d.sender_name,
        sender_address: d.sender_address,
        receiver_name: d.receiver_name,
        receiver_address: d.receiver_address,
        pic_name: d.pic_name,
        is_fragile: d.is_fragile,
        items_payload_json: d.items_payload_json as unknown as Json,
        status: d.status,
        shipped_at: timestamps.shipped_at,
        received_at: timestamps.received_at,
        notes: d.notes,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Gagal membuat catatan pengiriman.",
      };
    }

    revalidateLogisticsPaths();
    return { ok: true, data: { delivery: data } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function updateDeliveryAction(
  deliveryId: string,
  input: DeliveryInput,
): Promise<DeliveryActionResult<{ delivery: DeliveryLog }>> {
  const user = await requireAction("delivery.manage");

  if (!UUID_RE.test(deliveryId)) {
    return { ok: false, error: "ID pengiriman tidak valid." };
  }

  const parsed = validateDeliveryInput(input);
  if (!parsed.ok) return parsed;

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("deliveries_log")
      .select("*")
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "Data pengiriman tidak ditemukan." };
    }

    if (existing.direction !== parsed.data.direction) {
      return {
        ok: false,
        error: "Arah pengiriman (Inbound/Outbound) tidak dapat diubah setelah dibuat.",
      };
    }

    if (existing.converted_to_stock_at && parsed.data.status === "DIBATALKAN") {
      return {
        ok: false,
        error: "Pengiriman yang sudah dikonversi ke stok tidak dapat dibatalkan.",
      };
    }

    const d = parsed.data;
    const timestamps = resolveTimestampsForStatus(
      d.status,
      existing.shipped_at,
      existing.received_at,
      d.shipped_at ?? existing.shipped_at,
      d.received_at ?? existing.received_at,
    );

    const { data, error } = await supabase
      .from("deliveries_log")
      .update({
        package_type: d.package_type,
        courier_name: d.courier_name,
        tracking_number: d.tracking_number,
        shipping_cost: d.shipping_cost,
        sender_name: d.sender_name,
        sender_address: d.sender_address,
        receiver_name: d.receiver_name,
        receiver_address: d.receiver_address,
        pic_name: d.pic_name,
        is_fragile: d.is_fragile,
        items_payload_json: d.items_payload_json as unknown as Json,
        status: d.status,
        shipped_at: timestamps.shipped_at,
        received_at: timestamps.received_at,
        notes: d.notes,
        updated_by: user.id,
      })
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Gagal memperbarui data pengiriman.",
      };
    }

    revalidateLogisticsPaths();
    return { ok: true, data: { delivery: data } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function updateDeliveryStatusAction(
  deliveryId: string,
  nextStatus: DeliveryStatus,
): Promise<DeliveryActionResult<{ delivery: DeliveryLog }>> {
  const user = await requireAction("delivery.manage");

  if (!UUID_RE.test(deliveryId)) {
    return { ok: false, error: "ID pengiriman tidak valid." };
  }
  if (!VALID_STATUSES.has(nextStatus)) {
    return { ok: false, error: "Status pengiriman tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("deliveries_log")
      .select("*")
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "Data pengiriman tidak ditemukan." };
    }

    if (existing.converted_to_stock_at && nextStatus === "DIBATALKAN") {
      return {
        ok: false,
        error: "Pengiriman yang sudah dikonversi ke stok tidak dapat dibatalkan.",
      };
    }

    const timestamps = resolveTimestampsForStatus(
      nextStatus,
      existing.shipped_at,
      existing.received_at,
    );

    const { data, error } = await supabase
      .from("deliveries_log")
      .update({
        status: nextStatus,
        shipped_at: timestamps.shipped_at,
        received_at: timestamps.received_at,
        updated_by: user.id,
      })
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Gagal memperbarui status pengiriman.",
      };
    }

    revalidateLogisticsPaths();
    return { ok: true, data: { delivery: data } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function softDeleteDeliveryAction(
  deliveryId: string,
): Promise<DeliveryActionResult<{ id: string }>> {
  const user = await requireAction("delivery.manage");

  if (!UUID_RE.test(deliveryId)) {
    return { ok: false, error: "ID pengiriman tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("deliveries_log")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        updated_by: user.id,
      })
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Data pengiriman tidak ditemukan atau sudah dihapus.",
      };
    }

    revalidateLogisticsPaths();
    revalidatePath("/recycle-bin");
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function createDeliveryProofUploadUrlAction(
  deliveryId: string,
  fileName: string,
  contentType: string,
): Promise<DeliveryActionResult<{ path: string; token: string; signedUrl: string }>> {
  await requireAction("delivery.manage");

  if (!UUID_RE.test(deliveryId)) {
    return { ok: false, error: "ID pengiriman tidak valid." };
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType.toLowerCase())) {
    return {
      ok: false,
      error: "Format foto harus JPG, PNG, WebP, atau GIF.",
    };
  }

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("deliveries_log")
      .select("id")
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "Data pengiriman tidak ditemukan." };
    }

    const safeName = fileName
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]/g, "-")
      .replace(/-+/g, "-")
      .slice(-60) || "proof.jpg";
    const storagePath = `deliveries/${deliveryId}/${Date.now()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from("delivery-proofs")
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Gagal membuat URL unggah bukti foto.",
      };
    }

    return {
      ok: true,
      data: {
        path: data.path,
        token: data.token,
        signedUrl: data.signedUrl,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function saveDeliveryProofPhotoAction(
  deliveryId: string,
  storagePath: string,
): Promise<DeliveryActionResult<{ proofPhotoPath: string; signedUrl: string | null }>> {
  const user = await requireAction("delivery.manage");

  if (!UUID_RE.test(deliveryId)) {
    return { ok: false, error: "ID pengiriman tidak valid." };
  }

  const expectedPrefix = `deliveries/${deliveryId}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
    return { ok: false, error: "Path penyimpanan bukti foto tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("deliveries_log")
      .select("id, proof_photo_url")
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "Data pengiriman tidak ditemukan." };
    }

    const { error: updateError } = await supabase
      .from("deliveries_log")
      .update({
        proof_photo_url: storagePath,
        updated_by: user.id,
      })
      .eq("id", deliveryId)
      .is("deleted_at", null);

    if (updateError) {
      return {
        ok: false,
        error: updateError.message || "Gagal menyimpan path bukti foto.",
      };
    }

    if (existing.proof_photo_url && existing.proof_photo_url !== storagePath) {
      await supabase.storage
        .from("delivery-proofs")
        .remove([existing.proof_photo_url]);
    }

    const { data: signedData } = await supabase.storage
      .from("delivery-proofs")
      .createSignedUrl(storagePath, 3600);

    revalidateLogisticsPaths();
    return {
      ok: true,
      data: {
        proofPhotoPath: storagePath,
        signedUrl: signedData?.signedUrl ?? null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function removeDeliveryProofPhotoAction(
  deliveryId: string,
): Promise<DeliveryActionResult<{ id: string }>> {
  const user = await requireAction("delivery.manage");

  if (!UUID_RE.test(deliveryId)) {
    return { ok: false, error: "ID pengiriman tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("deliveries_log")
      .select("id, proof_photo_url")
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "Data pengiriman tidak ditemukan." };
    }

    const { error: updateError } = await supabase
      .from("deliveries_log")
      .update({
        proof_photo_url: null,
        updated_by: user.id,
      })
      .eq("id", deliveryId)
      .is("deleted_at", null);

    if (updateError) {
      return {
        ok: false,
        error: updateError.message || "Gagal menghapus bukti foto.",
      };
    }

    if (existing.proof_photo_url) {
      await supabase.storage
        .from("delivery-proofs")
        .remove([existing.proof_photo_url]);
    }

    revalidateLogisticsPaths();
    return { ok: true, data: { id: deliveryId } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function getDeliveryProofSignedUrlAction(
  deliveryId: string,
): Promise<DeliveryActionResult<{ signedUrl: string | null }>> {
  await requireAction("delivery.view");

  if (!UUID_RE.test(deliveryId)) {
    return { ok: false, error: "ID pengiriman tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("deliveries_log")
      .select("proof_photo_url")
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "Data pengiriman tidak ditemukan." };
    }

    if (!existing.proof_photo_url) {
      return { ok: true, data: { signedUrl: null } };
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from("delivery-proofs")
      .createSignedUrl(existing.proof_photo_url, 3600);

    if (signError) {
      return {
        ok: false,
        error: signError.message || "Gagal membuat tautan pratinjau foto.",
      };
    }

    return { ok: true, data: { signedUrl: signedData?.signedUrl ?? null } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function convertInboundToStockAction(
  deliveryId: string,
): Promise<
  DeliveryActionResult<{
    createdItems: ConvertedStockItem[];
    delivery: DeliveryLog;
  }>
> {
  const user = await requireAction("delivery.convert_to_stock");

  if (!UUID_RE.test(deliveryId)) {
    return { ok: false, error: "ID pengiriman tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data: delivery, error: fetchError } = await supabase
      .from("deliveries_log")
      .select("*")
      .eq("id", deliveryId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !delivery) {
      return { ok: false, error: "Data pengiriman tidak ditemukan." };
    }

    if (delivery.direction !== "INBOUND") {
      return {
        ok: false,
        error: "Hanya pengiriman Masuk (Inbound) yang dapat dikonversi menjadi stok inventaris.",
      };
    }

    if (delivery.status === "DIBATALKAN") {
      return {
        ok: false,
        error: "Pengiriman yang dibatalkan tidak dapat dikonversi ke stok.",
      };
    }

    if (delivery.converted_to_stock_at) {
      return {
        ok: false,
        error: "Paket ini sudah pernah dikonversi menjadi stok inventaris.",
      };
    }

    const payloadCheck = sanitizePayloadItems(delivery.items_payload_json);
    if (!payloadCheck.ok) {
      return payloadCheck;
    }

    if (payloadCheck.items.length === 0) {
      return {
        ok: false,
        error: "Daftar barang (payload) masih kosong. Tambahkan minimal 1 item sebelum konversi.",
      };
    }

    const acqDate = todayWibDate();
    const rowsToInsert: TablesInsert<"items_master">[] = [];
    const payloadRowIndexes: number[] = [];

    for (let i = 0; i < payloadCheck.items.length; i += 1) {
      const item = payloadCheck.items[i];
      const totalParts = Math.max(1, item.total_parts ?? 1);
      const currentParts =
        item.condition === "PART_KURANG" && totalParts > 1
          ? Math.max(0, totalParts - 1)
          : totalParts;

      const splitIntoIndividualUnits =
        Boolean(item.split_units) &&
        item.asset_type !== "CONSUMABLE" &&
        item.qty > 1;

      if (splitIntoIndividualUnits && item.qty > 50) {
        return {
          ok: false,
          error: `Item "${item.name}" melebihi batas maksimal 50 unit terpisah per konversi.`,
        };
      }

      const unitCount = splitIntoIndividualUnits ? item.qty : 1;
      const qtyPerRow = splitIntoIndividualUnits ? 1 : item.qty;

      for (let u = 0; u < unitCount; u += 1) {
        const unitSuffix = splitIntoIndividualUnits
          ? ` (Unit ${u + 1}/${unitCount})`
          : "";
        rowsToInsert.push({
          name: `${item.name}${unitSuffix}`,
          description:
            item.notes ||
            `Masuk dari pengiriman ${delivery.delivery_code} (${delivery.sender_name})`,
          category_prefix: item.category_prefix,
          category: item.category,
          asset_type: item.asset_type,
          room_code: item.room_code,
          rack_location: item.rack_location ?? null,
          pic_name: delivery.pic_name ?? null,
          barcode_format: item.barcode_format ?? "CODE128",
          acquisition_date: acqDate,
          purchase_price: item.purchase_price ?? 0,
          useful_life_months: item.useful_life_months ?? null,
          residual_value: item.residual_value ?? 0,
          total_parts: totalParts,
          current_parts: currentParts,
          unit_label: item.unit_label || "Pcs",
          stock_qty: qtyPerRow,
          min_stock_threshold: item.min_stock_threshold ?? 0,
          condition: item.condition,
          hygiene_status: item.hygiene_status ?? "STERIL",
          source_delivery_id: delivery.id,
          created_by: user.id,
          updated_by: user.id,
        });
        payloadRowIndexes.push(i);
      }
    }

    const { data: insertedItems, error: insertError } = await supabase
      .from("items_master")
      .insert(rowsToInsert)
      .select(
        "id, item_code, name, category_prefix, category, asset_type, room_code, condition, unit_label, stock_qty",
      );

    if (insertError || !insertedItems || insertedItems.length === 0) {
      return {
        ok: false,
        error:
          insertError?.message ||
          "Gagal memasukkan item ke master inventaris.",
      };
    }

    // Map newly auto-generated item_codes back onto payload items for Surat Jalan / BAST reference
    const codesByPayloadIndex = new Map<number, string[]>();
    insertedItems.forEach((created, idx) => {
      const payloadIdx = payloadRowIndexes[idx];
      if (payloadIdx === undefined) return;
      const list = codesByPayloadIndex.get(payloadIdx) ?? [];
      list.push(created.item_code);
      codesByPayloadIndex.set(payloadIdx, list);
    });

    const enrichedPayload: DeliveryPayloadItem[] = payloadCheck.items.map(
      (item, idx) => {
        const codes = codesByPayloadIndex.get(idx);
        if (!codes || codes.length === 0) return item;
        return {
          ...item,
          item_code: item.item_code || codes.join(", "),
          existing_item_id:
            item.existing_item_id ||
            (codes.length === 1
              ? insertedItems[payloadRowIndexes.indexOf(idx)]?.id ?? null
              : null),
        };
      },
    );

    const nowIso = new Date().toISOString();
    const nextStatus: DeliveryStatus =
      delivery.status === "SELESAI" ? "SELESAI" : "DITERIMA";

    const { data: updatedDelivery, error: updateError } = await supabase
      .from("deliveries_log")
      .update({
        converted_to_stock_at: nowIso,
        status: nextStatus,
        shipped_at: delivery.shipped_at ?? nowIso,
        received_at: delivery.received_at ?? nowIso,
        items_payload_json: enrichedPayload as unknown as Json,
        updated_by: user.id,
      })
      .eq("id", delivery.id)
      .is("converted_to_stock_at", null)
      .select("*")
      .maybeSingle();

    if (updateError || !updatedDelivery) {
      // Compensating rollback so items are not orphaned without conversion stamp.
      // Hard delete is OWNER-only in RLS; for Admin Operasional, use service-role admin client
      // if configured, otherwise fall back to soft-delete so active inventory stays clean.
      const insertedIds = insertedItems.map((i) => i.id);
      if (user.role === "OWNER") {
        await supabase.from("items_master").delete().in("id", insertedIds);
      } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createAdminClient();
        await admin.from("items_master").delete().in("id", insertedIds);
      } else {
        await supabase
          .from("items_master")
          .update({
            deleted_at: nowIso,
            deleted_by: user.id,
            updated_by: user.id,
          })
          .in("id", insertedIds);
      }
      return {
        ok: false,
        error:
          updateError?.message ||
          "Gagal menandai pengiriman telah dikonversi ke stok.",
      };
    }

    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_name: user.fullName,
      actor_role: user.role,
      action: "CONVERT_TO_STOCK",
      entity_type: "deliveries_log",
      entity_id: delivery.id,
      entity_code: delivery.delivery_code,
      summary: `Konversi 1-klik ${delivery.delivery_code} menghasilkan ${insertedItems.length} item inventaris baru`,
      metadata: {
        created_count: insertedItems.length,
        item_codes: insertedItems.map((i) => i.item_code),
      },
    });

    revalidateLogisticsPaths();
    revalidatePath("/inventory");
    revalidatePath("/barcode-studio");

    return {
      ok: true,
      data: {
        createdItems: insertedItems,
        delivery: updatedDelivery,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}
