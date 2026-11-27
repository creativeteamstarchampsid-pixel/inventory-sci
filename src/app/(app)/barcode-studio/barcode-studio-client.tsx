"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Archive,
  Barcode,
  Bookmark,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Grid3X3,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  Package,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
} from "@/components/cartoon/kawaii-decor";
import { useLocations } from "@/components/providers/locations-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteBarcodePresetAction,
  saveBarcodePresetAction,
  setDefaultBarcodePresetAction,
  type BarcodePresetRecord,
} from "@/lib/actions/barcode-presets";
import {
  A4_GRID_PRESETS,
  A4_GRID_PRESET_LIST,
  A4_GRID_SPEC,
  DEFAULT_BARCODE_STUDIO_CONFIG,
  LABEL_CONTENT_PRESET_LIST,
  SPINE_LABEL_SPEC,
  SPINE_SIZES,
  SPINE_SIZE_LIST,
  SYMBOLOGY_LABELS,
  TEMPLATE_LABELS,
  THERMAL_SIZES,
  THERMAL_SIZE_CATEGORY_LABELS,
  THERMAL_SIZE_LIST,
  buildActiveCounterLine,
  buildQrPayload,
  chunkIntoPages,
  clampCustomThermalSize,
  computeLinearStickerLayout,
  computeQrStickerLayout,
  computeSpineStickerLayout,
  estimateQrMatrixInfo,
  expandPrintQueue,
  normalizeBarcodeStudioConfig,
  resolvePageDimensionsMm,
  resolveThermalDimensions,
  type A4GridPresetId,
  type BarcodeStudioConfigSnapshot,
  type CustomThermalSize,
  type LabelContentPreset,
  type LabelContentSettings,
  type LabelSourceKind,
  type LabelTemplateId,
  type PrintBatchEntry,
  type PrintableLabelRecord,
  type QrDensityTier,
  type QrErrorLevel,
  type QrLayoutMode,
  type QrPayloadMode,
  type SpinePaperMode,
  type SpineSizeId,
  type SymbologyMode,
  type ThermalSizeCategory,
  type ThermalSizeId,
} from "@/lib/barcode";
import { ASSET_TYPE_LABELS, BARCODE_FORMAT_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

import "./print.css";

const PrintableSheetDocument = dynamic(
  () => import("./label-sticker").then((mod) => mod.PrintableSheetDocument),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] min-w-[180px] items-center justify-center rounded-xl border-2 border-dashed border-[#2C2623]/25 bg-white/80 px-4 py-6 text-xs font-bold text-[#574E49] print:hidden dark:border-stone-600 dark:bg-stone-900/60 dark:text-stone-300">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Menyiapkan pratinjau stiker...
      </div>
    ),
  },
);

const PX_PER_MM = 96 / 25.4;

const THERMAL_CATEGORY_ORDER: ThermalSizeCategory[] = [
  "MINI",
  "STANDAR",
  "PERSEGI",
  "BESAR",
  "KUSTOM",
];

const POPULAR_THERMAL_SIZE_IDS: ThermalSizeId[] = [
  "40x30",
  "50x30",
  "50x50",
  "60x40",
  "70x50",
  "80x80",
  "100x70",
  "CUSTOM",
];

const QR_SIZE_QUICK_PRESETS: Array<{
  percent: number;
  label: string;
  sublabel: string;
}> = [
  { percent: 50, label: "50%", sublabel: "Setengah" },
  { percent: 65, label: "65%", sublabel: "Besar" },
  { percent: 80, label: "80%", sublabel: "Dominan" },
];

const QR_LAYOUT_OPTIONS: Array<{
  id: QrLayoutMode;
  label: string;
  description: string;
}> = [
  {
    id: "SIDE_BY_SIDE",
    label: "QR Kiri · Info Kanan",
    description: "Ideal untuk label landscape (50×30, 60×40, A4)",
  },
  {
    id: "TOP_BOTTOM",
    label: "QR Atas · Info Bawah",
    description: "Ideal untuk stiker persegi (40×40, 50×50, 80×80)",
  },
  {
    id: "QR_DOMINANT",
    label: "QR Fokus Otomatis",
    description: "Prioritas QR ekstra besar 75%–80% sesuai rasio kertas",
  },
];

const QR_PAYLOAD_OPTIONS: Array<{
  id: QrPayloadMode;
  label: string;
  badge?: string;
  description: string;
}> = [
  {
    id: "SHORT_PREVIEW",
    label: "Link Preview Web Pendek (/s/kode)",
    badge: "Rekomendasi",
    description:
      "Buka pratinjau stok & detail langsung di kamera HP dengan kotak QR tetap besar & tebal.",
  },
  {
    id: "CODE_ONLY",
    label: "Kode Saja (SC-...)",
    badge: "Blok Terbesar",
    description:
      "QR Versi 1 (21×21 modul) paling tebal & cepat dipindai — khusus scanner app /scan.",
  },
  {
    id: "FULL_DETAIL",
    label: "URL Detail Lengkap (/inventory/uuid)",
    description:
      "Tautan penuh ke halaman detail master. Lebih panjang sehingga modul QR lebih rapat.",
  },
];

const QR_ERROR_LEVEL_OPTIONS: Array<{
  id: QrErrorLevel;
  title: string;
  subtitle: string;
  recommended?: boolean;
}> = [
  {
    id: "L",
    title: "Level L (7%)",
    subtitle: "Kotak paling besar & tebal · Rekomendasi Thermal",
    recommended: true,
  },
  {
    id: "M",
    title: "Level M (15%)",
    subtitle: "Seimbang & standar umum",
  },
  {
    id: "Q",
    title: "Level Q (25%)",
    subtitle: "Tahan gores sedang",
  },
  {
    id: "H",
    title: "Level H (30%)",
    subtitle: "Koreksi maksimal (kotak lebih kecil)",
  },
];

const FALLBACK_SAMPLE_RECORD: PrintableLabelRecord = {
  key: "sample:preview",
  id: "00000000-0000-0000-0000-000000000001",
  source: "INVENTORY",
  code: "SC-TOY-R01-0001",
  headerSubtitle: "ALAT TERAPI · TOY",
  title: "Balok Sensori Kayu Warna Terapi Okupasi",
  category: "Sensori Motorik",
  categoryPrefix: "TOY",
  assetType: "THERAPY_TOY",
  locationCode: "R01",
  locationDisplay: "Ruang Terapi 1 (R01) · Rak A",
  counterOrIndicator: "Part: 12/12 Pcs",
  stockText: "Stok: 4 Set",
  partsText: "Part: 12/12 Pcs",
  archiveDigitalText: null,
  hasDigitalLink: false,
  recommendedFormat: "QR",
  qrPath: "/inventory/00000000-0000-0000-0000-000000000001",
  shortSlug: null,
  shortQrPath: "/s/SC-TOY-R01-0001",
  statusTag: null,
};

type SourceTab = "ALL" | LabelSourceKind;
type ConfigTab = "layout" | "content" | "qr";
type TypeFilter =
  | "ALL"
  | "THERAPY_TOY"
  | "FIXED_ASSET"
  | "CONSUMABLE"
  | "ARCHIVE_DIGITAL"
  | "PART_KURANG";

export type BarcodeStudioClientProps = {
  schemaReady: boolean;
  schemaError?: string;
  items: PrintableLabelRecord[];
  archives: PrintableLabelRecord[];
  initialSelectedKeys?: string[];
  initialSourceTab?: SourceTab;
  initialTemplate?: LabelTemplateId;
  initialPresets?: BarcodePresetRecord[];
};

function sortPresets(list: BarcodePresetRecord[]): BarcodePresetRecord[] {
  return [...list].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.name.localeCompare(b.name, "id");
  });
}

function resolveInitialStudioState(
  initialPresets: BarcodePresetRecord[],
  initialTemplate?: LabelTemplateId,
): {
  config: BarcodeStudioConfigSnapshot;
  activePresetId: string | null;
} {
  const defaultPreset = initialPresets.find((p) => p.is_default) ?? null;
  const baseConfig = defaultPreset
    ? normalizeBarcodeStudioConfig(defaultPreset.config)
    : normalizeBarcodeStudioConfig(DEFAULT_BARCODE_STUDIO_CONFIG);

  const resolvedTemplate = initialTemplate ?? baseConfig.template;
  const templateOverridden = resolvedTemplate !== baseConfig.template;

  return {
    config: {
      ...baseConfig,
      template: resolvedTemplate,
    },
    activePresetId: defaultPreset && !templateOverridden ? defaultPreset.id : null,
  };
}

function areStudioConfigsEqual(
  a: BarcodeStudioConfigSnapshot,
  b: BarcodeStudioConfigSnapshot,
): boolean {
  return (
    JSON.stringify(normalizeBarcodeStudioConfig(a)) ===
    JSON.stringify(normalizeBarcodeStudioConfig(b))
  );
}

function areContentSettingsEqual(
  a: LabelContentSettings,
  b: LabelContentSettings,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getPrintPageSizeCss(
  template: LabelTemplateId,
  thermalSize: ThermalSizeId,
  spinePaperMode: SpinePaperMode,
  customThermalSize: CustomThermalSize,
  spineSize: SpineSizeId,
): string {
  if (template === "THERMAL") {
    const dims = resolveThermalDimensions(thermalSize, customThermalSize);
    return `${dims.widthMm}mm ${dims.heightMm}mm`;
  }
  if (template === "ARCHIVE_SPINE" && spinePaperMode === "CUSTOM_SINGLE") {
    const spineSpec = SPINE_SIZES[spineSize] ?? SPINE_LABEL_SPEC;
    return `${spineSpec.widthMm}mm ${spineSpec.heightMm}mm`;
  }
  return "A4 portrait";
}

function getDefaultZoomForTemplate(
  template: LabelTemplateId,
  spinePaperMode: SpinePaperMode,
): number {
  if (template === "THERMAL") return 1.5;
  if (template === "ARCHIVE_SPINE" && spinePaperMode === "CUSTOM_SINGLE") {
    return 1.05;
  }
  return 0.65;
}

function getDensityTierBadgeClasses(tier: QrDensityTier): string {
  switch (tier) {
    case "EKSTRA BESAR":
      return "border-[#2C2623] bg-[#D1FAE5] text-[#14532D] dark:border-emerald-500 dark:bg-emerald-950/75 dark:text-emerald-200";
    case "BESAR":
      return "border-[#2C2623] bg-[#E0F2FE] text-[#0C4A6E] dark:border-sky-500 dark:bg-sky-950/75 dark:text-sky-200";
    case "SEDANG":
      return "border-[#2C2623] bg-[#FEF3C7] text-[#78350F] dark:border-amber-500 dark:bg-amber-950/75 dark:text-amber-200";
    case "PADAT":
      return "border-[#2C2623] bg-[#FFE4E6] text-[#881337] dark:border-rose-500 dark:bg-rose-950/75 dark:text-rose-200";
  }
}

function formatConfigDimensionSummary(
  config: BarcodeStudioConfigSnapshot,
): string {
  if (config.template === "THERMAL") {
    const dims = resolveThermalDimensions(
      config.thermalSize,
      config.customThermalSize,
    );
    return config.thermalSize === "CUSTOM"
      ? `Thermal Kustom ${dims.widthMm}×${dims.heightMm} mm`
      : `Thermal ${dims.widthMm}×${dims.heightMm} mm`;
  }
  if (config.template === "A4_GRID") {
    const spec = A4_GRID_PRESETS[config.a4Preset] ?? A4_GRID_SPEC;
    return `A4 ${spec.shortLabel}`;
  }
  const spineSpec = SPINE_SIZES[config.spineSize] ?? SPINE_LABEL_SPEC;
  return `Punggung ${spineSpec.shortLabel} (${
    config.spinePaperMode === "A4_SHEET" ? "A4" : "Satuan"
  })`;
}

type ContentToggleRowProps = {
  id: string;
  label: string;
  description?: string;
  badge?: string;
  badgeTone?: "optional" | "info";
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children?: React.ReactNode;
};

function ContentToggleRow({
  id,
  label,
  description,
  badge,
  badgeTone = "info",
  checked,
  onCheckedChange,
  children,
}: ContentToggleRowProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-[#2C2623]/80 p-3 transition-colors dark:border-stone-600",
        checked
          ? "bg-white dark:bg-stone-900/90"
          : "bg-[#FAF6EE]/70 dark:bg-stone-950/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Label
              htmlFor={id}
              className="cursor-pointer text-xs leading-snug font-extrabold text-[#2C2623] dark:text-stone-100"
            >
              {label}
            </Label>
            {badge && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold",
                  badgeTone === "optional"
                    ? "border-[#2C2623]/40 bg-[#FEF3C7] text-[#78350F] dark:border-amber-500/60 dark:bg-amber-950/60 dark:text-amber-200"
                    : "border-[#2C2623]/40 bg-[#D1FAE5] text-[#14532D] dark:border-emerald-500/60 dark:bg-emerald-950/60 dark:text-emerald-200",
                )}
              >
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-[11px] leading-snug text-[#574E49] dark:text-stone-400">
              {description}
            </p>
          )}
        </div>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-0.5 shrink-0 border border-[#2C2623]/60 data-[state=checked]:bg-[#2AB673] dark:border-stone-500"
        />
      </div>
      {checked && children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

export function BarcodeStudioClient({
  schemaReady,
  schemaError,
  items,
  archives,
  initialSelectedKeys = [],
  initialSourceTab = "ALL",
  initialTemplate,
  initialPresets = [],
}: BarcodeStudioClientProps) {
  const { showWorking, showBatch, showSuccess, showError, runWithFeedback } =
    useCartoonFeedback();
  const { allOptions } = useLocations();

  const initialStudio = React.useMemo(
    () => resolveInitialStudioState(initialPresets, initialTemplate),
    // Computed once for initial state hydration consistency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const allRecords = React.useMemo(
    () => [...items, ...archives],
    [items, archives],
  );

  const recordByKey = React.useMemo(() => {
    const map = new Map<string, PrintableLabelRecord>();
    for (const r of allRecords) {
      map.set(r.key, r);
    }
    return map;
  }, [allRecords]);

  // Saved Supabase presets state
  const [presets, setPresets] = React.useState<BarcodePresetRecord[]>(() =>
    sortPresets(initialPresets),
  );
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(
    initialStudio.activePresetId,
  );
  const [isPresetMutating, setIsPresetMutating] = React.useState(false);

  // Save Preset Dialog state
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [saveMode, setSaveMode] = React.useState<"new" | "update">("new");
  const [presetNameInput, setPresetNameInput] = React.useState("");
  const [presetDescInput, setPresetDescInput] = React.useState("");
  const [presetIsDefaultInput, setPresetIsDefaultInput] = React.useState(false);

  // Delete Preset Confirm Dialog state
  const [deleteConfirmPreset, setDeleteConfirmPreset] =
    React.useState<BarcodePresetRecord | null>(null);

  // Selection state: ordered map of key -> quantity multiplier
  const [selectedQuantities, setSelectedQuantities] = React.useState<
    Record<string, number>
  >(() => {
    const init: Record<string, number> = {};
    for (const key of initialSelectedKeys) {
      if (recordByKey.has(key)) {
        init[key] = 1;
      }
    }
    return init;
  });

  // Filters
  const [sourceTab, setSourceTab] = React.useState<SourceTab>(initialSourceTab);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [locationFilter, setLocationFilter] = React.useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("ALL");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("ALL");

  // Configuration panel active tab
  const [configTab, setConfigTab] = React.useState<ConfigTab>("layout");

  // Print Studio Config (100% SSR-safe, initialized from Supabase default preset)
  const [symbology, setSymbology] = React.useState<SymbologyMode>(
    initialStudio.config.symbology,
  );
  const [template, setTemplate] = React.useState<LabelTemplateId>(
    initialStudio.config.template,
  );
  const [thermalSize, setThermalSize] = React.useState<ThermalSizeId>(
    initialStudio.config.thermalSize,
  );
  const [customThermalSize, setCustomThermalSize] =
    React.useState<CustomThermalSize>(initialStudio.config.customThermalSize);
  const [customWidthInput, setCustomWidthInput] = React.useState<string>(
    String(initialStudio.config.customThermalSize.widthMm),
  );
  const [customHeightInput, setCustomHeightInput] = React.useState<string>(
    String(initialStudio.config.customThermalSize.heightMm),
  );
  const [a4Preset, setA4Preset] = React.useState<A4GridPresetId>(
    initialStudio.config.a4Preset,
  );
  const [spineSize, setSpineSize] = React.useState<SpineSizeId>(
    initialStudio.config.spineSize,
  );
  const [spinePaperMode, setSpinePaperMode] = React.useState<SpinePaperMode>(
    initialStudio.config.spinePaperMode,
  );
  const [content, setContent] = React.useState<LabelContentSettings>(
    initialStudio.config.content,
  );
  const [a4StartSlot, setA4StartSlot] = React.useState<number>(1);
  const [qrOrigin, setQrOrigin] = React.useState<string>("");

  // Preview & Export UI state
  const [previewPageIndex, setPreviewPageIndex] = React.useState(0);
  const [isAutoFitZoom, setIsAutoFitZoom] = React.useState(true);
  const [manualZoom, setManualZoom] = React.useState<number>(() =>
    getDefaultZoomForTemplate(
      initialStudio.config.template,
      initialStudio.config.spinePaperMode,
    ),
  );
  const [viewportWidthPx, setViewportWidthPx] = React.useState<number>(0);
  const previewViewportRef = React.useRef<HTMLDivElement | null>(null);

  const [isExportingPdf, setIsExportingPdf] = React.useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const printTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setQrOrigin(window.location.origin);
    }
    return () => {
      if (printTimerRef.current) {
        clearTimeout(printTimerRef.current);
      }
    };
  }, []);

  // Current normalized config snapshot
  const currentConfigSnapshot = React.useMemo<BarcodeStudioConfigSnapshot>(
    () => ({
      symbology,
      template,
      thermalSize,
      customThermalSize,
      a4Preset,
      spineSize,
      spinePaperMode,
      content,
    }),
    [
      symbology,
      template,
      thermalSize,
      customThermalSize,
      a4Preset,
      spineSize,
      spinePaperMode,
      content,
    ],
  );

  const selectedPreset = React.useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  const isPresetModified = React.useMemo(() => {
    if (!selectedPreset) return false;
    return !areStudioConfigsEqual(currentConfigSnapshot, selectedPreset.config);
  }, [selectedPreset, currentConfigSnapshot]);

  // Active template geometry specs
  const activeThermalDims = React.useMemo(
    () => resolveThermalDimensions(thermalSize, customThermalSize),
    [thermalSize, customThermalSize],
  );
  const activeA4Spec = A4_GRID_PRESETS[a4Preset] ?? A4_GRID_SPEC;
  const activeSpineSpec = SPINE_SIZES[spineSize] ?? SPINE_LABEL_SPEC;

  // Grouped thermal sizes for <SelectGroup>
  const groupedThermalSizes = React.useMemo(() => {
    return THERMAL_CATEGORY_ORDER.map((category) => ({
      category,
      label: THERMAL_SIZE_CATEGORY_LABELS[category],
      items: THERMAL_SIZE_LIST.filter((s) => s.category === category),
    }));
  }, []);

  // Helper to update a single content setting cleanly
  const updateContent = React.useCallback(
    <K extends keyof LabelContentSettings>(
      key: K,
      value: LabelContentSettings[K],
    ) => {
      setContent((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [],
  );

  // Apply a full studio config snapshot (from a Supabase preset or reset)
  const applyStudioConfig = React.useCallback(
    (rawConfig: BarcodeStudioConfigSnapshot, presetId: string | null) => {
      const cfg = normalizeBarcodeStudioConfig(rawConfig);
      setSymbology(cfg.symbology);
      setTemplate(cfg.template);
      setThermalSize(cfg.thermalSize);
      setCustomThermalSize(cfg.customThermalSize);
      setCustomWidthInput(String(cfg.customThermalSize.widthMm));
      setCustomHeightInput(String(cfg.customThermalSize.heightMm));
      setA4Preset(cfg.a4Preset);
      setSpineSize(cfg.spineSize);
      setSpinePaperMode(cfg.spinePaperMode);
      setContent(cfg.content);
      setA4StartSlot((prev) =>
        Math.max(1, Math.min(A4_GRID_PRESETS[cfg.a4Preset].perPage, prev)),
      );
      setManualZoom(getDefaultZoomForTemplate(cfg.template, cfg.spinePaperMode));
      setPreviewPageIndex(0);
      setSelectedPresetId(presetId);
    },
    [],
  );

  const handleApplyContentPreset = (preset: LabelContentPreset) => {
    setContent({ ...preset.settings });
    // If choosing a QR-focused preset while in pure 1D mode, switch to QR automatically
    if (
      (preset.id === "QR_DOMINANT_80" || preset.id === "SCAN_ONLY_MINIMAL") &&
      symbology === "CODE128"
    ) {
      setSymbology("QR");
    }
  };

  // Derive unique categories from current records for filter dropdown
  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of allRecords) {
      if (sourceTab === "ALL" || r.source === sourceTab) {
        if (r.category.trim()) set.add(r.category.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
  }, [allRecords, sourceTab]);

  // Available locations relevant to active tab
  const locationFilterOptions = React.useMemo(() => {
    return allOptions.filter((loc) => {
      if (loc.group === "DIGITAL") return false;
      if (sourceTab === "ARCHIVE") return loc.group === "ARCHIVE";
      return true;
    });
  }, [allOptions, sourceTab]);

  // Filtered records
  const filteredRecords = React.useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    return allRecords.filter((rec) => {
      if (sourceTab !== "ALL" && rec.source !== sourceTab) return false;
      if (locationFilter !== "ALL" && rec.locationCode !== locationFilter) {
        return false;
      }
      if (categoryFilter !== "ALL" && rec.category !== categoryFilter) {
        return false;
      }
      if (typeFilter === "THERAPY_TOY" && rec.assetType !== "THERAPY_TOY") {
        return false;
      }
      if (typeFilter === "FIXED_ASSET" && rec.assetType !== "FIXED_ASSET") {
        return false;
      }
      if (typeFilter === "CONSUMABLE" && rec.assetType !== "CONSUMABLE") {
        return false;
      }
      if (
        typeFilter === "ARCHIVE_DIGITAL" &&
        !(rec.source === "ARCHIVE" && rec.hasDigitalLink)
      ) {
        return false;
      }
      if (typeFilter === "PART_KURANG" && rec.statusTag !== "PART_KURANG") {
        return false;
      }

      if (q) {
        const haystack = [
          rec.code,
          rec.title,
          rec.category,
          rec.locationDisplay,
          rec.counterOrIndicator,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    allRecords,
    sourceTab,
    locationFilter,
    categoryFilter,
    typeFilter,
    deferredSearchQuery,
  ]);

  // Ordered batch entries
  const batchEntries = React.useMemo<PrintBatchEntry[]>(() => {
    const entries: PrintBatchEntry[] = [];
    for (const [key, qty] of Object.entries(selectedQuantities)) {
      const rec = recordByKey.get(key);
      if (rec && qty > 0) {
        entries.push({ record: rec, quantity: qty });
      }
    }
    return entries;
  }, [selectedQuantities, recordByKey]);

  const expandedQueue = React.useMemo(
    () => expandPrintQueue(batchEntries),
    [batchEntries],
  );

  const clampedA4StartSlot = Math.max(
    1,
    Math.min(activeA4Spec.perPage, a4StartSlot),
  );

  const pages = React.useMemo(() => {
    if (expandedQueue.length === 0) return [];
    if (template === "THERMAL") {
      return chunkIntoPages(expandedQueue, 1, 1);
    }
    if (template === "A4_GRID") {
      return chunkIntoPages(
        expandedQueue,
        activeA4Spec.perPage,
        clampedA4StartSlot,
      );
    }
    if (spinePaperMode === "CUSTOM_SINGLE") {
      return chunkIntoPages(expandedQueue, 1, 1);
    }
    return chunkIntoPages(expandedQueue, activeSpineSpec.a4PerPage, 1);
  }, [
    expandedQueue,
    template,
    activeA4Spec.perPage,
    activeSpineSpec.a4PerPage,
    spinePaperMode,
    clampedA4StartSlot,
  ]);

  // Observe preview viewport width for Auto-Fit Zoom
  const hasPreviewPages = pages.length > 0;
  React.useEffect(() => {
    const el = previewViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const updateWidth = () => {
      const next = Math.floor(el.clientWidth);
      setViewportWidthPx((prev) => (prev === next ? prev : next));
    };

    updateWidth();
    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPreviewPages]);

  // Keep the hidden multi-page native print DOM off the urgent UI path during
  // rapid edits, while flushing immediately when printing.
  const rawPrintConfig = React.useMemo(
    () => ({
      pages,
      template,
      thermalSize,
      customThermalSize,
      a4Preset,
      spineSize,
      spinePaperMode,
      symbology,
      origin: qrOrigin,
      content,
    }),
    [
      pages,
      template,
      thermalSize,
      customThermalSize,
      a4Preset,
      spineSize,
      spinePaperMode,
      symbology,
      qrOrigin,
      content,
    ],
  );
  const deferredPrintConfig = React.useDeferredValue(rawPrintConfig);
  const activePrintConfig = isPreparingPrint
    ? rawPrintConfig
    : deferredPrintConfig;

  // Clamp active preview page index when batch or template changes
  React.useEffect(() => {
    setPreviewPageIndex((prev) => {
      if (pages.length === 0) return 0;
      return Math.min(prev, pages.length - 1);
    });
  }, [pages.length]);

  const selectedCount = batchEntries.length;
  const totalStickers = expandedQueue.length;
  const firstSelectedRecord = expandedQueue[0] ?? allRecords[0] ?? null;
  const qrSampleRecord = firstSelectedRecord ?? FALLBACK_SAMPLE_RECORD;

  // Live QR payload, density info, and computed physical QR mm size
  const liveQrPayload = React.useMemo(
    () => buildQrPayload(qrSampleRecord, qrOrigin, content.qrPayloadMode),
    [qrSampleRecord, qrOrigin, content.qrPayloadMode],
  );

  const liveQrMatrixInfo = React.useMemo(
    () => estimateQrMatrixInfo(liveQrPayload, content.qrErrorLevel),
    [liveQrPayload, content.qrErrorLevel],
  );

  const liveComputedQrMm = React.useMemo(() => {
    const rec = qrSampleRecord;
    const headerBrand = content.showHeader
      ? content.customHeaderText.trim()
      : "";
    const headerSub = content.showHeaderSubtitle
      ? rec.headerSubtitle.trim()
      : "";
    const hasBrand = Boolean(headerBrand);
    const hasHeader = hasBrand || Boolean(headerSub);
    const hasTitle = content.showTitle && Boolean(rec.title.trim());
    const hasCategory = content.showCategory && Boolean(rec.category.trim());
    const hasCodeText = content.showCodeText && Boolean(rec.code.trim());
    const hasLocation = content.showLocation && Boolean(rec.locationDisplay.trim());
    const counterLine = buildActiveCounterLine(rec, content);
    const hasCounterLine = Boolean(counterLine);
    const hasStatusTag = content.showStatusTag && Boolean(rec.statusTag);
    const effectiveQrSymbology: "QR" | "COMBO" =
      symbology === "COMBO" ? "COMBO" : "QR";
    const hasScanHint =
      effectiveQrSymbology === "QR" &&
      content.showScanHint &&
      Boolean(content.customScanHint.trim());

    if (template === "ARCHIVE_SPINE") {
      const spineLayout = computeSpineStickerLayout({
        spineSize,
        symbology: effectiveQrSymbology,
        content,
        hasLeftPillar: hasBrand || Boolean(headerSub) || content.showLocation,
        hasCategory,
        hasTitle,
        hasCodeText,
        hasLocation,
        hasCounterLine,
        hasStatusTag,
        hasScanHint,
      });
      return spineLayout.qrSizeMm;
    }

    const widthMm =
      template === "THERMAL"
        ? activeThermalDims.widthMm
        : activeA4Spec.labelWidthMm;
    const heightMm =
      template === "THERMAL"
        ? activeThermalDims.heightMm
        : activeA4Spec.labelHeightMm;

    if (symbology === "COMBO") {
      const linearLayout = computeLinearStickerLayout({
        widthMm,
        heightMm,
        symbology: "COMBO",
        content,
        hasHeader,
        hasTitle,
        hasCategory,
        hasCodeText,
        hasLocation,
        hasCounterLine,
        hasStatusTag,
      });
      return linearLayout.comboQrSizeMm;
    }

    const qrLayout = computeQrStickerLayout({
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
      titleText: rec.title,
      locationText: rec.locationDisplay,
      codeText: rec.code,
    });
    return qrLayout.qrSizeMm;
  }, [
    qrSampleRecord,
    content,
    template,
    spineSize,
    symbology,
    activeThermalDims,
    activeA4Spec,
  ]);

  // Count active content toggles for tab badge
  const activeContentToggleCount = React.useMemo(() => {
    const flags = [
      content.showHeader,
      content.showHeaderSubtitle,
      content.showTitle,
      content.showCategory,
      content.showCodeText,
      content.showLocation,
      content.showStockQty,
      content.showPartCounter,
      content.showArchiveDigitalIndicator,
      content.showStatusTag,
      content.showScanHint,
      content.showBorderFrame,
    ];
    return flags.filter(Boolean).length;
  }, [content]);

  // Active label anatomy summary tags for Live Preview footer
  const activeAnatomyLabels = React.useMemo(() => {
    const list: string[] = [];
    if (content.showHeader) {
      list.push(content.customHeaderText.trim() || "Header Brand");
    } else if (content.showHeaderSubtitle) {
      list.push("Sub-label Modul");
    }
    if (content.showTitle) list.push("Nama Auto-Fit");
    if (content.showCategory) list.push("Kategori");
    list.push(SYMBOLOGY_LABELS[symbology].shortTitle);
    if (content.showCodeText) list.push("Kode Monospace");
    if (content.showLocation) list.push("Lokasi");
    if (content.showStockQty) list.push("Stok");
    if (content.showPartCounter) list.push("Part");
    if (content.showArchiveDigitalIndicator) list.push("Status Arsip");
    if (content.showStatusTag) list.push("Badge Status");
    if (content.showScanHint && symbology === "QR") list.push("Panduan Scan");
    if (content.showBorderFrame) list.push("Bingkai Tepi");
    return list;
  }, [content, symbology]);

  // Template / size change handlers
  const handleTemplateChange = (nextTemplate: LabelTemplateId) => {
    setTemplate(nextTemplate);
    setManualZoom(getDefaultZoomForTemplate(nextTemplate, spinePaperMode));
    setPreviewPageIndex(0);
  };

  const handleA4PresetChange = (nextPreset: A4GridPresetId) => {
    setA4Preset(nextPreset);
    const maxSlots = A4_GRID_PRESETS[nextPreset].perPage;
    setA4StartSlot((prev) => Math.max(1, Math.min(maxSlots, prev)));
    setPreviewPageIndex(0);
  };

  const handleSpineSizeChange = (nextSpineSize: SpineSizeId) => {
    setSpineSize(nextSpineSize);
    setPreviewPageIndex(0);
  };

  const handleSpinePaperModeChange = (nextMode: SpinePaperMode) => {
    setSpinePaperMode(nextMode);
    setManualZoom(getDefaultZoomForTemplate("ARCHIVE_SPINE", nextMode));
    setPreviewPageIndex(0);
  };

  const handleCustomWidthChange = (raw: string) => {
    setCustomWidthInput(raw);
    const parsed = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 20 && parsed <= 210) {
      setCustomThermalSize((prev) =>
        clampCustomThermalSize({ ...prev, widthMm: parsed }),
      );
    }
  };

  const handleCustomWidthBlur = () => {
    const parsed = Number(customWidthInput);
    const next = clampCustomThermalSize({
      ...customThermalSize,
      widthMm: Number.isFinite(parsed) && customWidthInput.trim() !== ""
        ? parsed
        : customThermalSize.widthMm,
    });
    setCustomThermalSize(next);
    setCustomWidthInput(String(next.widthMm));
  };

  const handleCustomHeightChange = (raw: string) => {
    setCustomHeightInput(raw);
    const parsed = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 12 && parsed <= 297) {
      setCustomThermalSize((prev) =>
        clampCustomThermalSize({ ...prev, heightMm: parsed }),
      );
    }
  };

  const handleCustomHeightBlur = () => {
    const parsed = Number(customHeightInput);
    const next = clampCustomThermalSize({
      ...customThermalSize,
      heightMm: Number.isFinite(parsed) && customHeightInput.trim() !== ""
        ? parsed
        : customThermalSize.heightMm,
    });
    setCustomThermalSize(next);
    setCustomHeightInput(String(next.heightMm));
  };

  // Supabase Preset handlers
  const openSavePresetDialog = (mode: "new" | "update" = "new") => {
    if (mode === "update" && selectedPreset) {
      setSaveMode("update");
      setPresetNameInput(selectedPreset.name);
      setPresetDescInput(selectedPreset.description ?? "");
      setPresetIsDefaultInput(selectedPreset.is_default);
    } else {
      setSaveMode("new");
      setPresetNameInput("");
      setPresetDescInput("");
      setPresetIsDefaultInput(presets.length === 0);
    }
    setSaveDialogOpen(true);
  };

  const handleSavePresetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = presetNameInput.trim();
    if (trimmedName.length < 2) {
      showError({
        title: "Nama Preset Terlalu Pendek",
        message: "Masukkan minimal 2 karakter untuk nama preset stiker ya!",
      });
      return;
    }

    setIsPresetMutating(true);
    try {
      const isUpdating = saveMode === "update" && Boolean(selectedPreset);
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: isUpdating
            ? "Memperbarui Preset..."
            : "Menyimpan Preset Baru...",
          workingMessage:
            "Menyinkronkan pengaturan ukuran, isi label, dan QR Code ke Supabase...",
          successTitle: isUpdating
            ? "Preset Diperbarui! ✨"
            : "Preset Tersimpan! ✨",
          successMessage: (result) =>
            result.ok
              ? (result.message ?? `Preset "${trimmedName}" berhasil disimpan!`)
              : "Preset berhasil disimpan.",
          errorTitle: "Gagal Menyimpan Preset",
          isResultError: (result) => (result.ok ? null : result.error),
        },
        () =>
          saveBarcodePresetAction({
            id: isUpdating ? selectedPreset?.id : undefined,
            name: trimmedName,
            description: presetDescInput.trim() || null,
            isDefault: presetIsDefaultInput,
            config: normalizeBarcodeStudioConfig(currentConfigSnapshot),
          }),
      );

      if (res.ok && res.data) {
        const saved = res.data;
        setPresets((prev) => {
          const withoutCurrent = prev
            .filter((p) => p.id !== saved.id)
            .map((p) => (saved.is_default ? { ...p, is_default: false } : p));
          return sortPresets([...withoutCurrent, saved]);
        });
        setSelectedPresetId(saved.id);
        setSaveDialogOpen(false);
      }
    } finally {
      setIsPresetMutating(false);
    }
  };

  const handleSetDefaultPreset = async (preset: BarcodePresetRecord) => {
    if (preset.is_default || isPresetMutating) return;
    setIsPresetMutating(true);
    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Mengatur Preset Default...",
          workingMessage: `Menjadikan "${preset.name}" sebagai preset standar organisasi di Supabase...`,
          successTitle: "Default Organisasi Diperbarui! ★",
          successMessage: (result) =>
            result.ok
              ? (result.message ??
                `Preset "${preset.name}" kini menjadi default organisasi.`)
              : "Preset default diperbarui.",
          errorTitle: "Gagal Mengatur Default",
          isResultError: (result) => (result.ok ? null : result.error),
        },
        () => setDefaultBarcodePresetAction(preset.id),
      );

      if (res.ok && res.data) {
        const updated = res.data;
        setPresets((prev) =>
          sortPresets(
            prev.map((p) =>
              p.id === updated.id
                ? { ...updated, is_default: true }
                : { ...p, is_default: false },
            ),
          ),
        );
      }
    } finally {
      setIsPresetMutating(false);
    }
  };

  const handleDeletePreset = async (preset: BarcodePresetRecord) => {
    if (isPresetMutating) return;
    setIsPresetMutating(true);
    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Menghapus Preset...",
          workingMessage: `Menghapus preset "${preset.name}" dari Supabase...`,
          successTitle: "Preset Dihapus",
          successMessage: (result) =>
            result.ok
              ? (result.message ?? `Preset "${preset.name}" berhasil dihapus.`)
              : "Preset dihapus.",
          errorTitle: "Gagal Menghapus Preset",
          isResultError: (result) => (result.ok ? null : result.error),
        },
        () => deleteBarcodePresetAction(preset.id),
      );

      if (res.ok) {
        setPresets((prev) => prev.filter((p) => p.id !== preset.id));
        if (selectedPresetId === preset.id) {
          setSelectedPresetId(null);
        }
        setDeleteConfirmPreset(null);
      }
    } finally {
      setIsPresetMutating(false);
    }
  };

  // Batch selection handlers
  const toggleSelectRecord = (key: string) => {
    setSelectedQuantities((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = 1;
      }
      return next;
    });
  };

  const updateQuantity = (key: string, nextQty: number) => {
    const clamped = Math.max(1, Math.min(200, Math.floor(nextQty || 1)));
    setSelectedQuantities((prev) => ({
      ...prev,
      [key]: clamped,
    }));
  };

  const allFilteredSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((r) => Boolean(selectedQuantities[r.key]));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedQuantities((prev) => {
        const next = { ...prev };
        for (const rec of filteredRecords) {
          delete next[rec.key];
        }
        return next;
      });
    } else {
      setSelectedQuantities((prev) => {
        const next = { ...prev };
        for (const rec of filteredRecords) {
          if (!next[rec.key]) {
            next[rec.key] = 1;
          }
        }
        return next;
      });
    }
  };

  const applyQuantityToSelected = (qty: number) => {
    const clamped = Math.max(1, Math.min(200, Math.floor(qty)));
    setSelectedQuantities((prev) => {
      const next: Record<string, number> = {};
      for (const key of Object.keys(prev)) {
        next[key] = clamped;
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedQuantities({});
  };

  const resetFilters = () => {
    setSearchQuery("");
    setLocationFilter("ALL");
    setCategoryFilter("ALL");
    setTypeFilter("ALL");
  };

  const handleSelectQuickSample = (count: number) => {
    const pool = filteredRecords.length > 0 ? filteredRecords : allRecords;
    const sample = pool.slice(0, count);
    setSelectedQuantities((prev) => {
      const next = { ...prev };
      for (const rec of sample) {
        if (!next[rec.key]) next[rec.key] = 1;
      }
      return next;
    });
  };

  // Print & PDF handlers
  const handlePrint = () => {
    if (pages.length === 0 || isPreparingPrint) return;
    setIsPreparingPrint(true);

    const isBatch = totalStickers > 1 || pages.length > 1;
    if (isBatch) {
      showBatch({
        title: "Menyiapkan Cetak Massal...",
        message: `Tim mini lagi nyusun ${totalStickers} stiker (${pages.length} halaman) biar siap dikirim ke printer dengan presisi 1:1 mm nih~`,
      });
    } else {
      showWorking({
        title: "Menyiapkan Stiker Cetak...",
        message:
          "Dino Joguman lagi merapikan 1 stiker barcode siap cetak biar langsung tajam saat keluar dari printer~",
      });
    }

    printTimerRef.current = setTimeout(() => {
      try {
        window.print();
        showSuccess({
          title: "Dialog Cetak Siap! ✨",
          message: `Yeay! ${totalStickers} stiker (${pages.length} halaman) sudah dikirim ke dialog cetak browser. Pastikan skala 100% tanpa margin ya ♪`,
        });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Gagal membuka dialog cetak browser.";
        showError({
          title: "Gagal Membuka Cetak...",
          message: `Yah, proses cetak terkendala: ${msg}. Coba unduh versi PDF sebagai alternatif ya!`,
        });
      } finally {
        setIsPreparingPrint(false);
        printTimerRef.current = null;
      }
    }, 220);
  };

  const handleDownloadPdf = async () => {
    if (pages.length === 0 || isExportingPdf) return;
    setIsExportingPdf(true);
    setPdfError(null);

    const isBatch = totalStickers > 1 || pages.length > 1;

    try {
      await runWithFeedback(
        {
          mode: isBatch ? "batch" : "working",
          workingTitle: isBatch
            ? "Merender Lembar PDF Stiker..."
            : "Membuat Stiker PDF...",
          workingMessage: isBatch
            ? `Tim mini lagi lembur ngebut merender ${totalStickers} stiker (${pages.length} halaman) ke file PDF vektor tajam nih! Santai sebentar ya~`
            : "Dino Joguman lagi menggambar 1 stiker barcode vektor yang super rapi & tajam buatmu nih~",
          successTitle: "PDF Stiker Siap Dicetak! ✨",
          successMessage: `Yeay! File PDF berisi ${totalStickers} stiker (${pages.length} halaman) berhasil diunduh dan siap dicetak ♪`,
          errorTitle: "Gagal Membuat PDF...",
          errorMessage: (err) =>
            err instanceof Error
              ? `Gagal membuat PDF label: ${err.message}`
              : "Yah, hujan turun... terjadi kesalahan saat merender file PDF. Coba ulangi lagi ya!",
        },
        async () => {
          const { generateBarcodeBatchPdfBlob } = await import("./label-pdf");
          const blob = await generateBarcodeBatchPdfBlob({
            pages,
            template,
            thermalSize,
            customThermalSize,
            a4Preset,
            spineSize,
            spinePaperMode,
            symbology,
            origin: qrOrigin,
            content,
          });

          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().slice(0, 10);
          const templateSlug =
            template === "THERMAL"
              ? thermalSize === "CUSTOM"
                ? `thermal-custom-${activeThermalDims.widthMm}x${activeThermalDims.heightMm}`
                : `thermal-${thermalSize}`
              : template === "A4_GRID"
                ? `a4-${a4Preset.toLowerCase()}`
                : spinePaperMode === "A4_SHEET"
                  ? `spine-${spineSize}-a4`
                  : `spine-${spineSize}`;

          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `starops-label-${templateSlug}-${symbology.toLowerCase()}-${stamp}.pdf`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          return true;
        },
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat merender file PDF.";
      setPdfError(`Gagal membuat PDF label: ${msg}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Page dimensions & Auto-Fit Zoom math
  const printPageSizeCss = getPrintPageSizeCss(
    template,
    thermalSize,
    spinePaperMode,
    customThermalSize,
    spineSize,
  );
  const previewDims = resolvePageDimensionsMm(
    template,
    thermalSize,
    spinePaperMode,
    customThermalSize,
    a4Preset,
    spineSize,
  );

  const isFullA4Preview =
    template === "A4_GRID" ||
    (template === "ARCHIVE_SPINE" && spinePaperMode === "A4_SHEET");

  const autoFitZoom = React.useMemo(() => {
    if (viewportWidthPx <= 0) {
      return getDefaultZoomForTemplate(template, spinePaperMode);
    }
    const availW = Math.max(180, viewportWidthPx - 40);
    const maxFitH = isFullA4Preview ? 540 : 340;
    const naturalW = previewDims.widthMm * PX_PER_MM;
    const naturalH = previewDims.heightMm * PX_PER_MM;
    const fitW = availW / naturalW;
    const fitH = maxFitH / naturalH;
    const maxCap = isFullA4Preview ? 1.2 : 2.6;
    const raw = Math.min(fitW, fitH);
    return Number(Math.max(0.25, Math.min(maxCap, raw)).toFixed(3));
  }, [
    viewportWidthPx,
    previewDims.widthMm,
    previewDims.heightMm,
    isFullA4Preview,
    template,
    spinePaperMode,
  ]);

  const effectiveZoom = isAutoFitZoom ? autoFitZoom : manualZoom;

  const handleZoomStep = (delta: number) => {
    const base = isAutoFitZoom ? autoFitZoom : manualZoom;
    const next = Math.max(0.25, Math.min(3.0, Number((base + delta).toFixed(2))));
    setIsAutoFitZoom(false);
    setManualZoom(next);
  };

  const handleSetExact100Zoom = () => {
    setIsAutoFitZoom(false);
    setManualZoom(1);
  };

  return (
    <>
      {/* Dynamic @page size matching the currently selected print layout */}
      <style>{`@media print { @page { size: ${printPageSizeCss}; margin: 0; } }`}</style>

      {/* Interactive Studio Workspace (hidden when printing) */}
      <div className="barcode-no-print space-y-5 lg:space-y-6 print:hidden">
        {/* Top Kawaii Header */}
        <KawaiiPageHeader
          badge="Studio Cetak Stiker & Label"
          title="Barcode & Label Print Studio"
          description="Desain dan cetak stiker QR Code besar, Code-128, serta label arsip dengan 17 ukuran thermal, 7 grid A4, 4 punggung map, dan preset tersimpan Supabase."
          accent="pink"
          mascot="barcode"
          className="print:hidden"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#D1FAE5] px-3 py-1 font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-emerald-950/70 dark:text-emerald-100"
              >
                <Package className="size-3.5" />
                {items.length} Inventaris
              </Badge>
              <Badge
                variant="outline"
                className="gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] px-3 py-1 font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-sky-950/70 dark:text-sky-100"
              >
                <Archive className="size-3.5" />
                {archives.length} Arsip
              </Badge>
              <Badge
                variant={selectedCount > 0 ? "default" : "secondary"}
                className={cn(
                  "gap-1.5 rounded-full border-2 border-[#2C2623] px-3 py-1 font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500",
                  selectedCount > 0
                    ? "bg-[#FDE68A] text-[#2C2623] dark:bg-amber-900/80 dark:text-amber-100"
                    : "bg-white text-[#2C2623] dark:bg-stone-800 dark:text-stone-200",
                )}
              >
                <Layers className="size-3.5" />
                {selectedCount} Item · {totalStickers} Stiker · {pages.length}{" "}
                Hal.
              </Badge>
            </div>
          }
        />

        {!schemaReady && (
          <Alert
            variant="warning"
            className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] print:hidden dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100"
          >
            <AlertTriangle className="size-4" />
            <AlertTitle className="font-extrabold">
              Skema Database Supabase Belum Diterapkan
            </AlertTitle>
            <AlertDescription>
              <p>
                Jalankan file <code>supabase/schema.sql</code> di Supabase SQL
                Editor untuk memuat data <code>items_master</code> dan{" "}
                <code>archives_hybrid</code>.
              </p>
              {schemaError && (
                <p className="font-mono text-xs opacity-80">
                  Detail: {schemaError}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {pdfError && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF1F2] shadow-[3px_3px_0px_0px_#2C2623] print:hidden dark:border-rose-500 dark:bg-rose-950/50"
          >
            <AlertTriangle className="size-4" />
            <AlertTitle className="font-extrabold">Ekspor PDF Gagal</AlertTitle>
            <AlertDescription>{pdfError}</AlertDescription>
          </Alert>
        )}

        <div className="grid items-start gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          {/* LEFT COLUMN: Batch Selection Table */}
          <Card className="flex min-w-0 flex-col overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#FFE4E6]/65 pb-4 dark:border-stone-600 dark:bg-rose-950/35">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FDE68A] text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                      1
                    </span>
                    <CheckSquare className="size-4 shrink-0" />
                    <span className="truncate">Pilih Batch Item & Arsip</span>
                  </CardTitle>
                  <CardDescription className="mt-1 text-[#2C2623]/75 dark:text-stone-300">
                    Centang satu atau beberapa item/arsip lalu atur jumlah
                    cetakan per item.
                  </CardDescription>
                </div>
                {selectedCount > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearSelection}
                    className="h-8 shrink-0 rounded-xl border-2 border-[#2C2623] bg-white px-2.5 font-bold text-rose-600 shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FFF1F2] hover:text-rose-700 dark:border-stone-500 dark:bg-stone-900 dark:text-rose-300"
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    Bersihkan ({selectedCount})
                  </Button>
                )}
              </div>

              {/* Source Tabs */}
              <div className="pt-2.5">
                <Tabs
                  value={sourceTab}
                  onValueChange={(val) => {
                    setSourceTab(val as SourceTab);
                    setLocationFilter("ALL");
                    setCategoryFilter("ALL");
                  }}
                >
                  <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1 sm:inline-flex sm:w-auto dark:border-stone-500 dark:bg-stone-900">
                    <TabsTrigger
                      value="ALL"
                      className="rounded-xl px-2.5 py-1.5 text-xs font-bold sm:px-3 sm:text-sm data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FDE68A] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                    >
                      Semua ({allRecords.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="INVENTORY"
                      className="rounded-xl px-2.5 py-1.5 text-xs font-bold sm:px-3 sm:text-sm data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#A7F3D0] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                    >
                      Inventaris ({items.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="ARCHIVE"
                      className="rounded-xl px-2.5 py-1.5 text-xs font-bold sm:px-3 sm:text-sm data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#BAE6FD] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                    >
                      Arsip ({archives.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-1 flex-col gap-3.5 pt-4">
              {/* Filter Bar */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative min-w-0 sm:col-span-2">
                  <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari kode SC-..., nama, kategori, rak/laci..."
                    className="w-full rounded-xl border-2 border-[#2C2623] bg-white pl-9 dark:border-stone-500 dark:bg-stone-900"
                  />
                </div>

                <div className="min-w-0">
                  <Select
                    value={locationFilter}
                    onValueChange={setLocationFilter}
                  >
                    <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
                      <SelectValue placeholder="Semua Lokasi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Lokasi</SelectItem>
                      {locationFilterOptions.map((loc) => (
                        <SelectItem key={loc.value} value={loc.value}>
                          {loc.isActive === false
                            ? `${loc.label} (Nonaktif)`
                            : loc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0">
                  <Select
                    value={categoryFilter}
                    onValueChange={setCategoryFilter}
                  >
                    <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
                      <SelectValue placeholder="Semua Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Kategori</SelectItem>
                      {categoryOptions.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="w-full min-w-0 sm:w-auto sm:min-w-[190px]">
                    <Select
                      value={typeFilter}
                      onValueChange={(v) => setTypeFilter(v as TypeFilter)}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900"
                      >
                        <Filter className="mr-1.5 size-3.5 shrink-0" />
                        <SelectValue placeholder="Filter Jenis" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Semua Jenis & Kondisi</SelectItem>
                        <SelectItem value="THERAPY_TOY">
                          {ASSET_TYPE_LABELS.THERAPY_TOY}
                        </SelectItem>
                        <SelectItem value="FIXED_ASSET">
                          {ASSET_TYPE_LABELS.FIXED_ASSET}
                        </SelectItem>
                        <SelectItem value="CONSUMABLE">
                          {ASSET_TYPE_LABELS.CONSUMABLE}
                        </SelectItem>
                        <SelectItem value="ARCHIVE_DIGITAL">
                          Arsip Terdigitalisasi
                        </SelectItem>
                        <SelectItem value="PART_KURANG">
                          Status Part Kurang
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(searchQuery ||
                    locationFilter !== "ALL" ||
                    categoryFilter !== "ALL" ||
                    typeFilter !== "ALL") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetFilters}
                      className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#FFFBEB] px-2.5 text-xs font-bold text-[#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-800 dark:text-stone-100"
                    >
                      <RotateCcw className="mr-1 size-3" />
                      Reset Filter
                    </Button>
                  )}
                </div>

                {selectedCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-bold text-[#2C2623]/75 dark:text-stone-300">
                      Set Qty Terpilih:
                    </span>
                    {[1, 2, 5, 10, 24].map((qty) => (
                      <Button
                        key={qty}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyQuantityToSelected(qty)}
                        className="h-7 rounded-lg border-2 border-[#2C2623] bg-[#FEF3C7] px-2 text-xs font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] hover:bg-[#FDE68A] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none dark:border-stone-500 dark:bg-amber-950/60 dark:text-amber-100"
                      >
                        ×{qty}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Records Table */}
              <div className="max-h-[560px] min-w-0 overflow-x-auto overflow-y-auto rounded-2xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-950/40">
                <Table>
                  <TableHeader className="sticky top-0 z-10 border-b-2 border-[#2C2623] bg-[#FEF3C7]/95 dark:border-stone-600 dark:bg-stone-800">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allFilteredSelected}
                          onCheckedChange={toggleSelectAllFiltered}
                          aria-label="Pilih semua hasil filter"
                          disabled={filteredRecords.length === 0}
                        />
                      </TableHead>
                      <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                        Kode & Sumber
                      </TableHead>
                      <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                        Nama, Lokasi & Indikator
                      </TableHead>
                      <TableHead className="w-32 text-right font-extrabold text-[#2C2623] dark:text-stone-100">
                        Qty Label
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-6 whitespace-normal"
                        >
                          <KawaiiEmptyState
                            mascot="barcode"
                            title={
                              allRecords.length === 0
                                ? "Belum Ada Data Stiker"
                                : "Tidak Ada Hasil yang Cocok"
                            }
                            description={
                              allRecords.length === 0
                                ? "Belum ada data inventaris atau arsip aktif di database."
                                : "Coba ubah kata kunci pencarian atau reset filter untuk melihat daftar item lainnya ya!"
                            }
                            action={
                              allRecords.length > 0 ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={resetFilters}
                                  className="rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]"
                                >
                                  <RotateCcw className="mr-1.5 size-3.5" />
                                  Reset Semua Filter
                                </Button>
                              ) : undefined
                            }
                            className="border-0 bg-transparent py-4 shadow-none"
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecords.map((rec) => {
                        const qty = selectedQuantities[rec.key];
                        const isSelected = Boolean(qty);
                        return (
                          <TableRow
                            key={rec.key}
                            data-state={isSelected ? "selected" : undefined}
                            className={cn(
                              "cursor-pointer transition-colors",
                              isSelected
                                ? "bg-[#D1FAE5]/45 hover:bg-[#D1FAE5]/65 dark:bg-emerald-950/35"
                                : "hover:bg-[#FFFBEB] dark:hover:bg-stone-800/50",
                            )}
                            onClick={() => toggleSelectRecord(rec.key)}
                          >
                            <TableCell
                              onClick={(e) => e.stopPropagation()}
                              className="align-top"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() =>
                                  toggleSelectRecord(rec.key)
                                }
                                aria-label={`Pilih ${rec.code}`}
                              />
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <div className="font-mono text-xs font-extrabold text-[#2C2623] dark:text-stone-100">
                                {rec.code}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge
                                  variant={
                                    rec.source === "ARCHIVE"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className={cn(
                                    "rounded-full border border-[#2C2623] px-1.5 py-0 text-[10px] font-bold dark:border-stone-500",
                                    rec.source === "ARCHIVE"
                                      ? "bg-[#E0F2FE] text-[#2C2623] dark:bg-sky-950/60 dark:text-sky-100"
                                      : "bg-[#D1FAE5] text-[#2C2623] dark:bg-emerald-950/60 dark:text-emerald-100",
                                  )}
                                >
                                  {rec.source === "ARCHIVE"
                                    ? "Arsip"
                                    : "Inventaris"}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="rounded-full border border-[#2C2623]/60 bg-white px-1.5 py-0 text-[10px] font-semibold dark:border-stone-500 dark:bg-stone-900"
                                >
                                  {
                                    SYMBOLOGY_LABELS[rec.recommendedFormat]
                                      .shortTitle
                                  }
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <div className="leading-snug font-bold text-[#2C2623] dark:text-stone-100">
                                {rec.title}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {rec.category} · {rec.locationDisplay}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="font-semibold">
                                  {rec.counterOrIndicator}
                                </span>
                                {rec.statusTag && (
                                  <Badge
                                    variant={
                                      rec.statusTag === "PART KURANG"
                                        ? "destructive"
                                        : "secondary"
                                    }
                                    className="rounded-full border border-[#2C2623] px-1.5 py-0 text-[10px] font-bold"
                                  >
                                    {rec.statusTag}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              className="text-right align-top"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isSelected ? (
                                <div className="inline-flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="size-7 rounded-lg border-2 border-[#2C2623] bg-[#FFE4E6] text-[#2C2623] hover:bg-[#FECDD3] dark:border-stone-500"
                                    aria-label={`Kurangi jumlah ${rec.code}`}
                                    onClick={() =>
                                      updateQuantity(
                                        rec.key,
                                        Math.max(1, qty - 1),
                                      )
                                    }
                                  >
                                    <Minus className="size-3" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={200}
                                    value={qty}
                                    onChange={(e) =>
                                      updateQuantity(
                                        rec.key,
                                        Number.parseInt(e.target.value, 10) ||
                                          1,
                                      )
                                    }
                                    className="h-7 w-13 rounded-lg border-2 border-[#2C2623] bg-white px-1 text-center font-mono text-xs font-bold dark:border-stone-500 dark:bg-stone-900"
                                    aria-label={`Jumlah label untuk ${rec.code}`}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="size-7 rounded-lg border-2 border-[#2C2623] bg-[#D1FAE5] text-[#2C2623] hover:bg-[#A7F3D0] dark:border-stone-500"
                                    aria-label={`Tambah jumlah ${rec.code}`}
                                    onClick={() =>
                                      updateQuantity(rec.key, qty + 1)
                                    }
                                  >
                                    <Plus className="size-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleSelectRecord(rec.key)}
                                  className="h-7 rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-2.5 text-xs font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                                >
                                  + Pilih
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
                <span>
                  Menampilkan{" "}
                  <strong className="text-foreground">
                    {filteredRecords.length}
                  </strong>{" "}
                  dari{" "}
                  <strong className="text-foreground">
                    {allRecords.length}
                  </strong>{" "}
                  data aktif
                </span>
                <span>
                  Klik baris untuk memilih. Atur layout, isi & QR di panel kanan.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT COLUMN: Configuration & Live Preview */}
          <div className="flex min-w-0 flex-col gap-5 lg:gap-6">
            {/* Configuration Card */}
            <Card className="min-w-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE]/80 pb-4 dark:border-stone-600 dark:bg-sky-950/35">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#A7F3D0] text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                        2
                      </span>
                      <SlidersHorizontal className="size-4 shrink-0" />
                      <span className="truncate">
                        Pengaturan Label, Isi & QR Code
                      </span>
                    </CardTitle>
                    <CardDescription className="mt-1 text-[#2C2623]/75 dark:text-stone-300">
                      Atur ukuran kertas, isi stiker sekali tempel, ukuran QR
                      hingga 80%, dan simpan preset ke Supabase.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="min-w-0 space-y-4 pt-4">
                {/* SUPABASE SAVED PRESETS STRIP */}
                <div className="space-y-2.5 rounded-2xl border-2 border-[#2C2623] bg-[#FEF9E7] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-stone-900/75 dark:shadow-[2px_2px_0px_0px_#0c0a09]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Bookmark className="size-4 shrink-0 text-[#D97706] dark:text-amber-300" />
                      <span className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-100">
                        Preset Tersimpan (Supabase)
                      </span>
                      <Badge
                        variant="outline"
                        className="rounded-full border border-[#2C2623]/50 bg-white px-2 py-0 text-[10px] font-bold dark:border-stone-500 dark:bg-stone-800"
                      >
                        {presets.length}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedPreset && isPresetModified && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPresetMutating}
                          onClick={() => openSavePresetDialog("update")}
                          className="h-7 rounded-xl border-2 border-[#2C2623] bg-[#E0F2FE] px-2.5 text-[11px] font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] hover:bg-[#BAE6FD] dark:border-stone-500 dark:bg-sky-950/70 dark:text-sky-100"
                        >
                          <Save className="mr-1 size-3" />
                          Perbarui
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPresetMutating}
                        onClick={() => openSavePresetDialog("new")}
                        className="h-7 rounded-xl border-2 border-[#2C2623] bg-[#D1FAE5] px-2.5 text-[11px] font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] hover:bg-[#A7F3D0] dark:border-stone-500 dark:bg-emerald-950/70 dark:text-emerald-100"
                      >
                        <Save className="mr-1 size-3" />
                        Simpan Preset
                      </Button>
                    </div>
                  </div>

                  {presets.length === 0 ? (
                    <p className="text-xs text-[#574E49] dark:text-stone-400">
                      Belum ada preset tersimpan. Atur ukuran kertas & QR di
                      bawah lalu klik <strong>Simpan Preset</strong> agar bisa
                      dipakai ulang oleh seluruh tim!
                    </p>
                  ) : (
                    <>
                      {/* Quick Preset Pills (fast 1-click switch) */}
                      <div className="flex flex-wrap gap-1.5">
                        {presets.slice(0, 6).map((preset) => {
                          const isActive = selectedPresetId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() =>
                                applyStudioConfig(preset.config, preset.id)
                              }
                              className={cn(
                                "inline-flex max-w-full items-center gap-1.5 rounded-xl border-2 border-[#2C2623] px-2.5 py-1 text-left text-xs font-bold transition-all dark:border-stone-500",
                                isActive
                                  ? "-translate-y-0.5 bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-900/80 dark:text-amber-50"
                                  : "bg-white text-[#2C2623] hover:bg-[#FFFBEB] dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800",
                              )}
                            >
                              {preset.is_default && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#2C2623] px-1.5 py-0.5 text-[9px] font-black text-[#FDE68A] dark:bg-amber-400 dark:text-stone-950">
                                  ★ Default
                                </span>
                              )}
                              <span className="truncate">{preset.name}</span>
                              {isActive && !isPresetModified && (
                                <Check className="size-3 shrink-0 text-[#15803D] dark:text-emerald-300" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Dropdown Selector + Manage Actions for Selected Preset */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <Select
                            value={selectedPresetId ?? "__custom__"}
                            onValueChange={(val) => {
                              if (val === "__custom__") return;
                              const found = presets.find((p) => p.id === val);
                              if (found) {
                                applyStudioConfig(found.config, found.id);
                              }
                            }}
                          >
                            <SelectTrigger
                              size="sm"
                              aria-label="Pilih preset tersimpan"
                              className="w-full rounded-xl border-2 border-[#2C2623] bg-white text-xs font-bold dark:border-stone-500 dark:bg-stone-950"
                            >
                              <SelectValue placeholder="Pilih preset tersimpan..." />
                            </SelectTrigger>
                            <SelectContent>
                              {!selectedPresetId && (
                                <SelectItem value="__custom__">
                                  Pengaturan Kustom Aktif
                                </SelectItem>
                              )}
                              {presets.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.is_default ? "★ Default · " : ""}
                                  {preset.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedPreset && (
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                selectedPreset.is_default || isPresetMutating
                              }
                              onClick={() =>
                                void handleSetDefaultPreset(selectedPreset)
                              }
                              className="h-8 rounded-xl border-2 border-[#2C2623] bg-white px-2.5 text-[11px] font-extrabold text-[#2C2623] hover:bg-[#FEF3C7] disabled:opacity-60 dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                            >
                              <Star
                                className={cn(
                                  "mr-1 size-3",
                                  selectedPreset.is_default &&
                                    "fill-amber-400 text-amber-500",
                                )}
                              />
                              {selectedPreset.is_default
                                ? "Default Aktif"
                                : "Jadikan Default"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isPresetMutating}
                              onClick={() =>
                                setDeleteConfirmPreset(selectedPreset)
                              }
                              className="h-8 rounded-xl border-2 border-[#2C2623] bg-white px-2 text-[11px] font-extrabold text-rose-600 hover:bg-[#FFF1F2] hover:text-rose-700 dark:border-stone-500 dark:bg-stone-900 dark:text-rose-300"
                              aria-label={`Hapus preset ${selectedPreset.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {selectedPreset && (
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-[#574E49] dark:text-stone-400">
                          <span className="min-w-0 truncate">
                            {selectedPreset.description
                              ? selectedPreset.description
                              : formatConfigDimensionSummary(
                                  selectedPreset.config,
                                )}
                          </span>
                          {isPresetModified && (
                            <span className="shrink-0 rounded-full border border-amber-500/60 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                              Dimodifikasi
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 3-TAB CONFIGURATION WORKSPACE */}
                <Tabs
                  value={configTab}
                  onValueChange={(v) => setConfigTab(v as ConfigTab)}
                  className="min-w-0"
                >
                  <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl border-2 border-[#2C2623] bg-[#F5E9D6] p-1 dark:border-stone-500 dark:bg-stone-900">
                    <TabsTrigger
                      value="layout"
                      className="flex-wrap rounded-xl px-2 py-2 text-[11px] font-extrabold sm:text-xs data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FFFDF7] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623] dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-100"
                    >
                      <Tag className="size-3.5 shrink-0" />
                      <span>1. Ukuran</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="content"
                      className="flex-wrap rounded-xl px-2 py-2 text-[11px] font-extrabold sm:text-xs data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FFFDF7] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623] dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-100"
                    >
                      <SlidersHorizontal className="size-3.5 shrink-0" />
                      <span>2. Isi Label</span>
                      <span className="hidden rounded-full bg-[#D1FAE5] px-1.5 py-0 text-[9px] font-black text-[#14532D] sm:inline dark:bg-emerald-950 dark:text-emerald-200">
                        {activeContentToggleCount}/12
                      </span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="qr"
                      className="flex-wrap rounded-xl px-2 py-2 text-[11px] font-extrabold sm:text-xs data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FFFDF7] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623] dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-100"
                    >
                      <QrCode className="size-3.5 shrink-0" />
                      <span>3. QR Code</span>
                      {symbology !== "CODE128" && (
                        <span className="hidden rounded-full bg-[#FDE68A] px-1.5 py-0 text-[9px] font-black text-[#2C2623] sm:inline dark:bg-amber-900 dark:text-amber-100">
                          {content.qrSizePercent}%
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* TAB 1: UKURAN & SIMBOLOGI */}
                  <TabsContent value="layout" className="mt-3 space-y-4">
                    {/* Symbology Selector */}
                    <div className="space-y-2">
                      <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                        Mode Simbologi
                      </Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {(
                          [
                            { id: "CODE128", icon: Barcode },
                            { id: "QR", icon: QrCode },
                            { id: "COMBO", icon: Layers },
                          ] as const
                        ).map(({ id, icon: Icon }) => {
                          const active = symbology === id;
                          const meta = SYMBOLOGY_LABELS[id];
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setSymbology(id)}
                              className={cn(
                                "flex min-w-0 flex-col items-start gap-1 rounded-2xl border-2 border-[#2C2623] p-3 text-left transition-all dark:border-stone-500",
                                active
                                  ? "-translate-y-0.5 bg-[#D1FAE5] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-emerald-950/70 dark:text-emerald-100"
                                  : "bg-white hover:-translate-y-0.5 hover:bg-[#FFFBEB] dark:bg-stone-900 dark:hover:bg-stone-800",
                              )}
                            >
                              <div className="flex w-full items-center justify-between gap-1">
                                <span className="text-xs font-extrabold">
                                  {meta.title}
                                </span>
                                <Icon
                                  className={cn(
                                    "size-4 shrink-0",
                                    active
                                      ? "text-[#2AB673] dark:text-emerald-300"
                                      : "text-muted-foreground",
                                  )}
                                />
                              </div>
                              <span className="text-[11px] leading-snug opacity-80">
                                {meta.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Quick QR shortcut banner when QR or COMBO is active */}
                    {symbology !== "CODE128" && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/70 bg-[#EDE9FE]/55 px-3 py-2 text-xs dark:border-stone-600 dark:bg-violet-950/35">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <QrCode className="size-4 shrink-0 text-violet-700 dark:text-violet-300" />
                          <span className="font-extrabold text-[#2C2623] dark:text-stone-100">
                            QR {content.qrSizePercent}% ({liveComputedQrMm}×
                            {liveComputedQrMm} mm)
                          </span>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-extrabold",
                              getDensityTierBadgeClasses(
                                liveQrMatrixInfo.densityTier,
                              ),
                            )}
                          >
                            V{liveQrMatrixInfo.version} ·{" "}
                            {liveQrMatrixInfo.densityTier}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setConfigTab("qr")}
                          className="h-7 rounded-xl border-2 border-[#2C2623] bg-white px-2.5 text-[11px] font-extrabold text-[#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                        >
                          Atur QR 50%–80% →
                        </Button>
                      </div>
                    )}

                    {/* Layout Template Selector */}
                    <div className="space-y-2">
                      <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                        Template Kertas & Stiker
                      </Label>
                      <div className="grid gap-2">
                        {(
                          [
                            { id: "THERMAL", icon: Tag },
                            { id: "A4_GRID", icon: Grid3X3 },
                            { id: "ARCHIVE_SPINE", icon: FileText },
                          ] as const
                        ).map(({ id, icon: Icon }) => {
                          const active = template === id;
                          const meta = TEMPLATE_LABELS[id];
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => handleTemplateChange(id)}
                              className={cn(
                                "flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623] p-3 text-left transition-all sm:flex-nowrap dark:border-stone-500",
                                active
                                  ? "-translate-y-0.5 bg-[#FFE4E6] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-rose-950/60 dark:text-rose-100"
                                  : "bg-white hover:-translate-y-0.5 hover:bg-[#FFFBEB] dark:bg-stone-900 dark:hover:bg-stone-800",
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className={cn(
                                    "inline-flex size-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] dark:border-stone-500",
                                    active
                                      ? "bg-[#FDE68A] text-[#2C2623]"
                                      : "bg-[#F5EFE6] text-muted-foreground dark:bg-stone-800",
                                  )}
                                >
                                  <Icon className="size-4" />
                                </span>
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-extrabold">
                                    {meta.title}
                                  </div>
                                  <div className="truncate text-[11px] opacity-80">
                                    {meta.subtitle}
                                  </div>
                                </div>
                              </div>
                              <Badge
                                variant={active ? "default" : "outline"}
                                className={cn(
                                  "shrink-0 rounded-full border-[1.5px] border-[#2C2623] text-[10px] font-extrabold dark:border-stone-500",
                                  active
                                    ? "bg-[#2C2623] text-[#FFFDF7]"
                                    : "bg-white text-[#2C2623] dark:bg-stone-800 dark:text-stone-200",
                                )}
                              >
                                {meta.dimensions}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* TEMPLATE A: THERMAL ROLL (17 SIZES + CUSTOM) */}
                    {template === "THERMAL" && (
                      <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 dark:border-stone-600 dark:bg-stone-900/60">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-extrabold text-[#2C2623] dark:text-stone-100">
                            Ukuran Populer Thermal Roll
                          </Label>
                          <div className="flex flex-wrap gap-1.5">
                            {POPULAR_THERMAL_SIZE_IDS.map((sizeId) => {
                              const spec = THERMAL_SIZES[sizeId];
                              const active = thermalSize === sizeId;
                              return (
                                <button
                                  key={sizeId}
                                  type="button"
                                  onClick={() => setThermalSize(sizeId)}
                                  className={cn(
                                    "rounded-xl border-2 border-[#2C2623] px-2.5 py-1 text-[11px] font-extrabold transition-all dark:border-stone-500",
                                    active
                                      ? "-translate-y-0.5 bg-[#2AB673] text-white shadow-[2px_2px_0px_0px_#2C2623]"
                                      : "bg-white text-[#2C2623] hover:bg-[#FEF3C7] dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800",
                                  )}
                                >
                                  {sizeId === "CUSTOM"
                                    ? "Kustom"
                                    : spec.shortLabel.replace(" mm", "")}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label
                            htmlFor="thermal-size-select"
                            className="text-xs font-bold"
                          >
                            Semua 17 Ukuran Roll Stiker Thermal (Terkategori)
                          </Label>
                          <Select
                            value={thermalSize}
                            onValueChange={(v) =>
                              setThermalSize(v as ThermalSizeId)
                            }
                          >
                            <SelectTrigger
                              id="thermal-size-select"
                              className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-950"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {groupedThermalSizes.map((group) => (
                                <SelectGroup key={group.category}>
                                  <SelectLabel className="font-extrabold text-[#2C2623] dark:text-amber-300">
                                    {group.label}
                                  </SelectLabel>
                                  {group.items.map((sz) => (
                                    <SelectItem key={sz.id} value={sz.id}>
                                      {sz.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Custom Width × Height Inputs */}
                        {thermalSize === "CUSTOM" && (
                          <div className="grid grid-cols-2 gap-3 rounded-xl border-2 border-dashed border-[#2C2623]/40 bg-white p-3 dark:border-stone-600 dark:bg-stone-950/60">
                            <div className="space-y-1">
                              <Label
                                htmlFor="custom-thermal-width"
                                className="text-[11px] font-extrabold"
                              >
                                Lebar (mm) · 20–210
                              </Label>
                              <Input
                                id="custom-thermal-width"
                                type="number"
                                min={20}
                                max={210}
                                step={1}
                                value={customWidthInput}
                                onChange={(e) =>
                                  handleCustomWidthChange(e.target.value)
                                }
                                onBlur={handleCustomWidthBlur}
                                className="h-9 rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-mono text-sm font-bold dark:border-stone-500 dark:bg-stone-900"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor="custom-thermal-height"
                                className="text-[11px] font-extrabold"
                              >
                                Tinggi (mm) · 12–297
                              </Label>
                              <Input
                                id="custom-thermal-height"
                                type="number"
                                min={12}
                                max={297}
                                step={1}
                                value={customHeightInput}
                                onChange={(e) =>
                                  handleCustomHeightChange(e.target.value)
                                }
                                onBlur={handleCustomHeightBlur}
                                className="h-9 rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-mono text-sm font-bold dark:border-stone-500 dark:bg-stone-900"
                              />
                            </div>
                          </div>
                        )}

                        <p className="text-muted-foreground text-xs leading-relaxed">
                          <strong className="text-foreground">
                            {activeThermalDims.widthMm} ×{" "}
                            {activeThermalDims.heightMm} mm
                          </strong>{" "}
                          — {THERMAL_SIZES[thermalSize].description} Pastikan
                          driver printer thermal diatur tanpa margin.
                        </p>
                      </div>
                    )}

                    {/* TEMPLATE B: A4 MULTI-GRID (7 PRESETS + DYNAMIC START SLOT) */}
                    {template === "A4_GRID" && (
                      <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 dark:border-stone-600 dark:bg-stone-900/60">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="min-w-0 space-y-1.5">
                            <Label
                              htmlFor="a4-preset-select"
                              className="text-xs font-bold"
                            >
                              Preset Kertas Label A4 (7 Ukuran)
                            </Label>
                            <Select
                              value={a4Preset}
                              onValueChange={(v) =>
                                handleA4PresetChange(v as A4GridPresetId)
                              }
                            >
                              <SelectTrigger
                                id="a4-preset-select"
                                className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-950"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {A4_GRID_PRESET_LIST.map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="min-w-0 space-y-1.5">
                            <Label
                              htmlFor="a4-start-slot"
                              className="text-xs font-bold"
                            >
                              Mulai dari Slot ke- (1–{activeA4Spec.perPage})
                            </Label>
                            <Select
                              value={String(clampedA4StartSlot)}
                              onValueChange={(v) => {
                                setA4StartSlot(Number(v));
                                setPreviewPageIndex(0);
                              }}
                            >
                              <SelectTrigger
                                id="a4-start-slot"
                                className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-950"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                {Array.from(
                                  { length: activeA4Spec.perPage },
                                  (_, idx) => idx + 1,
                                ).map((slotNum) => (
                                  <SelectItem
                                    key={slotNum}
                                    value={String(slotNum)}
                                  >
                                    Slot #{slotNum} (Baris{" "}
                                    {Math.ceil(slotNum / activeA4Spec.cols)},
                                    Kolom{" "}
                                    {((slotNum - 1) % activeA4Spec.cols) + 1})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <p className="text-muted-foreground text-xs leading-relaxed">
                          <strong className="text-foreground">
                            {activeA4Spec.cols} Kolom × {activeA4Spec.rows} Baris
                            = {activeA4Spec.perPage} stiker/halaman A4
                          </strong>{" "}
                          ({activeA4Spec.labelWidthMm} ×{" "}
                          {activeA4Spec.labelHeightMm} mm) —{" "}
                          {activeA4Spec.description}
                        </p>
                      </div>
                    )}

                    {/* TEMPLATE C: ARCHIVE SPINE (4 SIZES + PAPER MODE) */}
                    {template === "ARCHIVE_SPINE" && (
                      <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 dark:border-stone-600 dark:bg-stone-900/60">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="min-w-0 space-y-1.5">
                            <Label
                              htmlFor="spine-size-select"
                              className="text-xs font-bold"
                            >
                              Ukuran Label Punggung Map (4 Preset)
                            </Label>
                            <Select
                              value={spineSize}
                              onValueChange={(v) =>
                                handleSpineSizeChange(v as SpineSizeId)
                              }
                            >
                              <SelectTrigger
                                id="spine-size-select"
                                className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-950"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SPINE_SIZE_LIST.map((sp) => (
                                  <SelectItem key={sp.id} value={sp.id}>
                                    {sp.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="min-w-0 space-y-1.5">
                            <Label
                              htmlFor="spine-paper-mode"
                              className="text-xs font-bold"
                            >
                              Mode Kertas Cetak
                            </Label>
                            <Select
                              value={spinePaperMode}
                              onValueChange={(v) =>
                                handleSpinePaperModeChange(v as SpinePaperMode)
                              }
                            >
                              <SelectTrigger
                                id="spine-paper-mode"
                                className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-950"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="A4_SHEET">
                                  Kertas A4 ({activeSpineSpec.a4PerPage}{" "}
                                  Label/Halaman)
                                </SelectItem>
                                <SelectItem value="CUSTOM_SINGLE">
                                  Satuan ({activeSpineSpec.widthMm} ×{" "}
                                  {activeSpineSpec.heightMm} mm)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <p className="text-muted-foreground text-xs leading-relaxed">
                          <strong className="text-foreground">
                            {activeSpineSpec.widthMm} ×{" "}
                            {activeSpineSpec.heightMm} mm
                          </strong>{" "}
                          — {activeSpineSpec.description}
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* TAB 2: ISI LABEL (CONTENT TOGGLES + OPTIONAL STOCK/QTY) */}
                  <TabsContent value="content" className="mt-3 space-y-4">
                    {/* Quick One-Click Content Presets */}
                    <div className="space-y-2">
                      <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                        Preset Cepat Isi Stiker
                      </Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {LABEL_CONTENT_PRESET_LIST.map((preset) => {
                          const isMatched = areContentSettingsEqual(
                            content,
                            preset.settings,
                          );
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleApplyContentPreset(preset)}
                              className={cn(
                                "flex min-w-0 flex-col items-start gap-0.5 rounded-2xl border-2 border-[#2C2623] p-2.5 text-left transition-all dark:border-stone-500",
                                isMatched
                                  ? "-translate-y-0.5 bg-[#D1FAE5] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-emerald-950/75 dark:text-emerald-100"
                                  : "bg-white hover:bg-[#FFFBEB] dark:bg-stone-900 dark:hover:bg-stone-800",
                              )}
                            >
                              <div className="flex w-full items-center justify-between gap-1.5">
                                <span className="text-xs font-extrabold">
                                  {preset.label}
                                </span>
                                {isMatched && (
                                  <Check className="size-3.5 shrink-0 text-[#15803D] dark:text-emerald-300" />
                                )}
                              </div>
                              <span className="text-[11px] leading-snug opacity-80">
                                {preset.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Friendly Note for Permanent Stickers */}
                    <div className="flex items-start gap-2 rounded-2xl border-2 border-dashed border-[#2C2623]/35 bg-[#E0F2FE]/55 px-3 py-2.5 text-xs text-[#2C2623] dark:border-sky-600/60 dark:bg-sky-950/35 dark:text-sky-100">
                      <Info className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300" />
                      <p className="leading-snug">
                        <strong>Tips Stiker Sekali Tempel:</strong> Matikan{" "}
                        <em>Stok/Qty</em> & <em>Part</em> agar stiker awet
                        selamanya. Data stok & kelengkapan real-time otomatis
                        tampil saat QR dipindai ke web preview!
                      </p>
                    </div>

                    {/* Group A: Identitas Utama */}
                    <div className="space-y-2">
                      <Label className="text-[11px] font-extrabold tracking-wide text-[#574E49] uppercase dark:text-stone-400">
                        Identitas & Lokasi Label
                      </Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ContentToggleRow
                          id="toggle-show-header"
                          label="Header Brand"
                          description="Nama klinik/organisasi di bagian atas stiker."
                          checked={content.showHeader}
                          onCheckedChange={(v) =>
                            updateContent("showHeader", v)
                          }
                        >
                          <Input
                            value={content.customHeaderText}
                            maxLength={80}
                            onChange={(e) =>
                              updateContent("customHeaderText", e.target.value)
                            }
                            placeholder="STAR CHAMPS INDONESIA"
                            aria-label="Teks header brand"
                            className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-xs font-bold dark:border-stone-500 dark:bg-stone-950"
                          />
                        </ContentToggleRow>

                        <ContentToggleRow
                          id="toggle-show-header-sub"
                          label="Sub-label Modul"
                          description="Contoh: ALAT TERAPI · TOY atau ARSIP HIBRIDA."
                          checked={content.showHeaderSubtitle}
                          onCheckedChange={(v) =>
                            updateContent("showHeaderSubtitle", v)
                          }
                        />

                        <ContentToggleRow
                          id="toggle-show-title"
                          label="Nama Barang / Nama File"
                          badge="Auto-fit Penuh"
                          badgeTone="info"
                          description="Auto-fit fleksibel, teks panjang terbaca penuh tanpa terpotong."
                          checked={content.showTitle}
                          onCheckedChange={(v) => updateContent("showTitle", v)}
                        />

                        <ContentToggleRow
                          id="toggle-show-category"
                          label="Kategori"
                          description="Menampilkan kategori item atau kategori berkas."
                          checked={content.showCategory}
                          onCheckedChange={(v) =>
                            updateContent("showCategory", v)
                          }
                        />

                        <ContentToggleRow
                          id="toggle-show-code"
                          label="Kode Monospace"
                          description="Kode unik mudah baca, mis. SC-WCR-R03-0012."
                          checked={content.showCodeText}
                          onCheckedChange={(v) =>
                            updateContent("showCodeText", v)
                          }
                        />

                        <ContentToggleRow
                          id="toggle-show-location"
                          label="Lokasi Ruang/Lemari & Rak/Laci"
                          description="Menampilkan kode ruang, rak, atau laci penyimpanan."
                          checked={content.showLocation}
                          onCheckedChange={(v) =>
                            updateContent("showLocation", v)
                          }
                        />
                      </div>
                    </div>

                    {/* Group B: Data Dinamis (Opsional) */}
                    <div className="space-y-2">
                      <Label className="text-[11px] font-extrabold tracking-wide text-[#574E49] uppercase dark:text-stone-400">
                        Data Dinamis & Status (Opsional)
                      </Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ContentToggleRow
                          id="toggle-show-stock"
                          label="Jumlah Stok / Qty"
                          badge="Opsional · Default OFF"
                          badgeTone="optional"
                          description="Opsional — stiker sekali tempel; stok real-time selalu tampil saat QR dipindai di web preview."
                          checked={content.showStockQty}
                          onCheckedChange={(v) =>
                            updateContent("showStockQty", v)
                          }
                        />

                        <ContentToggleRow
                          id="toggle-show-parts"
                          label="Rincian Part / Kepingan"
                          badge="Opsional · Default OFF"
                          badgeTone="optional"
                          description="Opsional — stiker sekali tempel; kelengkapan part terbaru selalu tampil di web preview saat QR dipindai."
                          checked={content.showPartCounter}
                          onCheckedChange={(v) =>
                            updateContent("showPartCounter", v)
                          }
                        />

                        <ContentToggleRow
                          id="toggle-show-archive-digital"
                          label="Indikator Digital & Versi Arsip"
                          description="Menampilkan status File Vault / Google Drive & versi arsip."
                          checked={content.showArchiveDigitalIndicator}
                          onCheckedChange={(v) =>
                            updateContent("showArchiveDigitalIndicator", v)
                          }
                        />

                        <ContentToggleRow
                          id="toggle-show-status-tag"
                          label="Badge Status (Part Kurang / SOP Publik)"
                          badge="Opsional"
                          badgeTone="optional"
                          description="Menampilkan lencana kondisi khusus bila tersedia pada item/arsip."
                          checked={content.showStatusTag}
                          onCheckedChange={(v) =>
                            updateContent("showStatusTag", v)
                          }
                        />
                      </div>
                    </div>

                    {/* Group C: Panduan & Bingkai */}
                    <div className="space-y-2">
                      <Label className="text-[11px] font-extrabold tracking-wide text-[#574E49] uppercase dark:text-stone-400">
                        Panduan Scan & Bingkai Stiker
                      </Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ContentToggleRow
                          id="toggle-show-scan-hint"
                          label="Panduan Scan QR (Mode QR)"
                          badge="Mode QR"
                          badgeTone="info"
                          description="Teks singkat pengarah pemindaian di bawah info label (tampil pada mode QR Code Saja)."
                          checked={content.showScanHint}
                          onCheckedChange={(v) =>
                            updateContent("showScanHint", v)
                          }
                        >
                          <Input
                            value={content.customScanHint}
                            maxLength={80}
                            onChange={(e) =>
                              updateContent("customScanHint", e.target.value)
                            }
                            placeholder="Scan QR untuk detail & stok"
                            aria-label="Teks panduan scan QR"
                            className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] text-xs font-semibold dark:border-stone-500 dark:bg-stone-950"
                          />
                        </ContentToggleRow>

                        <ContentToggleRow
                          id="toggle-show-border"
                          label="Bingkai Garis Tepi Stiker"
                          description="Tambahkan bingkai garis hitam tegas mengelilingi tepi label saat dicetak."
                          checked={content.showBorderFrame}
                          onCheckedChange={(v) =>
                            updateContent("showBorderFrame", v)
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB 3: PENGATURAN QR CODE LANJUTAN */}
                  <TabsContent value="qr" className="mt-3 space-y-4">
                    {symbology === "CODE128" && (
                      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] p-3 text-xs text-[#2C2623] dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100">
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold">
                            Mode saat ini adalah 1D Barcode Saja (Code-128)
                          </div>
                          <p className="mt-0.5 opacity-85">
                            Aktifkan mode QR Code atau Combo agar pengaturan QR
                            di bawah tampil di stiker.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setSymbology("QR")}
                            className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#2AB673] px-3 text-xs font-extrabold text-white shadow-[2px_2px_0px_0px_#2C2623]"
                          >
                            Aktifkan QR Saja
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSymbology("COMBO")}
                            className="h-8 rounded-xl border-2 border-[#2C2623] bg-white px-3 text-xs font-extrabold text-[#2C2623]"
                          >
                            Mode Combo
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* LIVE QR DENSITY INSPECTOR BADGE */}
                    <div className="space-y-2 rounded-2xl border-2 border-[#2C2623] bg-white p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-stone-900/90">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-[#2C2623] uppercase dark:text-stone-100">
                          Kepadatan Blok QR Live
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border-2 px-2.5 py-0.5 font-mono text-[11px] font-black",
                            getDensityTierBadgeClasses(
                              liveQrMatrixInfo.densityTier,
                            ),
                          )}
                        >
                          V{liveQrMatrixInfo.version} (
                          {liveQrMatrixInfo.modules}×{liveQrMatrixInfo.modules}{" "}
                          modul) · {liveQrMatrixInfo.densityTier} ·{" "}
                          {liveQrMatrixInfo.charCount} karakter
                        </span>
                      </div>
                      <p className="text-xs leading-snug text-[#574E49] dark:text-stone-300">
                        {liveQrMatrixInfo.hint}
                      </p>
                      <div className="rounded-xl border border-dashed border-[#2C2623]/30 bg-[#FAF6EE] px-2.5 py-1.5 font-mono text-[11px] break-all text-[#2C2623] dark:border-stone-600 dark:bg-stone-950 dark:text-stone-200">
                        <span className="mr-1.5 font-sans text-[10px] font-bold uppercase opacity-65">
                          Isi QR:
                        </span>
                        {liveQrPayload}
                      </div>
                    </div>

                    {/* QR SIZE PERCENTAGE (50% - 80% + SLIDER + MM READOUT) */}
                    <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 dark:border-stone-600 dark:bg-stone-900/60">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label
                          htmlFor="qr-size-slider"
                          className="text-xs font-extrabold text-[#2C2623] uppercase dark:text-stone-100"
                        >
                          Ukuran Kotak QR (% Bidang Kertas)
                        </Label>
                        <div className="flex items-center gap-1.5">
                          <Badge className="rounded-full border-2 border-[#2C2623] bg-[#FDE68A] font-mono text-xs font-black text-[#2C2623] dark:border-stone-500 dark:bg-amber-900 dark:text-amber-100">
                            {content.qrSizePercent}%
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-full border-2 border-[#2C2623] bg-white font-mono text-xs font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-stone-950 dark:text-stone-100"
                          >
                            ≈ {liveComputedQrMm} × {liveComputedQrMm} mm
                          </Badge>
                        </div>
                      </div>

                      {/* Instant Preset Buttons: 50%, 65%, 80% */}
                      <div className="grid grid-cols-3 gap-2">
                        {QR_SIZE_QUICK_PRESETS.map((preset) => {
                          const active =
                            content.qrSizePercent === preset.percent;
                          return (
                            <button
                              key={preset.percent}
                              type="button"
                              onClick={() =>
                                updateContent("qrSizePercent", preset.percent)
                              }
                              className={cn(
                                "flex flex-col items-center justify-center rounded-xl border-2 border-[#2C2623] px-2 py-2 text-center transition-all dark:border-stone-500",
                                active
                                  ? "-translate-y-0.5 bg-[#2AB673] text-white shadow-[2px_2px_0px_0px_#2C2623]"
                                  : "bg-white text-[#2C2623] hover:bg-[#FEF3C7] dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800",
                              )}
                            >
                              <span className="font-mono text-sm font-black">
                                {preset.label}
                              </span>
                              <span className="text-[10px] font-bold opacity-85">
                                ({preset.sublabel})
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Smooth Slider 40..85 step 5 */}
                      <div className="space-y-1">
                        <input
                          id="qr-size-slider"
                          type="range"
                          min={40}
                          max={85}
                          step={5}
                          value={content.qrSizePercent}
                          onChange={(e) =>
                            updateContent(
                              "qrSizePercent",
                              Number(e.target.value),
                            )
                          }
                          className="h-2.5 w-full cursor-pointer appearance-none rounded-full border border-[#2C2623] bg-[#F5E9D6] accent-[#2AB673] dark:border-stone-500 dark:bg-stone-800"
                        />
                        <div className="flex justify-between font-mono text-[10px] font-bold text-[#574E49] dark:text-stone-400">
                          <span>40%</span>
                          <span>50%</span>
                          <span>65%</span>
                          <span>80%</span>
                          <span>85%</span>
                        </div>
                      </div>
                    </div>

                    {/* QR LAYOUT MODE */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                          Tata Letak QR (Mode QR Saja)
                        </Label>
                        {symbology === "COMBO" && (
                          <span className="text-[11px] font-semibold text-[#574E49] dark:text-stone-400">
                            Berlaku penuh saat mode &ldquo;QR Code Saja&rdquo;
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {QR_LAYOUT_OPTIONS.map((opt) => {
                          const active = content.qrLayout === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => updateContent("qrLayout", opt.id)}
                              className={cn(
                                "flex min-w-0 flex-col items-start gap-1 rounded-2xl border-2 border-[#2C2623] p-2.5 text-left transition-all dark:border-stone-500",
                                active
                                  ? "-translate-y-0.5 bg-[#E0F2FE] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-sky-950/75 dark:text-sky-100"
                                  : "bg-white hover:bg-[#FFFBEB] dark:bg-stone-900 dark:hover:bg-stone-800",
                              )}
                            >
                              <span className="text-xs font-extrabold">
                                {opt.label}
                              </span>
                              <span className="text-[11px] leading-snug opacity-80">
                                {opt.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* QR PAYLOAD SOURCE */}
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                          Sumber Isi QR (Lebih Pendek = Kotak QR Lebih Besar &
                          Tebal!)
                        </Label>
                      </div>
                      <div className="grid gap-2">
                        {QR_PAYLOAD_OPTIONS.map((opt) => {
                          const active = content.qrPayloadMode === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                updateContent("qrPayloadMode", opt.id)
                              }
                              className={cn(
                                "flex min-w-0 flex-col items-start gap-0.5 rounded-2xl border-2 border-[#2C2623] p-3 text-left transition-all dark:border-stone-500",
                                active
                                  ? "-translate-y-0.5 bg-[#D1FAE5] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-emerald-950/70 dark:text-emerald-100"
                                  : "bg-white hover:bg-[#FFFBEB] dark:bg-stone-900 dark:hover:bg-stone-800",
                              )}
                            >
                              <div className="flex w-full flex-wrap items-center justify-between gap-1.5">
                                <span className="text-xs font-extrabold">
                                  {opt.label}
                                </span>
                                {opt.badge && (
                                  <span className="rounded-full border border-[#2C2623] bg-[#FDE68A] px-2 py-0.5 text-[10px] font-black text-[#2C2623] dark:border-stone-500 dark:bg-amber-900 dark:text-amber-100">
                                    {opt.badge}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] leading-snug opacity-80">
                                {opt.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* QR ERROR CORRECTION LEVEL + QUIET ZONE */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                          Kepadatan / Koreksi Error (ECC)
                        </Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {QR_ERROR_LEVEL_OPTIONS.map((opt) => {
                            const active = content.qrErrorLevel === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  updateContent("qrErrorLevel", opt.id)
                                }
                                className={cn(
                                  "flex flex-col items-start gap-0.5 rounded-xl border-2 border-[#2C2623] p-2 text-left transition-all dark:border-stone-500",
                                  active
                                    ? "-translate-y-0.5 bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-900/80 dark:text-amber-50"
                                    : "bg-white hover:bg-[#FFFBEB] dark:bg-stone-900 dark:hover:bg-stone-800",
                                )}
                              >
                                <span className="text-xs font-extrabold">
                                  {opt.title}
                                </span>
                                <span className="text-[10px] leading-tight opacity-80">
                                  {opt.subtitle}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                          Quiet Zone (Margin Putih QR)
                        </Label>
                        <div className="grid grid-cols-1 gap-1.5">
                          {(
                            [
                              {
                                value: 1 as const,
                                title: "1 Modul (Rapat · Rekomendasi)",
                                desc: "Memaksimalkan ukuran fisik kotak QR pada stiker kecil.",
                              },
                              {
                                value: 2 as const,
                                title: "2 Modul (Lebar)",
                                desc: "Margin putih ekstra di sekeliling QR untuk permukaan gelap.",
                              },
                            ] as const
                          ).map((opt) => {
                            const active = content.qrQuietZone === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  updateContent("qrQuietZone", opt.value)
                                }
                                className={cn(
                                  "flex flex-col items-start gap-0.5 rounded-xl border-2 border-[#2C2623] p-2.5 text-left transition-all dark:border-stone-500",
                                  active
                                    ? "-translate-y-0.5 bg-[#D1FAE5] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-emerald-950/75 dark:text-emerald-100"
                                    : "bg-white hover:bg-[#FFFBEB] dark:bg-stone-900 dark:hover:bg-stone-800",
                                )}
                              >
                                <span className="text-xs font-extrabold">
                                  {opt.title}
                                </span>
                                <span className="text-[10px] leading-snug opacity-80">
                                  {opt.desc}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Base URL Origin (shown when payload uses URLs) */}
                    {content.qrPayloadMode !== "CODE_ONLY" && (
                      <div className="space-y-1.5 rounded-2xl border-2 border-[#2C2623] bg-white p-3 dark:border-stone-600 dark:bg-stone-900/60">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label
                            htmlFor="qr-base-origin"
                            className="text-xs font-extrabold"
                          >
                            Base URL Origin QR Code
                          </Label>
                          <span className="text-muted-foreground text-[11px]">
                            Gunakan domain pendek agar blok QR semakin besar
                          </span>
                        </div>
                        <Input
                          id="qr-base-origin"
                          value={qrOrigin}
                          onChange={(e) => setQrOrigin(e.target.value)}
                          placeholder="https://starops.starchamps.id"
                          className="h-9 w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-mono text-xs dark:border-stone-500 dark:bg-stone-950"
                        />
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {/* Print & PDF Action Buttons (always visible at bottom of Config Card) */}
                <div className="flex flex-col gap-2.5 border-t-2 border-dashed border-[#2C2623]/25 pt-4 sm:flex-row sm:items-center dark:border-stone-700">
                  <Button
                    type="button"
                    onClick={handlePrint}
                    disabled={pages.length === 0 || isPreparingPrint}
                    className="h-11 flex-1 rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#229c61] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
                  >
                    {isPreparingPrint ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Printer className="mr-2 size-4" />
                    )}
                    Cetak Langsung ({totalStickers} Stiker)
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleDownloadPdf()}
                    disabled={pages.length === 0 || isExportingPdf}
                    className="h-11 flex-1 rounded-xl border-2 border-[#2C2623] bg-[#FDE68A] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#FCD34D] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
                  >
                    {isExportingPdf ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 size-4" />
                    )}
                    {isExportingPdf
                      ? "Merender PDF Vektor..."
                      : "Unduh PDF (.pdf)"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live Preview Card (Sticky on wide desktop for effortless editing) */}
            <Card className="min-w-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] xl:sticky xl:top-20 dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-[#EDE9FE]/80 pb-4 dark:border-stone-600 dark:bg-violet-950/35">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFE4E6] text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                        3
                      </span>
                      <span className="truncate">Live Preview Siap Cetak</span>
                    </CardTitle>
                    <CardDescription className="mt-1 text-[#2C2623]/75 dark:text-stone-300">
                      {pages.length === 0
                        ? "Pilih minimal 1 item atau arsip untuk melihat pratinjau label."
                        : `Halaman ${previewPageIndex + 1} dari ${pages.length} · ${printPageSizeCss}`}
                    </CardDescription>
                  </div>

                  {/* Auto-Fit, Manual Zoom & Pagination Controls */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAutoFitZoom(true)}
                      className={cn(
                        "h-8 rounded-xl border-2 border-[#2C2623] px-2.5 text-[11px] font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500",
                        isAutoFitZoom
                          ? "bg-[#D1FAE5] text-[#2C2623] dark:bg-emerald-950/80 dark:text-emerald-100"
                          : "bg-white text-[#2C2623] hover:bg-[#FEF3C7] dark:bg-stone-900 dark:text-stone-100",
                      )}
                      title="Sesuaikan skala otomatis ke lebar layar"
                    >
                      <Maximize2 className="mr-1 size-3" />
                      Pas Layar
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-xl border-2 border-[#2C2623] bg-white text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                      aria-label="Perkecil pratinjau"
                      onClick={() => handleZoomStep(-0.15)}
                    >
                      <ZoomOut className="size-3.5" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSetExact100Zoom}
                      title="Klik untuk skala 100%"
                      className="h-8 min-w-[3.25rem] rounded-xl px-1.5 font-mono text-xs font-extrabold text-[#2C2623] hover:bg-white/70 dark:text-stone-100 dark:hover:bg-stone-800"
                    >
                      {Math.round(effectiveZoom * 100)}%
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-xl border-2 border-[#2C2623] bg-white text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                      aria-label="Perbesar pratinjau"
                      onClick={() => handleZoomStep(0.15)}
                    >
                      <ZoomIn className="size-3.5" />
                    </Button>

                    {pages.length > 1 && (
                      <div className="ml-0.5 flex items-center gap-1 border-l-2 border-[#2C2623]/25 pl-2 dark:border-stone-600">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-xl border-2 border-[#2C2623] bg-white text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#E0F2FE] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                          disabled={previewPageIndex <= 0}
                          onClick={() =>
                            setPreviewPageIndex((p) => Math.max(0, p - 1))
                          }
                          aria-label="Halaman sebelumnya"
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <span className="px-1 font-mono text-xs font-extrabold text-[#2C2623] dark:text-stone-100">
                          {previewPageIndex + 1}/{pages.length}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-xl border-2 border-[#2C2623] bg-white text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#E0F2FE] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                          disabled={previewPageIndex >= pages.length - 1}
                          onClick={() =>
                            setPreviewPageIndex((p) =>
                              Math.min(pages.length - 1, p + 1),
                            )
                          }
                          aria-label="Halaman berikutnya"
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="min-w-0 pt-4">
                {pages.length === 0 ? (
                  <KawaiiEmptyState
                    mascot="barcode"
                    title="Antrean Label Masih Kosong"
                    description="Centang item inventaris atau berkas arsip di panel kiri untuk melihat pratinjau label real-time."
                    action={
                      allRecords.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectQuickSample(1)}
                            className="rounded-xl border-2 border-[#2C2623] bg-[#D1FAE5] font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#A7F3D0]"
                          >
                            <Sparkles className="mr-1.5 size-3.5" />
                            Pilih 1 Contoh
                          </Button>
                          {allRecords.length >= 3 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleSelectQuickSample(3)}
                              className="rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE68A]"
                            >
                              <Layers className="mr-1.5 size-3.5" />
                              Pilih 3 Contoh
                            </Button>
                          )}
                        </div>
                      ) : undefined
                    }
                  />
                ) : (
                  <div
                    ref={previewViewportRef}
                    className="max-h-[620px] min-h-[220px] w-full min-w-0 overflow-auto rounded-2xl border-2 border-[#2C2623] bg-[#F5EFE6] p-4 shadow-inner sm:p-5 dark:border-stone-500 dark:bg-stone-900/80"
                  >
                    <div
                      style={{
                        width: `${previewDims.widthMm * effectiveZoom}mm`,
                        height: `${previewDims.heightMm * effectiveZoom}mm`,
                      }}
                      className="relative mx-auto shrink-0"
                    >
                      <div
                        style={{
                          transform: `scale(${effectiveZoom})`,
                          transformOrigin: "top left",
                        }}
                      >
                        <PrintableSheetDocument
                          pages={pages}
                          template={template}
                          thermalSize={thermalSize}
                          customThermalSize={customThermalSize}
                          a4Preset={a4Preset}
                          spineSize={spineSize}
                          spinePaperMode={spinePaperMode}
                          symbology={symbology}
                          origin={qrOrigin}
                          content={content}
                          mode="preview"
                          previewPageIndex={previewPageIndex}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Dynamic Anatomy Reference Footer */}
                <div className="text-muted-foreground mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-xl border-2 border-dashed border-[#2C2623]/25 bg-[#FFFBEB]/80 px-3 py-2 text-[11px] dark:border-stone-700 dark:bg-stone-900/50">
                  <span>
                    <strong className="text-foreground">Elemen Aktif:</strong>{" "}
                    {activeAnatomyLabels.join(" · ")}
                  </span>
                  {firstSelectedRecord && (
                    <span className="font-mono font-semibold">
                      Default item #1:{" "}
                      {
                        BARCODE_FORMAT_LABELS[
                          firstSelectedRecord.recommendedFormat
                        ]
                      }
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* SAVE / UPDATE PRESET DIALOG */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="size-5 text-[#D97706]" />
              {saveMode === "update" && selectedPreset
                ? "Perbarui Preset Barcode Studio"
                : "Simpan Preset Barcode Studio"}
            </DialogTitle>
            <DialogDescription>
              Pengaturan ukuran kertas, isi label, dan QR Code akan disimpan ke
              Supabase dan bisa langsung dipakai ulang kapan saja.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePresetSubmit} className="space-y-4">
            {selectedPreset && (
              <div className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-[#2C2623]/70 bg-[#FAF6EE] p-1 dark:border-stone-600 dark:bg-stone-900">
                <button
                  type="button"
                  onClick={() => {
                    setSaveMode("new");
                    setPresetNameInput("");
                    setPresetDescInput("");
                    setPresetIsDefaultInput(false);
                  }}
                  className={cn(
                    "rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition-all",
                    saveMode === "new"
                      ? "border-2 border-[#2C2623] bg-[#D1FAE5] text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
                      : "text-[#574E49] hover:text-[#2C2623] dark:text-stone-400",
                  )}
                >
                  Simpan Baru
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveMode("update");
                    setPresetNameInput(selectedPreset.name);
                    setPresetDescInput(selectedPreset.description ?? "");
                    setPresetIsDefaultInput(selectedPreset.is_default);
                  }}
                  className={cn(
                    "truncate rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition-all",
                    saveMode === "update"
                      ? "border-2 border-[#2C2623] bg-[#E0F2FE] text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
                      : "text-[#574E49] hover:text-[#2C2623] dark:text-stone-400",
                  )}
                >
                  Timpa Terpilih
                </button>
              </div>
            )}

            {/* Snapshot summary pills */}
            <div className="flex flex-wrap gap-1.5 rounded-2xl border-2 border-dashed border-[#2C2623]/30 bg-[#FFFBEB] p-2.5 text-[11px] font-bold dark:border-stone-600 dark:bg-stone-900/60">
              <Badge
                variant="outline"
                className="rounded-full border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-950"
              >
                {SYMBOLOGY_LABELS[symbology].shortTitle}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-950"
              >
                {formatConfigDimensionSummary(currentConfigSnapshot)}
              </Badge>
              {symbology !== "CODE128" && (
                <Badge
                  variant="outline"
                  className="rounded-full border-[#2C2623] bg-[#FDE68A] text-[#2C2623] dark:border-stone-500 dark:bg-amber-900 dark:text-amber-100"
                >
                  QR {content.qrSizePercent}% · ECC {content.qrErrorLevel}
                </Badge>
              )}
              <Badge
                variant="outline"
                className="rounded-full border-[#2C2623] bg-[#D1FAE5] text-[#14532D] dark:border-stone-500 dark:bg-emerald-950 dark:text-emerald-200"
              >
                {content.showStockQty ? "Stok Tampil" : "Sekali Tempel"}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preset-name-input" className="text-xs font-extrabold">
                Nama Preset *
              </Label>
              <Input
                id="preset-name-input"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                maxLength={80}
                required
                placeholder="Contoh: Stiker Thermal 50×50 QR Dominan"
                className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-950"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preset-desc-input" className="text-xs font-extrabold">
                Deskripsi Singkat (Opsional)
              </Label>
              <Textarea
                id="preset-desc-input"
                value={presetDescInput}
                onChange={(e) => setPresetDescInput(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Mis. Untuk label permanen kontainer mainan ruang terapi."
                className="rounded-xl border-2 border-[#2C2623] bg-white text-sm dark:border-stone-500 dark:bg-stone-950"
              />
            </div>

            <label
              htmlFor="preset-default-checkbox"
              className="flex cursor-pointer items-start gap-2.5 rounded-2xl border-2 border-[#2C2623]/70 bg-[#FEF9E7] p-3 dark:border-stone-600 dark:bg-stone-900"
            >
              <Checkbox
                id="preset-default-checkbox"
                checked={presetIsDefaultInput}
                onCheckedChange={(v) => setPresetIsDefaultInput(Boolean(v))}
                className="mt-0.5"
              />
              <div className="space-y-0.5 text-xs">
                <div className="font-extrabold text-[#2C2623] dark:text-stone-100">
                  Jadikan default organisasi
                </div>
                <p className="text-[11px] text-[#574E49] dark:text-stone-400">
                  Preset ini akan dimuat otomatis saat siapa pun membuka Barcode
                  & Label Print Studio.
                </p>
              </div>
            </label>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveDialogOpen(false)}
                disabled={isPresetMutating}
                className="rounded-xl border-2 border-[#2C2623] font-bold"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isPresetMutating || presetNameInput.trim().length < 2}
                className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#229c61]"
              >
                {isPresetMutating ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-4" />
                )}
                {saveMode === "update" && selectedPreset
                  ? "Simpan Perubahan"
                  : "Simpan ke Supabase"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE PRESET CONFIRMATION DIALOG */}
      <Dialog
        open={Boolean(deleteConfirmPreset)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmPreset(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
              <Trash2 className="size-5" />
              Hapus Preset Tersimpan?
            </DialogTitle>
            <DialogDescription>
              Preset{" "}
              <strong className="text-foreground">
                &ldquo;{deleteConfirmPreset?.name}&rdquo;
              </strong>{" "}
              akan dihapus permanen dari Supabase. Pengaturan di layar saat ini
              tetap utuh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPresetMutating}
              onClick={() => setDeleteConfirmPreset(null)}
              className="rounded-xl border-2 border-[#2C2623] font-bold"
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPresetMutating || !deleteConfirmPreset}
              onClick={() => {
                if (deleteConfirmPreset) {
                  void handleDeletePreset(deleteConfirmPreset);
                }
              }}
              className="rounded-xl border-2 border-[#2C2623] font-extrabold shadow-[2px_2px_0px_0px_#2C2623]"
            >
              {isPresetMutating ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 size-4" />
              )}
              Hapus Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Native Browser Print Surface (all pages at 1:1 mm scale) */}
      <div id="barcode-print-root" className="barcode-print-only">
        {activePrintConfig.pages.length > 0 && (
          <PrintableSheetDocument
            pages={activePrintConfig.pages}
            template={activePrintConfig.template}
            thermalSize={activePrintConfig.thermalSize}
            customThermalSize={activePrintConfig.customThermalSize}
            a4Preset={activePrintConfig.a4Preset}
            spineSize={activePrintConfig.spineSize}
            spinePaperMode={activePrintConfig.spinePaperMode}
            symbology={activePrintConfig.symbology}
            origin={activePrintConfig.origin}
            content={activePrintConfig.content}
            mode="print"
          />
        )}
      </div>
    </>
  );
}
