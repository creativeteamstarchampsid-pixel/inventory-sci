"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CornerDownRight,
  Eye,
  Filter,
  Layers,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Tag,
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
import { SharePreviewDialog } from "@/components/share/share-preview-dialog";
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
  ItemBarcodeAlias,
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

export type InventoryBarcodeAlias = Pick<
  ItemBarcodeAlias,
  "alias_code" | "target_item_id" | "legacy_name" | "alias_reason"
>;

type InventoryGroup = {
  parent: ItemMaster;
  isParent: boolean;
  allSubItems: ItemMaster[];
  visibleSubItems: ItemMaster[];
  matchedSubItemIds: Set<string>;
  matchedParentAliases: InventoryBarcodeAlias[];
  matchedAliasesByItemId: Map<string, InventoryBarcodeAlias[]>;
  autoExpanded: boolean;
};

type InventoryClientProps = {
  items: ItemMaster[];
  barcodeAliases?: InventoryBarcodeAlias[];
  signedPhotoUrls: Record<string, string>;
  todayWib: string;
};

export function InventoryClient({
  items,
  barcodeAliases = [],
  signedPhotoUrls,
  todayWib,
}: InventoryClientProps) {
  const { can } = useRole();
  const { runWithFeedback } = useCartoonFeedback();
  const { inventoryOptions, getOptionWithCurrent, getLabel } = useLocations();
  const canViewValuation = can("inventory.view_valuation");
  const canCreateItem = can("inventory.create");
  const canManageItem = canCreateItem || can("inventory.update");
  const canValidateOpname = can("inventory.validate_opname");

  const [search, setSearch] = useState("");
  const [prefixFilter, setPrefixFilter] = useState<string>(ALL_OPTION);
  const [roomFilter, setRoomFilter] = useState<string>(ALL_OPTION);
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>(ALL_OPTION);
  const [conditionFilter, setConditionFilter] = useState<string>(ALL_OPTION);
  const [hygieneFilter, setHygieneFilter] = useState<string>(ALL_OPTION);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemMaster | null>(null);
  const [formEnableSubItems, setFormEnableSubItems] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ItemMaster | null>(null);
  const [partDialogItem, setPartDialogItem] = useState<ItemMaster | null>(null);
  const [partCountInput, setPartCountInput] = useState<string>("1");
  const [shareTarget, setShareTarget] = useState<ItemMaster | null>(null);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    childrenByParentId,
    topLevelItems,
    leafItems,
    aliasesByTargetId,
  } = useMemo(() => {
    const activeIds = new Set(items.map((i) => i.id));
    const childrenMap = new Map<string, ItemMaster[]>();
    for (const item of items) {
      if (item.parent_item_id && activeIds.has(item.parent_item_id)) {
        const list = childrenMap.get(item.parent_item_id) ?? [];
        list.push(item);
        childrenMap.set(item.parent_item_id, list);
      }
    }
    for (const [pid, list] of childrenMap.entries()) {
      list.sort((a, b) => a.item_code.localeCompare(b.item_code, "id"));
      childrenMap.set(pid, list);
    }

    const topItems = items.filter(
      (item) => !item.parent_item_id || !activeIds.has(item.parent_item_id),
    );
    const leaves = items.filter(
      (item) => !item.has_sub_items && (childrenMap.get(item.id)?.length ?? 0) === 0,
    );

    const aliasMap = new Map<string, InventoryBarcodeAlias[]>();
    for (const alias of barcodeAliases) {
      const list = aliasMap.get(alias.target_item_id) ?? [];
      list.push(alias);
      aliasMap.set(alias.target_item_id, list);
    }

    return {
      childrenByParentId: childrenMap,
      topLevelItems: topItems,
      leafItems: leaves,
      aliasesByTargetId: aliasMap,
    };
  }, [items, barcodeAliases]);

  const totalStockUnits = useMemo(
    () =>
      leafItems
        .filter((item) => item.condition !== "DIHAPUSBUKU")
        .reduce((sum, item) => sum + (Number(item.stock_qty) || 0), 0),
    [leafItems],
  );

  const lowStockItems = useMemo(
    () =>
      leafItems.filter(
        (item) =>
          item.asset_type === "CONSUMABLE" &&
          item.min_stock_threshold > 0 &&
          item.stock_qty < item.min_stock_threshold,
      ),
    [leafItems],
  );

  const partKurangCount = useMemo(
    () => leafItems.filter((item) => item.condition === "PART_KURANG").length,
    [leafItems],
  );

  const sanitizationAlertCount = useMemo(
    () =>
      leafItems.filter(
        (item) =>
          item.asset_type === "THERAPY_TOY" &&
          (item.hygiene_status !== "STERIL" ||
            isSanitizationOverdue(item.asset_type, item.next_sanitization_due, todayWib)),
      ).length,
    [leafItems, todayWib],
  );

  const filteredGroups = useMemo<InventoryGroup[]>(() => {
    const query = search.trim().toLowerCase();

    const matchesDropdownFilters = (item: ItemMaster, isParent: boolean) => {
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
        (isParent ||
          !(
            item.asset_type === "CONSUMABLE" &&
            item.min_stock_threshold > 0 &&
            item.stock_qty < item.min_stock_threshold
          ))
      ) {
        return false;
      }
      return true;
    };

    const getQueryMatches = (item: ItemMaster) => {
      if (!query) {
        return { textMatch: true, matchedAliases: [] as InventoryBarcodeAlias[] };
      }
      const textMatch =
        item.item_code.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.rack_location?.toLowerCase().includes(query) ?? false) ||
        (item.pic_name?.toLowerCase().includes(query) ?? false);
      const itemAliases = aliasesByTargetId.get(item.id) ?? [];
      const matchedAliases = itemAliases.filter(
        (alias) =>
          alias.alias_code.toLowerCase().includes(query) ||
          (alias.legacy_name?.toLowerCase().includes(query) ?? false),
      );
      return { textMatch, matchedAliases };
    };

    const groups: InventoryGroup[] = [];
    for (const topItem of topLevelItems) {
      const allSubItems = childrenByParentId.get(topItem.id) ?? [];
      const isParent = topItem.has_sub_items || allSubItems.length > 0;

      const parentFilterOk = matchesDropdownFilters(topItem, isParent);
      const parentQuery = getQueryMatches(topItem);
      const parentMatched =
        parentFilterOk && (parentQuery.textMatch || parentQuery.matchedAliases.length > 0);

      const matchedSubItemIds = new Set<string>();
      const matchedAliasesByItemId = new Map<string, InventoryBarcodeAlias[]>();
      if (parentQuery.matchedAliases.length > 0) {
        matchedAliasesByItemId.set(topItem.id, parentQuery.matchedAliases);
      }

      const matchingSubItems: ItemMaster[] = [];
      for (const child of allSubItems) {
        const childFilterOk = matchesDropdownFilters(child, false);
        const childQuery = getQueryMatches(child);
        const childQueryOk = !query || childQuery.textMatch || childQuery.matchedAliases.length > 0;
        if (childQuery.matchedAliases.length > 0) {
          matchedAliasesByItemId.set(child.id, childQuery.matchedAliases);
        }
        if (childFilterOk && childQueryOk) {
          matchingSubItems.push(child);
          if (query) {
            matchedSubItemIds.add(child.id);
          }
        }
      }

      if (!isParent) {
        if (parentMatched) {
          groups.push({
            parent: topItem,
            isParent: false,
            allSubItems: [],
            visibleSubItems: [],
            matchedSubItemIds,
            matchedParentAliases: parentQuery.matchedAliases,
            matchedAliasesByItemId,
            autoExpanded: false,
          });
        }
        continue;
      }

      if (!parentMatched && matchingSubItems.length === 0) {
        continue;
      }

      const hasSubMatchDuringSearch = Boolean(query) && matchedSubItemIds.size > 0;
      const hasSubMatchDuringFilter =
        !query &&
        (prefixFilter !== ALL_OPTION ||
          roomFilter !== ALL_OPTION ||
          assetTypeFilter !== ALL_OPTION ||
          conditionFilter !== ALL_OPTION ||
          hygieneFilter !== ALL_OPTION ||
          lowStockOnly) &&
        matchingSubItems.length > 0 &&
        !parentMatched;

      const visibleSubItems =
        hasSubMatchDuringSearch || hasSubMatchDuringFilter
          ? matchingSubItems
          : allSubItems;

      groups.push({
        parent: topItem,
        isParent: true,
        allSubItems,
        visibleSubItems,
        matchedSubItemIds,
        matchedParentAliases: parentQuery.matchedAliases,
        matchedAliasesByItemId,
        autoExpanded: hasSubMatchDuringSearch || hasSubMatchDuringFilter,
      });
    }

    return groups;
  }, [
    topLevelItems,
    childrenByParentId,
    aliasesByTargetId,
    search,
    prefixFilter,
    roomFilter,
    assetTypeFilter,
    conditionFilter,
    hygieneFilter,
    lowStockOnly,
  ]);

  const toggleExpandParent = (parentId: string) => {
    setExpandedParents((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

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
    setFormEnableSubItems(false);
    setFormOpen(true);
  };

  const handleOpenEdit = (item: ItemMaster) => {
    setEditingItem(item);
    setFormEnableSubItems(false);
    setFormOpen(true);
  };

  const handleOpenAddSubItem = (parentItem: ItemMaster) => {
    setEditingItem(parentItem);
    setFormEnableSubItems(true);
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
          value={topLevelItems.length}
          hint={`Tampil ${filteredGroups.length} grup · Total ${totalStockUnits} unit stok`}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 [&>*]:min-w-0">
            <div className="relative sm:col-span-2">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode (SC-...), varian, alias lama, rak, PIC…"
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
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <div className="w-full sm:w-52">
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
          {filteredGroups.length === 0 ? (
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
                {filteredGroups.map((group) => {
                  const isExpanded =
                    group.isParent &&
                    (Boolean(expandedParents[group.parent.id]) || group.autoExpanded);

                  const renderItemRow = (
                    item: ItemMaster,
                    opts: {
                      isSubRow: boolean;
                      isParentRow: boolean;
                      subCount: number;
                      isSearchMatch: boolean;
                      matchedAliases: InventoryBarcodeAlias[];
                    },
                  ) => {
                    const photoUrl = item.photo_url
                      ? /^https?:\/\//i.test(item.photo_url)
                        ? item.photo_url
                        : signedPhotoUrls[item.photo_url] ?? null
                      : null;
                    const isLowStock =
                      !opts.isParentRow &&
                      item.asset_type === "CONSUMABLE" &&
                      item.min_stock_threshold > 0 &&
                      item.stock_qty < item.min_stock_threshold;
                    const bookValue = calculateBookValue(
                      item.purchase_price,
                      item.acquisition_date,
                      item.useful_life_months,
                      item.residual_value,
                    );
                    const rowBusy = isPending && pendingRowId === item.id;
                    const itemAliases = aliasesByTargetId.get(item.id) ?? [];

                    return (
                      <TableRow
                        key={item.id}
                        className={
                          opts.isSubRow
                            ? opts.isSearchMatch
                              ? "bg-[#FEF3C7]/65 transition-colors hover:bg-[#FEF3C7]/85 dark:bg-amber-950/35 dark:hover:bg-amber-950/50"
                              : "bg-[#FAF6EE]/70 transition-colors hover:bg-[#D1FAE5]/25 dark:bg-stone-900/35 dark:hover:bg-stone-800/45"
                            : "transition-colors hover:bg-[#D1FAE5]/25 dark:hover:bg-stone-800/40"
                        }
                      >
                        <TableCell>
                          <div className={`flex items-center gap-2 ${opts.isSubRow ? "pl-6" : ""}`}>
                            {opts.isParentRow ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => toggleExpandParent(item.id)}
                                title={isExpanded ? "Tutup Sub-Item" : "Lihat Sub-Item"}
                                className="size-7 shrink-0 rounded-lg border-[1.5px] border-[#2C2623] bg-[#EDE9FE] text-[#4C1D95] shadow-[1.5px_1.5px_0px_0px_#2C2623] hover:bg-[#DDD6FE] dark:border-stone-400 dark:bg-violet-950/70 dark:text-violet-200"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </Button>
                            ) : opts.isSubRow ? (
                              <CornerDownRight className="text-muted-foreground size-4 shrink-0" />
                            ) : null}

                            {photoUrl ? (
                              <Link
                                href={`/inventory/${item.id}`}
                                className={`shrink-0 overflow-hidden rounded-xl border-[1.5px] border-[#2C2623] bg-white shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-500 ${opts.isSubRow ? "size-9" : "size-11"}`}
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
                                className={`flex shrink-0 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] text-[11px] font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-500 ${opts.isSubRow ? "size-9 bg-[#E0F2FE] dark:bg-sky-950/60 dark:text-sky-200" : "size-11 bg-[#FEF3C7] dark:bg-amber-950/60 dark:text-amber-200"}`}
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
                              {opts.isParentRow ? (
                                <p className="text-[11px] font-bold text-[#4C1D95] dark:text-violet-300">
                                  Parent • {opts.subCount} Sub-Item
                                </p>
                              ) : opts.isSubRow ? (
                                <p className="text-muted-foreground text-[11px] font-medium">
                                  Sub dari{" "}
                                  <span className="font-mono font-semibold">
                                    {group.parent.item_code}
                                  </span>
                                </p>
                              ) : (
                                <p className="text-muted-foreground text-[11px] font-medium">
                                  Simple Item
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-normal">
                          <div className="max-w-[250px] space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`/inventory/${item.id}`}
                                className="font-bold text-[#2C2623] hover:underline dark:text-stone-100"
                              >
                                {item.name}
                              </Link>
                              {opts.isSearchMatch && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border border-[#2C2623] bg-[#FDE68A] px-1.5 py-0 text-[10px] font-extrabold text-[#2C2623]"
                                >
                                  Cocok
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {opts.isParentRow && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-[1.5px] border-[#2C2623] bg-[#EDE9FE] px-2 py-0 text-[10px] font-extrabold text-[#4C1D95] shadow-[1px_1px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-violet-950/70 dark:text-violet-200"
                                >
                                  <Layers className="mr-1 size-2.5" />
                                  Parent • {opts.subCount} Sub-Item
                                </Badge>
                              )}
                              <AssetTypeBadge assetType={item.asset_type} />
                              <span className="text-muted-foreground text-xs font-medium">
                                {item.category}
                              </span>
                            </div>
                            {(opts.matchedAliases.length > 0 || itemAliases.length > 0) && (
                              <div className="flex flex-wrap gap-1">
                                {(opts.matchedAliases.length > 0
                                  ? opts.matchedAliases
                                  : itemAliases.slice(0, 2)
                                ).map((alias) => (
                                  <Badge
                                    key={alias.alias_code}
                                    variant="outline"
                                    title={alias.legacy_name ?? alias.alias_code}
                                    className={`rounded-full border px-1.5 py-0 font-mono text-[10px] font-bold ${
                                      opts.matchedAliases.some(
                                        (m) => m.alias_code === alias.alias_code,
                                      )
                                        ? "border-[#2C2623] bg-[#FDE68A] text-[#2C2623]"
                                        : "border-[#2C2623]/30 bg-white text-muted-foreground dark:border-stone-600 dark:bg-stone-900"
                                    }`}
                                  >
                                    <Tag className="mr-1 size-2.5" />
                                    {alias.alias_code}
                                    {alias.legacy_name ? ` (${alias.legacy_name})` : ""}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-normal">
                          <div className="text-xs">
                            <p className="font-bold text-[#2C2623] dark:text-stone-100">
                              {item.room_code} · {getLabel(item.room_code)}
                            </p>
                            {item.rack_location && (
                              <p className="text-muted-foreground font-medium">
                                {item.rack_location}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="space-y-1.5">
                            {opts.isParentRow ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] px-2 py-0.5 font-mono text-xs font-extrabold text-[#14532D] shadow-[1px_1px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-emerald-950/70 dark:text-emerald-200"
                                  >
                                    Total: {item.stock_qty} {item.unit_label}
                                  </Badge>
                                </div>
                                <p className="text-muted-foreground text-[11px] font-medium">
                                  Otomatis dari {opts.subCount} Sub-Item
                                </p>
                              </div>
                            ) : item.asset_type === "CONSUMABLE" || opts.isSubRow ? (
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
                                {item.asset_type === "CONSUMABLE" && !opts.isSubRow && (
                                  <p className="text-muted-foreground text-[11px]">
                                    Min: {item.min_stock_threshold} {item.unit_label}
                                  </p>
                                )}
                                {item.total_parts > 1 && (
                                  <PartProgressIndicator
                                    currentParts={item.current_parts}
                                    totalParts={item.total_parts}
                                    unitLabel={item.unit_label}
                                  />
                                )}
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
                            {!opts.isParentRow && item.asset_type === "THERAPY_TOY" && (
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
                            {opts.isParentRow && canValidateOpname && (
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                title="Stock Opname Varian"
                                className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] px-2 text-xs font-extrabold text-[#78350F] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE68A] dark:border-stone-500 dark:bg-amber-950/60 dark:text-amber-100 dark:shadow-none"
                              >
                                <Link
                                  href={`/stock-opname?code=${encodeURIComponent(item.item_code)}`}
                                >
                                  <ClipboardCheck className="size-3.5" />
                                  <span className="hidden xl:inline">Stock Opname Varian</span>
                                </Link>
                              </Button>
                            )}
                            {!opts.isSubRow && canCreateItem && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Tambah Sub-Item"
                                onClick={() => handleOpenAddSubItem(item)}
                                disabled={rowBusy}
                                className="rounded-xl hover:bg-[#EDE9FE] dark:hover:bg-violet-950/60"
                              >
                                <Plus className="size-4 text-[#4C1D95] dark:text-violet-300" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              title="Bagikan Link Pratinjau Pendek"
                              onClick={() => setShareTarget(item)}
                              className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#CCFBF1] px-2.5 text-xs font-extrabold text-[#115E59] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#99F6E4] dark:border-stone-500 dark:bg-teal-950/60 dark:text-teal-200 dark:shadow-none"
                            >
                              <Share2 className="size-3.5" />
                              Share
                            </Button>
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
                  };

                  return (
                    <Fragment key={group.parent.id}>
                      {renderItemRow(group.parent, {
                        isSubRow: false,
                        isParentRow: group.isParent,
                        subCount: group.allSubItems.length,
                        isSearchMatch: false,
                        matchedAliases: group.matchedParentAliases,
                      })}
                      {isExpanded &&
                        group.visibleSubItems.map((sub) =>
                          renderItemRow(sub, {
                            isSubRow: true,
                            isParentRow: false,
                            subCount: 0,
                            isSearchMatch: group.matchedSubItemIds.has(sub.id),
                            matchedAliases: group.matchedAliasesByItemId.get(sub.id) ?? [],
                          }),
                        )}
                      {isExpanded && group.isParent && canValidateOpname && (
                        <TableRow className="bg-[#EDE9FE]/35 hover:bg-[#EDE9FE]/35 dark:bg-violet-950/20">
                          <TableCell colSpan={canViewValuation ? 8 : 7} className="py-2 pl-14">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-[#4C1D95] dark:text-violet-200">
                                Menampilkan {group.visibleSubItems.length} dari{" "}
                                {group.allSubItems.length} Sub-Item pada{" "}
                                <strong className="font-mono">{group.parent.item_code}</strong>
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                className="h-7 rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] hover:bg-[#FEF3C7] dark:border-stone-400 dark:bg-stone-900 dark:text-stone-100"
                              >
                                <Link
                                  href={`/stock-opname?code=${encodeURIComponent(group.parent.item_code)}`}
                                >
                                  <ClipboardCheck className="size-3.5" />
                                  Stock Opname Varian
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManageItem && (
        <ItemFormDialog
          key={`${editingItem?.id ?? (formOpen ? "create-open" : "create-closed")}-${formEnableSubItems}`}
          open={formOpen}
          onOpenChange={(nextOpen) => {
            setFormOpen(nextOpen);
            if (!nextOpen) setFormEnableSubItems(false);
          }}
          editingItem={editingItem}
          initialEnableSubItems={formEnableSubItems}
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

      <SharePreviewDialog
        open={Boolean(shareTarget)}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
        target={
          shareTarget
            ? {
                type: "ITEM",
                id: shareTarget.id,
                code: shareTarget.item_code,
                title: shareTarget.name,
                locationCode: shareTarget.room_code,
              }
            : null
        }
      />
    </div>
  );
}
