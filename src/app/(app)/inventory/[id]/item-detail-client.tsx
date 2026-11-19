"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  History,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Sparkles,
  Trash2,
} from "lucide-react";

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
      const res = await updateItemHygieneAction(item.id, status);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Status sanitasi diperbarui." });
    });
  };

  const handlePartsSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await updateItemPartsAction(item.id, Math.trunc(Number(partsValue)));
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Jumlah kepingan diperbarui." });
    });
  };

  const handleConditionChange = (nextCondition: ItemCondition) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateItemConditionAction(item.id, nextCondition);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Kondisi diperbarui." });
    });
  };

  const handleStockSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await updateConsumableStockAction(item.id, Math.trunc(Number(stockValue)));
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Stok diperbarui." });
    });
  };

  const handleConfirmDelete = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await softDeleteItemAction(item.id);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setDeleteOpen(false);
      router.push("/inventory");
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-1.5">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/inventory">
              <ArrowLeft className="size-4" />
              Kembali ke Daftar Inventaris
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-sm">
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
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
          <p className="text-muted-foreground text-sm">
            {CATEGORY_PREFIX_LABELS[item.category_prefix]} · {item.category} ·{" "}
            {item.room_code} ({LOCATION_LABELS[item.room_code]})
            {item.rack_location ? ` · ${item.rack_location}` : ""}
          </p>
          {parentItem && (
            <p className="text-muted-foreground text-xs">
              Sub-komponen dari:{" "}
              <Link
                href={`/inventory/${parentItem.id}`}
                className="text-primary font-mono hover:underline"
              >
                {parentItem.item_code} — {parentItem.name}
              </Link>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/scan?code=${encodeURIComponent(item.item_code)}`}>
              <QrCode className="size-4" />
              Pinjam / Kembalikan
            </Link>
          </Button>
          <Can action="inventory.update">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Foto & Identitas Barang</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {signedPhotoUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signedPhotoUrl}
                  alt={item.name}
                  className="size-full object-cover"
                />
              </div>
            ) : (
              <div className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center rounded-lg border text-sm">
                Belum ada foto barang
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Kode Item</dt>
              <dd className="font-mono font-medium">{item.item_code}</dd>
              <dt className="text-muted-foreground">Format Barcode</dt>
              <dd>{BARCODE_FORMAT_LABELS[item.barcode_format]}</dd>
              <dt className="text-muted-foreground">Ruangan</dt>
              <dd>
                {item.room_code} — {LOCATION_LABELS[item.room_code]}
              </dd>
              <dt className="text-muted-foreground">Rak / Lemari</dt>
              <dd>{item.rack_location || "-"}</dd>
              <dt className="text-muted-foreground">PIC</dt>
              <dd>{item.pic_name || "-"}</dd>
              <dt className="text-muted-foreground">Stok</dt>
              <dd className="font-mono">
                {item.stock_qty} {item.unit_label}
              </dd>
            </dl>

            {item.description && (
              <div className="border-t pt-3 text-sm">
                <p className="text-muted-foreground mb-1 text-xs font-medium">Deskripsi</p>
                <p className="whitespace-pre-line">{item.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4" />
                  Kontrol Sanitasi & Kebersihan
                </CardTitle>
                <CardDescription>
                  Terakhir disterilkan:{" "}
                  {item.last_sanitized_at ? formatDateWIB(item.last_sanitized_at, true) : "-"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <HygieneBadge
                  status={item.hygiene_status}
                  assetType={item.asset_type}
                  nextDue={item.next_sanitization_due}
                  todayWib={todayWib}
                />
                {item.next_sanitization_due && (
                  <p className="text-muted-foreground text-xs">
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
                      >
                        {HYGIENE_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                </Can>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Boxes className="size-4" />
                  Kelengkapan Part & Kondisi
                </CardTitle>
                <CardDescription>
                  Pemantauan kepingan mainan atau kelengkapan unit.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <PartProgressIndicator
                  currentParts={item.current_parts}
                  totalParts={item.total_parts}
                  unitLabel={item.unit_label}
                />

                {can("inventory.report_issue") && (
                  <form onSubmit={handlePartsSubmit} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="detail-parts-input" className="text-xs">
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
                    <Label className="text-xs">Ubah Status Kondisi</Label>
                    <Select
                      value={item.condition}
                      onValueChange={(v) => handleConditionChange(v as ItemCondition)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CONDITION_LABELS) as ItemCondition[])
                          .filter((k) => k !== "DIHAPUSBUKU" || can("inventory.update"))
                          .map((key) => (
                            <SelectItem key={key} value={key}>
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
                    className="flex items-end gap-2 border-t pt-3"
                  >
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="detail-stock-input" className="text-xs">
                        Stok Fisik ({item.unit_label}, Min: {item.min_stock_threshold})
                      </Label>
                      <Input
                        id="detail-stock-input"
                        type="number"
                        min={0}
                        value={stockValue}
                        onChange={(e) => setStockValue(e.target.value)}
                        disabled={isPending}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nilai Aset & Penyusutan Garis Lurus</CardTitle>
              <CardDescription>
                Perhitungan otomatis berdasarkan harga beli, tanggal perolehan, umur manfaat, dan nilai residu.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-muted-foreground text-xs">Tanggal Perolehan</p>
                  <p className="text-sm font-medium">{formatDateWIB(item.acquisition_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Harga Beli</p>
                  <p className="text-sm font-medium">{formatRupiah(item.purchase_price)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Umur Manfaat</p>
                  <p className="text-sm font-medium">
                    {item.useful_life_months ? `${item.useful_life_months} Bulan` : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Akumulasi Penyusutan</p>
                  <p className="text-sm font-medium">{formatRupiah(depreciationAccumulated)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Nilai Buku Saat Ini</p>
                  <p className="text-primary text-base font-semibold">{formatRupiah(bookValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Sub-Komponen / Anak Item ({childItems.length})</CardTitle>
                <CardDescription>
                  Komponen turunan dengan sub-kode dari {item.item_code}.
                </CardDescription>
              </div>
              <Can action="inventory.create">
                <Button size="sm" variant="outline" onClick={() => setCreateSubOpen(true)}>
                  <Plus className="size-3.5" />
                  Tambah Sub-Item
                </Button>
              </Can>
            </CardHeader>
            <CardContent className="p-0">
              {childItems.length === 0 ? (
                <p className="text-muted-foreground px-6 pb-6 text-sm">
                  Belum ada sub-item terdaftar di bawah {item.item_code}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Part</TableHead>
                      <TableHead>Kondisi</TableHead>
                      <TableHead>Sanitasi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {childItems.map((child) => (
                      <TableRow key={child.id}>
                        <TableCell>
                          <Link
                            href={`/inventory/${child.id}`}
                            className="text-primary font-mono text-xs font-semibold hover:underline"
                          >
                            {child.item_code}
                          </Link>
                        </TableCell>
                        <TableCell>{child.name}</TableCell>
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" />
                Riwayat Peminjaman Terbaru
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {borrowHistory.length === 0 ? (
                <p className="text-muted-foreground px-6 pb-6 text-sm">
                  Belum ada riwayat peminjaman untuk item ini.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode Trx</TableHead>
                      <TableHead>Peminjam</TableHead>
                      <TableHead>Ruangan</TableHead>
                      <TableHead>Part</TableHead>
                      <TableHead>Pinjam / Kembali</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {borrowHistory.map((trx) => (
                      <TableRow key={trx.id}>
                        <TableCell className="font-mono text-xs">{trx.transaction_code}</TableCell>
                        <TableCell>{trx.borrower_name || "-"}</TableCell>
                        <TableCell>{trx.room_code || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">
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
                            variant={
                              trx.status === "HILANG_PART" || trx.status === "TERLAMBAT"
                                ? "destructive"
                                : trx.status === "DIKEMBALIKAN"
                                  ? "outline"
                                  : "secondary"
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Item Inventaris?</DialogTitle>
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
