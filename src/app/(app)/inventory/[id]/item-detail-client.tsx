"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Coins,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { KawaiiEmptyState, KawaiiPageHeader } from "@/components/cartoon/kawaii-decor";
import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  updateConsumableStockAction,
  updateItemConditionAction,
  updateItemHygieneAction,
  updateItemPartsAction,
} from "@/lib/actions/inventory";
import type { BorrowHistoryEntry } from "@/lib/actions/scan";
import {
  BARCODE_FORMAT_LABELS,
  BORROW_STATUS_LABELS,
  CATEGORY_PREFIX_LABELS,
  CONDITION_LABELS,
  HYGIENE_LABELS,
  LOCATION_LABELS,
  calculateBookValue,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import type { HygieneStatus, ItemCondition, ItemMaster } from "@/types/database";
import {
  AssetTypeBadge,
  ConditionBadge,
  HygieneBadge,
  PartProgressIndicator,
} from "../inventory-badges";
import { ItemFormDialog } from "../item-form-dialog";

type ItemDetailClientProps = {
  item: ItemMaster;
  parentItem: Pick<ItemMaster, "id" | "item_code" | "name"> | null;
  childItems: ItemMaster[];
  allItemsForParentSelect: ItemMaster[];
  borrowHistory: BorrowHistoryEntry[];
  signedPhotoUrl: string | null;
  todayWib: string;
};

export function ItemDetailClient({
  item,
  parentItem,
  childItems,
  allItemsForParentSelect,
  borrowHistory,
  signedPhotoUrl,
  todayWib,
}: ItemDetailClientProps) {
  const router = useRouter();
  const { can } = useRole();
  const { runWithFeedback } = useCartoonFeedback();
  const canViewValuation = can("inventory.view_valuation");
  const canApproveWriteoff = can("writeoff.approve");
  const canCreateItem = can("inventory.create");
  const canUpdateItem = can("inventory.update");
  const lockedWrittenOff = item.condition === "DIHAPUSBUKU" && !canApproveWriteoff;

  const [partsValue, setPartsValue] = useState(String(item.current_parts));
  const [stockValue, setStockValue] = useState(String(item.stock_qty));
  const [editOpen, setEditOpen] = useState(false);
  const [createSubOpen, setCreateSubOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const bookValue = calculateBookValue(
    item.purchase_price,
    item.acquisition_date,
    item.useful_life_months,
    item.residual_value,
  );
  const depreciationAccumulated = Math.max(0, item.purchase_price - bookValue);

  const handleHygieneUpdate = (status: HygieneStatus) => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Memperbarui Status Sanitasi...",
            workingMessage: `Dino Joguman lagi mencatat status sanitasi ${item.item_code} menjadi "${HYGIENE_LABELS[status]}"~`,
            successTitle: "Sanitasi Diperbarui! ✨",
            successMessage: (r) =>
              r.ok ? r.message ?? "Status sanitasi berhasil diperbarui!" : "",
            errorTitle: "Gagal Update Sanitasi...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => updateItemHygieneAction(item.id, status),
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
      }
    });
  };

  const handlePartsSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextParts = Math.trunc(Number(partsValue));
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Menyimpan Jumlah Kepingan...",
            workingMessage: `Dino Joguman lagi menghitung ulang part ${item.item_code} (${nextParts}/${item.total_parts} ${item.unit_label})~`,
            successTitle: "Kepingan Diperbarui! 🧩",
            successMessage: (r) =>
              r.ok ? r.message ?? "Jumlah kepingan berhasil diperbarui!" : "",
            errorTitle: "Gagal Update Kepingan...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => updateItemPartsAction(item.id, nextParts),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setFeedback({ type: "success", text: res.message ?? "Jumlah kepingan diperbarui." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal memperbarui jumlah kepingan.",
        });
      }
    });
  };

  const handleConditionChange = (nextCondition: ItemCondition) => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Memperbarui Kondisi Barang...",
            workingMessage: `Sedang mencatat perubahan kondisi ${item.item_code} ke "${CONDITION_LABELS[nextCondition]}" nih~`,
            successTitle: "Kondisi Barang Diperbarui! ✨",
            successMessage: (r) => (r.ok ? r.message ?? "Kondisi berhasil diperbarui!" : ""),
            errorTitle: "Gagal Mengubah Kondisi...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => updateItemConditionAction(item.id, nextCondition),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setFeedback({ type: "success", text: res.message ?? "Kondisi diperbarui." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal memperbarui kondisi barang.",
        });
      }
    });
  };

  const handleStockSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextStock = Math.trunc(Number(stockValue));
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Menyesuaikan Stok Fisik...",
            workingMessage: `Dino Joguman lagi memperbarui stok ${item.item_code} menjadi ${nextStock} ${item.unit_label}~`,
            successTitle: "Stok Diperbarui! 📦",
            successMessage: (r) => (r.ok ? r.message ?? "Stok berhasil diperbarui!" : ""),
            errorTitle: "Gagal Update Stok...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => updateConsumableStockAction(item.id, nextStock),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setFeedback({ type: "success", text: res.message ?? "Stok diperbarui." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal memperbarui stok.",
        });
      }
    });
  };

  const handleConfirmDelete = () => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Memindahkan ke Recycle Bin...",
            workingMessage: `Sedang merapikan & memindahkan ${item.item_code} (${item.name}) ke Recycle Bin ya~`,
            successTitle: "Item Dipindahkan! 🗑️",
            successMessage: (r) =>
              r.ok ? r.message ?? "Item berhasil dipindahkan ke Recycle Bin." : "",
            errorTitle: "Gagal Menghapus Item...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => softDeleteItemAction(item.id),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setDeleteOpen(false);
        router.push("/inventory");
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal menghapus item.",
        });
      }
    });
  };

  const headerAccent =
    item.asset_type === "THERAPY_TOY"
      ? "mint"
      : item.asset_type === "FIXED_ASSET"
        ? "lavender"
        : "peach";

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="outline"
          size="sm"
          asChild
          className="rounded-full bg-[#FFFDF7] font-bold dark:bg-stone-900"
        >
          <Link href="/inventory">
            <ArrowLeft className="size-4" />
            Kembali ke Daftar Inventaris
          </Link>
        </Button>
      </div>

      <KawaiiPageHeader
        badge={item.item_code}
        title={item.name}
        description={`${CATEGORY_PREFIX_LABELS[item.category_prefix]} · ${item.category} · ${item.room_code} (${LOCATION_LABELS[item.room_code]})${item.rack_location ? ` · ${item.rack_location}` : ""}`}
        accent={headerAccent}
        mascot="box"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild className="bg-[#FFFDF7] dark:bg-stone-900">
              <Link href={`/scan?code=${encodeURIComponent(item.item_code)}`}>
                <QrCode className="size-4" />
                Pinjam / Kembalikan
              </Link>
            </Button>
            <Can action="inventory.update">
              <Button
                variant="outline"
                onClick={() => setEditOpen(true)}
                className="bg-[#FEF3C7] text-[#2C2623] hover:bg-[#FDE68A] dark:bg-amber-950/60 dark:text-amber-100"
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            </Can>
            <Can action="inventory.delete">
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                Hapus
              </Button>
            </Can>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] px-4 py-3 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
        <Badge
          variant="outline"
          className="rounded-full border-[1.5px] border-[#2C2623] bg-white font-mono text-xs font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900"
        >
          {item.item_code}
        </Badge>
        <AssetTypeBadge assetType={item.asset_type} />
        <ConditionBadge condition={item.condition} />
        <HygieneBadge
          status={item.hygiene_status}
          assetType={item.asset_type}
          nextDue={item.next_sanitization_due}
          todayWib={todayWib}
        />
        {parentItem && (
          <Link
            href={`/inventory/${parentItem.id}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#EDE9FE] px-3 py-0.5 text-xs font-bold text-[#4C1D95] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-400 dark:bg-violet-950/70 dark:text-violet-200"
          >
            <span>Induk:</span>
            <span className="font-mono">{parentItem.item_code}</span>
            <span>— {parentItem.name}</span>
          </Link>
        )}
      </div>

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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] lg:col-span-1 dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
          <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#FFE4E6]/45 dark:border-stone-700 dark:bg-rose-950/20">
            <CardTitle className="flex items-center gap-2 text-base font-extrabold">
              <span className="inline-flex size-7 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900">
                <ImageIcon className="size-3.5 text-rose-600 dark:text-rose-300" />
              </span>
              Foto & Identitas Barang
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {signedPhotoUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-2xl border-2 border-[#2C2623] bg-white shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signedPhotoUrl}
                  alt={item.name}
                  className="size-full object-cover"
                />
              </div>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#2C2623]/35 bg-[#FEF3C7]/45 text-sm font-bold text-muted-foreground dark:border-stone-500 dark:bg-amber-950/20">
                <ImageIcon className="size-7 opacity-50" />
                <span>Belum ada foto barang</span>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-2xl border-2 border-[#2C2623]/15 bg-white/80 p-3.5 text-sm dark:border-stone-700 dark:bg-stone-900/50">
              <dt className="text-muted-foreground font-semibold">Kode Item</dt>
              <dd className="font-mono font-bold">{item.item_code}</dd>
              <dt className="text-muted-foreground font-semibold">Format Barcode</dt>
              <dd className="font-semibold">{BARCODE_FORMAT_LABELS[item.barcode_format]}</dd>
              <dt className="text-muted-foreground font-semibold">Ruangan</dt>
              <dd className="font-semibold">
                {item.room_code} — {LOCATION_LABELS[item.room_code]}
              </dd>
              <dt className="text-muted-foreground font-semibold">Rak / Lemari</dt>
              <dd className="font-semibold">{item.rack_location || "-"}</dd>
              <dt className="text-muted-foreground font-semibold">PIC</dt>
              <dd className="font-semibold">{item.pic_name || "-"}</dd>
              <dt className="text-muted-foreground font-semibold">Stok</dt>
              <dd className="font-mono font-bold">
                {item.stock_qty} {item.unit_label}
              </dd>
            </dl>

            {item.description && (
              <div className="rounded-2xl border-2 border-[#2C2623]/15 bg-[#FEF3C7]/40 p-3.5 text-sm dark:border-stone-700 dark:bg-amber-950/20">
                <p className="text-muted-foreground mb-1 text-xs font-extrabold uppercase tracking-wide">
                  Deskripsi
                </p>
                <p className="whitespace-pre-line font-medium">{item.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#E0F2FE]/55 dark:border-stone-700 dark:bg-sky-950/25">
                <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                  <span className="inline-flex size-7 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900">
                    <Sparkles className="size-3.5 text-sky-600 dark:text-sky-300" />
                  </span>
                  Kontrol Sanitasi & Kebersihan
                </CardTitle>
                <CardDescription className="font-medium">
                  Terakhir disterilkan:{" "}
                  {item.last_sanitized_at ? formatDateWIB(item.last_sanitized_at, true) : "-"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <HygieneBadge
                  status={item.hygiene_status}
                  assetType={item.asset_type}
                  nextDue={item.next_sanitization_due}
                  todayWib={todayWib}
                />
                {item.next_sanitization_due && (
                  <p className="rounded-xl border border-[#2C2623]/15 bg-white px-3 py-2 text-xs text-muted-foreground dark:border-stone-700 dark:bg-stone-900/60">
                    Jadwal sanitasi berikutnya:{" "}
                    <strong className="text-foreground">
                      {formatDateWIB(item.next_sanitization_due)}
                    </strong>
                  </p>
                )}

                <Can action="inventory.update_hygiene">
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(Object.keys(HYGIENE_LABELS) as HygieneStatus[]).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={item.hygiene_status === status ? "default" : "outline"}
                        onClick={() => handleHygieneUpdate(status)}
                        disabled={isPending}
                        className="rounded-full"
                      >
                        {HYGIENE_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                </Can>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#FEF3C7]/60 dark:border-stone-700 dark:bg-amber-950/25">
                <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                  <span className="inline-flex size-7 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900">
                    <Boxes className="size-3.5 text-amber-600 dark:text-amber-300" />
                  </span>
                  Kelengkapan Part & Kondisi
                </CardTitle>
                <CardDescription className="font-medium">
                  Pemantauan kepingan mainan atau kelengkapan unit.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <PartProgressIndicator
                  currentParts={item.current_parts}
                  totalParts={item.total_parts}
                  unitLabel={item.unit_label}
                />

                {can("inventory.report_issue") && (
                  <form onSubmit={handlePartsSubmit} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="detail-parts-input" className="text-xs font-bold">
                        Update Part ({item.unit_label})
                      </Label>
                      <Input
                        id="detail-parts-input"
                        type="number"
                        min={0}
                        max={item.total_parts}
                        value={partsValue}
                        onChange={(e) => setPartsValue(e.target.value)}
                        disabled={isPending}
                        className="bg-white font-mono font-bold dark:bg-stone-900"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={isPending}>
                      {isPending && <Loader2 className="size-3.5 animate-spin" />}
                      Simpan Part
                    </Button>
                  </form>
                )}

                {can("inventory.report_issue") && (
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Ubah Status Kondisi</Label>
                    <Select
                      value={item.condition}
                      onValueChange={(v) => handleConditionChange(v as ItemCondition)}
                      disabled={isPending || lockedWrittenOff}
                    >
                      <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CONDITION_LABELS) as ItemCondition[])
                          .filter(
                            (k) =>
                              k !== "DIHAPUSBUKU" ||
                              canApproveWriteoff ||
                              item.condition === "DIHAPUSBUKU",
                          )
                          .map((key) => (
                            <SelectItem
                              key={key}
                              value={key}
                              disabled={key === "DIHAPUSBUKU" && !canApproveWriteoff}
                            >
                              {CONDITION_LABELS[key]}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {item.asset_type === "CONSUMABLE" && can("inventory.update") && (
                  <form
                    onSubmit={handleStockSubmit}
                    className="flex items-end gap-2 border-t-2 border-dashed border-[#2C2623]/15 pt-3 dark:border-stone-700"
                  >
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="detail-stock-input" className="text-xs font-bold">
                        Stok Fisik ({item.unit_label}, Min: {item.min_stock_threshold})
                      </Label>
                      <Input
                        id="detail-stock-input"
                        type="number"
                        min={0}
                        value={stockValue}
                        onChange={(e) => setStockValue(e.target.value)}
                        disabled={isPending}
                        className="bg-white font-mono font-bold dark:bg-stone-900"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
                      Update Stok
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          {canViewValuation && (
            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#D1FAE5]/45 dark:border-stone-700 dark:bg-emerald-950/25">
                <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                  <span className="inline-flex size-7 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900">
                    <Coins className="size-3.5 text-emerald-700 dark:text-emerald-300" />
                  </span>
                  Nilai Aset & Penyusutan Garis Lurus
                </CardTitle>
                <CardDescription className="font-medium">
                  Perhitungan otomatis berdasarkan harga beli, tanggal perolehan, umur manfaat, dan
                  nilai residu.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-2xl border-[1.5px] border-[#2C2623]/25 bg-white p-3 dark:border-stone-600 dark:bg-stone-900/60">
                    <p className="text-muted-foreground text-xs font-semibold">Tanggal Perolehan</p>
                    <p className="mt-1 text-sm font-bold">{formatDateWIB(item.acquisition_date)}</p>
                  </div>
                  <div className="rounded-2xl border-[1.5px] border-[#2C2623]/25 bg-white p-3 dark:border-stone-600 dark:bg-stone-900/60">
                    <p className="text-muted-foreground text-xs font-semibold">Harga Beli</p>
                    <p className="mt-1 text-sm font-bold">{formatRupiah(item.purchase_price)}</p>
                  </div>
                  <div className="rounded-2xl border-[1.5px] border-[#2C2623]/25 bg-white p-3 dark:border-stone-600 dark:bg-stone-900/60">
                    <p className="text-muted-foreground text-xs font-semibold">Umur Manfaat</p>
                    <p className="mt-1 text-sm font-bold">
                      {item.useful_life_months ? `${item.useful_life_months} Bulan` : "-"}
                    </p>
                  </div>
                  <div className="rounded-2xl border-[1.5px] border-[#2C2623]/25 bg-[#FEF3C7]/45 p-3 dark:border-stone-600 dark:bg-amber-950/30">
                    <p className="text-muted-foreground text-xs font-semibold">Akumulasi Penyusutan</p>
                    <p className="mt-1 text-sm font-bold">{formatRupiah(depreciationAccumulated)}</p>
                  </div>
                  <div className="rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5] p-3 text-[#14532D] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-emerald-950/70 dark:text-emerald-200">
                    <p className="text-xs font-bold opacity-85">Nilai Buku Saat Ini</p>
                    <p className="mt-1 text-base font-black">{formatRupiah(bookValue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b-2 border-[#2C2623]/15 bg-[#EDE9FE]/55 dark:border-stone-700 dark:bg-violet-950/25">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                  <span className="inline-flex size-7 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900">
                    <Layers className="size-3.5 text-violet-700 dark:text-violet-300" />
                  </span>
                  Sub-Komponen / Anak Item ({childItems.length})
                </CardTitle>
                <CardDescription className="font-medium">
                  Komponen turunan dengan sub-kode dari {item.item_code}.
                </CardDescription>
              </div>
              <Can action="inventory.create">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateSubOpen(true)}
                  className="bg-[#FFFDF7] dark:bg-stone-900"
                >
                  <Plus className="size-3.5" />
                  Tambah Sub-Item
                </Button>
              </Can>
            </CardHeader>
            <CardContent className="p-0">
              {childItems.length === 0 ? (
                <div className="p-5">
                  <KawaiiEmptyState
                    mascot="box"
                    title="Belum Ada Sub-Komponen"
                    description={`Belum ada sub-item terdaftar di bawah ${item.item_code}.`}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#FEF3C7]/60 hover:bg-[#FEF3C7]/60 dark:bg-stone-800/80">
                      <TableHead className="font-extrabold">Kode</TableHead>
                      <TableHead className="font-extrabold">Nama</TableHead>
                      <TableHead className="font-extrabold">Part</TableHead>
                      <TableHead className="font-extrabold">Kondisi</TableHead>
                      <TableHead className="font-extrabold">Sanitasi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {childItems.map((child) => (
                      <TableRow key={child.id}>
                        <TableCell>
                          <Link
                            href={`/inventory/${child.id}`}
                            className="inline-block rounded-lg border border-[#2C2623]/25 bg-white px-2 py-0.5 font-mono text-xs font-bold text-[#14532D] hover:bg-[#D1FAE5] dark:border-stone-600 dark:bg-stone-900 dark:text-emerald-300"
                          >
                            {child.item_code}
                          </Link>
                        </TableCell>
                        <TableCell className="font-bold">{child.name}</TableCell>
                        <TableCell>
                          <PartProgressIndicator
                            currentParts={child.current_parts}
                            totalParts={child.total_parts}
                            unitLabel={child.unit_label}
                          />
                        </TableCell>
                        <TableCell>
                          <ConditionBadge condition={child.condition} />
                        </TableCell>
                        <TableCell>
                          <HygieneBadge
                            status={child.hygiene_status}
                            assetType={child.asset_type}
                            nextDue={child.next_sanitization_due}
                            todayWib={todayWib}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
            <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#FFEDD5]/55 dark:border-stone-700 dark:bg-orange-950/25">
              <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                <span className="inline-flex size-7 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900">
                  <History className="size-3.5 text-orange-600 dark:text-orange-300" />
                </span>
                Riwayat Peminjaman Terbaru
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {borrowHistory.length === 0 ? (
                <div className="p-5">
                  <KawaiiEmptyState
                    mascot="history"
                    title="Belum Ada Riwayat Peminjaman"
                    description="Riwayat peminjaman dan pengembalian untuk item ini akan tampil di sini."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#FEF3C7]/60 hover:bg-[#FEF3C7]/60 dark:bg-stone-800/80">
                      <TableHead className="font-extrabold">Kode Trx</TableHead>
                      <TableHead className="font-extrabold">Peminjam</TableHead>
                      <TableHead className="font-extrabold">Ruangan</TableHead>
                      <TableHead className="font-extrabold">Part</TableHead>
                      <TableHead className="font-extrabold">Pinjam / Kembali</TableHead>
                      <TableHead className="font-extrabold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {borrowHistory.map((trx) => (
                      <TableRow key={trx.id}>
                        <TableCell className="font-mono text-xs font-bold">
                          {trx.transaction_code}
                        </TableCell>
                        <TableCell className="font-semibold">{trx.borrower_name || "-"}</TableCell>
                        <TableCell className="font-semibold">{trx.room_code || "-"}</TableCell>
                        <TableCell className="font-mono text-xs font-bold">
                          {trx.parts_before ?? "-"} → {trx.parts_after ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-normal">
                          <div>Pinjam: {formatDateWIB(trx.borrowed_at, true)}</div>
                          {trx.returned_at && (
                            <div className="text-muted-foreground">
                              Kembali: {formatDateWIB(trx.returned_at, true)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              trx.status === "HILANG_PART" || trx.status === "TERLAMBAT"
                                ? "rounded-full border-[1.5px] border-[#2C2623] bg-[#FECDD3] font-bold text-[#881337] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-rose-950/80 dark:text-rose-200"
                                : trx.status === "DIKEMBALIKAN"
                                  ? "rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] font-bold text-[#14532D] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-emerald-950/70 dark:text-emerald-200"
                                  : "rounded-full border-[1.5px] border-[#2C2623] bg-[#E0F2FE] font-bold text-[#0C4A6E] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-sky-950/70 dark:text-sky-200"
                            }
                          >
                            {BORROW_STATUS_LABELS[trx.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {canUpdateItem && (
        <ItemFormDialog
          key={`edit-${item.id}-${editOpen}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          editingItem={item}
          initialSignedPhotoUrl={signedPhotoUrl}
          parentCandidates={allItemsForParentSelect}
          onSaved={(_saved, message) => {
            if (message) setFeedback({ type: "success", text: message });
          }}
        />
      )}

      {canCreateItem && (
        <ItemFormDialog
          key={`sub-${item.id}-${createSubOpen}`}
          open={createSubOpen}
          onOpenChange={setCreateSubOpen}
          defaultParentId={item.id}
          parentCandidates={allItemsForParentSelect}
          onSaved={(_saved, message) => {
            if (message) setFeedback({ type: "success", text: message });
          }}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extrabold">Hapus Item Inventaris?</DialogTitle>
            <DialogDescription>
              Item <strong className="font-mono">{item.item_code}</strong> ({item.name}) akan
              dipindahkan ke Recycle Bin (dapat dipulihkan dalam 30 hari).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
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
              Ya, Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
