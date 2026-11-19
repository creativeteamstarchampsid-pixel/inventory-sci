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
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Truck,
} from "lucide-react";

import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
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
  LOCATION_LABELS,
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

export function DeliveriesClient({
  initialDeliveries,
  initialProofSignedUrls,
  inventoryItems: initialInventoryItems,
  schemaError,
}: DeliveriesClientProps) {
  const { can } = useRole();
  const canManage = can("delivery.manage");
  const canConvert = can("delivery.convert_to_stock");

  const [deliveries, setDeliveries] = useState<DeliveryLog[]>(initialDeliveries);
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

  const [detailDelivery, setDetailDelivery] = useState<DeliveryLog | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  const [convertTarget, setConvertTarget] = useState<DeliveryLog | null>(null);
  const [converting, setConverting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeliveryLog | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      const res = await getDeliveryProofSignedUrlAction(delivery.id);
      setLoadingProof(false);
      if (res.ok && res.data.signedUrl) {
        setProofSignedUrls((prev) => ({
          ...prev,
          [delivery.id]: res.data.signedUrl!,
        }));
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
    setStatusUpdatingId(deliveryId);
    setBannerError(null);
    const res = await updateDeliveryStatusAction(deliveryId, nextStatus);
    setStatusUpdatingId(null);

    if (!res.ok) {
      setBannerError(res.error);
      return;
    }

    setDeliveries((prev) =>
      prev.map((d) => (d.id === deliveryId ? res.data.delivery : d)),
    );
    if (detailDelivery?.id === deliveryId) {
      setDetailDelivery(res.data.delivery);
    }
  }

  async function handleConfirmConvert() {
    if (!convertTarget) return;
    setConverting(true);
    setBannerError(null);
    const res = await convertInboundToStockAction(convertTarget.id);
    setConverting(false);

    if (!res.ok) {
      setBannerError(res.error);
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
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setBannerError(null);
    const res = await softDeleteDeliveryAction(deleteTarget.id);
    setDeleting(false);

    if (!res.ok) {
      setBannerError(res.error);
      return;
    }

    setDeliveries((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    if (detailDelivery?.id === deleteTarget.id) {
      setDetailDelivery(null);
    }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Pengiriman &amp; Logistik
          </h1>
          <p className="text-muted-foreground text-sm">
            Pelacakan paket masuk/keluar, generator Label Barcode, Surat Jalan,
            BAST, dan konversi 1-klik ke stok inventaris.
          </p>
        </div>

        <Can action="delivery.manage">
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            Catat Pengiriman / BAST
          </Button>
        </Can>
      </div>

      {schemaError && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>Skema Database Belum Siap</AlertTitle>
          <AlertDescription>
            Gagal memuat data pengiriman: {schemaError}
          </AlertDescription>
        </Alert>
      )}

      {bannerError && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Terjadi Kesalahan</AlertTitle>
          <AlertDescription>{bannerError}</AlertDescription>
        </Alert>
      )}

      {recentConverted && (
        <Alert>
          <CheckCircle2 className="size-4 text-emerald-600" />
          <AlertTitle>
            Berhasil Konversi {recentConverted.deliveryCode} ke Stok Inventaris
          </AlertTitle>
          <AlertDescription>
            <p>
              {recentConverted.items.length} entri inventaris baru otomatis dibuat
              beserta kode &amp; barcode:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {recentConverted.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/inventory/${item.id}`}
                  className="bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs underline-offset-2 hover:underline"
                >
                  <span>{item.item_code}</span>
                  <span className="font-sans text-muted-foreground">
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
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Paket Masuk (Inbound)</span>
              <ArrowDownLeft className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{stats.inboundCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {stats.unconvertedCount} paket belum dikonversi ke stok
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Keluar &amp; BAST (Outbound)</span>
              <ArrowUpRight className="size-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{stats.outboundCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Pengiriman keluar &amp; serah terima aset/kunci
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Dalam Proses / Transit</span>
              <Truck className="text-muted-foreground size-4" />
            </CardDescription>
            <CardTitle className="text-2xl">{stats.activeTransitCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Berstatus Draf, Dikemas, atau Dalam Perjalanan
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Total Biaya Ongkir</span>
              <PackageCheck className="text-muted-foreground size-4" />
            </CardDescription>
            <CardTitle className="text-2xl">
              {formatRupiah(stats.totalShippingCost)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Akumulasi biaya logistik aktif
          </CardContent>
        </Card>
      </div>

      {/* Filters & Tabs */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <Tabs
              value={directionTab}
              onValueChange={(val) =>
                setDirectionTab(val as "ALL" | DeliveryDirection)
              }
            >
              <TabsList>
                <TabsTrigger value="ALL">
                  Semua ({deliveries.length})
                </TabsTrigger>
                <TabsTrigger value="INBOUND">
                  Inbound ({stats.inboundCount})
                </TabsTrigger>
                <TabsTrigger value="OUTBOUND">
                  Outbound / BAST ({stats.outboundCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kode, resi, kurir, barang..."
                  className="pl-8"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as "ALL" | DeliveryStatus)
                }
              >
                <SelectTrigger className="w-[180px]">
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

              <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs">
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

        <CardContent>
          {filteredDeliveries.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <Truck className="mb-2 size-8 opacity-40" />
              <p className="font-medium">Belum ada data pengiriman yang cocok</p>
              <p className="mt-1 text-xs">
                {canManage
                  ? "Klik tombol Catat Pengiriman / BAST untuk membuat log baru."
                  : "Tidak ada data pengiriman pada filter ini."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode &amp; Arah</TableHead>
                  <TableHead>Paket &amp; Kurir</TableHead>
                  <TableHead>Pengirim → Penerima</TableHead>
                  <TableHead>Isi Paket &amp; Stok</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi &amp; Dokumen</TableHead>
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
                    <TableRow key={d.id}>
                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold">
                              {d.delivery_code}
                            </span>
                            {d.is_fragile && (
                              <Badge
                                variant="destructive"
                                className="px-1.5 py-0 text-[10px]"
                              >
                                Fragile
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {DELIVERY_DIRECTION_LABELS[d.direction]}
                            </Badge>
                            {d.proof_photo_url && (
                              <Badge variant="secondary" className="gap-1 text-[10px]">
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
                        <div className="space-y-0.5 text-xs">
                          <p className="font-medium">{d.package_type}</p>
                          <p className="text-muted-foreground">
                            {d.courier_name}
                            {d.tracking_number ? ` · ${d.tracking_number}` : ""}
                          </p>
                          <p className="text-muted-foreground">
                            Ongkir: {formatRupiah(d.shipping_cost)}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-0.5 text-xs">
                          <p>
                            <span className="text-muted-foreground">Dari:</span>{" "}
                            <strong>{d.sender_name}</strong>
                          </p>
                          <p>
                            <span className="text-muted-foreground">Ke:</span>{" "}
                            <strong>{d.receiver_name}</strong>
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
                          <p className="font-medium">
                            {items.length} jenis barang (
                            {items.reduce((s, it) => s + it.qty, 0)} unit)
                          </p>
                          <p className="text-muted-foreground line-clamp-2">
                            {items
                              .map((it) => `${it.name} (${it.qty} ${it.unit_label})`)
                              .join(", ") || "-"}
                          </p>
                          {d.converted_to_stock_at && (
                            <div className="space-y-1 pt-0.5">
                              <Badge
                                variant="secondary"
                                className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
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
                                      className="bg-muted hover:bg-accent rounded px-1 py-0.5 font-mono text-[10px] underline-offset-2 hover:underline"
                                    >
                                      {li.item_code}
                                    </Link>
                                  ))}
                                  {linkedStock.length > 3 && (
                                    <span className="text-muted-foreground text-[10px]">
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
                              handleQuickStatusChange(d.id, v as DeliveryStatus)
                            }
                            disabled={statusUpdatingId === d.id}
                          >
                            <SelectTrigger size="sm" className="w-[155px]">
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
                          >
                            <Printer className="size-3.5" />
                            Dokumen
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDetailDialog(d)}
                            title="Lihat Detail & Bukti Foto"
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
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(d)}
                                title="Hapus ke Recycle Bin"
                                className="text-destructive hover:text-destructive"
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
            editingDelivery ? (proofSignedUrls[editingDelivery.id] ?? null) : null
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {detailDelivery && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{detailDelivery.delivery_code}</span>
                  <Badge variant="outline">
                    {DELIVERY_DIRECTION_LABELS[detailDelivery.direction]}
                  </Badge>
                  <Badge
                    variant={
                      DELIVERY_STATUS_BADGE_VARIANT[detailDelivery.status]
                    }
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs font-semibold uppercase">
                      Pengirim / Pihak Pertama
                    </p>
                    <p className="mt-1 font-medium">
                      {detailDelivery.sender_name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {detailDelivery.sender_address || "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs font-semibold uppercase">
                      Penerima / Pihak Kedua
                    </p>
                    <p className="mt-1 font-medium">
                      {detailDelivery.receiver_name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {detailDelivery.receiver_address || "-"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-4">
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

                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase">
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
                            <p className="font-medium">{item.name}</p>
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
                            {item.room_code} ·{" "}
                            {LOCATION_LABELS[item.room_code] ?? item.room_code}
                          </TableCell>
                          <TableCell className="text-xs">
                            {CONDITION_LABELS[item.condition] ?? item.condition}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col items-center justify-center rounded-lg border p-3">
                    <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                      Barcode Pengiriman (Code-128)
                    </p>
                    <DeliveryBarcode value={detailDelivery.delivery_code} />
                  </div>

                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
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
                        className="max-h-44 w-auto rounded border object-contain"
                      />
                    ) : (
                      <p className="text-muted-foreground py-4 text-xs">
                        Belum ada foto bukti diunggah.
                      </p>
                    )}
                  </div>
                </div>

                {detailDelivery.notes && (
                  <div className="bg-muted/40 rounded-lg border p-3 text-xs">
                    <span className="font-semibold">Catatan:</span>{" "}
                    {detailDelivery.notes}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2">
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
            <DialogTitle>Konversi Paket Masuk ke Stok Inventaris</DialogTitle>
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
            <div className="space-y-2 rounded-lg border p-3 text-xs">
              {parseDeliveryPayloadItems(convertTarget.items_payload_json).map(
                (item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between border-b pb-1.5 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-muted-foreground">
                        Prefix: <strong>{item.category_prefix}</strong> · Lokasi:{" "}
                        <strong>{item.room_code}</strong> ·{" "}
                        {ASSET_TYPE_LABELS[item.asset_type]}
                      </p>
                    </div>
                    <Badge variant="outline">
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
            <DialogTitle>Hapus Catatan Pengiriman?</DialogTitle>
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
    </div>
  );
}
