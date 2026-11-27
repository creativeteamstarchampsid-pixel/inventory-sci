"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
import { useLocations } from "@/components/providers/locations-provider";
import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
import { SharePreviewDialog } from "@/components/share/share-preview-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  convertInboundToStockAction,
  getDeliveryProofSignedUrlAction,
  softDeleteDeliveryAction,
  updateDeliveryStatusAction,
  type ConvertedStockItem,
} from "@/lib/actions/deliveries";
import {
  ASSET_TYPE_LABELS,
  CONDITION_LABELS,
  DELIVERY_DIRECTION_LABELS,
  DELIVERY_STATUS_LABELS,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import type {
  DeliveryDirection,
  DeliveryLog,
  DeliveryStatus,
} from "@/types/database";
import { DeliveryBarcode } from "./delivery-barcode";
import { DeliveryFormDialog } from "./delivery-form-dialog";
import { DeliveryPrintDialog } from "./delivery-print-dialog";
import {
  DELIVERY_STATUS_BADGE_VARIANT,
  parseDeliveryPayloadItems,
  type InventoryPickerItem,
} from "./helpers";
import type { DeliveryDocType } from "./pdf-documents";

type DeliveriesClientProps = {
  initialDeliveries: DeliveryLog[];
  initialProofSignedUrls: Record<string, string>;
  inventoryItems: InventoryPickerItem[];
  schemaError?: string | null;
};

const DELIVERY_STATUS_PILL_STYLES: Record<DeliveryStatus, string> = {
  DRAFT:
    "border-[#2C2623] bg-[#FFF7E6] text-[#5C4422] dark:border-amber-400/50 dark:bg-amber-950/50 dark:text-amber-200",
  DIKEMAS:
    "border-[#2C2623] bg-[#FEF08A] text-[#5C3D00] dark:border-yellow-400/50 dark:bg-yellow-950/50 dark:text-yellow-200",
  DALAM_PERJALANAN:
    "border-[#2C2623] bg-[#BAE6FD] text-[#0C4A6E] dark:border-sky-400/50 dark:bg-sky-950/50 dark:text-sky-200",
  DITERIMA:
    "border-[#2C2623] bg-[#FED7AA] text-[#7C2D12] dark:border-orange-400/50 dark:bg-orange-950/50 dark:text-orange-200",
  SELESAI:
    "border-[#2C2623] bg-[#A7F3D0] text-[#064E3B] dark:border-emerald-400/50 dark:bg-emerald-950/50 dark:text-emerald-200",
  DIBATALKAN:
    "border-[#2C2623] bg-[#FECDD3] text-[#881337] dark:border-rose-400/50 dark:bg-rose-950/50 dark:text-rose-200",
};

export function DeliveriesClient({
  initialDeliveries,
  initialProofSignedUrls,
  inventoryItems: initialInventoryItems,
  schemaError,
}: DeliveriesClientProps) {
  const { can } = useRole();
  const canManage = can("delivery.manage");
  const canConvert = can("delivery.convert_to_stock");
  const { showWorking, showBatch, showSuccess, showError } =
    useCartoonFeedback();
  const { getLabel } = useLocations();

  const [deliveries, setDeliveries] =
    useState<DeliveryLog[]>(initialDeliveries);
  const [proofSignedUrls, setProofSignedUrls] = useState<
    Record<string, string>
  >(initialProofSignedUrls);
  const [inventoryItems, setInventoryItems] = useState<InventoryPickerItem[]>(
    initialInventoryItems,
  );

  const [directionTab, setDirectionTab] = useState<"ALL" | DeliveryDirection>(
    "ALL",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | DeliveryStatus>(
    "ALL",
  );
  const [onlyUnconverted, setOnlyUnconverted] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<DeliveryLog | null>(
    null,
  );

  const [printOpen, setPrintOpen] = useState(false);
  const [printDelivery, setPrintDelivery] = useState<DeliveryLog | null>(null);
  const [printTab, setPrintTab] = useState<DeliveryDocType>("label");

  const [detailDelivery, setDetailDelivery] = useState<DeliveryLog | null>(
    null,
  );
  const [loadingProof, setLoadingProof] = useState(false);

  const [convertTarget, setConvertTarget] = useState<DeliveryLog | null>(null);
  const [converting, setConverting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeliveryLog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [shareDelivery, setShareDelivery] = useState<DeliveryLog | null>(null);

  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [recentConverted, setRecentConverted] = useState<{
    deliveryCode: string;
    items: ConvertedStockItem[];
  } | null>(null);

  const stats = useMemo(() => {
    const inbound = deliveries.filter((d) => d.direction === "INBOUND");
    const outbound = deliveries.filter((d) => d.direction === "OUTBOUND");
    const unconvertedInbound = inbound.filter(
      (d) => !d.converted_to_stock_at && d.status !== "DIBATALKAN",
    );
    const activeTransit = deliveries.filter((d) =>
      ["DRAFT", "DIKEMAS", "DALAM_PERJALANAN"].includes(d.status),
    );
    const totalShippingCost = deliveries
      .filter((d) => d.status !== "DIBATALKAN")
      .reduce((sum, d) => sum + (Number(d.shipping_cost) || 0), 0);

    return {
      inboundCount: inbound.length,
      outboundCount: outbound.length,
      unconvertedCount: unconvertedInbound.length,
      activeTransitCount: activeTransit.length,
      totalShippingCost,
    };
  }, [deliveries]);

  const linkedItemsByDelivery = useMemo(() => {
    const map = new Map<string, InventoryPickerItem[]>();
    for (const item of inventoryItems) {
      if (!item.source_delivery_id) continue;
      const list = map.get(item.source_delivery_id) ?? [];
      list.push(item);
      map.set(item.source_delivery_id, list);
    }
    return map;
  }, [inventoryItems]);

  const filteredDeliveries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (directionTab !== "ALL" && d.direction !== directionTab) return false;
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (
        onlyUnconverted &&
        (d.direction !== "INBOUND" ||
          Boolean(d.converted_to_stock_at) ||
          d.status === "DIBATALKAN")
      ) {
        return false;
      }
      if (!q) return true;

      const items = parseDeliveryPayloadItems(d.items_payload_json);
      const itemText = items
        .map((i) => `${i.name} ${i.item_code ?? ""}`)
        .join(" ")
        .toLowerCase();

      return (
        d.delivery_code.toLowerCase().includes(q) ||
        d.package_type.toLowerCase().includes(q) ||
        d.courier_name.toLowerCase().includes(q) ||
        (d.tracking_number ?? "").toLowerCase().includes(q) ||
        d.sender_name.toLowerCase().includes(q) ||
        d.receiver_name.toLowerCase().includes(q) ||
        (d.pic_name ?? "").toLowerCase().includes(q) ||
        itemText.includes(q)
      );
    });
  }, [deliveries, directionTab, statusFilter, onlyUnconverted, searchQuery]);

  const hasActiveFilters =
    directionTab !== "ALL" ||
    statusFilter !== "ALL" ||
    onlyUnconverted ||
    searchQuery.trim().length > 0;

  function resetFilters() {
    setDirectionTab("ALL");
    setStatusFilter("ALL");
    setOnlyUnconverted(false);
    setSearchQuery("");
  }

  function openCreateDialog() {
    setEditingDelivery(null);
    setFormOpen(true);
  }

  function openEditDialog(delivery: DeliveryLog) {
    setEditingDelivery(delivery);
    setFormOpen(true);
  }

  function openPrintDialog(
    delivery: DeliveryLog,
    docType: DeliveryDocType = "label",
  ) {
    setPrintDelivery(delivery);
    setPrintTab(docType);
    setPrintOpen(true);
  }

  async function openDetailDialog(delivery: DeliveryLog) {
    setDetailDelivery(delivery);
    if (delivery.proof_photo_url && !proofSignedUrls[delivery.id]) {
      setLoadingProof(true);
      try {
        const res = await getDeliveryProofSignedUrlAction(delivery.id);
        if (res.ok && res.data.signedUrl) {
          setProofSignedUrls((prev) => ({
            ...prev,
            [delivery.id]: res.data.signedUrl!,
          }));
        }
      } finally {
        setLoadingProof(false);
      }
    }
  }

  function handleSavedDelivery(
    saved: DeliveryLog,
    updatedProofUrl?: string | null,
  ) {
    setDeliveries((prev) => {
      const exists = prev.some((d) => d.id === saved.id);
      if (exists) {
        return prev.map((d) => (d.id === saved.id ? saved : d));
      }
      return [saved, ...prev];
    });
    if (updatedProofUrl !== undefined) {
      setProofSignedUrls((prev) => {
        const next = { ...prev };
        if (updatedProofUrl) {
          next[saved.id] = updatedProofUrl;
        } else {
          delete next[saved.id];
        }
        return next;
      });
    }
    if (detailDelivery?.id === saved.id) {
      setDetailDelivery(saved);
    }
  }

  async function handleQuickStatusChange(
    deliveryId: string,
    nextStatus: DeliveryStatus,
  ) {
    const target = deliveries.find((d) => d.id === deliveryId);
    const codeLabel = target?.delivery_code ?? "paket";
    setStatusUpdatingId(deliveryId);
    setBannerError(null);
    showWorking({
      title: "Memperbarui Status Paket...",
      message: `Dino Joguman lagi update status ${codeLabel} ke "${DELIVERY_STATUS_LABELS[nextStatus]}" biar pelacakan selalu akurat~`,
    });

    try {
      const res = await updateDeliveryStatusAction(deliveryId, nextStatus);
      setStatusUpdatingId(null);

      if (!res.ok) {
        setBannerError(res.error);
        showError({
          title: "Yah, Gagal Update Status...",
          message: res.error,
        });
        return;
      }

      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? res.data.delivery : d)),
      );
      if (detailDelivery?.id === deliveryId) {
        setDetailDelivery(res.data.delivery);
      }
      showSuccess({
        title: "Status Paket Diperbarui! ♪",
        message: `Pengiriman ${res.data.delivery.delivery_code} sekarang berstatus "${DELIVERY_STATUS_LABELS[nextStatus]}".`,
      });
    } catch (err) {
      setStatusUpdatingId(null);
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal memperbarui status pengiriman.";
      setBannerError(msg);
      showError({
        title: "Yah, Gagal Update Status...",
        message: msg,
      });
    }
  }

  async function handleConfirmConvert() {
    if (!convertTarget) return;
    const target = convertTarget;
    const itemCount = parseDeliveryPayloadItems(target.items_payload_json).length;
    setConverting(true);
    setBannerError(null);
    showBatch({
      title: "Konversi Paket ke Stok Inventaris...",
      message: `Tim mini lagi lembur memproses ${itemCount} item dari ${target.delivery_code} sekaligus — membuat kode inventaris & barcode otomatis! Tunggu sebentar ya~`,
    });

    try {
      const res = await convertInboundToStockAction(target.id);
      setConverting(false);

      if (!res.ok) {
        setBannerError(res.error);
        showError({
          title: "Yah, Konversi Stok Gagal...",
          message: res.error,
        });
        return;
      }

      const { delivery, createdItems } = res.data;
      setDeliveries((prev) =>
        prev.map((d) => (d.id === delivery.id ? delivery : d)),
      );
      if (detailDelivery?.id === delivery.id) {
        setDetailDelivery(delivery);
      }
      setInventoryItems((prev) => [
        ...createdItems.map((ci) => ({
          id: ci.id,
          item_code: ci.item_code,
          name: ci.name,
          category_prefix: ci.category_prefix,
          category: ci.category,
          asset_type: ci.asset_type,
          room_code: ci.room_code,
          condition: ci.condition,
          unit_label: ci.unit_label,
          stock_qty: ci.stock_qty,
          source_delivery_id: delivery.id,
        })),
        ...prev,
      ]);
      setRecentConverted({
        deliveryCode: delivery.delivery_code,
        items: createdItems,
      });
      setConvertTarget(null);
      showSuccess({
        title: "Yeay! Stok Inventaris Terbentuk ♪",
        message: `${createdItems.length} barang baru dari ${delivery.delivery_code} sudah masuk ke Master Inventaris beserta kode & barcode!`,
      });
    } catch (err) {
      setConverting(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal mengonversi paket ke stok inventaris.";
      setBannerError(msg);
      showError({
        title: "Yah, Konversi Stok Gagal...",
        message: msg,
      });
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    setBannerError(null);
    showWorking({
      title: "Memindahkan ke Recycle Bin...",
      message: `Dino Joguman lagi memindahkan catatan pengiriman ${target.delivery_code} ke Recycle Bin dengan aman~`,
    });

    try {
      const res = await softDeleteDeliveryAction(target.id);
      setDeleting(false);

      if (!res.ok) {
        setBannerError(res.error);
        showError({
          title: "Yah, Gagal Menghapus Data...",
          message: res.error,
        });
        return;
      }

      setDeliveries((prev) => prev.filter((d) => d.id !== target.id));
      if (detailDelivery?.id === target.id) {
        setDetailDelivery(null);
      }
      setDeleteTarget(null);
      showSuccess({
        title: "Pengiriman Dipindahkan! ♪",
        message: `Catatan ${target.delivery_code} sudah aman di Recycle Bin dan dapat dipulihkan dalam 30 hari.`,
      });
    } catch (err) {
      setDeleting(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal menghapus catatan pengiriman.";
      setBannerError(msg);
      showError({
        title: "Yah, Gagal Menghapus Data...",
        message: msg,
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* 2D Japanese Cartoon Page Header */}
      <KawaiiPageHeader
        badge="Logistik & Paket"
        title="Pengiriman & Logistik"
        description="Pelacakan paket masuk/keluar, generator Label Barcode, Surat Jalan, BAST, dan konversi 1-klik ke stok inventaris."
        accent="peach"
        mascot="truck"
        actions={
          <Can action="delivery.manage">
            <Button
              onClick={openCreateDialog}
              className="rounded-2xl border-2 border-[#2C2623] bg-[#FF9E6D] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#FF8C54] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-[#F5E9D6]/70"
            >
              <Plus className="size-4 stroke-[2.5]" />
              Catat Pengiriman / BAST
            </Button>
          </Can>
        }
      />

      {schemaError && (
        <Alert
          variant="warning"
          className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-400/50 dark:bg-amber-950/40"
        >
          <AlertTriangle className="size-4" />
          <AlertTitle className="font-extrabold">
            Skema Database Belum Siap
          </AlertTitle>
          <AlertDescription>
            Gagal memuat data pengiriman: {schemaError}
          </AlertDescription>
        </Alert>
      )}

      {bannerError && (
        <Alert
          variant="destructive"
          className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] shadow-[3px_3px_0px_0px_#2C2623] dark:border-rose-400/50 dark:bg-rose-950/40"
        >
          <AlertTriangle className="size-4" />
          <AlertTitle className="font-extrabold">Terjadi Kesalahan</AlertTitle>
          <AlertDescription>{bannerError}</AlertDescription>
        </Alert>
      )}

      {recentConverted && (
        <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5] text-[#14532D] shadow-[3px_3px_0px_0px_#2C2623] dark:border-emerald-400/50 dark:bg-emerald-950/50 dark:text-emerald-100">
          <CheckCircle2 className="size-4 text-emerald-700 dark:text-emerald-300" />
          <AlertTitle className="flex items-center gap-1.5 font-extrabold">
            <Sparkles className="size-4" />
            Berhasil Konversi {recentConverted.deliveryCode} ke Stok Inventaris!
          </AlertTitle>
          <AlertDescription>
            <p className="font-medium">
              {recentConverted.items.length} entri inventaris baru otomatis
              dibuat beserta kode &amp; barcode:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recentConverted.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/inventory/${item.id}`}
                  className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] bg-[#FFFDF7] px-2.5 py-0.5 font-mono text-xs font-bold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 hover:bg-[#FEF9C3] dark:border-emerald-300/60 dark:bg-emerald-900/60 dark:text-emerald-100"
                >
                  <span>{item.item_code}</span>
                  <span className="font-sans text-[11px] font-semibold opacity-80">
                    · {item.name} ({item.stock_qty})
                  </span>
                </Link>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KawaiiStatCard
          label="Paket Masuk (Inbound)"
          value={stats.inboundCount}
          hint={`${stats.unconvertedCount} paket belum dikonversi ke stok`}
          accent="mint"
          icon={
            <ArrowDownLeft className="size-4 text-emerald-700 dark:text-emerald-300" />
          }
        />

        <KawaiiStatCard
          label="Keluar & BAST (Outbound)"
          value={stats.outboundCount}
          hint="Pengiriman keluar & serah terima aset/kunci"
          accent="sky"
          icon={
            <ArrowUpRight className="size-4 text-sky-700 dark:text-sky-300" />
          }
        />

        <KawaiiStatCard
          label="Dalam Proses / Transit"
          value={stats.activeTransitCount}
          hint="Berstatus Draf, Dikemas, atau Dalam Perjalanan"
          accent="peach"
          icon={
            <Truck className="size-4 text-orange-700 dark:text-orange-300" />
          }
        />

        <KawaiiStatCard
          label="Total Biaya Ongkir"
          value={formatRupiah(stats.totalShippingCost)}
          hint="Akumulasi biaya logistik aktif"
          accent="butter"
          icon={
            <PackageCheck className="size-4 text-amber-700 dark:text-amber-300" />
          }
        />
      </div>

      {/* Filters, Tabs & Table Card */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-card dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
        <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#FFF1E6]/85 pb-4 dark:border-stone-700 dark:bg-orange-950/20">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <Tabs
              value={directionTab}
              onValueChange={(val) =>
                setDirectionTab(val as "ALL" | DeliveryDirection)
              }
            >
              <TabsList className="h-auto w-full flex-wrap justify-start rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1 shadow-[2px_2px_0px_0px_#2C2623] sm:w-auto dark:border-stone-600 dark:bg-background">
                <TabsTrigger
                  value="ALL"
                  className="rounded-xl font-bold data-[state=active]:border-[1.5px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FFE8D6] data-[state=active]:text-[#2C2623]"
                >
                  Semua ({deliveries.length})
                </TabsTrigger>
                <TabsTrigger
                  value="INBOUND"
                  className="rounded-xl font-bold data-[state=active]:border-[1.5px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#D1FAE5] data-[state=active]:text-[#14532D]"
                >
                  Inbound ({stats.inboundCount})
                </TabsTrigger>
                <TabsTrigger
                  value="OUTBOUND"
                  className="rounded-xl font-bold data-[state=active]:border-[1.5px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#DBEAFE] data-[state=active]:text-[#1E3A8A]"
                >
                  Outbound / BAST ({stats.outboundCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kode, resi, kurir, barang..."
                  className="rounded-xl border-2 border-[#2C2623] bg-white pl-9 dark:border-stone-600 dark:bg-background"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as "ALL" | DeliveryStatus)
                }
              >
                <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold sm:w-[180px] dark:border-stone-600 dark:bg-background">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  {(Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[]).map(
                    (st) => (
                      <SelectItem key={st} value={st}>
                        {DELIVERY_STATUS_LABELS[st]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>

              <label className="flex w-full cursor-pointer items-center gap-2 rounded-xl border-2 border-[#2C2623] bg-[#FEF9C3]/85 px-3 py-2 text-xs font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] transition-colors hover:bg-[#FEF08A] sm:w-auto dark:border-amber-400/50 dark:bg-amber-950/50 dark:text-amber-100">
                <Checkbox
                  checked={onlyUnconverted}
                  onCheckedChange={(checked) =>
                    setOnlyUnconverted(checked === true)
                  }
                />
                <span>Belum Konversi Stok</span>
              </label>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {filteredDeliveries.length === 0 ? (
            <KawaiiEmptyState
              mascot="truck"
              title="Belum ada paket yang cocok nih~"
              description={
                hasActiveFilters
                  ? "Coba ubah kata kunci pencarian atau reset filter untuk melihat semua paket."
                  : canManage
                    ? "Klik tombol Catat Pengiriman / BAST untuk membuat log paket masuk atau keluar baru!"
                    : "Belum ada data pengiriman yang tercatat pada halaman ini."
              }
              action={
                hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetFilters}
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF9C3] font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF08A]"
                  >
                    <RotateCcw className="size-4" />
                    Reset Filter
                  </Button>
                ) : canManage ? (
                  <Button
                    type="button"
                    onClick={openCreateDialog}
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FF9E6D] font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FF8C54]"
                  >
                    <Plus className="size-4" />
                    Catat Pengiriman / BAST
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border-2 border-[#2C2623]/20 dark:border-stone-700">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 border-[#2C2623]/20 bg-[#FEF7E5] hover:bg-[#FEF7E5] dark:bg-stone-900/60">
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Kode &amp; Arah
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Paket &amp; Kurir
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Pengirim → Penerima
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Isi Paket &amp; Stok
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Status
                    </TableHead>
                    <TableHead className="text-right font-extrabold text-[#2C2623] dark:text-foreground">
                      Aksi &amp; Dokumen
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.map((d) => {
                    const items = parseDeliveryPayloadItems(d.items_payload_json);
                    const linkedStock = linkedItemsByDelivery.get(d.id) ?? [];
                    const canShowConvert =
                      canConvert &&
                      d.direction === "INBOUND" &&
                      d.status !== "DIBATALKAN" &&
                      !d.converted_to_stock_at;

                    return (
                      <TableRow
                        key={d.id}
                        className="transition-colors hover:bg-[#FFF6EC]/80 dark:hover:bg-orange-950/15"
                      >
                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFF4D6] px-2 py-0.5 font-mono text-xs font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-amber-400/60 dark:bg-amber-950/60 dark:text-amber-100">
                                <Package className="size-3" />
                                {d.delivery_code}
                              </span>
                              {d.is_fragile && (
                                <Badge
                                  variant="destructive"
                                  className="rounded-full border-[1.5px] border-[#2C2623] bg-[#FFE4E6] px-2 py-0 text-[10px] font-extrabold text-[#9F1239] dark:border-rose-400/60 dark:bg-rose-950/70 dark:text-rose-200"
                                >
                                  Fragile!
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={
                                  d.direction === "INBOUND"
                                    ? "gap-1 rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] px-2 py-0 text-[10px] font-bold text-[#14532D] dark:border-emerald-400/50 dark:bg-emerald-950/60 dark:text-emerald-200"
                                    : "gap-1 rounded-full border-[1.5px] border-[#2C2623] bg-[#DBEAFE] px-2 py-0 text-[10px] font-bold text-[#1E3A8A] dark:border-sky-400/50 dark:bg-sky-950/60 dark:text-sky-200"
                                }
                              >
                                {d.direction === "INBOUND" ? (
                                  <ArrowDownLeft className="size-2.5" />
                                ) : (
                                  <ArrowUpRight className="size-2.5" />
                                )}
                                {DELIVERY_DIRECTION_LABELS[d.direction]}
                              </Badge>
                              {d.proof_photo_url && (
                                <Badge
                                  variant="secondary"
                                  className="gap-1 rounded-full border-[1.5px] border-[#2C2623] bg-[#EDE9FE] px-2 py-0 text-[10px] font-bold text-[#4C1D95] dark:border-violet-400/50 dark:bg-violet-950/60 dark:text-violet-200"
                                >
                                  <ImageIcon className="size-2.5" />
                                  Foto
                                </Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground text-[11px]">
                              {formatDateWIB(d.created_at, true)}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1 text-xs">
                            <p className="font-bold text-[#2C2623] dark:text-foreground">
                              {d.package_type}
                            </p>
                            <p className="text-muted-foreground">
                              {d.courier_name}
                              {d.tracking_number
                                ? ` · ${d.tracking_number}`
                                : ""}
                            </p>
                            <span className="inline-block rounded-lg border border-[#2C2623]/25 bg-[#FEF9C3]/70 px-1.5 py-0.5 text-[11px] font-semibold text-[#5C3D00] dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200">
                              Ongkir: {formatRupiah(d.shipping_cost)}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1 text-xs">
                            <p>
                              <span className="text-muted-foreground">
                                Dari:
                              </span>{" "}
                              <strong className="text-[#2C2623] dark:text-foreground">
                                {d.sender_name}
                              </strong>
                            </p>
                            <p>
                              <span className="text-muted-foreground">Ke:</span>{" "}
                              <strong className="text-[#2C2623] dark:text-foreground">
                                {d.receiver_name}
                              </strong>
                            </p>
                            {d.pic_name && (
                              <p className="text-muted-foreground">
                                PIC: {d.pic_name}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="max-w-[260px] align-top whitespace-normal">
                          <div className="space-y-1 text-xs">
                            <p className="font-bold text-[#2C2623] dark:text-foreground">
                              {items.length} jenis barang (
                              {items.reduce((s, it) => s + it.qty, 0)} unit)
                            </p>
                            <p className="text-muted-foreground line-clamp-2">
                              {items
                                .map(
                                  (it) =>
                                    `${it.name} (${it.qty} ${it.unit_label})`,
                                )
                                .join(", ") || "-"}
                            </p>
                            {d.converted_to_stock_at && (
                              <div className="space-y-1 pt-0.5">
                                <Badge
                                  variant="secondary"
                                  className="rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] text-[10px] font-bold text-[#065F46] dark:border-emerald-400/50 dark:bg-emerald-950/60 dark:text-emerald-200"
                                >
                                  <CheckCircle2 className="size-3" />
                                  Stok Dikonversi ·{" "}
                                  {formatDateWIB(d.converted_to_stock_at)}
                                </Badge>
                                {linkedStock.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {linkedStock.slice(0, 3).map((li) => (
                                      <Link
                                        key={li.id}
                                        href={`/inventory/${li.id}`}
                                        className="rounded-lg border border-[#2C2623]/40 bg-[#FFFDF7] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#2C2623] transition-colors hover:bg-[#FEF08A] dark:border-stone-600 dark:bg-muted dark:text-foreground"
                                      >
                                        {li.item_code}
                                      </Link>
                                    ))}
                                    {linkedStock.length > 3 && (
                                      <span className="text-muted-foreground text-[10px] font-semibold">
                                        +{linkedStock.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          {canManage ? (
                            <Select
                              value={d.status}
                              onValueChange={(v) =>
                                handleQuickStatusChange(
                                  d.id,
                                  v as DeliveryStatus,
                                )
                              }
                              disabled={statusUpdatingId === d.id}
                            >
                              <SelectTrigger
                                size="sm"
                                className={`w-[162px] rounded-xl border-2 font-bold shadow-[2px_2px_0px_0px_#2C2623] ${DELIVERY_STATUS_PILL_STYLES[d.status]}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(
                                  Object.keys(
                                    DELIVERY_STATUS_LABELS,
                                  ) as DeliveryStatus[]
                                ).map((st) => (
                                  <SelectItem key={st} value={st}>
                                    {DELIVERY_STATUS_LABELS[st]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              variant={DELIVERY_STATUS_BADGE_VARIANT[d.status]}
                              className={`rounded-full border-[1.5px] font-bold ${DELIVERY_STATUS_PILL_STYLES[d.status]}`}
                            >
                              {DELIVERY_STATUS_LABELS[d.status]}
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right align-top">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {canShowConvert && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => setConvertTarget(d)}
                                title="Konversi 1-Klik ke Master Inventaris"
                                className="rounded-xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#14532D] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#34D399] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none dark:border-emerald-300/60"
                              >
                                <Boxes className="size-3.5" />
                                Konversi Stok
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPrintDialog(d, "label")}
                              title="Cetak / Unduh Label, Surat Jalan & BAST"
                              className="rounded-xl border-2 border-[#2C2623] bg-[#E0F2FE] font-bold text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#BAE6FD] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none dark:border-sky-400/50 dark:bg-sky-950/60 dark:text-sky-100"
                            >
                              <Printer className="size-3.5" />
                              Dokumen
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShareDelivery(d)}
                              title="Bagikan Link Pendek Pratinjau Surat Jalan / Pengiriman"
                              className="rounded-xl border-2 border-[#2C2623] bg-[#CCFBF1] font-extrabold text-[#115E59] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#99F6E4] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none dark:border-teal-400/50 dark:bg-teal-950/60 dark:text-teal-200"
                            >
                              <Share2 className="size-3.5" />
                              Share
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openDetailDialog(d)}
                              title="Lihat Detail & Bukti Foto"
                              className="rounded-xl border border-transparent hover:border-[#2C2623]/30 hover:bg-[#FEF3C7]"
                            >
                              <Eye className="size-3.5" />
                            </Button>

                            {canManage && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditDialog(d)}
                                  title="Ubah Data"
                                  className="rounded-xl border border-transparent hover:border-[#2C2623]/30 hover:bg-[#FFEDD5]"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteTarget(d)}
                                  title="Hapus ke Recycle Bin"
                                  className="text-destructive hover:text-destructive rounded-xl border border-transparent hover:border-[#2C2623]/30 hover:bg-[#FFE4E6]"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      {canManage && (
        <DeliveryFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          editingDelivery={editingDelivery}
          initialDirection={
            directionTab === "OUTBOUND" ? "OUTBOUND" : "INBOUND"
          }
          existingProofUrl={
            editingDelivery
              ? (proofSignedUrls[editingDelivery.id] ?? null)
              : null
          }
          inventoryItems={inventoryItems}
          onSaved={handleSavedDelivery}
        />
      )}

      {/* Print / PDF Document Dialog */}
      <DeliveryPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        delivery={printDelivery}
        initialTab={printTab}
      />

      {/* Detail & Proof Photo Dialog */}
      <Dialog
        open={Boolean(detailDelivery)}
        onOpenChange={(open) => {
          if (!open) setDetailDelivery(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          {detailDelivery && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="rounded-xl border-2 border-[#2C2623] bg-[#FFF4D6] px-2.5 py-0.5 font-mono text-sm font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-400/50 dark:bg-amber-950/60 dark:text-amber-100">
                    {detailDelivery.delivery_code}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      detailDelivery.direction === "INBOUND"
                        ? "rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] font-bold text-[#14532D]"
                        : "rounded-full border-[1.5px] border-[#2C2623] bg-[#DBEAFE] font-bold text-[#1E3A8A]"
                    }
                  >
                    {DELIVERY_DIRECTION_LABELS[detailDelivery.direction]}
                  </Badge>
                  <Badge
                    variant={
                      DELIVERY_STATUS_BADGE_VARIANT[detailDelivery.status]
                    }
                    className={`rounded-full border-[1.5px] font-bold ${DELIVERY_STATUS_PILL_STYLES[detailDelivery.status]}`}
                  >
                    {DELIVERY_STATUS_LABELS[detailDelivery.status]}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {detailDelivery.package_type} · Kurir:{" "}
                  {detailDelivery.courier_name}
                  {detailDelivery.tracking_number
                    ? ` (${detailDelivery.tracking_number})`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                  <div className="rounded-2xl border-2 border-[#2C2623]/70 bg-[#FFF4E6] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-orange-950/25">
                    <p className="text-muted-foreground text-[11px] font-extrabold tracking-wide uppercase">
                      Pengirim / Pihak Pertama
                    </p>
                    <p className="mt-1 font-bold">
                      {detailDelivery.sender_name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {detailDelivery.sender_address || "-"}
                    </p>
                  </div>
                  <div className="rounded-2xl border-2 border-[#2C2623]/70 bg-[#EFF6FF] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-sky-950/25">
                    <p className="text-muted-foreground text-[11px] font-extrabold tracking-wide uppercase">
                      Penerima / Pihak Kedua
                    </p>
                    <p className="mt-1 font-bold">
                      {detailDelivery.receiver_name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {detailDelivery.receiver_address || "-"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-[#2C2623]/60 bg-[#FEFCE8] p-3.5 text-xs sm:grid-cols-4 dark:border-stone-600 dark:bg-amber-950/20 [&>*]:min-w-0">
                  <div>
                    <span className="text-muted-foreground">PIC:</span>{" "}
                    <strong>{detailDelivery.pic_name || "-"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ongkir:</span>{" "}
                    <strong>
                      {formatRupiah(detailDelivery.shipping_cost)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Dikirim:</span>{" "}
                    <strong>
                      {formatDateWIB(detailDelivery.shipped_at, true)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Diterima:</span>{" "}
                    <strong>
                      {formatDateWIB(detailDelivery.received_at, true)}
                    </strong>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden rounded-2xl border-2 border-[#2C2623]/60 bg-white p-3.5 dark:border-stone-600 dark:bg-card">
                  <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">
                    Rincian Barang
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Barang</TableHead>
                        <TableHead>Kode</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Lokasi</TableHead>
                        <TableHead>Kondisi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parseDeliveryPayloadItems(
                        detailDelivery.items_payload_json,
                      ).map((item, idx) => (
                        <TableRow key={item.id || idx}>
                          <TableCell className="whitespace-normal">
                            <p className="font-semibold">{item.name}</p>
                            <p className="text-muted-foreground text-xs">
                              {ASSET_TYPE_LABELS[item.asset_type]} ·{" "}
                              {item.category}
                            </p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.item_code || "-"}
                          </TableCell>
                          <TableCell>
                            {item.qty} {item.unit_label}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.room_code} · {getLabel(item.room_code)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {CONDITION_LABELS[item.condition] ?? item.condition}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-[#2C2623]/70 bg-white p-3.5 text-slate-900">
                    <p className="mb-2 text-xs font-extrabold tracking-wide text-slate-600 uppercase">
                      Barcode Pengiriman (Code-128)
                    </p>
                    <DeliveryBarcode value={detailDelivery.delivery_code} />
                  </div>

                  <div className="rounded-2xl border-2 border-[#2C2623]/70 bg-[#F8FAFC] p-3.5 dark:border-stone-600 dark:bg-muted/30">
                    <p className="text-muted-foreground mb-2 text-xs font-extrabold tracking-wide uppercase">
                      Bukti Foto Pengiriman / Penerimaan
                    </p>
                    {loadingProof ? (
                      <div className="text-muted-foreground flex items-center gap-2 py-6 text-xs">
                        <Loader2 className="size-4 animate-spin" />
                        Memuat tautan foto aman...
                      </div>
                    ) : proofSignedUrls[detailDelivery.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proofSignedUrls[detailDelivery.id]}
                        alt={`Bukti ${detailDelivery.delivery_code}`}
                        className="max-h-44 w-auto rounded-xl border-2 border-[#2C2623]/40 object-contain"
                      />
                    ) : (
                      <p className="text-muted-foreground py-4 text-xs">
                        Belum ada foto bukti diunggah.
                      </p>
                    )}
                  </div>
                </div>

                {detailDelivery.notes && (
                  <div className="rounded-2xl border-2 border-[#2C2623]/50 bg-[#FFF7ED] p-3 text-xs dark:border-stone-600 dark:bg-muted/40">
                    <span className="font-extrabold">Catatan:</span>{" "}
                    {detailDelivery.notes}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShareDelivery(detailDelivery)}
                  className="rounded-xl border-2 border-[#2C2623] bg-[#CCFBF1] font-extrabold text-[#115E59] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#99F6E4]"
                >
                  <Share2 className="size-4" />
                  Share Link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openPrintDialog(detailDelivery, "label")}
                >
                  <Printer className="size-4" />
                  Label
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openPrintDialog(detailDelivery, "surat-jalan")}
                >
                  <FileText className="size-4" />
                  Surat Jalan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openPrintDialog(detailDelivery, "bast")}
                >
                  <FileText className="size-4" />
                  BAST
                </Button>
                {canConvert &&
                  detailDelivery.direction === "INBOUND" &&
                  detailDelivery.status !== "DIBATALKAN" &&
                  !detailDelivery.converted_to_stock_at && (
                    <Button
                      type="button"
                      onClick={() => setConvertTarget(detailDelivery)}
                      className="rounded-xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#14532D] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#34D399]"
                    >
                      <Boxes className="size-4" />
                      1-Klik Konversi ke Stok
                    </Button>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 1-Click Convert Inbound to Stock Confirmation Dialog */}
      <Dialog
        open={Boolean(convertTarget)}
        onOpenChange={(open) => {
          if (!open && !converting) setConvertTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-extrabold">
              <Boxes className="size-5 text-emerald-600" />
              Konversi Paket Masuk ke Stok Inventaris
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan membuat data barang baru di{" "}
              <code>items_master</code> dengan{" "}
              <code>source_delivery_id</code> tertaut ke{" "}
              <strong className="font-mono">
                {convertTarget?.delivery_code}
              </strong>{" "}
              dan men-generate <code>item_code</code> serta barcode otomatis.
            </DialogDescription>
          </DialogHeader>

          {convertTarget && (
            <div className="space-y-2 rounded-2xl border-2 border-[#2C2623]/70 bg-[#ECFDF5] p-3.5 text-xs dark:border-emerald-400/40 dark:bg-emerald-950/30">
              {parseDeliveryPayloadItems(convertTarget.items_payload_json).map(
                (item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2C2623]/15 pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold break-words">{item.name}</p>
                      <p className="text-muted-foreground">
                        Prefix: <strong>{item.category_prefix}</strong> · Lokasi:{" "}
                        <strong>{item.room_code}</strong> ({getLabel(item.room_code)}) ·{" "}
                        {ASSET_TYPE_LABELS[item.asset_type]}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full border-[1.5px] border-[#2C2623] bg-white font-bold text-[#2C2623] dark:bg-background dark:text-foreground"
                    >
                      {item.split_units &&
                      item.asset_type !== "CONSUMABLE" &&
                      item.qty > 1
                        ? `${item.qty} kode unik`
                        : `Qty ${item.qty} ${item.unit_label}`}
                    </Badge>
                  </div>
                ),
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConvertTarget(null)}
              disabled={converting}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleConfirmConvert}
              disabled={converting}
              className="rounded-xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#14532D] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#34D399]"
            >
              {converting && <Loader2 className="size-4 animate-spin" />}
              Konversi Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Soft Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extrabold">
              Hapus Catatan Pengiriman?
            </DialogTitle>
            <DialogDescription>
              Pengiriman{" "}
              <strong className="font-mono">
                {deleteTarget?.delivery_code}
              </strong>{" "}
              akan dipindahkan ke Recycle Bin dan masih dapat dipulihkan dalam
              30 hari.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Hapus ke Recycle Bin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SharePreviewDialog
        open={Boolean(shareDelivery)}
        onOpenChange={(open) => {
          if (!open) setShareDelivery(null);
        }}
        target={
          shareDelivery
            ? {
                type: "DELIVERY",
                id: shareDelivery.id,
                code: shareDelivery.delivery_code,
                title:
                  shareDelivery.package_type?.trim() ||
                  `${shareDelivery.sender_name} → ${shareDelivery.receiver_name}`,
                locationCode: null,
              }
            : null
        }
      />
    </div>
  );
}
