"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Eye,
  Filter,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { runWithFeedback } = useCartoonFeedback();
  const { inventoryOptions, getOptionWithCurrent, getLabel } = useLocations();
  const canViewValuation = can("inventory.view_valuation");
  const canCreateItem = can("inventory.create");
  const canManageItem = canCreateItem || can("inventory.update");

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

  const handleHygieneChange = (item: ItemMaster, nextStatus: HygieneStatus) => {
    setFeedback(null);
    setPendingRowId(item.id);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Memperbarui Status Sanitasi...",
            workingMessage: `Dino Joguman lagi mencatat kebersihan ${item.item_code} menjadi "${HYGIENE_LABELS[nextStatus]}" nih~`,
            successTitle: "Status Sanitasi Diperbarui! ✨",
            successMessage: (r) =>
              r.ok ? r.message ?? "Status sanitasi berhasil diperbarui!" : "",
            errorTitle: "Gagal Update Sanitasi...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => updateItemHygieneAction(item.id, nextStatus),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setFeedback({ type: "success", text: res.message ?? "Status sanitasi diperbarui." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal memperbarui status sanitasi.",
        });
      } finally {
        setPendingRowId(null);
      }
    });
  };

  const handleOpenPartDialog = (item: ItemMaster) => {
    setPartDialogItem(item);
    setPartCountInput(String(item.current_parts));
  };

  const handleSavePartCount = (event: React.FormEvent) => {
    event.preventDefault();
    if (!partDialogItem) return;
    const targetItem = partDialogItem;
    const targetId = targetItem.id;
    const nextParts = Math.trunc(Number(partCountInput));
    setFeedback(null);
    setPendingRowId(targetId);

    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Menyimpan Jumlah Kepingan...",
            workingMessage: `Dino Joguman lagi menghitung & memperbarui part ${targetItem.item_code} (${nextParts}/${targetItem.total_parts} ${targetItem.unit_label})~`,
            successTitle: "Jumlah Part Diperbarui! 🧩",
            successMessage: (r) => (r.ok ? r.message ?? "Jumlah part berhasil diperbarui!" : ""),
            errorTitle: "Gagal Memperbarui Part...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => updateItemPartsAction(targetId, nextParts),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setPartDialogItem(null);
        setFeedback({ type: "success", text: res.message ?? "Jumlah part diperbarui." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal memperbarui jumlah part.",
        });
      } finally {
        setPendingRowId(null);
      }
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setFeedback(null);
    setPendingRowId(target.id);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Memindahkan ke Recycle Bin...",
            workingMessage: `Sedang merapikan & memindahkan ${target.item_code} (${target.name}) ke Recycle Bin ya~`,
            successTitle: "Item Dipindahkan! 🗑️",
            successMessage: (r) =>
              r.ok ? r.message ?? "Item berhasil dipindahkan ke Recycle Bin." : "",
            errorTitle: "Gagal Menghapus Item...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => softDeleteItemAction(target.id),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setDeleteTarget(null);
        setFeedback({ type: "success", text: res.message ?? "Item dihapus." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal menghapus item.",
        });
      } finally {
        setPendingRowId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        badge="Inventaris Klinik"
        title="Inventaris & Alat Terapi"
        description={
          canViewValuation
            ? "Master barang, tracking kelengkapan kepingan, jadwal sterilisasi mingguan & nilai buku aset."
            : "Daftar barang & alat terapi, kelengkapan kepingan, serta jadwal sterilisasi mingguan."
        }
        accent="mint"
        mascot="box"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Can action="locations.manage">
              <Button variant="outline" asChild className="bg-[#FFFDF7] dark:bg-stone-900">
                <Link href="/rooms">
                  <MapPin className="size-4" />
                  Kelola Ruangan
                </Link>
              </Button>
            </Can>
            <Button variant="outline" asChild className="bg-[#FFFDF7] dark:bg-stone-900">
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
        }
      />

      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          className={
            feedback.type === "success"
              ? "rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5] text-[#14532D] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-emerald-950/60 dark:text-emerald-100"
              : "rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#881337] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-rose-950/60 dark:text-rose-100"
          }
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          <AlertDescription className="font-semibold">{feedback.text}</AlertDescription>
        </Alert>
      )}

      {lowStockItems.length > 0 && (
        <Alert
          variant="warning"
          className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-amber-950/50 dark:text-amber-100"
        >
          <AlertTriangle className="size-4 text-amber-700 dark:text-amber-300" />
          <AlertTitle className="font-extrabold">
            Peringatan Stok Menipis ({lowStockItems.length} Barang Habis Pakai)
          </AlertTitle>
          <AlertDescription className="w-full">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium">
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
                className="shrink-0 bg-[#FFFDF7] font-bold text-[#2C2623] dark:bg-stone-900 dark:text-amber-100"
              >
                Tampilkan Low-Stock
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KawaiiStatCard
          label="Total Item Aktif"
          value={items.length}
          hint={`Ditampilkan: ${filteredItems.length} item`}
          accent="mint"
          icon={<Package className="size-4" />}
        />
        <KawaiiStatCard
          label="Part Kurang"
          value={partKurangCount}
          hint="Mainan dengan kepingan tidak lengkap"
          accent="butter"
          icon={<Boxes className="size-4" />}
        />
        <KawaiiStatCard
          label="Perlu / Terlambat Sanitasi"
          value={sanitizationAlertCount}
          hint="Mainan terapi perlu dicuci atau lewat jadwal 7 hari"
          accent="sky"
          icon={<Sparkles className="size-4" />}
        />
        <KawaiiStatCard
          label="Consumable Low-Stock"
          value={lowStockItems.length}
          hint="Stok ≤ batas minimum threshold"
          accent="pink"
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
        <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#E0F2FE]/55 pb-3 dark:border-stone-700 dark:bg-sky-950/25">
          <CardTitle className="flex items-center gap-2 text-base font-extrabold">
            <span className="inline-flex size-7 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900">
              <Filter className="size-3.5 text-sky-700 dark:text-sky-300" />
            </span>
            Filter & Pencarian
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode (SC-...), nama, rak, PIC…"
                className="bg-white pl-8 dark:bg-stone-900"
              />
            </div>

            <Select value={prefixFilter} onValueChange={setPrefixFilter}>
              <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
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
              <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
                <SelectValue placeholder="Lokasi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Semua Ruangan</SelectItem>
                {getOptionWithCurrent(
                  inventoryOptions,
                  roomFilter === ALL_OPTION ? null : roomFilter,
                ).map((loc) => (
                  <SelectItem key={loc.value} value={loc.value}>
                    {loc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
              <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
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
              <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-52">
                <Select value={hygieneFilter} onValueChange={setHygieneFilter}>
                  <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
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

              <label
                htmlFor="filter-low-stock"
                className="flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-[#2C2623] bg-[#FFE4E6]/70 px-3.5 py-1.5 text-xs font-bold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-500 dark:bg-rose-950/40 dark:text-rose-100"
              >
                <Checkbox
                  id="filter-low-stock"
                  checked={lowStockOnly}
                  onCheckedChange={(checked) => setLowStockOnly(checked === true)}
                />
                <span>Hanya Consumable Low-Stock</span>
              </label>
            </div>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="rounded-full bg-[#FEF3C7] font-bold text-[#2C2623] hover:bg-[#FDE68A] dark:bg-amber-950/60 dark:text-amber-100"
              >
                <RotateCcw className="size-3.5" />
                Reset Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
        <CardContent className="p-0">
          {filteredItems.length === 0 ? (
            <div className="p-6">
              <KawaiiEmptyState
                mascot="box"
                title="Tidak ada item yang cocok"
                description={
                  canCreateItem
                    ? "Ubah filter pencarian atau tambahkan item inventaris baru biar rak klinik makin rapi~"
                    : "Ubah filter pencarian untuk melihat barang atau alat terapi lainnya."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      <RotateCcw className="size-3.5" />
                      Reset Semua Filter
                    </Button>
                  ) : canCreateItem ? (
                    <Button size="sm" onClick={handleOpenCreate}>
                      <Plus className="size-4" />
                      Tambah Item Pertama
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-[#FEF3C7]/70 hover:bg-[#FEF3C7]/70 dark:bg-stone-800/80">
                  <TableHead className="font-extrabold">Kode & Foto</TableHead>
                  <TableHead className="font-extrabold">Nama & Kategori</TableHead>
                  <TableHead className="font-extrabold">Lokasi</TableHead>
                  <TableHead className="font-extrabold">Part / Stok</TableHead>
                  <TableHead className="font-extrabold">Kondisi</TableHead>
                  <TableHead className="font-extrabold">Sanitasi</TableHead>
                  {canViewValuation && <TableHead className="font-extrabold">Nilai Buku</TableHead>}
                  <TableHead className="text-right font-extrabold">Aksi</TableHead>
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
                    <TableRow
                      key={item.id}
                      className="transition-colors hover:bg-[#D1FAE5]/25 dark:hover:bg-stone-800/40"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          {photoUrl ? (
                            <Link
                              href={`/inventory/${item.id}`}
                              className="size-11 shrink-0 overflow-hidden rounded-xl border-[1.5px] border-[#2C2623] bg-white shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-500"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photoUrl}
                                alt={item.name}
                                className="size-full object-cover"
                              />
                            </Link>
                          ) : (
                            <Link
                              href={`/inventory/${item.id}`}
                              className="flex size-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FEF3C7] text-[11px] font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-500 dark:bg-amber-950/60 dark:text-amber-200"
                            >
                              {item.category_prefix}
                            </Link>
                          )}
                          <div className="space-y-0.5">
                            <Link
                              href={`/inventory/${item.id}`}
                              className="inline-block rounded-lg border border-[#2C2623]/25 bg-white px-2 py-0.5 font-mono text-xs font-bold text-[#14532D] transition-colors hover:bg-[#D1FAE5] dark:border-stone-600 dark:bg-stone-900 dark:text-emerald-300"
                            >
                              {item.item_code}
                            </Link>
                            {parentCode && (
                              <p className="text-muted-foreground text-[11px]">
                                Sub dari <span className="font-mono font-semibold">{parentCode}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="whitespace-normal">
                        <div className="max-w-[230px] space-y-1.5">
                          <Link
                            href={`/inventory/${item.id}`}
                            className="font-bold text-[#2C2623] hover:underline dark:text-stone-100"
                          >
                            {item.name}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <AssetTypeBadge assetType={item.asset_type} />
                            <span className="text-muted-foreground text-xs font-medium">
                              {item.category}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="whitespace-normal">
                        <div className="text-xs">
                          <p className="font-bold text-[#2C2623] dark:text-stone-100">
                            {item.room_code} · {getLabel(item.room_code)}
                          </p>
                          {item.rack_location && (
                            <p className="text-muted-foreground font-medium">{item.rack_location}</p>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1.5">
                          {item.asset_type === "CONSUMABLE" ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="font-mono font-bold">
                                  {item.stock_qty} {item.unit_label}
                                </span>
                                {isLowStock && (
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-[1.5px] border-[#2C2623] bg-[#FECDD3] px-1.5 py-0 text-[10px] font-extrabold text-[#881337] shadow-[1px_1px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-rose-950/80 dark:text-rose-200"
                                  >
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
                                  variant="outline"
                                  size="sm"
                                  className="h-7 rounded-full bg-[#FEF3C7] px-2.5 text-xs font-bold text-[#2C2623] hover:bg-[#FDE68A] dark:bg-amber-950/50 dark:text-amber-100"
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
                                    handleHygieneChange(item, v as HygieneStatus)
                                  }
                                  disabled={rowBusy}
                                >
                                  <SelectTrigger
                                    size="sm"
                                    className="h-7 rounded-xl border-[1.5px] border-[#2C2623] bg-white text-xs font-semibold dark:border-stone-500 dark:bg-stone-900"
                                  >
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
                            <p className="text-muted-foreground text-[11px] font-medium">
                              Jadwal: {formatDateWIB(item.next_sanitization_due)}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {canViewValuation && (
                        <TableCell>
                          {item.purchase_price > 0 ? (
                            <div className="text-xs">
                              <p className="font-bold text-[#14532D] dark:text-emerald-300">
                                {formatRupiah(bookValue)}
                              </p>
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
                      )}

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title="Detail Item"
                            className="rounded-xl hover:bg-[#E0F2FE] dark:hover:bg-sky-950/60"
                          >
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
                              className="rounded-xl hover:bg-[#FEF3C7] dark:hover:bg-amber-950/60"
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
                              className="rounded-xl hover:bg-[#FFE4E6] dark:hover:bg-rose-950/60"
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

      {canManageItem && (
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
      )}

      <Dialog
        open={Boolean(partDialogItem)}
        onOpenChange={(open) => {
          if (!open) setPartDialogItem(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extrabold">Perbarui Jumlah Part / Kepingan</DialogTitle>
            <DialogDescription>
              <span className="font-mono font-bold">{partDialogItem?.item_code}</span> —{" "}
              {partDialogItem?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePartCount} className="space-y-4">
            <div className="space-y-2 rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7]/45 p-4 dark:border-stone-500 dark:bg-amber-950/25">
              <Label htmlFor="quick-part-input" className="font-bold">
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
                className="bg-white font-mono font-bold dark:bg-stone-900"
              />
              {partDialogItem &&
                partDialogItem.total_parts > 1 &&
                Number(partCountInput) < partDialogItem.total_parts && (
                  <p className="rounded-xl border border-amber-400 bg-amber-100/80 px-2.5 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
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
            <DialogTitle className="font-extrabold">Hapus Item Inventaris?</DialogTitle>
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
