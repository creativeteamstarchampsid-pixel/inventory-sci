import type { DeliveryPayloadItem } from "@/lib/actions/deliveries";
import type {
  AssetType,
  BarcodeFormat,
  CodeCategoryPrefix,
  DeliveryStatus,
  HygieneStatus,
  ItemCondition,
  Json,
  LocationCode,
} from "@/types/database";

export type InventoryPickerItem = {
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
  source_delivery_id: string | null;
};

export const PACKAGE_TYPE_PRESETS = [
  "Paket Barang Masuk / Pembelian",
  "Alat Terapi & Edukasi",
  "Pengiriman Keluar / Cabang",
  "Serah Terima Aset / Kunci (BAST)",
  "Perbaikan / Kalibrasi Alat",
  "Dokumen & Perlengkapan Kantor",
] as const;

export const COURIER_PRESETS = [
  "Kurir Internal",
  "Serah Terima Langsung",
  "JNE",
  "J&T Express",
  "SiCepat",
  "AnterAja",
  "GoSend / GrabExpress",
  "Lalamove",
] as const;

export const UNIT_LABEL_PRESETS = [
  "Pcs",
  "Set",
  "Unit",
  "Kotak",
  "Pack",
  "Kunci",
  "Berkas",
] as const;

export const DELIVERY_STATUS_BADGE_VARIANT: Record<
  DeliveryStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  DIKEMAS: "secondary",
  DALAM_PERJALANAN: "default",
  DITERIMA: "secondary",
  SELESAI: "default",
  DIBATALKAN: "destructive",
};

export function createEmptyPayloadItem(index = 1): DeliveryPayloadItem {
  return {
    id: `row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    item_code: null,
    existing_item_id: null,
    qty: 1,
    unit_label: "Pcs",
    condition: "BAIK",
    notes: null,
    category_prefix: "SNS",
    category: "Sensorik",
    asset_type: "THERAPY_TOY",
    room_code: "GDG",
    rack_location: null,
    purchase_price: 0,
    useful_life_months: null,
    residual_value: 0,
    total_parts: 1,
    min_stock_threshold: 0,
    barcode_format: "CODE128",
    hygiene_status: "STERIL",
    split_units: false,
  };
}

export function parseDeliveryPayloadItems(raw: Json | unknown): DeliveryPayloadItem[] {
  if (!Array.isArray(raw)) return [];
  const items: DeliveryPayloadItem[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name : "";
    if (!name.trim()) continue;

    items.push({
      id: typeof r.id === "string" && r.id ? r.id : `item-${i + 1}`,
      name,
      item_code: typeof r.item_code === "string" ? r.item_code : null,
      existing_item_id:
        typeof r.existing_item_id === "string" ? r.existing_item_id : null,
      qty: Math.max(1, Math.floor(Number(r.qty ?? 1) || 1)),
      unit_label:
        typeof r.unit_label === "string" && r.unit_label ? r.unit_label : "Pcs",
      condition: (typeof r.condition === "string"
        ? r.condition
        : "BAIK") as ItemCondition,
      notes: typeof r.notes === "string" ? r.notes : null,
      category_prefix: (typeof r.category_prefix === "string"
        ? r.category_prefix
        : "SNS") as CodeCategoryPrefix,
      category:
        typeof r.category === "string" && r.category ? r.category : "Sensorik",
      asset_type: (typeof r.asset_type === "string"
        ? r.asset_type
        : "THERAPY_TOY") as AssetType,
      room_code: (typeof r.room_code === "string"
        ? r.room_code
        : "GDG") as LocationCode,
      rack_location:
        typeof r.rack_location === "string" ? r.rack_location : null,
      purchase_price: Math.max(0, Number(r.purchase_price ?? 0) || 0),
      useful_life_months:
        r.useful_life_months !== null && r.useful_life_months !== undefined
          ? Number(r.useful_life_months) || null
          : null,
      residual_value: Math.max(0, Number(r.residual_value ?? 0) || 0),
      total_parts: Math.max(1, Math.floor(Number(r.total_parts ?? 1) || 1)),
      min_stock_threshold: Math.max(
        0,
        Math.floor(Number(r.min_stock_threshold ?? 0) || 0),
      ),
      barcode_format: (typeof r.barcode_format === "string"
        ? r.barcode_format
        : "CODE128") as BarcodeFormat,
      hygiene_status: (typeof r.hygiene_status === "string"
        ? r.hygiene_status
        : "STERIL") as HygieneStatus,
      split_units: Boolean(r.split_units),
    });
  }

  return items;
}
