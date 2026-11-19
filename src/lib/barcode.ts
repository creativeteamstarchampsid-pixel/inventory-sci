import JsBarcode from "jsbarcode";

import { LOCATION_LABELS } from "@/lib/constants";
import type {
  ArchivePhysicalStatus,
  AssetType,
  BarcodeFormat,
  CodeCategoryPrefix,
  ItemCondition,
  LocationCode,
} from "@/types/database";

export type SymbologyMode = BarcodeFormat; // "CODE128" | "QR" | "COMBO"
export type LabelTemplateId = "THERMAL" | "A4_GRID" | "ARCHIVE_SPINE";
export type ThermalSizeId = "50x30" | "40x30";
export type SpinePaperMode = "A4_SHEET" | "CUSTOM_SINGLE";
export type LabelSourceKind = "INVENTORY" | "ARCHIVE";

export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export const THERMAL_SIZES: Record<
  ThermalSizeId,
  { id: ThermalSizeId; label: string; widthMm: number; heightMm: number }
> = {
  "50x30": {
    id: "50x30",
    label: "Thermal 50 × 30 mm (Standar)",
    widthMm: 50,
    heightMm: 30,
  },
  "40x30": {
    id: "40x30",
    label: "Thermal 40 × 30 mm (Ringkas)",
    widthMm: 40,
    heightMm: 30,
  },
};

export const A4_GRID_SPEC = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  cols: 3,
  rows: 8,
  perPage: 24,
  marginTopMm: 10,
  marginSideMm: 8,
  gapXMm: 4,
  gapYMm: 1.8,
  labelWidthMm: 62,
  labelHeightMm: 33,
} as const;

export const SPINE_LABEL_SPEC = {
  widthMm: 150,
  heightMm: 35,
  a4PageWidthMm: 210,
  a4PageHeightMm: 297,
  a4PerPage: 7,
  a4MarginTopMm: 12,
  a4MarginSideMm: 30,
  a4GapYMm: 4,
} as const;

export const SYMBOLOGY_LABELS: Record<
  SymbologyMode,
  { title: string; shortTitle: string; description: string }
> = {
  CODE128: {
    title: "1D Barcode Saja",
    shortTitle: "Code-128",
    description: "Barcode batang Code-128 Auto vektor untuk scanner laser/USB.",
  },
  QR: {
    title: "QR Code Saja",
    shortTitle: "QR Code",
    description: "QR Code deep-link URL untuk pemindaian kamera HP & tablet.",
  },
  COMBO: {
    title: "Mode Combo (1D + QR)",
    shortTitle: "Combo",
    description: "Gabungan Code-128 Auto & QR Code dalam satu label.",
  },
};

export const TEMPLATE_LABELS: Record<
  LabelTemplateId,
  { title: string; subtitle: string; dimensions: string }
> = {
  THERMAL: {
    title: "Template A — Stiker Thermal Roll",
    subtitle: "1 label per halaman roll thermal",
    dimensions: "50 × 30 mm / 40 × 30 mm",
  },
  A4_GRID: {
    title: "Template B — Kertas Label A4 Multi-Grid",
    subtitle: "Tom & Jerry No. 121/103 (3 Kolom × 8 Baris)",
    dimensions: "24 stiker/halaman A4 + garis potong",
  },
  ARCHIVE_SPINE: {
    title: "Template C — Label Punggung Map Arsip",
    subtitle: "Layout horizontal untuk punggung map/odner",
    dimensions: "150 × 35 mm",
  },
};

const ASSET_SUBTITLE_MAP: Record<AssetType, string> = {
  THERAPY_TOY: "ALAT TERAPI",
  FIXED_ASSET: "ASET KANTOR",
  CONSUMABLE: "HABIS PAKAI",
};

export type PrintableItemRow = {
  id: string;
  item_code: string;
  barcode_format: BarcodeFormat;
  name: string;
  category_prefix: CodeCategoryPrefix;
  category: string;
  asset_type: AssetType;
  room_code: LocationCode;
  rack_location: string | null;
  total_parts: number;
  current_parts: number;
  unit_label: string;
  stock_qty: number;
  condition: ItemCondition;
};

export type PrintableArchiveRow = {
  id: string;
  doc_code: string;
  title: string;
  category: string;
  branch_building: string;
  cabinet_code: LocationCode;
  drawer_no: string;
  folder_code: string | null;
  physical_status: ArchivePhysicalStatus;
  digital_file_url: string | null;
  drive_link: string | null;
  version_no: number;
  is_sop_public_to_staff: boolean;
};

export type PrintableLabelRecord = {
  key: string;
  id: string;
  source: LabelSourceKind;
  code: string;
  headerSubtitle: string;
  title: string;
  category: string;
  categoryPrefix: string;
  assetType: AssetType | null;
  locationCode: LocationCode;
  locationDisplay: string;
  counterOrIndicator: string;
  hasDigitalLink: boolean;
  recommendedFormat: BarcodeFormat;
  qrPath: string;
  statusTag: string | null;
};

export type PrintBatchEntry = {
  record: PrintableLabelRecord;
  quantity: number;
};

export type BarcodeBar = {
  x: number;
  width: number;
};

export type Code128VectorData = {
  valid: boolean;
  value: string;
  quietZone: number;
  totalModules: number;
  bars: BarcodeBar[];
  pathD: string;
};

/**
 * Strips non-ASCII characters outside Code-128 Auto range so JsBarcode always
 * receives clean ASCII input without throwing on stray whitespace/symbols.
 */
export function sanitizeCode128Input(raw: string): string {
  return raw.trim().replace(/[^\x20-\x7E]/g, "");
}

/**
 * Encodes a string into crisp Code-128 Auto vector bar segments using `jsbarcode`.
 * Pure geometric output (no DOM required), usable across HTML SVG preview,
 * `window.print()`, and `@react-pdf/renderer` `<Svg><Path /></Svg>`.
 */
export function encodeCode128Vector(
  rawValue: string,
  quietZone = 4,
): Code128VectorData {
  const value = sanitizeCode128Input(rawValue);
  if (!value) {
    return {
      valid: false,
      value: "",
      quietZone,
      totalModules: 0,
      bars: [],
      pathD: "",
    };
  }

  type JsBarcodeObjectTarget = {
    encodings?: Array<{ data?: string; text?: string }>;
  };

  const holder: JsBarcodeObjectTarget = {};
  let isValid = true;

  try {
    JsBarcode(holder, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 1,
      height: 1,
      valid: (ok) => {
        isValid = ok;
      },
    });
  } catch {
    return {
      valid: false,
      value,
      quietZone,
      totalModules: 0,
      bars: [],
      pathD: "",
    };
  }

  const binary = holder.encodings?.[0]?.data ?? "";
  if (!isValid || !binary) {
    return {
      valid: false,
      value,
      quietZone,
      totalModules: 0,
      bars: [],
      pathD: "",
    };
  }

  const bars: BarcodeBar[] = [];
  const pathParts: string[] = [];
  let runLength = 0;

  for (let i = 0; i < binary.length; i += 1) {
    if (binary[i] === "1") {
      runLength += 1;
    } else if (runLength > 0) {
      const x = quietZone + i - runLength;
      bars.push({ x, width: runLength });
      pathParts.push(`M${x},0 h${runLength}v1H${x}z`);
      runLength = 0;
    }
  }

  if (runLength > 0) {
    const x = quietZone + binary.length - runLength;
    bars.push({ x, width: runLength });
    pathParts.push(`M${x},0 h${runLength}v1H${x}z`);
  }

  return {
    valid: bars.length > 0,
    value,
    quietZone,
    totalModules: binary.length + quietZone * 2,
    bars,
    pathD: pathParts.join(""),
  };
}

/**
 * Builds the QR code payload URL:
 * - Inventory items: `${origin}/inventory/${id}`
 * - Hybrid archives: `${origin}/archives?code=${encodeURIComponent(doc_code)}`
 */
export function buildQrTargetUrl(
  record: Pick<PrintableLabelRecord, "qrPath">,
  origin = "",
): string {
  const cleanOrigin = origin.trim().replace(/\/+$/, "");
  return cleanOrigin ? `${cleanOrigin}${record.qrPath}` : record.qrPath;
}

/** Maps an `items_master` row into the unified printable label shape. */
export function mapItemToPrintableRecord(
  item: PrintableItemRow,
): PrintableLabelRecord {
  const roomShort = LOCATION_LABELS[item.room_code] ?? item.room_code;
  const locationDisplay = item.rack_location
    ? `${roomShort} (${item.room_code}) · ${item.rack_location}`
    : `${roomShort} (${item.room_code})`;

  const unit = item.unit_label?.trim() || "Pcs";
  const counterOrIndicator =
    item.asset_type === "CONSUMABLE"
      ? `Stok: ${item.stock_qty} ${unit}${
          item.total_parts > 1
            ? ` · Part: ${item.current_parts}/${item.total_parts}`
            : ""
        }`
      : `Part: ${item.current_parts}/${item.total_parts} ${unit}`;

  return {
    key: `item:${item.id}`,
    id: item.id,
    source: "INVENTORY",
    code: item.item_code,
    headerSubtitle: `${ASSET_SUBTITLE_MAP[item.asset_type]} · ${item.category_prefix}`,
    title: item.name,
    category: item.category,
    categoryPrefix: item.category_prefix,
    assetType: item.asset_type,
    locationCode: item.room_code,
    locationDisplay,
    counterOrIndicator,
    hasDigitalLink: false,
    recommendedFormat: item.barcode_format,
    qrPath: `/inventory/${item.id}`,
    statusTag: item.condition === "PART_KURANG" ? "PART KURANG" : null,
  };
}

/** Maps an `archives_hybrid` row into the unified printable label shape. */
export function mapArchiveToPrintableRecord(
  archive: PrintableArchiveRow,
): PrintableLabelRecord {
  const cabinetShort =
    LOCATION_LABELS[archive.cabinet_code] ?? archive.cabinet_code;
  const folderSuffix = archive.folder_code
    ? ` · Map ${archive.folder_code}`
    : "";
  const branchPrefix =
    archive.branch_building && archive.branch_building !== "Pusat"
      ? `${archive.branch_building} · `
      : "";

  const locationDisplay = `${branchPrefix}${cabinetShort} (${archive.cabinet_code}) · Laci ${archive.drawer_no}${folderSuffix}`;

  const hasFile = Boolean(archive.digital_file_url?.trim());
  const hasDrive = Boolean(archive.drive_link?.trim());
  const hasDigitalLink = hasFile || hasDrive;

  let counterOrIndicator: string;
  if (hasFile && hasDrive) {
    counterOrIndicator = `Digital: File Vault + GDrive · v${archive.version_no}`;
  } else if (hasFile) {
    counterOrIndicator = `Digital: File Vault · v${archive.version_no}`;
  } else if (hasDrive) {
    counterOrIndicator = `Digital: Google Drive · v${archive.version_no}`;
  } else {
    counterOrIndicator = `Arsip Fisik Saja · v${archive.version_no}`;
  }

  return {
    key: `archive:${archive.id}`,
    id: archive.id,
    source: "ARCHIVE",
    code: archive.doc_code,
    headerSubtitle: `ARSIP HIBRIDA · ${archive.branch_building || "Pusat"}`,
    title: archive.title,
    category: archive.category,
    categoryPrefix: "DOC",
    assetType: null,
    locationCode: archive.cabinet_code,
    locationDisplay,
    counterOrIndicator,
    hasDigitalLink,
    recommendedFormat: "COMBO",
    qrPath: `/archives?code=${encodeURIComponent(archive.doc_code)}`,
    statusTag: archive.is_sop_public_to_staff ? "SOP PUBLIK" : null,
  };
}

/** Expands selected batch entries by their quantity multiplier (clamped 1..200). */
export function expandPrintQueue(
  entries: PrintBatchEntry[],
): PrintableLabelRecord[] {
  const expanded: PrintableLabelRecord[] = [];
  for (const entry of entries) {
    const qty = Math.max(1, Math.min(200, Math.floor(entry.quantity || 1)));
    for (let i = 0; i < qty; i += 1) {
      expanded.push(entry.record);
    }
  }
  return expanded;
}

/**
 * Splits expanded labels into fixed-size pages, optionally skipping `startSlot - 1`
 * leading slots on the first page (useful for partially-used A4 Tom & Jerry sheets).
 */
export function chunkIntoPages<T>(
  items: T[],
  perPage: number,
  startSlot = 1,
): Array<Array<T | null>> {
  if (items.length === 0 || perPage <= 0) return [];
  const leadingBlanks = Math.max(0, Math.min(perPage - 1, startSlot - 1));
  const padded: Array<T | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...items,
  ];

  const pages: Array<Array<T | null>> = [];
  for (let i = 0; i < padded.length; i += perPage) {
    const slice = padded.slice(i, i + perPage);
    while (slice.length < perPage) {
      slice.push(null);
    }
    pages.push(slice);
  }
  return pages;
}
