"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Eye,
  Loader2,
  Package,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  softDeleteItemAction,
  updateItemHygieneAction,
  updateItemPartsAction,
} from "@/lib/actions/inventory";
import {
  ASSET_TYPE_LABELS,
  CATEGORY_PREFIX_OPTIONS,
  CONDITION_LABELS,
  HYGIENE_LABELS,
  INVENTORY_LOCATION_OPTIONS,
  LOCATION_LABELS,
  calculateBookValue,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import type {
  AssetType,
  CodeCategoryPrefix,
  HygieneStatus,
  ItemCondition,
  ItemMaster,
  LocationCode,
} from "@/types/database";
import {
  AssetTypeBadge,
  ConditionBadge,
  HygieneBadge,
  PartProgressIndicator,
  isSanitizationOverdue,
} from "./inventory-badges";
import { ItemFormDialog } from "./item-form-dialog";

const ALL_OPTION = "__ALL__";

type InventoryClientProps = {
  items: ItemMaster[];
  signedPhotoUrls: Record<string, string>;
  todayWib: string;
};

export function InventoryClient({
  items,
  signedPhotoUrls,
  todayWib,
}: InventoryClientProps) {
  const { can } = useRole();

  const [search, setSearch] = useState("");
  const [prefixFilter, setPrefixFilter] = useState<string>(ALL_OPTION);
  const [roomFilter, setRoomFilter] = useState<string>(ALL_OPTION);
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>(ALL_OPTION);
  const [conditionFilter, setConditionFilter] = useState<string>(ALL_OPTION);
  const [hygieneFilter, setHygieneFilter] = useState<string>(ALL_OPTION);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemMaster | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemMaster | null>(null);
  const [partDialogItem, setPartDialogItem] = useState<ItemMaster | null>(null);
  const [partCountInput, setPartCountInput] = useState<string>("1");

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parentCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      map.set(item.id, item.item_code);
    }
    return map;
  }, [items]);

  const lowStockItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.asset_type === "CONSUMABLE" &&
          item.stock_qty <= item.min_stock_threshold,
      ),
    [items],
  );

  const partKurangCount = useMemo(
    () => items.filter((item) => item.condition === "PART_KURANG").length,
    [items],
  );

  const sanitizationAlertCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.asset_type === "THERAPY_TOY" &&
          (item.hygiene_status !== "STERIL" ||
            isSanitizationOverdue(item.asset_type, item.next_sanitization_due, todayWib)),
      ).length,
    [items, todayWib],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (prefixFilter !== ALL_OPTION && item.category_prefix !== (prefixFilter as CodeCategoryPrefix)) {
        return false;
      }
      if (roomFilter !== ALL_OPTION && item.room_code !== (roomFilter as LocationCode)) {
        return false;
      }
      if (assetTypeFilter !== ALL_OPTION && item.asset_type !== (assetTypeFilter as AssetType)) {
        return false;
      }
      if (conditionFilter !== ALL_OPTION && item.condition !== (conditionFilter as ItemCondition)) {
        return false;
      }
      if (hygieneFilter !== ALL_OPTION && item.hygiene_status !== (hygieneFilter as HygieneStatus)) {
        return false;
      }
      if (
        lowStockOnly &&
        !(item.asset_type === "CONSUMABLE" && item.stock_qty <= item.min_stock_threshold)
      ) {
        return false;
      }
      if (!query) return true;
      return (
        item.item_code.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.rack_location?.toLowerCase().includes(query) ?? false) ||
        (item.pic_name?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [
    items,
    search,
    prefixFilter,
    roomFilter,
    assetTypeFilter,
    conditionFilter,
    hygieneFilter,
    lowStockOnly,
  ]);

  const hasActiveFilters =
    search.trim() !== "" ||
    prefixFilter !== ALL_OPTION ||
    roomFilter !== ALL_OPTION ||
    assetTypeFilter !== ALL_OPTION ||
    conditionFilter !== ALL_OPTION ||
    hygieneFilter !== ALL_OPTION ||
    lowStockOnly;

  const resetFilters = () => {
    setSearch("");
    setPrefixFilter(ALL_OPTION);
    setRoomFilter(ALL_OPTION);
    setAssetTypeFilter(ALL_OPTION);
    setConditionFilter(ALL_OPTION);
    setHygieneFilter(ALL_OPTION);
    setLowStockOnly(false);
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (item: ItemMaster) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  const handleHygieneChange = (itemId: string, nextStatus: HygieneStatus) => {
    setFeedback(null);
    setPendingRowId(itemId);
    startTransition(async () => {
      const res = await updateItemHygieneAction(itemId, nextStatus);
      setPendingRowId(null);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Status sanitasi diperbarui." });
    });
  };

  const handleOpenPartDialog = (item: ItemMaster) => {
    setPartDialogItem(item);
    setPartCountInput(String(item.current_parts));
  };

  const handleSavePartCount = (event: React.FormEvent) => {
    event.preventDefault();
    if (!partDialogItem) return;
    const targetId = partDialogItem.id;
    const nextParts = Math.trunc(Number(partCountInput));
    setFeedback(null);
    setPendingRowId(targetId);

    startTransition(async () => {
      const res = await updateItemPartsAction(targetId, nextParts);
      setPendingRowId(null);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setPartDialogItem(null);
      setFeedback({ type: "success", text: res.message ?? "Jumlah part diperbarui." });
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    setFeedback(null);
    setPendingRowId(targetId);
    startTransition(async () => {
      const res = await softDeleteItemAction(targetId);
      setPendingRowId(null);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setDeleteTarget(null);
      setFeedback({ type: "success", text: res.message ?? "Item dihapus." });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventaris & Alat Terapi</h1>
          <p className="text-muted-foreground text-sm">
            Master barang, tracking kelengkapan kepingan, jadwal sterilisasi mingguan & nilai buku aset.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/scan">
              <QrCode className="size-4" />
              Scan Pinjam / Kembali
            </Link>
          </Button>
          <Can action="inventory.create">
            <Button onClick={handleOpenCreate}>
              <Plus className="size-4" />
              Tambah Item
            </Button>
          </Can>
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          <AlertDescription>{feedback.text}</AlertDescription>
        </Alert>
      )}

      {lowStockItems.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            Peringatan Stok Menipis ({lowStockItems.length} Barang Habis Pakai)
          </AlertTitle>
          <AlertDescription className="w-full">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p>
                {lowStockItems
                  .slice(0, 4)
                  .map(
                    (i) =>
                      `${i.name} (${i.stock_qty}/${i.min_stock_threshold} ${i.unit_label})`,
                  )
                  .join(" · ")}
                {lowStockItems.length > 4 ? ` · +${lowStockItems.length - 4} lainnya` : ""}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLowStockOnly(true)}
                className="shrink-0 bg-white/70 dark:bg-black/20"
              >
                Tampilkan Low-Stock
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Total Item Aktif</span>
              <Package className="text-muted-foreground size-4" />
            </CardDescription>
            <CardTitle className="text-2xl">{items.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Ditampilkan: {filteredItems.length} item
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Part Kurang</span>
              <Boxes className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{partKurangCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Mainan dengan kepingan tidak lengkap
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Perlu / Terlambat Sanitasi</span>
              <Sparkles className="size-4 text-sky-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{sanitizationAlertCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Mainan terapi perlu dicuci atau lewat jadwal 7 hari
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Consumable Low-Stock</span>
              <AlertTriangle className="size-4 text-red-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{lowStockItems.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Stok ≤ batas minimum threshold
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter & Pencarian</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode (SC-...), nama, rak, PIC…"
                className="pl-8"
              />
            </div>

            <Select value={prefixFilter} onValueChange={setPrefixFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Prefix Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Semua Prefix</SelectItem>
                {CATEGORY_PREFIX_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={roomFilter} onValueChange={setRoomFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Lokasi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Semua Ruangan</SelectItem>
                {INVENTORY_LOCATION_OPTIONS.map((loc) => (
                  <SelectItem key={loc.value} value={loc.value}>
                    {loc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tipe Aset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Semua Tipe Aset</SelectItem>
                {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {ASSET_TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Kondisi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Semua Kondisi</SelectItem>
                {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {CONDITION_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-52">
                <Select value={hygieneFilter} onValueChange={setHygieneFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Status Sanitasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPTION}>Semua Status Sanitasi</SelectItem>
                    {(Object.keys(HYGIENE_LABELS) as HygieneStatus[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {HYGIENE_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-low-stock"
                  checked={lowStockOnly}
                  onCheckedChange={(checked) => setLowStockOnly(checked === true)}
                />
                <Label htmlFor="filter-low-stock" className="cursor-pointer text-sm">
                  Hanya Consumable Low-Stock
                </Label>
              </div>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw className="size-3.5" />
                Reset Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <Package className="text-muted-foreground size-10 opacity-50" />
              <p className="font-medium">Tidak ada item yang cocok</p>
              <p className="text-muted-foreground text-sm">
                Ubah filter pencarian atau tambahkan item inventaris baru.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode & Foto</TableHead>
                  <TableHead>Nama & Kategori</TableHead>
                  <TableHead>Lokasi</TableHead>
                  <TableHead>Part / Stok</TableHead>
                  <TableHead>Kondisi</TableHead>
                  <TableHead>Sanitasi</TableHead>
                  <TableHead>Nilai Buku</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const photoUrl = item.photo_url
                    ? /^https?:\/\//i.test(item.photo_url)
                      ? item.photo_url
                      : signedPhotoUrls[item.photo_url] ?? null
                    : null;
                  const isLowStock =
                    item.asset_type === "CONSUMABLE" &&
                    item.stock_qty <= item.min_stock_threshold;
                  const bookValue = calculateBookValue(
                    item.purchase_price,
                    item.acquisition_date,
                    item.useful_life_months,
                    item.residual_value,
                  );
                  const rowBusy = isPending && pendingRowId === item.id;
                  const parentCode = item.parent_item_id
                    ? parentCodeMap.get(item.parent_item_id)
                    : null;

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          {photoUrl ? (
                            <Link
                              href={`/inventory/${item.id}`}
                              className="size-10 shrink-0 overflow-hidden rounded-md border"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photoUrl}
                                alt={item.name}
                                className="size-full object-cover"
                              />
                            </Link>
                          ) : (
                            <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border text-[10px]">
                              {item.category_prefix}
                            </div>
                          )}
                          <div className="space-y-0.5">
                            <Link
                              href={`/inventory/${item.id}`}
                              className="text-primary font-mono text-xs font-semibold hover:underline"
                            >
                              {item.item_code}
                            </Link>
                            {parentCode && (
                              <p className="text-muted-foreground text-[11px]">
                                Sub dari <span className="font-mono">{parentCode}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="whitespace-normal">
                        <div className="max-w-[230px] space-y-1">
                          <Link
                            href={`/inventory/${item.id}`}
                            className="font-medium hover:underline"
                          >
                            {item.name}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <AssetTypeBadge assetType={item.asset_type} />
                            <span className="text-muted-foreground text-xs">{item.category}</span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="whitespace-normal">
                        <div className="text-xs">
                          <p className="font-medium">
                            {item.room_code} · {LOCATION_LABELS[item.room_code]}
                          </p>
                          {item.rack_location && (
                            <p className="text-muted-foreground">{item.rack_location}</p>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1.5">
                          {item.asset_type === "CONSUMABLE" ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="font-mono font-semibold">
                                  {item.stock_qty} {item.unit_label}
                                </span>
                                {isLowStock && (
                                  <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                                    Low-Stock
                                  </Badge>
                                )}
                              </div>
                              <p className="text-muted-foreground text-[11px]">
                                Min: {item.min_stock_threshold} {item.unit_label}
                              </p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <PartProgressIndicator
                                currentParts={item.current_parts}
                                totalParts={item.total_parts}
                                unitLabel={item.unit_label}
                              />
                              {can("inventory.report_issue") && item.total_parts > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleOpenPartDialog(item)}
                                  disabled={rowBusy}
                                >
                                  Ubah
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <ConditionBadge condition={item.condition} />
                      </TableCell>

                      <TableCell className="whitespace-normal">
                        <div className="space-y-1.5">
                          <HygieneBadge
                            status={item.hygiene_status}
                            assetType={item.asset_type}
                            nextDue={item.next_sanitization_due}
                            todayWib={todayWib}
                          />
                          {item.asset_type === "THERAPY_TOY" && (
                            <div className="flex items-center gap-1.5">
                              {can("inventory.update_hygiene") && (
                                <Select
                                  value={item.hygiene_status}
                                  onValueChange={(v) =>
                                    handleHygieneChange(item.id, v as HygieneStatus)
                                  }
                                  disabled={rowBusy}
                                >
                                  <SelectTrigger size="sm" className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(Object.keys(HYGIENE_LABELS) as HygieneStatus[]).map(
                                      (key) => (
                                        <SelectItem key={key} value={key}>
                                          {HYGIENE_LABELS[key]}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )}
                          {item.next_sanitization_due && item.asset_type === "THERAPY_TOY" && (
                            <p className="text-muted-foreground text-[11px]">
                              Jadwal: {formatDateWIB(item.next_sanitization_due)}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        {item.purchase_price > 0 ? (
                          <div className="text-xs">
                            <p className="font-medium">{formatRupiah(bookValue)}</p>
                            {item.asset_type === "FIXED_ASSET" && (
                              <p className="text-muted-foreground text-[11px]">
                                Beli: {formatRupiah(item.purchase_price)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" asChild title="Detail Item">
                            <Link href={`/inventory/${item.id}`}>
                              <Eye className="size-4" />
                            </Link>
                          </Button>
                          <Can action="inventory.update">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Edit Item"
                              onClick={() => handleOpenEdit(item)}
                              disabled={rowBusy}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </Can>
                          <Can action="inventory.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Hapus Item"
                              onClick={() => setDeleteTarget(item)}
                              disabled={rowBusy}
                            >
                              <Trash2 className="text-destructive size-4" />
                            </Button>
                          </Can>
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

      <ItemFormDialog
        key={editingItem?.id ?? (formOpen ? "create-open" : "create-closed")}
        open={formOpen}
        onOpenChange={setFormOpen}
        editingItem={editingItem}
        initialSignedPhotoUrl={
          editingItem?.photo_url
            ? /^https?:\/\//i.test(editingItem.photo_url)
              ? editingItem.photo_url
              : signedPhotoUrls[editingItem.photo_url] ?? null
            : null
        }
        parentCandidates={items}
        onSaved={(_saved, message) => {
          if (message) setFeedback({ type: "success", text: message });
        }}
      />

      <Dialog
        open={Boolean(partDialogItem)}
        onOpenChange={(open) => {
          if (!open) setPartDialogItem(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Perbarui Jumlah Part / Kepingan</DialogTitle>
            <DialogDescription>
              {partDialogItem?.item_code} — {partDialogItem?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePartCount} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quick-part-input">
                Jumlah Tersedia (Maksimal {partDialogItem?.total_parts ?? 1}{" "}
                {partDialogItem?.unit_label ?? "Pcs"})
              </Label>
              <Input
                id="quick-part-input"
                type="number"
                min={0}
                max={partDialogItem?.total_parts ?? 1}
                value={partCountInput}
                onChange={(e) => setPartCountInput(e.target.value)}
                required
              />
              {partDialogItem &&
                partDialogItem.total_parts > 1 &&
                Number(partCountInput) < partDialogItem.total_parts && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Kondisi akan otomatis ditandai sebagai PART_KURANG karena jumlah kurang dari total.
                  </p>
                )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPartDialogItem(null)}
                disabled={isPending}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="size-4 animate-spin" />}
                Simpan Part
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Item Inventaris?</DialogTitle>
            <DialogDescription>
              Item <strong className="font-mono">{deleteTarget?.item_code}</strong> (
              {deleteTarget?.name}) akan dipindahkan ke Recycle Bin dan masih dapat dipulihkan dalam 30 hari.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isPending}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Ya, Hapus ke Recycle Bin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
