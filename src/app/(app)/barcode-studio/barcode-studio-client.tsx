"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  Barcode,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Grid3X3,
  Layers,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  A4_GRID_SPEC,
  SPINE_LABEL_SPEC,
  SYMBOLOGY_LABELS,
  TEMPLATE_LABELS,
  THERMAL_SIZES,
  buildQrTargetUrl,
  chunkIntoPages,
  expandPrintQueue,
  type LabelSourceKind,
  type LabelTemplateId,
  type PrintBatchEntry,
  type PrintableLabelRecord,
  type SpinePaperMode,
  type SymbologyMode,
  type ThermalSizeId,
} from "@/lib/barcode";
import {
  ASSET_TYPE_LABELS,
  BARCODE_FORMAT_LABELS,
  LOCATION_OPTIONS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

import { PrintableSheetDocument } from "./label-sticker";
import "./print.css";

type SourceTab = "ALL" | LabelSourceKind;
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
};

function getPrintPageSizeCss(
  template: LabelTemplateId,
  thermalSize: ThermalSizeId,
  spinePaperMode: SpinePaperMode,
): string {
  if (template === "THERMAL") {
    const spec = THERMAL_SIZES[thermalSize];
    return `${spec.widthMm}mm ${spec.heightMm}mm`;
  }
  if (template === "ARCHIVE_SPINE" && spinePaperMode === "CUSTOM_SINGLE") {
    return `${SPINE_LABEL_SPEC.widthMm}mm ${SPINE_LABEL_SPEC.heightMm}mm`;
  }
  return "A4 portrait";
}

function getPreviewPageDimensionsMm(
  template: LabelTemplateId,
  thermalSize: ThermalSizeId,
  spinePaperMode: SpinePaperMode,
): { widthMm: number; heightMm: number } {
  if (template === "THERMAL") {
    const spec = THERMAL_SIZES[thermalSize];
    return { widthMm: spec.widthMm, heightMm: spec.heightMm };
  }
  if (template === "ARCHIVE_SPINE" && spinePaperMode === "CUSTOM_SINGLE") {
    return {
      widthMm: SPINE_LABEL_SPEC.widthMm,
      heightMm: SPINE_LABEL_SPEC.heightMm,
    };
  }
  return {
    widthMm: A4_GRID_SPEC.pageWidthMm,
    heightMm: A4_GRID_SPEC.pageHeightMm,
  };
}

function getDefaultZoomForTemplate(
  template: LabelTemplateId,
  spinePaperMode: SpinePaperMode,
): number {
  if (template === "THERMAL") return 1.5;
  if (template === "ARCHIVE_SPINE" && spinePaperMode === "CUSTOM_SINGLE") {
    return 1.1;
  }
  return 0.68;
}

export function BarcodeStudioClient({
  schemaReady,
  schemaError,
  items,
  archives,
  initialSelectedKeys = [],
  initialSourceTab = "ALL",
  initialTemplate = "THERMAL",
}: BarcodeStudioClientProps) {
  const { showWorking, showBatch, showSuccess, showError, runWithFeedback } =
    useCartoonFeedback();

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

  // Selection state: ordered map of key -> quantity multiplier
  const [selectedQuantities, setSelectedQuantities] = React.useState<
    Record<string, number>
  >(() => {
    const init: Record<string, number> = {};
    for (const key of initialSelectedKeys) {
      if (allRecords.some((r) => r.key === key)) {
        init[key] = 1;
      }
    }
    return init;
  });

  // Filters
  const [sourceTab, setSourceTab] = React.useState<SourceTab>(initialSourceTab);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [locationFilter, setLocationFilter] = React.useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("ALL");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("ALL");

  // Print Studio Config
  const [symbology, setSymbology] = React.useState<SymbologyMode>("COMBO");
  const [template, setTemplate] =
    React.useState<LabelTemplateId>(initialTemplate);
  const [thermalSize, setThermalSize] = React.useState<ThermalSizeId>("50x30");
  const [spinePaperMode, setSpinePaperMode] =
    React.useState<SpinePaperMode>("A4_SHEET");
  const [a4StartSlot, setA4StartSlot] = React.useState<number>(1);
  const [qrOrigin, setQrOrigin] = React.useState<string>("");

  // Preview & Export UI state
  const [previewPageIndex, setPreviewPageIndex] = React.useState(0);
  const [zoom, setZoom] = React.useState<number>(() =>
    getDefaultZoomForTemplate(initialTemplate, "A4_SHEET"),
  );
  const [isExportingPdf, setIsExportingPdf] = React.useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const printTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return LOCATION_OPTIONS.filter((loc) => {
      if (loc.group === "DIGITAL") return false;
      if (sourceTab === "ARCHIVE") return loc.group === "ARCHIVE";
      if (sourceTab === "INVENTORY") return loc.group !== "ARCHIVE";
      return true;
    });
  }, [sourceTab]);

  // Filtered records
  const filteredRecords = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
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
      if (typeFilter === "PART_KURANG" && rec.statusTag !== "PART KURANG") {
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
    searchQuery,
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

  const pages = React.useMemo(() => {
    if (expandedQueue.length === 0) return [];
    if (template === "THERMAL") {
      return chunkIntoPages(expandedQueue, 1, 1);
    }
    if (template === "A4_GRID") {
      return chunkIntoPages(expandedQueue, A4_GRID_SPEC.perPage, a4StartSlot);
    }
    // ARCHIVE_SPINE
    if (spinePaperMode === "CUSTOM_SINGLE") {
      return chunkIntoPages(expandedQueue, 1, 1);
    }
    return chunkIntoPages(expandedQueue, SPINE_LABEL_SPEC.a4PerPage, 1);
  }, [expandedQueue, template, spinePaperMode, a4StartSlot]);

  // Clamp active preview page index when batch or template changes
  React.useEffect(() => {
    setPreviewPageIndex((prev) => {
      if (pages.length === 0) return 0;
      return Math.min(prev, pages.length - 1);
    });
  }, [pages.length]);

  const handleTemplateChange = (nextTemplate: LabelTemplateId) => {
    setTemplate(nextTemplate);
    setZoom(getDefaultZoomForTemplate(nextTemplate, spinePaperMode));
    setPreviewPageIndex(0);
  };

  const handleSpinePaperModeChange = (nextMode: SpinePaperMode) => {
    setSpinePaperMode(nextMode);
    setZoom(getDefaultZoomForTemplate("ARCHIVE_SPINE", nextMode));
    setPreviewPageIndex(0);
  };

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

  const selectedCount = batchEntries.length;
  const totalStickers = expandedQueue.length;
  const firstSelectedRecord = expandedQueue[0] ?? allRecords[0] ?? null;

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
            spinePaperMode,
            symbology,
            origin: qrOrigin,
          });

          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().slice(0, 10);
          const templateSlug =
            template === "THERMAL"
              ? `thermal-${thermalSize}`
              : template === "A4_GRID"
                ? "a4-24grid"
                : spinePaperMode === "A4_SHEET"
                  ? "spine-a4"
                  : "spine-150x35";

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

  const printPageSizeCss = getPrintPageSizeCss(
    template,
    thermalSize,
    spinePaperMode,
  );
  const previewDims = getPreviewPageDimensionsMm(
    template,
    thermalSize,
    spinePaperMode,
  );

  return (
    <>
      {/* Dynamic @page size matching the currently selected print layout */}
      <style>{`@media print { @page { size: ${printPageSizeCss}; margin: 0; } }`}</style>

      {/* Interactive Studio Workspace (hidden when printing) */}
      <div className="barcode-no-print space-y-6 print:hidden">
        {/* Top Kawaii Header */}
        <KawaiiPageHeader
          badge="Studio Cetak Stiker & Label"
          title="Barcode & Label Print Studio"
          description="Desain dan cetak stiker Code-128 & QR Code siap potong untuk inventaris terapi, aset kantor, dan punggung map arsip."
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          {/* LEFT COLUMN: Batch Selection Table */}
          <Card className="flex flex-col overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#FFE4E6]/65 pb-4 dark:border-stone-600 dark:bg-rose-950/35">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                    <span className="inline-flex size-7 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FDE68A] text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                      1
                    </span>
                    <CheckSquare className="size-4" />
                    Pilih Batch Item & Arsip
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
                    className="h-8 rounded-xl border-2 border-[#2C2623] bg-white px-2.5 font-bold text-rose-600 shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FFF1F2] hover:text-rose-700 dark:border-stone-500 dark:bg-stone-900 dark:text-rose-300"
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
                  <TabsList className="h-auto w-full gap-1 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1 sm:w-auto dark:border-stone-500 dark:bg-stone-900">
                    <TabsTrigger
                      value="ALL"
                      className="rounded-xl px-3 py-1.5 font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FDE68A] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                    >
                      Semua ({allRecords.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="INVENTORY"
                      className="rounded-xl px-3 py-1.5 font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#A7F3D0] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                    >
                      Inventaris ({items.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="ARCHIVE"
                      className="rounded-xl px-3 py-1.5 font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#BAE6FD] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                    >
                      Arsip ({archives.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-3.5 pt-4">
              {/* Filter Bar */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative sm:col-span-2">
                  <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari kode SC-..., nama, kategori, rak/laci..."
                    className="rounded-xl border-2 border-[#2C2623] bg-white pl-9 dark:border-stone-500 dark:bg-stone-900"
                  />
                </div>

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
                        {loc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={typeFilter}
                    onValueChange={(v) => setTypeFilter(v as TypeFilter)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-[195px] rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900"
                    >
                      <Filter className="mr-1.5 size-3.5" />
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
              <div className="max-h-[540px] overflow-y-auto rounded-2xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-950/40">
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
                  Default simbologi item mengikuti pengaturan master (dapat
                  diganti bebas di panel kanan).
                </span>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT COLUMN: Configuration & Live Preview */}
          <div className="flex flex-col gap-6">
            {/* Configuration Card */}
            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE]/80 pb-4 dark:border-stone-600 dark:bg-sky-950/35">
                <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                  <span className="inline-flex size-7 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#A7F3D0] text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                    2
                  </span>
                  <Tag className="size-4" />
                  Pengaturan Simbologi & Template Cetak
                </CardTitle>
                <CardDescription className="text-[#2C2623]/75 dark:text-stone-300">
                  Sesuaikan mode barcode/QR dan ukuran kertas cetak sesuai PRD
                  Section 3.2.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                {/* Symbology Selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                    Mode Simbologi
                  </Label>
                  <div className="grid gap-2.5 sm:grid-cols-3">
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
                            "flex flex-col items-start gap-1 rounded-2xl border-2 border-[#2C2623] p-3 text-left transition-all dark:border-stone-500",
                            active
                              ? "-translate-y-0.5 bg-[#D1FAE5] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-emerald-950/70 dark:text-emerald-100"
                              : "bg-white hover:-translate-y-0.5 hover:bg-[#FFFBEB] dark:bg-stone-900 dark:hover:bg-stone-800",
                          )}
                        >
                          <div className="flex w-full items-center justify-between">
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

                {/* Layout Template Selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                    Template Kertas & Stiker
                  </Label>
                  <div className="grid gap-2.5">
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
                            "flex items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] p-3 text-left transition-all dark:border-stone-500",
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

                {/* Template-Specific Sub-options */}
                {template === "THERMAL" && (
                  <div className="grid gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 sm:grid-cols-2 dark:border-stone-600 dark:bg-stone-900/60">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="thermal-size-select"
                        className="text-xs font-bold"
                      >
                        Ukuran Roll Stiker Thermal
                      </Label>
                      <Select
                        value={thermalSize}
                        onValueChange={(v) =>
                          setThermalSize(v as ThermalSizeId)
                        }
                      >
                        <SelectTrigger
                          id="thermal-size-select"
                          className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(THERMAL_SIZES).map((sz) => (
                            <SelectItem key={sz.id} value={sz.id}>
                              {sz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-muted-foreground flex items-center text-xs">
                      1 label per halaman roll thermal. Pastikan printer thermal
                      diatur ke ukuran{" "}
                      <strong className="text-foreground mx-1">
                        {THERMAL_SIZES[thermalSize].widthMm}×
                        {THERMAL_SIZES[thermalSize].heightMm} mm
                      </strong>
                      tanpa margin.
                    </div>
                  </div>
                )}

                {template === "A4_GRID" && (
                  <div className="grid gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 sm:grid-cols-2 dark:border-stone-600 dark:bg-stone-900/60">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="a4-start-slot"
                        className="text-xs font-bold"
                      >
                        Mulai dari Slot ke- (Kertas Terpakai Sebagian)
                      </Label>
                      <Select
                        value={String(a4StartSlot)}
                        onValueChange={(v) => {
                          setA4StartSlot(Number(v));
                          setPreviewPageIndex(0);
                        }}
                      >
                        <SelectTrigger
                          id="a4-start-slot"
                          className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: A4_GRID_SPEC.perPage },
                            (_, idx) => idx + 1,
                          ).map((slotNum) => (
                            <SelectItem key={slotNum} value={String(slotNum)}>
                              Slot #{slotNum} (Baris {Math.ceil(slotNum / 3)},
                              Kolom {((slotNum - 1) % 3) + 1})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-muted-foreground flex items-center text-xs">
                      Grid 3 Kolom × 8 Baris = 24 stiker/halaman A4 (62×33 mm)
                      dengan garis potong putus-putus gaya Tom & Jerry No.
                      121/103.
                    </div>
                  </div>
                )}

                {template === "ARCHIVE_SPINE" && (
                  <div className="grid gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 sm:grid-cols-2 dark:border-stone-600 dark:bg-stone-900/60">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="spine-paper-mode"
                        className="text-xs font-bold"
                      >
                        Mode Kertas Cetak Punggung Map
                      </Label>
                      <Select
                        value={spinePaperMode}
                        onValueChange={(v) =>
                          handleSpinePaperModeChange(v as SpinePaperMode)
                        }
                      >
                        <SelectTrigger
                          id="spine-paper-mode"
                          className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A4_SHEET">
                            Kertas A4 Cut-Sheet (7 Label/Halaman)
                          </SelectItem>
                          <SelectItem value="CUSTOM_SINGLE">
                            Ukuran Kustom (150 × 35 mm / Halaman)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-muted-foreground flex items-center text-xs">
                      Layout horizontal 150 × 35 mm untuk punggung map/odner
                      lemari arsip L01–L04.
                    </div>
                  </div>
                )}

                {/* QR Base Origin (only shown when QR or COMBO is selected) */}
                {symbology !== "CODE128" && (
                  <div className="space-y-1.5 rounded-2xl border-2 border-[#2C2623] bg-white p-3.5 dark:border-stone-600 dark:bg-stone-900/60">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor="qr-base-origin"
                        className="text-xs font-bold"
                      >
                        Base URL Deep-Link QR Code
                      </Label>
                      {firstSelectedRecord && (
                        <span className="text-muted-foreground max-w-[260px] truncate font-mono text-[11px]">
                          {buildQrTargetUrl(firstSelectedRecord, qrOrigin)}
                        </span>
                      )}
                    </div>
                    <Input
                      id="qr-base-origin"
                      value={qrOrigin}
                      onChange={(e) => setQrOrigin(e.target.value)}
                      placeholder="https://starops.starchamps.id"
                      className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-mono text-xs dark:border-stone-500 dark:bg-stone-950"
                    />
                  </div>
                )}

                {/* Print & PDF Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 border-t-2 border-dashed border-[#2C2623]/25 pt-4 dark:border-stone-700">
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

            {/* Live Preview Card */}
            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-[#EDE9FE]/80 pb-4 dark:border-stone-600 dark:bg-violet-950/35">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                      <span className="inline-flex size-7 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#FFE4E6] text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                        3
                      </span>
                      Live Preview Siap Cetak
                    </CardTitle>
                    <CardDescription className="mt-1 text-[#2C2623]/75 dark:text-stone-300">
                      {pages.length === 0
                        ? "Pilih minimal 1 item atau arsip untuk melihat pratinjau label."
                        : `Halaman ${previewPageIndex + 1} dari ${pages.length} · Ukuran cetak ${printPageSizeCss}`}
                    </CardDescription>
                  </div>

                  {/* Zoom & Pagination Controls */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-xl border-2 border-[#2C2623] bg-white text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                      aria-label="Perkecil pratinjau"
                      onClick={() =>
                        setZoom((z) =>
                          Math.max(0.4, Number((z - 0.15).toFixed(2))),
                        )
                      }
                    >
                      <ZoomOut className="size-3.5" />
                    </Button>
                    <span className="w-12 text-center font-mono text-xs font-extrabold text-[#2C2623] dark:text-stone-100">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-xl border-2 border-[#2C2623] bg-white text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                      aria-label="Perbesar pratinjau"
                      onClick={() =>
                        setZoom((z) =>
                          Math.min(2, Number((z + 0.15).toFixed(2))),
                        )
                      }
                    >
                      <ZoomIn className="size-3.5" />
                    </Button>

                    {pages.length > 1 && (
                      <div className="ml-1 flex items-center gap-1 border-l-2 border-[#2C2623]/25 pl-2 dark:border-stone-600">
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

              <CardContent className="pt-4">
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
                  <div className="flex max-h-[580px] justify-center overflow-auto rounded-2xl border-2 border-[#2C2623] bg-[#F5EFE6] p-6 shadow-inner dark:border-stone-500 dark:bg-stone-900/80">
                    <div
                      style={{
                        width: `${previewDims.widthMm * zoom}mm`,
                        height: `${previewDims.heightMm * zoom}mm`,
                      }}
                      className="relative shrink-0"
                    >
                      <div
                        style={{
                          transform: `scale(${zoom})`,
                          transformOrigin: "top left",
                        }}
                      >
                        <PrintableSheetDocument
                          pages={pages}
                          template={template}
                          thermalSize={thermalSize}
                          spinePaperMode={spinePaperMode}
                          symbology={symbology}
                          origin={qrOrigin}
                          mode="preview"
                          previewPageIndex={previewPageIndex}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Anatomy Reference Footer */}
                <div className="text-muted-foreground mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-2 border-dashed border-[#2C2623]/25 bg-[#FFFBEB]/80 px-3 py-2 text-[11px] dark:border-stone-700 dark:bg-stone-900/50">
                  <span>
                    <strong className="text-foreground">Anatomi Stiker:</strong>{" "}
                    Header Star Champs · Nama & Kategori · Code-128/QR · Kode
                    Monospace · Lokasi Ruang/Lemari & Rak/Laci · Part Counter /
                    Status Digital.
                  </span>
                  {firstSelectedRecord && (
                    <span className="font-mono font-semibold">
                      Default item pertama:{" "}
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

      {/* Native Browser Print Surface (all pages at 1:1 mm scale) */}
      <div id="barcode-print-root" className="barcode-print-only">
        <PrintableSheetDocument
          pages={pages}
          template={template}
          thermalSize={thermalSize}
          spinePaperMode={spinePaperMode}
          symbology={symbology}
          origin={qrOrigin}
          mode="print"
        />
      </div>
    </>
  );
}
