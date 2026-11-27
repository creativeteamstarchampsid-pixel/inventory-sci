import JsBarcode from "jsbarcode";

import { getLocationLabel } from "@/lib/constants";
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
export type SpinePaperMode = "A4_SHEET" | "CUSTOM_SINGLE";
export type LabelSourceKind = "INVENTORY" | "ARCHIVE";

export type ThermalSizeCategory =
  | "MINI"
  | "STANDAR"
  | "PERSEGI"
  | "BESAR"
  | "KUSTOM";

export type ThermalSizeId =
  | "30x20"
  | "33x15"
  | "40x20"
  | "40x30"
  | "40x40"
  | "50x30"
  | "50x40"
  | "50x50"
  | "60x40"
  | "70x40"
  | "70x50"
  | "80x50"
  | "80x80"
  | "100x50"
  | "100x70"
  | "100x100"
  | "CUSTOM";

export type ThermalSizeSpec = {
  id: ThermalSizeId;
  label: string;
  shortLabel: string;
  category: ThermalSizeCategory;
  widthMm: number;
  heightMm: number;
  description: string;
};

export type CustomThermalSize = {
  widthMm: number;
  heightMm: number;
};

export type A4GridPresetId =
  | "TJ_121_24"
  | "TJ_107_30"
  | "TJ_125_18"
  | "TJ_103_12"
  | "A4_SQUARE_12"
  | "A4_LARGE_8"
  | "A4_MINI_40";

export type A4GridPresetSpec = {
  id: A4GridPresetId;
  label: string;
  shortLabel: string;
  description: string;
  pageWidthMm: number;
  pageHeightMm: number;
  cols: number;
  rows: number;
  perPage: number;
  marginTopMm: number;
  marginSideMm: number;
  gapXMm: number;
  gapYMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
};

export type SpineSizeId = "150x35" | "180x50" | "190x30" | "120x30";

export type SpineSizeSpec = {
  id: SpineSizeId;
  label: string;
  shortLabel: string;
  description: string;
  widthMm: number;
  heightMm: number;
  a4PageWidthMm: number;
  a4PageHeightMm: number;
  a4PerPage: number;
  a4MarginTopMm: number;
  a4MarginSideMm: number;
  a4GapYMm: number;
};

export type QrPayloadMode = "SHORT_PREVIEW" | "CODE_ONLY" | "FULL_DETAIL";
export type QrErrorLevel = "L" | "M" | "Q" | "H";
export type QrLayoutMode = "SIDE_BY_SIDE" | "TOP_BOTTOM" | "QR_DOMINANT";

export type LabelContentSettings = {
  showHeader: boolean;
  customHeaderText: string;
  showHeaderSubtitle: boolean;
  showTitle: boolean;
  showCategory: boolean;
  showCodeText: boolean;
  showLocation: boolean;
  showStockQty: boolean;
  showPartCounter: boolean;
  showArchiveDigitalIndicator: boolean;
  showStatusTag: boolean;
  showScanHint: boolean;
  customScanHint: string;
  showBorderFrame: boolean;
  qrPayloadMode: QrPayloadMode;
  qrErrorLevel: QrErrorLevel;
  qrSizePercent: number;
  qrLayout: QrLayoutMode;
  qrQuietZone: 1 | 2;
};

export type LabelContentPresetId =
  | "PERMANENT_STICKER"
  | "QR_DOMINANT_80"
  | "FULL_INFO"
  | "SCAN_ONLY_MINIMAL";

export type LabelContentPreset = {
  id: LabelContentPresetId;
  label: string;
  description: string;
  settings: LabelContentSettings;
};

export type BarcodeStudioConfigSnapshot = {
  symbology: SymbologyMode;
  template: LabelTemplateId;
  thermalSize: ThermalSizeId;
  customThermalSize: CustomThermalSize;
  a4Preset: A4GridPresetId;
  spineSize: SpineSizeId;
  spinePaperMode: SpinePaperMode;
  content: LabelContentSettings;
};

export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export function ptToMm(pt: number): number {
  return pt / MM_TO_PT;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function floor1(value: number): number {
  return Math.floor((value + 1e-9) * 10) / 10;
}

function normalizeQrOrigin(origin: string): string {
  const trimmed = origin.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export const DEFAULT_CUSTOM_THERMAL_SIZE: CustomThermalSize = {
  widthMm: 60,
  heightMm: 40,
};

export function clampCustomThermalSize(
  size?: Partial<CustomThermalSize> | null,
): CustomThermalSize {
  const rawW = Number(size?.widthMm);
  const rawH = Number(size?.heightMm);
  const widthMm = Number.isFinite(rawW)
    ? round1(clampNumber(rawW, 20, 210))
    : DEFAULT_CUSTOM_THERMAL_SIZE.widthMm;
  const heightMm = Number.isFinite(rawH)
    ? round1(clampNumber(rawH, 12, 297))
    : DEFAULT_CUSTOM_THERMAL_SIZE.heightMm;
  return { widthMm, heightMm };
}

export const THERMAL_SIZE_CATEGORY_LABELS: Record<ThermalSizeCategory, string> =
  {
    MINI: "Mini & Tipis",
    STANDAR: "Standar Operasional",
    PERSEGI: "Persegi (QR Besar)",
    BESAR: "Besar & Boks",
    KUSTOM: "Ukuran Kustom",
  };

export const THERMAL_SIZES: Record<ThermalSizeId, ThermalSizeSpec> = {
  "30x20": {
    id: "30x20",
    label: "Thermal 30 × 20 mm (Mini)",
    shortLabel: "30 × 20 mm",
    category: "MINI",
    widthMm: 30,
    heightMm: 20,
    description: "Label mini untuk komponen kecil, botol, kabel, atau aksesori.",
  },
  "33x15": {
    id: "33x15",
    label: "Thermal 33 × 15 mm (Super Mini)",
    shortLabel: "33 × 15 mm",
    category: "MINI",
    widthMm: 33,
    heightMm: 15,
    description: "Stiker super tipis untuk mainan kecil & penanda kode ringkas.",
  },
  "40x20": {
    id: "40x20",
    label: "Thermal 40 × 20 mm (Tipis)",
    shortLabel: "40 × 20 mm",
    category: "MINI",
    widthMm: 40,
    heightMm: 20,
    description: "Label tipis memanjang untuk bibir rak tipis & kotak ringkas.",
  },
  "40x30": {
    id: "40x30",
    label: "Thermal 40 × 30 mm (Ringkas)",
    shortLabel: "40 × 30 mm",
    category: "STANDAR",
    widthMm: 40,
    heightMm: 30,
    description: "Ukuran thermal ringkas favorit untuk mainan terapi & aset.",
  },
  "40x40": {
    id: "40x40",
    label: "Thermal 40 × 40 mm (Persegi Mini)",
    shortLabel: "40 × 40 mm",
    category: "PERSEGI",
    widthMm: 40,
    heightMm: 40,
    description: "Stiker persegi ideal untuk QR Code besar & judul jelas.",
  },
  "50x30": {
    id: "50x30",
    label: "Thermal 50 × 30 mm (Standar)",
    shortLabel: "50 × 30 mm",
    category: "STANDAR",
    widthMm: 50,
    heightMm: 30,
    description:
      "Ukuran standar StarOps — pas untuk QR hingga 24 mm maupun Combo.",
  },
  "50x40": {
    id: "50x40",
    label: "Thermal 50 × 40 mm (Sedang)",
    shortLabel: "50 × 40 mm",
    category: "STANDAR",
    widthMm: 50,
    heightMm: 40,
    description: "Ruang vertikal ekstra untuk nama item panjang tanpa terpotong.",
  },
  "50x50": {
    id: "50x50",
    label: "Thermal 50 × 50 mm (Persegi Standar)",
    shortLabel: "50 × 50 mm",
    category: "PERSEGI",
    widthMm: 50,
    heightMm: 50,
    description:
      "Persegi serbaguna untuk QR Dominan 80% yang super cepat dipindai.",
  },
  "60x40": {
    id: "60x40",
    label: "Thermal 60 × 40 mm (Lega)",
    shortLabel: "60 × 40 mm",
    category: "STANDAR",
    widthMm: 60,
    heightMm: 40,
    description: "Format lebar & lega untuk inventaris aset & informasi lokasi.",
  },
  "70x40": {
    id: "70x40",
    label: "Thermal 70 × 40 mm (Lebar)",
    shortLabel: "70 × 40 mm",
    category: "STANDAR",
    widthMm: 70,
    heightMm: 40,
    description: "Nyaman untuk barcode 1D panjang + QR besar secara bersamaan.",
  },
  "70x50": {
    id: "70x50",
    label: "Thermal 70 × 50 mm (Besar)",
    shortLabel: "70 × 50 mm",
    category: "BESAR",
    widthMm: 70,
    heightMm: 50,
    description: "Label besar untuk kontainer mainan, boks penyimpanan & lemari.",
  },
  "80x50": {
    id: "80x50",
    label: "Thermal 80 × 50 mm (Boks & Rak)",
    shortLabel: "80 × 50 mm",
    category: "BESAR",
    widthMm: 80,
    heightMm: 50,
    description: "QR ekstra besar hingga 40 mm — cepat dipindai dari jarak jauh.",
  },
  "80x80": {
    id: "80x80",
    label: "Thermal 80 × 80 mm (Persegi Besar)",
    shortLabel: "80 × 80 mm",
    category: "PERSEGI",
    widthMm: 80,
    heightMm: 80,
    description: "Persegi jumbo untuk rak terapi, pintu ruang, atau boks besar.",
  },
  "100x50": {
    id: "100x50",
    label: "Thermal 100 × 50 mm (Ekstra Lebar)",
    shortLabel: "100 × 50 mm",
    category: "BESAR",
    widthMm: 100,
    heightMm: 50,
    description: "Format ekstra lebar untuk judul arsip panjang & rak utama.",
  },
  "100x70": {
    id: "100x70",
    label: "Thermal 100 × 70 mm (Jumbo)",
    shortLabel: "100 × 70 mm",
    category: "BESAR",
    widthMm: 100,
    heightMm: 70,
    description: "Label jumbo kontainer & paket dengan keterbacaan maksimal.",
  },
  "100x100": {
    id: "100x100",
    label: "Thermal 100 × 100 mm (Jumbo Persegi)",
    shortLabel: "100 × 100 mm",
    category: "PERSEGI",
    widthMm: 100,
    heightMm: 100,
    description: "Stiker persegi maksimal 10 × 10 cm untuk pemindaian jarak jauh.",
  },
  CUSTOM: {
    id: "CUSTOM",
    label: "Thermal Kustom (Bebas mm)",
    shortLabel: "Kustom (mm)",
    category: "KUSTOM",
    widthMm: DEFAULT_CUSTOM_THERMAL_SIZE.widthMm,
    heightMm: DEFAULT_CUSTOM_THERMAL_SIZE.heightMm,
    description:
      "Atur lebar (20–210 mm) & tinggi (12–297 mm) sesuai gulungan kertas Anda.",
  },
};

export const THERMAL_SIZE_LIST: ThermalSizeSpec[] = Object.values(THERMAL_SIZES);

export function resolveThermalDimensions(
  sizeId: ThermalSizeId,
  custom?: Partial<CustomThermalSize> | null,
): { widthMm: number; heightMm: number } {
  if (sizeId === "CUSTOM") {
    return clampCustomThermalSize(custom);
  }
  const spec = THERMAL_SIZES[sizeId] ?? THERMAL_SIZES["50x30"];
  return { widthMm: spec.widthMm, heightMm: spec.heightMm };
}

export const A4_GRID_PRESETS: Record<A4GridPresetId, A4GridPresetSpec> = {
  TJ_121_24: {
    id: "TJ_121_24",
    label: "Tom & Jerry No. 121 — 24/Hal (62 × 33 mm)",
    shortLabel: "24/Hal (62×33)",
    description: "3 kolom × 8 baris standar serbaguna untuk inventaris & arsip.",
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
  },
  TJ_107_30: {
    id: "TJ_107_30",
    label: "Tom & Jerry No. 107 — 30/Hal (62 × 26 mm)",
    shortLabel: "30/Hal (62×26)",
    description: "3 kolom × 10 baris hemat kertas untuk label kode & QR ringkas.",
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 3,
    rows: 10,
    perPage: 30,
    marginTopMm: 10,
    marginSideMm: 8,
    gapXMm: 4,
    gapYMm: 1.8,
    labelWidthMm: 62,
    labelHeightMm: 26,
  },
  TJ_125_18: {
    id: "TJ_125_18",
    label: "Tom & Jerry No. 125 — 18/Hal (62 × 45 mm)",
    shortLabel: "18/Hal (62×45)",
    description: "3 kolom × 6 baris tinggi lega untuk QR besar + judul panjang.",
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 3,
    rows: 6,
    perPage: 18,
    marginTopMm: 10,
    marginSideMm: 8,
    gapXMm: 4,
    gapYMm: 1.4,
    labelWidthMm: 62,
    labelHeightMm: 45,
  },
  TJ_103_12: {
    id: "TJ_103_12",
    label: "Tom & Jerry No. 103 — 12/Hal (94 × 44 mm)",
    shortLabel: "12/Hal (94×44)",
    description: "2 kolom × 6 baris lebar untuk boks penyimpanan & aset besar.",
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 2,
    rows: 6,
    perPage: 12,
    marginTopMm: 11,
    marginSideMm: 9,
    gapXMm: 4,
    gapYMm: 2.2,
    labelWidthMm: 94,
    labelHeightMm: 44,
  },
  A4_SQUARE_12: {
    id: "A4_SQUARE_12",
    label: "A4 Persegi — 12/Hal (60 × 60 mm)",
    shortLabel: "12/Hal (60×60)",
    description:
      "3 kolom × 4 baris persegi sempurna untuk stiker QR Dominan 80%.",
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 3,
    rows: 4,
    perPage: 12,
    marginTopMm: 18,
    marginSideMm: 11,
    gapXMm: 4,
    gapYMm: 7,
    labelWidthMm: 60,
    labelHeightMm: 60,
  },
  A4_LARGE_8: {
    id: "A4_LARGE_8",
    label: "A4 Besar — 8/Hal (94 × 66 mm)",
    shortLabel: "8/Hal (94×66)",
    description: "2 kolom × 4 baris ukuran besar untuk lemari, kontainer & ruang.",
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 2,
    rows: 4,
    perPage: 8,
    marginTopMm: 11,
    marginSideMm: 9,
    gapXMm: 4,
    gapYMm: 3.5,
    labelWidthMm: 94,
    labelHeightMm: 66,
  },
  A4_MINI_40: {
    id: "A4_MINI_40",
    label: "A4 Mini — 40/Hal (46 × 26 mm)",
    shortLabel: "40/Hal (46×26)",
    description: "4 kolom × 10 baris super hemat untuk item kecil dalam jumlah banyak.",
    pageWidthMm: 210,
    pageHeightMm: 297,
    cols: 4,
    rows: 10,
    perPage: 40,
    marginTopMm: 10,
    marginSideMm: 8,
    gapXMm: 3.3,
    gapYMm: 1.8,
    labelWidthMm: 46,
    labelHeightMm: 26,
  },
};

export const A4_GRID_PRESET_LIST: A4GridPresetSpec[] =
  Object.values(A4_GRID_PRESETS);

/** Backwards-compatible default A4 grid spec (Tom & Jerry No. 121 — 24/hal). */
export const A4_GRID_SPEC = A4_GRID_PRESETS.TJ_121_24;

export const SPINE_SIZES: Record<SpineSizeId, SpineSizeSpec> = {
  "150x35": {
    id: "150x35",
    label: "Punggung Map 150 × 35 mm (Standar Odner)",
    shortLabel: "150 × 35 mm",
    description: "7 label/halaman A4 — pas untuk odner & box file standar.",
    widthMm: 150,
    heightMm: 35,
    a4PageWidthMm: 210,
    a4PageHeightMm: 297,
    a4PerPage: 7,
    a4MarginTopMm: 12,
    a4MarginSideMm: 30,
    a4GapYMm: 4,
  },
  "180x50": {
    id: "180x50",
    label: "Punggung Map 180 × 50 mm (Odner Tebal)",
    shortLabel: "180 × 50 mm",
    description: "5 label/halaman A4 — lega untuk odner tebal & judul panjang.",
    widthMm: 180,
    heightMm: 50,
    a4PageWidthMm: 210,
    a4PageHeightMm: 297,
    a4PerPage: 5,
    a4MarginTopMm: 12,
    a4MarginSideMm: 15,
    a4GapYMm: 5,
  },
  "190x30": {
    id: "190x30",
    label: "Punggung Map 190 × 30 mm (Tipis Panjang)",
    shortLabel: "190 × 30 mm",
    description: "8 label/halaman A4 — ramping untuk map tipis / binder.",
    widthMm: 190,
    heightMm: 30,
    a4PageWidthMm: 210,
    a4PageHeightMm: 297,
    a4PerPage: 8,
    a4MarginTopMm: 12,
    a4MarginSideMm: 10,
    a4GapYMm: 4,
  },
  "120x30": {
    id: "120x30",
    label: "Punggung Map 120 × 30 mm (Ringkas)",
    shortLabel: "120 × 30 mm",
    description: "8 label/halaman A4 — ukuran pendek untuk map kecil & laci.",
    widthMm: 120,
    heightMm: 30,
    a4PageWidthMm: 210,
    a4PageHeightMm: 297,
    a4PerPage: 8,
    a4MarginTopMm: 12,
    a4MarginSideMm: 45,
    a4GapYMm: 4,
  },
};

export const SPINE_SIZE_LIST: SpineSizeSpec[] = Object.values(SPINE_SIZES);

/** Backwards-compatible default spine spec (150 × 35 mm). */
export const SPINE_LABEL_SPEC = SPINE_SIZES["150x35"];

export function resolvePageDimensionsMm(
  template: LabelTemplateId,
  thermalSize: ThermalSizeId,
  spinePaperMode: SpinePaperMode,
  customThermalSize?: Partial<CustomThermalSize> | null,
  a4Preset: A4GridPresetId = "TJ_121_24",
  spineSize: SpineSizeId = "150x35",
): { widthMm: number; heightMm: number } {
  if (template === "THERMAL") {
    return resolveThermalDimensions(thermalSize, customThermalSize);
  }
  if (template === "A4_GRID") {
    const spec = A4_GRID_PRESETS[a4Preset] ?? A4_GRID_SPEC;
    return { widthMm: spec.pageWidthMm, heightMm: spec.pageHeightMm };
  }
  const spineSpec = SPINE_SIZES[spineSize] ?? SPINE_LABEL_SPEC;
  if (spinePaperMode === "CUSTOM_SINGLE") {
    return { widthMm: spineSpec.widthMm, heightMm: spineSpec.heightMm };
  }
  return {
    widthMm: spineSpec.a4PageWidthMm,
    heightMm: spineSpec.a4PageHeightMm,
  };
}

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
    description:
      "QR Code besar & tajam untuk pemindaian kamera HP, tablet & scanner.",
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
    subtitle: "17 ukuran roll (30×20 hingga 100×100 mm) + Kustom",
    dimensions: "30×20 – 100×100 mm / Kustom",
  },
  A4_GRID: {
    title: "Template B — Kertas Label A4 Multi-Grid",
    subtitle: "7 preset A4 (Tom & Jerry 121/107/125/103, Persegi, Besar, Mini)",
    dimensions: "8 – 40 stiker/halaman A4 + garis potong",
  },
  ARCHIVE_SPINE: {
    title: "Template C — Label Punggung Map Arsip",
    subtitle: "4 ukuran punggung map/odner (120×30 hingga 180×50 mm)",
    dimensions: "120×30 – 180×50 mm",
  },
};

export const DEFAULT_LABEL_CONTENT_SETTINGS: LabelContentSettings = {
  showHeader: true,
  customHeaderText: "STAR CHAMPS INDONESIA",
  showHeaderSubtitle: true,
  showTitle: true,
  showCategory: true,
  showCodeText: true,
  showLocation: true,
  showStockQty: false,
  showPartCounter: false,
  showArchiveDigitalIndicator: true,
  showStatusTag: false,
  showScanHint: true,
  customScanHint: "Scan QR untuk detail & stok",
  showBorderFrame: false,
  qrPayloadMode: "SHORT_PREVIEW",
  qrErrorLevel: "L",
  qrSizePercent: 65,
  qrLayout: "SIDE_BY_SIDE",
  qrQuietZone: 1,
};

const VALID_QR_PAYLOAD_MODES = new Set<QrPayloadMode>([
  "SHORT_PREVIEW",
  "CODE_ONLY",
  "FULL_DETAIL",
]);
const VALID_QR_ERROR_LEVELS = new Set<QrErrorLevel>(["L", "M", "Q", "H"]);
const VALID_QR_LAYOUTS = new Set<QrLayoutMode>([
  "SIDE_BY_SIDE",
  "TOP_BOTTOM",
  "QR_DOMINANT",
]);
const VALID_SYMBOLOGIES = new Set<SymbologyMode>(["CODE128", "QR", "COMBO"]);
const VALID_TEMPLATES = new Set<LabelTemplateId>([
  "THERMAL",
  "A4_GRID",
  "ARCHIVE_SPINE",
]);
const VALID_SPINE_PAPER_MODES = new Set<SpinePaperMode>([
  "A4_SHEET",
  "CUSTOM_SINGLE",
]);

export function normalizeLabelContentSettings(
  partial?: Partial<LabelContentSettings> | Record<string, unknown> | null,
): LabelContentSettings {
  const src =
    partial && typeof partial === "object"
      ? (partial as Record<string, unknown>)
      : {};
  const d = DEFAULT_LABEL_CONTENT_SETTINGS;

  const rawQrPercent = Number(src.qrSizePercent);
  const qrSizePercent = Number.isFinite(rawQrPercent)
    ? Math.round(clampNumber(rawQrPercent, 40, 85))
    : d.qrSizePercent;

  return {
    showHeader: typeof src.showHeader === "boolean" ? src.showHeader : d.showHeader,
    customHeaderText:
      typeof src.customHeaderText === "string"
        ? src.customHeaderText.slice(0, 80)
        : d.customHeaderText,
    showHeaderSubtitle:
      typeof src.showHeaderSubtitle === "boolean"
        ? src.showHeaderSubtitle
        : d.showHeaderSubtitle,
    showTitle: typeof src.showTitle === "boolean" ? src.showTitle : d.showTitle,
    showCategory:
      typeof src.showCategory === "boolean" ? src.showCategory : d.showCategory,
    showCodeText:
      typeof src.showCodeText === "boolean" ? src.showCodeText : d.showCodeText,
    showLocation:
      typeof src.showLocation === "boolean" ? src.showLocation : d.showLocation,
    showStockQty:
      typeof src.showStockQty === "boolean" ? src.showStockQty : d.showStockQty,
    showPartCounter:
      typeof src.showPartCounter === "boolean"
        ? src.showPartCounter
        : d.showPartCounter,
    showArchiveDigitalIndicator:
      typeof src.showArchiveDigitalIndicator === "boolean"
        ? src.showArchiveDigitalIndicator
        : d.showArchiveDigitalIndicator,
    showStatusTag:
      typeof src.showStatusTag === "boolean" ? src.showStatusTag : d.showStatusTag,
    showScanHint:
      typeof src.showScanHint === "boolean" ? src.showScanHint : d.showScanHint,
    customScanHint:
      typeof src.customScanHint === "string"
        ? src.customScanHint.slice(0, 80)
        : d.customScanHint,
    showBorderFrame:
      typeof src.showBorderFrame === "boolean"
        ? src.showBorderFrame
        : d.showBorderFrame,
    qrPayloadMode: VALID_QR_PAYLOAD_MODES.has(src.qrPayloadMode as QrPayloadMode)
      ? (src.qrPayloadMode as QrPayloadMode)
      : d.qrPayloadMode,
    qrErrorLevel: VALID_QR_ERROR_LEVELS.has(src.qrErrorLevel as QrErrorLevel)
      ? (src.qrErrorLevel as QrErrorLevel)
      : d.qrErrorLevel,
    qrSizePercent,
    qrLayout: VALID_QR_LAYOUTS.has(src.qrLayout as QrLayoutMode)
      ? (src.qrLayout as QrLayoutMode)
      : d.qrLayout,
    qrQuietZone: src.qrQuietZone === 2 ? 2 : 1,
  };
}

export const LABEL_CONTENT_PRESETS: Record<
  LabelContentPresetId,
  LabelContentPreset
> = {
  PERMANENT_STICKER: {
    id: "PERMANENT_STICKER",
    label: "Stiker Sekali Tempel",
    description:
      "Tanpa angka stok/part yang cepat usang — detail live dilihat via scan QR.",
    settings: { ...DEFAULT_LABEL_CONTENT_SETTINGS },
  },
  QR_DOMINANT_80: {
    id: "QR_DOMINANT_80",
    label: "QR Dominan 80%",
    description:
      "QR super besar hingga 80% bidang kertas dengan teks judul, kode & lokasi ringkas.",
    settings: {
      ...DEFAULT_LABEL_CONTENT_SETTINGS,
      showHeader: false,
      showHeaderSubtitle: false,
      showTitle: true,
      showCategory: false,
      showCodeText: true,
      showLocation: true,
      showStockQty: false,
      showPartCounter: false,
      showArchiveDigitalIndicator: false,
      showStatusTag: false,
      showScanHint: false,
      qrPayloadMode: "SHORT_PREVIEW",
      qrErrorLevel: "L",
      qrSizePercent: 80,
      qrLayout: "QR_DOMINANT",
      qrQuietZone: 1,
    },
  },
  FULL_INFO: {
    id: "FULL_INFO",
    label: "Info Lengkap (Stok & Part)",
    description:
      "Menampilkan seluruh identitas termasuk stok, part counter, kategori & status.",
    settings: {
      ...DEFAULT_LABEL_CONTENT_SETTINGS,
      showHeader: true,
      showHeaderSubtitle: true,
      showTitle: true,
      showCategory: true,
      showCodeText: true,
      showLocation: true,
      showStockQty: true,
      showPartCounter: true,
      showArchiveDigitalIndicator: true,
      showStatusTag: true,
      showScanHint: true,
      customScanHint: "Scan QR untuk info & audit",
      qrPayloadMode: "SHORT_PREVIEW",
      qrErrorLevel: "M",
      qrSizePercent: 60,
      qrLayout: "SIDE_BY_SIDE",
      qrQuietZone: 1,
    },
  },
  SCAN_ONLY_MINIMAL: {
    id: "SCAN_ONLY_MINIMAL",
    label: "QR Maksimal + Kode",
    description:
      "Kotak QR ekstra tebal (Kode Saja) dengan teks kode saja — cocok untuk stiker mini.",
    settings: {
      ...DEFAULT_LABEL_CONTENT_SETTINGS,
      showHeader: false,
      showHeaderSubtitle: false,
      showTitle: false,
      showCategory: false,
      showCodeText: true,
      showLocation: false,
      showStockQty: false,
      showPartCounter: false,
      showArchiveDigitalIndicator: false,
      showStatusTag: false,
      showScanHint: false,
      qrPayloadMode: "CODE_ONLY",
      qrErrorLevel: "L",
      qrSizePercent: 85,
      qrLayout: "TOP_BOTTOM",
      qrQuietZone: 1,
    },
  },
};

export const LABEL_CONTENT_PRESET_LIST: LabelContentPreset[] = Object.values(
  LABEL_CONTENT_PRESETS,
);

export const DEFAULT_BARCODE_STUDIO_CONFIG: BarcodeStudioConfigSnapshot = {
  symbology: "QR",
  template: "THERMAL",
  thermalSize: "50x30",
  customThermalSize: { ...DEFAULT_CUSTOM_THERMAL_SIZE },
  a4Preset: "TJ_121_24",
  spineSize: "150x35",
  spinePaperMode: "A4_SHEET",
  content: { ...DEFAULT_LABEL_CONTENT_SETTINGS },
};

export function normalizeBarcodeStudioConfig(
  raw: unknown,
): BarcodeStudioConfigSnapshot {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_BARCODE_STUDIO_CONFIG;

  const symbology = VALID_SYMBOLOGIES.has(src.symbology as SymbologyMode)
    ? (src.symbology as SymbologyMode)
    : d.symbology;

  const template = VALID_TEMPLATES.has(src.template as LabelTemplateId)
    ? (src.template as LabelTemplateId)
    : d.template;

  const thermalSize =
    typeof src.thermalSize === "string" && src.thermalSize in THERMAL_SIZES
      ? (src.thermalSize as ThermalSizeId)
      : d.thermalSize;

  const customThermalSize = clampCustomThermalSize(
    src.customThermalSize && typeof src.customThermalSize === "object"
      ? (src.customThermalSize as Partial<CustomThermalSize>)
      : d.customThermalSize,
  );

  const a4Preset =
    typeof src.a4Preset === "string" && src.a4Preset in A4_GRID_PRESETS
      ? (src.a4Preset as A4GridPresetId)
      : d.a4Preset;

  const spineSize =
    typeof src.spineSize === "string" && src.spineSize in SPINE_SIZES
      ? (src.spineSize as SpineSizeId)
      : d.spineSize;

  const spinePaperMode = VALID_SPINE_PAPER_MODES.has(
    src.spinePaperMode as SpinePaperMode,
  )
    ? (src.spinePaperMode as SpinePaperMode)
    : d.spinePaperMode;

  const content = normalizeLabelContentSettings(
    src.content && typeof src.content === "object"
      ? (src.content as Record<string, unknown>)
      : d.content,
  );

  return {
    symbology,
    template,
    thermalSize,
    customThermalSize,
    a4Preset,
    spineSize,
    spinePaperMode,
    content,
  };
}

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
  stockText: string | null;
  partsText: string | null;
  archiveDigitalText: string | null;
  hasDigitalLink: boolean;
  recommendedFormat: BarcodeFormat;
  qrPath: string;
  shortSlug: string | null;
  shortQrPath: string;
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
 * Backwards-compatible full-detail QR target URL builder:
 * - Inventory items: `${origin}/inventory/${id}`
 * - Hybrid archives: `${origin}/archives?code=${encodeURIComponent(doc_code)}`
 */
export function buildQrTargetUrl(
  record: Pick<PrintableLabelRecord, "qrPath">,
  origin = "",
): string {
  const cleanOrigin = normalizeQrOrigin(origin);
  return cleanOrigin ? `${cleanOrigin}${record.qrPath}` : record.qrPath;
}

/**
 * Builds the QR payload according to `mode`:
 * - `"CODE_ONLY"`: plain item/doc code (smallest QR v1 21×21 giant blocks!)
 * - `"SHORT_PREVIEW"`: `${origin}/s/${shortSlugOrCode}` (short web preview URL)
 * - `"FULL_DETAIL"`: `${origin}${record.qrPath}`
 */
export function buildQrPayload(
  record: Pick<PrintableLabelRecord, "code" | "qrPath" | "shortQrPath">,
  origin = "",
  mode: QrPayloadMode = "SHORT_PREVIEW",
): string {
  if (mode === "CODE_ONLY") {
    return record.code.trim();
  }
  const cleanOrigin = normalizeQrOrigin(origin);
  if (mode === "FULL_DETAIL") {
    return cleanOrigin ? `${cleanOrigin}${record.qrPath}` : record.qrPath;
  }
  const shortPath =
    record.shortQrPath?.trim() || `/s/${encodeURIComponent(record.code.trim())}`;
  return cleanOrigin ? `${cleanOrigin}${shortPath}` : shortPath;
}

/**
 * Exact ISO/IEC 18004 QR Code Version 1–10 character capacities.
 */
const QR_ALPHANUMERIC_CAPACITIES: Record<QrErrorLevel, readonly number[]> = {
  L: [25, 47, 77, 114, 154, 195, 224, 279, 335, 395],
  M: [20, 38, 61, 90, 122, 154, 178, 221, 262, 311],
  Q: [16, 29, 47, 67, 87, 108, 125, 157, 189, 221],
  H: [10, 20, 35, 50, 64, 84, 93, 122, 143, 174],
};

const QR_BYTE_CAPACITIES: Record<QrErrorLevel, readonly number[]> = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271],
  M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213],
  Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151],
  H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119],
};

const QR_ALPHANUMERIC_RE = /^[0-9A-Z $%*+\-./:]+$/;

export type QrDensityTier = "EKSTRA BESAR" | "BESAR" | "SEDANG" | "PADAT";

export type QrMatrixInfo = {
  charCount: number;
  isAlphanumeric: boolean;
  version: number;
  modules: number;
  densityTier: QrDensityTier;
  hint: string;
};

function utf8ByteLength(str: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  return str.length;
}

/**
 * Estimates the exact QR Code version, module count, and visual block density
 * tier for a payload and error-correction level using ISO/IEC 18004 v1..v10 tables.
 */
export function estimateQrMatrixInfo(
  payload: string,
  level: QrErrorLevel = "L",
): QrMatrixInfo {
  const value = payload ?? "";
  const charCount = value.length;
  const isAlphanumeric = charCount > 0 && QR_ALPHANUMERIC_RE.test(value);
  const effectiveLen = isAlphanumeric ? charCount : utf8ByteLength(value);
  const table = isAlphanumeric
    ? QR_ALPHANUMERIC_CAPACITIES[level]
    : QR_BYTE_CAPACITIES[level];

  let version = 1;
  let matched = false;
  for (let idx = 0; idx < table.length; idx += 1) {
    if (effectiveLen <= table[idx]) {
      version = idx + 1;
      matched = true;
      break;
    }
  }
  if (!matched) {
    const v10Max = table[table.length - 1];
    const perVersionStep = isAlphanumeric ? 42 : 28;
    version = Math.min(
      40,
      10 + Math.max(1, Math.ceil((effectiveLen - v10Max) / perVersionStep)),
    );
  }

  const modules = 17 + 4 * version;

  let densityTier: QrDensityTier;
  let hint: string;
  if (version <= 2) {
    densityTier = "EKSTRA BESAR";
    hint =
      "Kotak QR ekstra besar & tebal — super cepat dipindai kamera HP bahkan pada stiker kecil.";
  } else if (version === 3) {
    densityTier = "BESAR";
    hint =
      "Kotak QR besar & tajam — sangat ideal untuk stiker thermal maupun kertas A4.";
  } else if (version <= 5) {
    densityTier = "SEDANG";
    hint =
      "Kepadatan sedang — tetap nyaman dipindai pada ukuran QR ≥ 16 mm atau gunakan level L.";
  } else {
    densityTier = "PADAT";
    hint =
      "QR cukup padat — pilih mode Short Preview / Kode Saja atau ECC Level L agar blok lebih besar.";
  }

  return {
    charCount,
    isAlphanumeric,
    version,
    modules,
    densityTier,
    hint,
  };
}

/**
 * Inserts zero-width space (`\u200B`) soft break opportunities after `_`, `-`, `/`
 * so long underscore filenames & codes wrap cleanly at delimiters without
 * overflowing or breaking awkwardly mid-word.
 */
export function insertSoftBreakOpportunities(text: string): string {
  if (!text) return "";
  return text.replace(/([_\-/])(?!\u200B)/g, "$1\u200B");
}

/**
 * Splits a single whitespace-delimited token into soft-break segments at `_`, `-`, `/`
 * (keeping the delimiter attached to the preceding segment) and chunks ultra-long
 * unbroken sequences so `@react-pdf/renderer` hyphenationCallback never overflows.
 */
export function splitSoftBreakSegments(
  word: string,
  maxChunkChars = 16,
): string[] {
  if (!word) return [""];
  const rawSegments = word.split(/(?<=[_\-/])/).filter(Boolean);
  const result: string[] = [];

  for (const seg of rawSegments) {
    if (seg.length <= maxChunkChars) {
      result.push(seg);
    } else {
      for (let i = 0; i < seg.length; i += maxChunkChars) {
        result.push(seg.slice(i, i + maxChunkChars));
      }
    }
  }
  return result.length > 0 ? result : [word];
}

function estimateCharWidthEm(ch: string): number {
  if (ch === " ") return 0.28;
  if ("ilI1!|.,:;'`".includes(ch)) return 0.31;
  if ("ftjr()-/[]{}".includes(ch)) return 0.4;
  if ("MWmw@%".includes(ch)) return 0.86;
  if (ch >= "A" && ch <= "Z") return 0.69;
  if ((ch >= "0" && ch <= "9") || ch === "_") return 0.59;
  return 0.55;
}

function estimateStringWidthPt(
  str: string,
  fontSizePt: number,
  bold: boolean,
  mono = false,
): number {
  if (mono) {
    // Courier-Bold has fixed 0.60em glyph advance; 0.625em gives clean safety parity across PDF & browser mono
    return str.length * 0.625 * fontSizePt * (bold ? 1.03 : 1.0);
  }
  let emSum = 0;
  for (let i = 0; i < str.length; i += 1) {
    emSum += estimateCharWidthEm(str[i]);
  }
  const weightMultiplier = bold ? 1.07 : 1.0;
  // 4% conservative safety buffer across Helvetica (PDF) and system sans (HTML)
  return emSum * fontSizePt * weightMultiplier * 1.04;
}

function estimateWrappedLines(
  cleanText: string,
  boxWidthPt: number,
  fontSizePt: number,
  bold: boolean,
  mono = false,
): number {
  const words = cleanText.split(" ").filter(Boolean);
  if (words.length === 0) return 1;

  const spacePt = estimateStringWidthPt(" ", fontSizePt, bold, mono);
  let lines = 1;
  let currentLinePt = 0;

  for (const word of words) {
    const wholeWordPt = estimateStringWidthPt(word, fontSizePt, bold, mono);
    const neededWithSpace =
      currentLinePt > 0 ? currentLinePt + spacePt + wholeWordPt : wholeWordPt;

    if (neededWithSpace <= boxWidthPt) {
      currentLinePt = neededWithSpace;
      continue;
    }

    // Try breaking at soft delimiters (_, -, /) if whole word doesn't fit
    const segments = splitSoftBreakSegments(word, 16);
    if (segments.length === 1) {
      if (currentLinePt > 0) {
        lines += 1;
        currentLinePt = 0;
      }
      if (wholeWordPt <= boxWidthPt) {
        currentLinePt = wholeWordPt;
      } else {
        const extraLines = Math.ceil(wholeWordPt / boxWidthPt);
        lines += extraLines - 1;
        currentLinePt = wholeWordPt - (extraLines - 1) * boxWidthPt;
      }
      continue;
    }

    // Place word starting with space if current line can fit at least first segment
    const firstSegPt = estimateStringWidthPt(segments[0], fontSizePt, bold, mono);
    if (currentLinePt > 0 && currentLinePt + spacePt + firstSegPt <= boxWidthPt) {
      currentLinePt += spacePt;
    } else if (currentLinePt > 0) {
      lines += 1;
      currentLinePt = 0;
    }

    for (const seg of segments) {
      const segPt = estimateStringWidthPt(seg, fontSizePt, bold, mono);
      if (currentLinePt > 0 && currentLinePt + segPt <= boxWidthPt) {
        currentLinePt += segPt;
      } else {
        if (currentLinePt > 0) {
          lines += 1;
          currentLinePt = 0;
        }
        if (segPt <= boxWidthPt) {
          currentLinePt = segPt;
        } else {
          const extra = Math.ceil(segPt / boxWidthPt);
          lines += extra - 1;
          currentLinePt = segPt - (extra - 1) * boxWidthPt;
        }
      }
    }
  }

  return lines;
}

export type AdaptiveFontResult = {
  fontSizePt: number;
  lineHeight: number;
  estimatedLines: number;
};

/**
 * Computes an adaptive font size (in pt) that wraps words and soft-break segments
 * cleanly inside `boxWidthMm × maxHeightMm` without EVER truncating the text.
 * Steps smoothly from `baseFontPt` down to `minFontPt` until 100% fits.
 */
export function computeAdaptiveFontPt(
  text: string,
  boxWidthMm: number,
  maxHeightMm: number,
  baseFontPt: number,
  minFontPt: number,
  lineHeight = 1.15,
  bold = true,
  mono = false,
): AdaptiveFontResult {
  const clean = text.trim().replace(/\s+/g, " ");
  const safeMax = Math.max(minFontPt, baseFontPt);
  const safeMin = Math.min(minFontPt, safeMax);

  if (!clean) {
    return { fontSizePt: safeMax, lineHeight, estimatedLines: 1 };
  }

  const boxWidthPt = Math.max(12, mmToPt(boxWidthMm));
  const maxHeightPt = Math.max(3, mmToPt(maxHeightMm));
  const step = 0.25;

  let bestLines = 1;
  let bestLineHeight = lineHeight;

  for (let pt = safeMax; pt >= safeMin - 0.001; pt -= step) {
    const candidatePt = round1(Math.max(safeMin, pt));
    const lines = estimateWrappedLines(clean, boxWidthPt, candidatePt, bold, mono);
    const effLineHeight =
      lines >= 3 ? Math.max(1.05, round1(lineHeight - 0.05)) : lineHeight;
    const totalHeightPt = lines * candidatePt * effLineHeight;

    bestLines = lines;
    bestLineHeight = effLineHeight;

    if (totalHeightPt <= maxHeightPt) {
      return {
        fontSizePt: candidatePt,
        lineHeight: effLineHeight,
        estimatedLines: lines,
      };
    }
  }

  return {
    fontSizePt: round1(safeMin),
    lineHeight: bestLineHeight,
    estimatedLines: bestLines,
  };
}

/**
 * Builds the optional dynamic counter/indicator line respecting user toggles.
 * By default `showStockQty` and `showPartCounter` are OFF for permanent stickers.
 */
export function buildActiveCounterLine(
  record: Pick<
    PrintableLabelRecord,
    "source" | "stockText" | "partsText" | "archiveDigitalText"
  >,
  content: LabelContentSettings,
): string | null {
  if (record.source === "ARCHIVE") {
    if (!content.showArchiveDigitalIndicator) return null;
    return record.archiveDigitalText?.trim() || null;
  }
  const parts: string[] = [];
  if (content.showStockQty && record.stockText?.trim()) {
    parts.push(record.stockText.trim());
  }
  if (content.showPartCounter && record.partsText?.trim()) {
    parts.push(record.partsText.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type QrStickerLayoutInput = {
  widthMm: number;
  heightMm: number;
  content: LabelContentSettings;
  hasHeader: boolean;
  hasTitle: boolean;
  hasCategory: boolean;
  hasCodeText: boolean;
  hasLocation: boolean;
  hasCounterLine: boolean;
  hasStatusTag: boolean;
  hasScanHint: boolean;
  titleText?: string;
  locationText?: string;
  codeText?: string;
  counterText?: string;
  scanHintText?: string;
};

export type QrStickerLayoutResult = {
  orientation: "SIDE_BY_SIDE" | "TOP_BOTTOM" | "QR_ONLY";
  padXMm: number;
  padYMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  headerFullWidth: boolean;
  headerHeightMm: number;
  qrSizeMm: number;
  gapMm: number;
  textBoxWidthMm: number;
  textBoxHeightMm: number;
  titleMaxHeightMm: number;
  locationMaxHeightMm: number;
  scale: number;
  headerFontPt: number;
  headerSubFontPt: number;
  titleBaseFontPt: number;
  titleMinFontPt: number;
  categoryFontPt: number;
  codeFontPt: number;
  metaFontPt: number;
  hintFontPt: number;
  statusFontPt: number;
};

/**
 * Shared 1:1 QR sticker layout engine used by BOTH HTML (`label-sticker.tsx`)
 * and Vector PDF (`label-pdf.tsx`). Supports 40%–85% QR box sizing across
 * SIDE_BY_SIDE, TOP_BOTTOM, and QR_DOMINANT modes for any sticker size.
 */
export function computeQrStickerLayout(
  input: QrStickerLayoutInput,
): QrStickerLayoutResult {
  const {
    widthMm,
    heightMm,
    content,
    hasHeader,
    hasTitle,
    hasCategory,
    hasCodeText,
    hasLocation,
    hasCounterLine,
    hasStatusTag,
    hasScanHint,
    titleText = "",
    locationText = "",
    codeText = "",
    counterText = "",
    scanHintText = "",
  } = input;

  const isDominant = content.qrLayout === "QR_DOMINANT";
  const pct = clampNumber(content.qrSizePercent, 40, 85) / 100;
  const shortSide = Math.min(widthMm, heightMm);
  const scale = clampNumber(
    Math.min(widthMm / 50, heightMm / 30),
    0.38,
    2.45,
  );

  // Tighter padding in QR_DOMINANT or mini custom labels so QR fits cleanly with zero overflow
  const padBase = isDominant ? 0.03 : 0.038;
  const padXMm = round1(clampNumber(widthMm * padBase, 0.6, 3.6));
  const padYMm = round1(clampNumber(heightMm * padBase, 0.5, 3.4));
  const innerWidthMm = Math.max(4, floor1(widthMm - padXMm * 2));
  const innerHeightMm = Math.max(4, floor1(heightMm - padYMm * 2));

  const hasBodyText =
    hasTitle ||
    hasCategory ||
    hasCodeText ||
    hasLocation ||
    hasCounterLine ||
    hasStatusTag ||
    hasScanHint;

  // Base typography scaled proportionally to sticker size
  const domFactor = isDominant ? 0.9 : 1.0;
  const headerFontPt = round1(clampNumber(5.2 * scale * domFactor, 3.2, 10.5));
  const headerSubFontPt = round1(
    clampNumber(4.4 * scale * domFactor, 3.0, 8.5),
  );
  const titleBaseFontPt = round1(
    clampNumber(6.6 * scale * domFactor, 3.8, 14.5),
  );
  let titleMinFontPt = round1(
    clampNumber(3.6 * Math.pow(scale, 0.65), 2.8, 7.0),
  );
  const categoryFontPt = round1(clampNumber(4.7 * scale * domFactor, 3.0, 9.0));
  const codeFontPt = round1(clampNumber(5.8 * scale * domFactor, 3.4, 12.0));
  const metaFontPt = round1(clampNumber(4.6 * scale * domFactor, 3.0, 8.8));
  const hintFontPt = round1(clampNumber(4.3 * scale * domFactor, 2.9, 8.0));
  const statusFontPt = round1(clampNumber(4.2 * scale * domFactor, 2.9, 7.8));

  const headerLineMm = hasHeader
    ? round1(
        ptToMm(headerFontPt * 1.25) + clampNumber(0.6 * scale, 0.35, 1.3),
      )
    : 0;

  // Case 1: No body text (ALL_OFF or HEADER_ONLY) => center QR cleanly in remaining space
  if (!hasBodyText) {
    const headerFullWidth = hasHeader;
    const headerReserveMm = headerFullWidth ? round1(headerLineMm + 0.45) : 0;
    const availH = Math.max(0, floor1(innerHeightMm - headerReserveMm));
    const maxSquare = Math.max(0, Math.min(innerWidthMm, availH));
    const qrSizeMm = floor1(
      clampNumber(shortSide * pct, Math.min(5, maxSquare), maxSquare),
    );
    return {
      orientation: "QR_ONLY",
      padXMm,
      padYMm,
      innerWidthMm,
      innerHeightMm,
      headerFullWidth,
      headerHeightMm: headerFullWidth ? headerLineMm : 0,
      qrSizeMm,
      gapMm: 0,
      textBoxWidthMm: 0,
      textBoxHeightMm: 0,
      titleMaxHeightMm: 0,
      locationMaxHeightMm: 0,
      scale,
      headerFontPt,
      headerSubFontPt,
      titleBaseFontPt,
      titleMinFontPt,
      categoryFontPt,
      codeFontPt,
      metaFontPt,
      hintFontPt,
      statusFontPt,
    };
  }

  // Resolve SIDE_BY_SIDE vs TOP_BOTTOM
  let orientation: "SIDE_BY_SIDE" | "TOP_BOTTOM";
  if (content.qrLayout === "SIDE_BY_SIDE") {
    orientation = "SIDE_BY_SIDE";
  } else if (content.qrLayout === "TOP_BOTTOM") {
    orientation = "TOP_BOTTOM";
  } else {
    // QR_DOMINANT aspect-ratio auto-split
    orientation = widthMm > heightMm * 1.25 ? "SIDE_BY_SIDE" : "TOP_BOTTOM";
  }

  const targetQrMm = shortSide * pct;
  const gapMm = round1(
    clampNumber((isDominant ? 1.15 : 1.5) * Math.pow(scale, 0.7), 0.7, 3.2),
  );

  if (orientation === "SIDE_BY_SIDE") {
    // Keep full-width header only if it does NOT restrict the target QR size
    const canHeaderBeFullWidth =
      hasHeader &&
      !isDominant &&
      heightMm >= 24 &&
      innerHeightMm - headerLineMm - 0.5 >= targetQrMm;

    const headerFullWidth = canHeaderBeFullWidth;
    const headerHeightMm = headerFullWidth ? headerLineMm : 0;
    const headerReserveMm = headerFullWidth ? round1(headerHeightMm + 0.45) : 0;
    const bodyHeightMm = Math.max(0, floor1(innerHeightMm - headerReserveMm));

    // Reserve sensible minimum right column width without ever exceeding innerWidthMm
    const minTextColMm = clampNumber(
      innerWidthMm * (isDominant ? 0.3 : 0.34),
      Math.min(8, innerWidthMm * 0.4),
      24,
    );

    const maxQrWidthMm = Math.max(0, floor1(innerWidthMm - gapMm - minTextColMm));
    const maxQrMm = Math.max(0, Math.min(bodyHeightMm, maxQrWidthMm));
    const minQrMm = Math.min(5, maxQrMm);
    const qrSizeMm = floor1(clampNumber(targetQrMm, minQrMm, maxQrMm));
    const textBoxWidthMm = Math.max(0, floor1(innerWidthMm - qrSizeMm - gapMm));
    const textBoxHeightMm = bodyHeightMm;

    // Realistic vertical budget inside right text column (accounting for wrapping in narrow columns)
    const colWidthPt = Math.max(12, mmToPt(textBoxWidthMm));
    let nonTitleMm = 0;
    if (hasHeader && !headerFullWidth) {
      nonTitleMm += ptToMm(headerFontPt * 1.25) + 0.65;
    }
    if (hasCategory) {
      nonTitleMm += ptToMm(categoryFontPt * 1.25) + 0.3;
    }
    if (hasCodeText) {
      const codeLines = codeText.trim()
        ? Math.min(
            2,
            estimateWrappedLines(
              codeText.trim(),
              colWidthPt,
              Math.max(3.2, codeFontPt * 0.8),
              true,
              true,
            ),
          )
        : 1;
      nonTitleMm += ptToMm(codeLines * codeFontPt * 1.15) + 0.45;
    }

    const locationBudgetMm = hasLocation
      ? round1(
          clampNumber(
            textBoxHeightMm * 0.17,
            ptToMm(metaFontPt * 1.25),
            ptToMm(metaFontPt * 2.3),
          ),
        )
      : 0;
    if (hasLocation) nonTitleMm += locationBudgetMm + 0.3;

    if (hasCounterLine) {
      const counterLines = counterText.trim()
        ? Math.min(
            2,
            estimateWrappedLines(
              counterText.trim(),
              colWidthPt,
              Math.max(2.9, metaFontPt * 0.78),
              true,
              false,
            ),
          )
        : 1;
      nonTitleMm += ptToMm(counterLines * Math.max(3.0, metaFontPt * 0.85) * 1.15) + 0.25;
    }
    if (hasStatusTag) nonTitleMm += ptToMm(statusFontPt * 1.45) + 0.4;
    if (hasScanHint) {
      const hintLines = scanHintText.trim()
        ? Math.min(
            2,
            estimateWrappedLines(
              scanHintText.trim(),
              colWidthPt,
              Math.max(2.9, hintFontPt * 0.8),
              false,
              false,
            ),
          )
        : 1;
      nonTitleMm += ptToMm(hintLines * Math.max(2.9, hintFontPt * 0.85) * 1.15) + 0.25;
    }

    // Divider / flex gap safety
    nonTitleMm += clampNumber(0.75 * scale, 0.4, 1.6);

    const rawTitleMaxH = floor1(textBoxHeightMm - nonTitleMm);
    const titleMaxHeightMm = hasTitle
      ? Math.max(Math.min(2.6, textBoxHeightMm * 0.35), rawTitleMaxH)
      : 0;

    if (titleMaxHeightMm < 7.5) {
      titleMinFontPt = Math.min(
        titleMinFontPt,
        titleMaxHeightMm < 4.5 ? 2.8 : 3.0,
      );
    }

    return {
      orientation: "SIDE_BY_SIDE",
      padXMm,
      padYMm,
      innerWidthMm,
      innerHeightMm,
      headerFullWidth,
      headerHeightMm,
      qrSizeMm,
      gapMm,
      textBoxWidthMm,
      textBoxHeightMm,
      titleMaxHeightMm,
      locationMaxHeightMm: locationBudgetMm,
      scale,
      headerFontPt,
      headerSubFontPt,
      titleBaseFontPt,
      titleMinFontPt,
      categoryFontPt,
      codeFontPt,
      metaFontPt,
      hintFontPt,
      statusFontPt,
    };
  }

  // TOP_BOTTOM layout (ideal for squares 40x40, 50x50, 60x60, 80x80, 100x100)
  const headerFullWidth = hasHeader;
  const headerHeightMm = headerFullWidth ? headerLineMm : 0;
  const headerReserveMm = headerFullWidth ? round1(headerHeightMm + 0.45) : 0;
  const availAfterHeaderMm = Math.max(0, floor1(innerHeightMm - headerReserveMm));

  const isSquareDominant =
    isDominant && pct >= 0.75 && !hasHeader && widthMm <= heightMm * 1.25;
  const isShortLandscape = heightMm <= 34 && widthMm > heightMm;

  // Count active non-title fields below QR
  const enabledNonTitleCount =
    (hasCategory ? 1 : 0) +
    (hasCodeText ? 1 : 0) +
    (hasLocation ? 1 : 0) +
    (hasCounterLine ? 1 : 0) +
    (hasStatusTag ? 1 : 0) +
    (hasScanHint ? 1 : 0);

  const compactMult = isSquareDominant ? 0.84 : isShortLandscape ? 0.88 : 1.0;
  const effCatPt = Math.max(2.9, categoryFontPt * compactMult);
  const effCodePt = Math.max(3.2, codeFontPt * compactMult);
  const effMetaPt = Math.max(2.9, metaFontPt * compactMult);
  const effHintPt = Math.max(2.8, hintFontPt * compactMult);
  const effStatusPt = Math.max(2.8, statusFontPt * compactMult);

  let nonTitleBelowMm = 0;
  if (hasCategory) nonTitleBelowMm += ptToMm(effCatPt * 1.2) + 0.22;
  if (hasCodeText) nonTitleBelowMm += ptToMm(effCodePt * 1.25) + 0.3;
  if (hasLocation) {
    const locLines = locationText.trim()
      ? Math.min(
          2,
          estimateWrappedLines(
            locationText.trim(),
            mmToPt(innerWidthMm),
            effMetaPt,
            false,
            false,
          ),
        )
      : 1;
    nonTitleBelowMm += ptToMm(locLines * effMetaPt * 1.15) + 0.25;
  }
  if (hasCounterLine) nonTitleBelowMm += ptToMm(effMetaPt * 1.22) + 0.22;
  if (hasStatusTag) nonTitleBelowMm += ptToMm(effStatusPt * 1.35) + 0.3;
  if (hasScanHint) nonTitleBelowMm += ptToMm(effHintPt * 1.2) + 0.2;

  // Estimate title height across full innerWidthMm
  let estTitleMm = 0;
  if (hasTitle) {
    const probePt = isSquareDominant
      ? Math.max(2.9, Math.min(titleBaseFontPt * 0.68, 5.2 * scale))
      : isShortLandscape
        ? Math.max(2.9, titleBaseFontPt * 0.62)
        : Math.max(titleMinFontPt, titleBaseFontPt * 0.82);
    const estLines = titleText.trim()
      ? Math.min(
          4,
          estimateWrappedLines(
            titleText.trim().replace(/\s+/g, " "),
            mmToPt(innerWidthMm),
            probePt,
            true,
            false,
          ),
        )
      : 1;
    estTitleMm = ptToMm(estLines * probePt * 1.12) + 0.35;
  }

  const rawReservedTextMm = estTitleMm + nonTitleBelowMm + 0.45;
  let maxTextShare: number;
  if (isSquareDominant) {
    // Allow QR to reach 76–80% on 50x50 / 60x60 / 80x80 squares while fitting Title + Code cleanly
    maxTextShare = 0.3;
  } else if (isShortLandscape) {
    // Give short landscape labels (40x30 / 50x30) enough room so 90-char titles never clip in TOP_BOTTOM
    maxTextShare = enabledNonTitleCount >= 4 ? 0.66 : 0.58;
  } else if (isDominant || pct >= 0.75) {
    maxTextShare = 0.42;
  } else {
    maxTextShare = 0.52;
  }

  const reservedTextMm = Math.min(
    rawReservedTextMm,
    floor1(availAfterHeaderMm * maxTextShare),
  );

  const maxQrHeightMm = Math.max(
    0,
    floor1(availAfterHeaderMm - reservedTextMm - gapMm),
  );
  const maxQrMm = Math.max(0, Math.min(innerWidthMm, maxQrHeightMm));
  const minQrMm = Math.min(4.5, maxQrMm);
  const qrSizeMm = floor1(clampNumber(targetQrMm, minQrMm, maxQrMm));

  const textBoxWidthMm = innerWidthMm;
  const textBoxHeightMm = Math.max(
    0,
    floor1(availAfterHeaderMm - qrSizeMm - gapMm),
  );

  const locationBudgetMm = hasLocation
    ? round1(
        clampNumber(
          ptToMm(effMetaPt * 2.0),
          Math.min(ptToMm(effMetaPt * 1.2), textBoxHeightMm * 0.35),
          textBoxHeightMm * 0.35,
        ),
      )
    : 0;

  const rawTitleMaxH = floor1(textBoxHeightMm - nonTitleBelowMm - 0.25);
  const titleMaxHeightMm = hasTitle
    ? Math.max(Math.min(2.4, textBoxHeightMm * 0.45), rawTitleMaxH)
    : 0;

  if (titleMaxHeightMm < 4.5) {
    titleMinFontPt = Math.min(titleMinFontPt, 2.8);
  } else if (titleMaxHeightMm < 7.0) {
    titleMinFontPt = Math.min(titleMinFontPt, 3.0);
  }

  return {
    orientation: "TOP_BOTTOM",
    padXMm,
    padYMm,
    innerWidthMm,
    innerHeightMm,
    headerFullWidth,
    headerHeightMm,
    qrSizeMm,
    gapMm,
    textBoxWidthMm,
    textBoxHeightMm,
    titleMaxHeightMm,
    locationMaxHeightMm: locationBudgetMm,
    scale,
    headerFontPt,
    headerSubFontPt,
    titleBaseFontPt,
    titleMinFontPt,
    categoryFontPt: round1(effCatPt),
    codeFontPt: round1(effCodePt),
    metaFontPt: round1(effMetaPt),
    hintFontPt: round1(effHintPt),
    statusFontPt: round1(effStatusPt),
  };
}

export type LinearStickerLayoutInput = {
  widthMm: number;
  heightMm: number;
  symbology: "CODE128" | "COMBO";
  content: LabelContentSettings;
  hasHeader: boolean;
  hasTitle: boolean;
  hasCategory: boolean;
  hasCodeText: boolean;
  hasLocation: boolean;
  hasCounterLine: boolean;
  hasStatusTag: boolean;
};

export type LinearStickerLayoutResult = {
  padXMm: number;
  padYMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  scale: number;
  headerFontPt: number;
  headerSubFontPt: number;
  titleBaseFontPt: number;
  titleMinFontPt: number;
  titleMaxHeightMm: number;
  categoryFontPt: number;
  codeFontPt: number;
  metaFontPt: number;
  statusFontPt: number;
  barcodeHeightMm: number;
  comboQrSizeMm: number;
  comboGapMm: number;
  comboBarcodeWidthMm: number;
  locationMaxHeightMm: number;
};

/**
 * Shared dynamic layout calculator for `CODE128` and `COMBO` modes across all
 * 17 thermal sizes (33×15mm up to 100×100mm + custom) and all 7 A4 grid sizes.
 */
export function computeLinearStickerLayout(
  input: LinearStickerLayoutInput,
): LinearStickerLayoutResult {
  const {
    widthMm,
    heightMm,
    symbology,
    content,
    hasHeader,
    hasTitle,
    hasCategory,
    hasCodeText,
    hasLocation,
    hasCounterLine,
    hasStatusTag,
  } = input;

  const scale = clampNumber(
    Math.min(widthMm / 50, heightMm / 30),
    0.38,
    2.5,
  );
  const padXMm = round1(clampNumber(widthMm * 0.036, 0.6, 3.8));
  const padYMm = round1(clampNumber(heightMm * 0.044, 0.5, 3.5));
  const innerWidthMm = Math.max(4, floor1(widthMm - padXMm * 2));
  const innerHeightMm = Math.max(4, floor1(heightMm - padYMm * 2));

  const headerFontPt = round1(clampNumber(5.2 * scale, 3.0, 10.5));
  const headerSubFontPt = round1(clampNumber(4.4 * scale, 2.8, 8.5));
  const titleBaseFontPt = round1(clampNumber(6.5 * scale, 3.8, 14.0));
  let titleMinFontPt = round1(
    clampNumber(3.5 * Math.pow(scale, 0.65), 2.8, 7.0),
  );
  const categoryFontPt = round1(clampNumber(4.8 * scale, 2.9, 9.0));
  const codeFontPt = round1(
    clampNumber((symbology === "COMBO" ? 5.8 : 6.4) * scale, 3.2, 12.0),
  );
  const metaFontPt = round1(clampNumber(4.7 * scale, 2.9, 9.0));
  const statusFontPt = round1(clampNumber(4.2 * scale, 2.8, 8.0));

  const rawHeaderMm = hasHeader ? ptToMm(headerFontPt * 1.3) + 0.55 : 0;
  const rawCategoryMm = hasCategory ? ptToMm(categoryFontPt * 1.2) + 0.25 : 0;
  const codeLineMm = hasCodeText ? ptToMm(codeFontPt * 1.22) + 0.4 : 0;

  const hasFooter = hasLocation || hasCounterLine || hasStatusTag;
  let locationMaxHeightMm = hasLocation
    ? round1(
        clampNumber(
          ptToMm(metaFontPt * 1.6),
          ptToMm(metaFontPt * 1.15),
          innerHeightMm * 0.16,
        ),
      )
    : 0;
  const rawFooterMm = hasFooter
    ? locationMaxHeightMm +
      (hasCounterLine || hasStatusTag ? ptToMm(metaFontPt * 1.3) + 0.25 : 0) +
      0.55
    : 0;

  // Ensure chrome (header + category + footer) never starves the middle band on mini custom stickers
  const chromeSum = rawHeaderMm + rawCategoryMm + rawFooterMm;
  const maxChromeMm = floor1(innerHeightMm * 0.56);
  const chromeScale =
    chromeSum > maxChromeMm && chromeSum > 0 ? maxChromeMm / chromeSum : 1;
  const headerMm = rawHeaderMm * chromeScale;
  const categoryMm = rawCategoryMm * chromeScale;
  const footerMm = rawFooterMm * chromeScale;
  if (chromeScale < 1 && hasLocation) {
    locationMaxHeightMm = round1(locationMaxHeightMm * chromeScale);
  }

  const verticalPadMm = Math.min(0.6, innerHeightMm * 0.04);
  const usableMiddleMm = Math.max(
    0,
    floor1(innerHeightMm - headerMm - categoryMm - footerMm - verticalPadMm),
  );

  const titleShare = hasTitle
    ? heightMm < 22
      ? 0.34
      : heightMm >= 50
        ? 0.36
        : 0.35
    : 0;
  const titleMaxHeightMm = hasTitle
    ? floor1(
        clampNumber(
          usableMiddleMm * titleShare,
          Math.min(ptToMm(titleMinFontPt * 1.25), usableMiddleMm * 0.42),
          usableMiddleMm * 0.45,
        ),
      )
    : 0;

  if (titleMaxHeightMm < 4.5) {
    titleMinFontPt = Math.min(titleMinFontPt, 2.8);
  }

  const titleGapMm = hasTitle ? Math.min(0.45, usableMiddleMm * 0.06) : 0;
  const symBandMm = Math.max(
    0,
    floor1(usableMiddleMm - titleMaxHeightMm - titleGapMm),
  );

  const maxBarH = Math.max(0, floor1(symBandMm - codeLineMm));
  const barcodeHeightMm =
    maxBarH >= 2.0
      ? floor1(
          clampNumber(
            maxBarH,
            Math.min(2.2, maxBarH),
            Math.max(2.2, innerHeightMm * 0.42),
          ),
        )
      : floor1(Math.max(1.2, symBandMm * 0.58));

  const comboGapMm = round1(clampNumber(1.4 * Math.pow(scale, 0.7), 0.7, 3.0));
  const qrBoost = clampNumber(content.qrSizePercent / 65, 0.75, 1.25);
  const maxComboQrByWidth = floor1(innerWidthMm * 0.36);
  const maxComboQr = Math.max(0, Math.min(symBandMm, maxComboQrByWidth));
  const comboQrSizeMm =
    symbology === "COMBO"
      ? floor1(
          clampNumber(
            Math.min(symBandMm * qrBoost, innerWidthMm * 0.34),
            Math.min(4.5, maxComboQr),
            maxComboQr,
          ),
        )
      : 0;
  const comboBarcodeWidthMm =
    symbology === "COMBO"
      ? Math.max(0, floor1(innerWidthMm - comboQrSizeMm - comboGapMm))
      : innerWidthMm;

  return {
    padXMm,
    padYMm,
    innerWidthMm,
    innerHeightMm,
    scale,
    headerFontPt,
    headerSubFontPt,
    titleBaseFontPt,
    titleMinFontPt,
    titleMaxHeightMm,
    categoryFontPt,
    codeFontPt,
    metaFontPt,
    statusFontPt,
    barcodeHeightMm,
    comboQrSizeMm,
    comboGapMm,
    comboBarcodeWidthMm,
    locationMaxHeightMm,
  };
}

export type SpineStickerLayoutInput = {
  spineSize: SpineSizeId;
  symbology: SymbologyMode;
  content: LabelContentSettings;
  hasLeftPillar: boolean;
  hasCategory: boolean;
  hasTitle: boolean;
  hasCodeText: boolean;
  hasLocation: boolean;
  hasCounterLine: boolean;
  hasStatusTag: boolean;
  hasScanHint: boolean;
};

export type SpineStickerLayoutResult = {
  spec: SpineSizeSpec;
  padXMm: number;
  padYMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  gapMm: number;
  leftPillarWidthMm: number;
  middleWidthMm: number;
  rightBlockWidthMm: number;
  barcodeWidthMm: number;
  barcodeHeightMm: number;
  qrSizeMm: number;
  scale: number;
  brandFontPt: number;
  locationBadgeFontPt: number;
  headerSubFontPt: number;
  categoryFontPt: number;
  titleBaseFontPt: number;
  titleMinFontPt: number;
  titleMaxHeightMm: number;
  codeFontPt: number;
  metaFontPt: number;
  hintFontPt: number;
  statusFontPt: number;
};

/**
 * Shared dynamic layout calculator for all 4 Archive Spine sizes
 * (`150x35`, `180x50`, `190x30`, `120x30`) used identically by HTML & PDF.
 */
export function computeSpineStickerLayout(
  input: SpineStickerLayoutInput,
): SpineStickerLayoutResult {
  const spec = SPINE_SIZES[input.spineSize] ?? SPINE_LABEL_SPEC;
  const { widthMm, heightMm } = spec;
  const {
    symbology,
    content,
    hasLeftPillar,
    hasCategory,
    hasTitle,
    hasCodeText,
    hasLocation,
    hasCounterLine,
    hasStatusTag,
    hasScanHint,
  } = input;

  const scale = clampNumber(
    Math.min(widthMm / 150, heightMm / 35),
    0.78,
    1.45,
  );
  const padXMm = round1(clampNumber(widthMm * 0.017, 1.8, 3.2));
  const padYMm = round1(clampNumber(heightMm * 0.058, 1.6, 3.0));
  const innerWidthMm = round1(widthMm - padXMm * 2);
  const innerHeightMm = round1(heightMm - padYMm * 2);
  const gapMm = round1(clampNumber(2.2 * scale, 1.8, 3.0));

  const leftPillarWidthMm = hasLeftPillar
    ? round1(clampNumber(widthMm * 0.16, 18.5, 29))
    : 0;

  const qrPct = clampNumber(content.qrSizePercent, 40, 85) / 100;
  const showQrHint = symbology === "QR" && hasScanHint;
  const hintReserveMm = showQrHint ? 2.8 : 0.2;

  let barcodeWidthMm = 0;
  let barcodeHeightMm = 0;
  let qrSizeMm = 0;
  let rightBlockWidthMm = 0;

  if (symbology === "CODE128") {
    barcodeWidthMm = round1(clampNumber(widthMm * 0.3, 32, 56));
    barcodeHeightMm = round1(clampNumber(innerHeightMm * 0.56, 12, 26));
    rightBlockWidthMm = barcodeWidthMm + gapMm;
  } else if (symbology === "QR") {
    const maxQrH = Math.max(12, innerHeightMm - hintReserveMm);
    qrSizeMm = round1(
      clampNumber(innerHeightMm * qrPct, Math.min(14, maxQrH), maxQrH),
    );
    rightBlockWidthMm = qrSizeMm + gapMm;
  } else {
    // COMBO
    barcodeWidthMm = round1(clampNumber(widthMm * 0.225, 25, 44));
    barcodeHeightMm = round1(clampNumber(innerHeightMm * 0.54, 11, 24));
    const maxComboQr = Math.min(innerHeightMm - 0.5, widthMm * 0.18);
    qrSizeMm = round1(
      clampNumber(innerHeightMm * 0.72, Math.min(14, maxComboQr), maxComboQr),
    );
    rightBlockWidthMm = barcodeWidthMm + qrSizeMm + gapMm * 2;
  }

  const middleWidthMm = Math.max(
    28,
    round1(
      innerWidthMm -
        (hasLeftPillar ? leftPillarWidthMm + gapMm : 0) -
        rightBlockWidthMm -
        gapMm,
    ),
  );

  const brandFontPt = round1(clampNumber(5.2 * scale, 4.4, 7.2));
  const locationBadgeFontPt = round1(clampNumber(10.5 * scale, 8.5, 14.0));
  const headerSubFontPt = round1(clampNumber(4.4 * scale, 3.8, 6.2));
  const categoryFontPt = round1(clampNumber(5.6 * scale, 4.6, 7.8));
  const titleBaseFontPt = round1(clampNumber(9.2 * scale, 7.4, 12.5));
  const titleMinFontPt = round1(clampNumber(4.6 * scale, 4.0, 6.4));
  const codeFontPt = round1(clampNumber(8.0 * scale, 6.4, 10.5));
  const metaFontPt = round1(clampNumber(5.8 * scale, 4.8, 7.8));
  const hintFontPt = round1(clampNumber(4.8 * scale, 4.0, 6.4));
  const statusFontPt = round1(clampNumber(5.0 * scale, 4.2, 6.8));

  let nonTitleMidMm = 0;
  if (hasCategory || hasStatusTag) {
    nonTitleMidMm += ptToMm(categoryFontPt * 1.35) + 0.5;
  }
  if (hasCodeText) {
    nonTitleMidMm += ptToMm(codeFontPt * 1.35) + 0.7;
  }
  if (hasLocation || hasCounterLine) {
    nonTitleMidMm +=
      (hasLocation ? ptToMm(metaFontPt * 1.35) : 0) +
      (hasCounterLine ? ptToMm(metaFontPt * 1.35) : 0) +
      1.2;
  }

  const titleMaxHeightMm = hasTitle
    ? round1(
        Math.max(
          ptToMm(titleMinFontPt * 1.4),
          innerHeightMm - nonTitleMidMm - 0.8,
        ),
      )
    : 0;

  return {
    spec,
    padXMm,
    padYMm,
    innerWidthMm,
    innerHeightMm,
    gapMm,
    leftPillarWidthMm,
    middleWidthMm,
    rightBlockWidthMm,
    barcodeWidthMm,
    barcodeHeightMm,
    qrSizeMm,
    scale,
    brandFontPt,
    locationBadgeFontPt,
    headerSubFontPt,
    categoryFontPt,
    titleBaseFontPt,
    titleMinFontPt,
    titleMaxHeightMm,
    codeFontPt,
    metaFontPt,
    hintFontPt,
    statusFontPt,
  };
}

function buildShortQrPath(code: string, shortSlug?: string | null): string {
  const cleanCode = code.trim();
  const cleanSlug = shortSlug?.trim() || null;
  if (cleanSlug && cleanSlug.length < cleanCode.length) {
    return `/s/${encodeURIComponent(cleanSlug)}`;
  }
  return `/s/${encodeURIComponent(cleanCode)}`;
}

/** Maps an `items_master` row into the unified printable label shape. */
export function mapItemToPrintableRecord(
  item: PrintableItemRow,
  locationLabels?: Record<string, string>,
  shortSlug?: string | null,
): PrintableLabelRecord {
  const roomShort = getLocationLabel(item.room_code, locationLabels);
  const locationDisplay = item.rack_location
    ? `${roomShort} (${item.room_code}) · ${item.rack_location}`
    : `${roomShort} (${item.room_code})`;

  const unit = item.unit_label?.trim() || "Pcs";
  const stockText = `Stok: ${item.stock_qty} ${unit}`;
  const partsText = `Part: ${item.current_parts}/${item.total_parts} ${unit}`;

  const counterOrIndicator =
    item.asset_type === "CONSUMABLE"
      ? `${stockText}${
          item.total_parts > 1
            ? ` · Part: ${item.current_parts}/${item.total_parts}`
            : ""
        }`
      : partsText;

  const cleanSlug = shortSlug?.trim() || null;

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
    stockText,
    partsText,
    archiveDigitalText: null,
    hasDigitalLink: false,
    recommendedFormat: item.barcode_format,
    qrPath: `/inventory/${item.id}`,
    shortSlug: cleanSlug,
    shortQrPath: buildShortQrPath(item.item_code, cleanSlug),
    statusTag: item.condition === "PART_KURANG" ? "PART KURANG" : null,
  };
}

/** Maps an `archives_hybrid` row into the unified printable label shape. */
export function mapArchiveToPrintableRecord(
  archive: PrintableArchiveRow,
  locationLabels?: Record<string, string>,
  shortSlug?: string | null,
): PrintableLabelRecord {
  const cabinetShort = getLocationLabel(archive.cabinet_code, locationLabels);
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

  const cleanSlug = shortSlug?.trim() || null;

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
    stockText: null,
    partsText: null,
    archiveDigitalText: counterOrIndicator,
    hasDigitalLink,
    recommendedFormat: "COMBO",
    qrPath: `/archives?code=${encodeURIComponent(archive.doc_code)}`,
    shortSlug: cleanSlug,
    shortQrPath: buildShortQrPath(archive.doc_code, cleanSlug),
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
