"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  History,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  checkoutKitAction,
  returnKitAction,
  softDeleteKitAction,
} from "@/lib/actions/kits";
import type { BorrowHistoryEntry } from "@/lib/actions/scan";
import {
  BORROW_STATUS_LABELS,
  HYGIENE_LABELS,
  INVENTORY_LOCATION_OPTIONS,
  KIT_STATUS_LABELS,
  LOCATION_LABELS,
  formatDateWIB,
} from "@/lib/constants";
import type {
  HygieneStatus,
  ItemKit,
  ItemMaster,
  KitStatus,
  LocationCode,
} from "@/types/database";
import {
  HygieneBadge,
  KitStatusBadge,
  PartProgressIndicator,
} from "../inventory/inventory-badges";
import { KitFormDialog } from "./kit-form-dialog";

const ALL_OPTION = "__ALL__";

type KitsClientProps = {
  kits: ItemKit[];
  items: ItemMaster[];
  activeBorrowsByKitId: Record<string, BorrowHistoryEntry>;
  recentKitBorrows: BorrowHistoryEntry[];
  todayWib: string;
};

export function KitsClient({
  kits,
  items,
  activeBorrowsByKitId,
  recentKitBorrows,
  todayWib,
}: KitsClientProps) {
  const { user, role, can } = useRole();
  const canManageKits = can("kits.manage");
  const canReturnAnyKit = role !== "STAFF";

  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState(ALL_OPTION);
  const [statusFilter, setStatusFilter] = useState(ALL_OPTION);

  const [formOpen, setFormOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<ItemKit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemKit | null>(null);
  const [returnTarget, setReturnTarget] = useState<ItemKit | null>(null);
  const [returnHygiene, setReturnHygiene] = useState<HygieneStatus>("PERLU_DICUCI");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnPartCounts, setReturnPartCounts] = useState<Record<string, number>>({});

  const [pendingKitId, setPendingKitId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const itemMap = useMemo(() => {
    const map = new Map<string, ItemMaster>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  const kitCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const kit of kits) {
      map.set(kit.id, kit.kit_code);
    }
    return map;
  }, [kits]);

  const stats = useMemo(
    () => ({
      total: kits.length,
      available: kits.filter((k) => k.status === "TERSEDIA").length,
      borrowed: kits.filter((k) => k.status === "DIPINJAM").length,
      incomplete: kits.filter((k) => k.status === "TIDAK_LENGKAP").length,
    }),
    [kits],
  );

  const filteredKits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return kits.filter((kit) => {
      if (roomFilter !== ALL_OPTION && kit.assigned_room !== (roomFilter as LocationCode)) {
        return false;
      }
      if (statusFilter !== ALL_OPTION && kit.status !== (statusFilter as KitStatus)) {
        return false;
      }
      if (!query) return true;
      const bundledMatch = kit.bundled_item_ids.some((id) => {
        const item = itemMap.get(id);
        return (
          item?.name.toLowerCase().includes(query) ||
          item?.item_code.toLowerCase().includes(query)
        );
      });
      return (
        kit.kit_code.toLowerCase().includes(query) ||
        kit.kit_name.toLowerCase().includes(query) ||
        (kit.description?.toLowerCase().includes(query) ?? false) ||
        bundledMatch
      );
    });
  }, [kits, search, roomFilter, statusFilter, itemMap]);

  const handleCheckout = (kit: ItemKit) => {
    setFeedback(null);
    setPendingKitId(kit.id);
    startTransition(async () => {
      const res = await checkoutKitAction(kit.id);
      setPendingKitId(null);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Kit berhasil di-check-out." });
    });
  };

  const handleOpenReturnDialog = (kit: ItemKit) => {
    const initialParts: Record<string, number> = {};
    for (const itemId of kit.bundled_item_ids) {
      const item = itemMap.get(itemId);
      if (item) {
        initialParts[item.id] = item.current_parts;
      }
    }
    setReturnPartCounts(initialParts);
    setReturnHygiene("PERLU_DICUCI");
    setReturnNotes("");
    setReturnTarget(kit);
  };

  const handleConfirmReturn = (event: React.FormEvent) => {
    event.preventDefault();
    if (!returnTarget) return;
    const kit = returnTarget;
    setFeedback(null);
    setPendingKitId(kit.id);

    const itemUpdates = kit.bundled_item_ids
      .map((itemId) => {
        const item = itemMap.get(itemId);
        if (!item) return null;
        return {
          itemId: item.id,
          currentParts: returnPartCounts[item.id] ?? item.current_parts,
          hygieneStatus: item.asset_type === "THERAPY_TOY" ? returnHygiene : undefined,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    startTransition(async () => {
      const res = await returnKitAction(kit.id, {
        hygieneStatus: returnHygiene,
        itemUpdates,
        notes: returnNotes.trim() || null,
      });
      setPendingKitId(null);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setReturnTarget(null);
      setFeedback({ type: "success", text: res.message ?? "Kit berhasil dikembalikan." });
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const kitId = deleteTarget.id;
    setFeedback(null);
    setPendingKitId(kitId);
    startTransition(async () => {
      const res = await softDeleteKitAction(kitId);
      setPendingKitId(null);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setDeleteTarget(null);
      setFeedback({ type: "success", text: res.message ?? "Kit dihapus." });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manajemen Kit Terapi</h1>
          <p className="text-muted-foreground text-sm">
            Bundling paket alat terapi per ruangan dengan check-out dan pengembalian 1 klik.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/scan">
              <QrCode className="size-4" />
              Scan Kit
            </Link>
          </Button>
          <Can action="kits.manage">
            <Button
              onClick={() => {
                setEditingKit(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Buat Kit Baru
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Kit Aktif</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Kit Tersedia</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{stats.available}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sedang Dipinjam</CardDescription>
            <CardTitle className="text-2xl text-sky-600">{stats.borrowed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Kit Tidak Lengkap</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{stats.incomplete}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative min-w-[220px] flex-1">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode kit (KIT-...), nama kit, atau nama item…"
              className="pl-8"
            />
          </div>

          <div className="w-48">
            <Select value={roomFilter} onValueChange={setRoomFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Ruangan" />
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
          </div>

          <div className="w-44">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Status Kit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Semua Status</SelectItem>
                {(Object.keys(KIT_STATUS_LABELS) as KitStatus[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {KIT_STATUS_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(search || roomFilter !== ALL_OPTION || statusFilter !== ALL_OPTION) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setRoomFilter(ALL_OPTION);
                setStatusFilter(ALL_OPTION);
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </CardContent>
      </Card>

      {filteredKits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Boxes className="text-muted-foreground size-10 opacity-50" />
            <p className="font-medium">Belum ada kit yang sesuai</p>
            <p className="text-muted-foreground text-sm">
              {canManageKits
                ? "Buat kit baru untuk mengelompokkan beberapa mainan terapi dalam satu check-out."
                : "Belum ada paket alat (kit) yang cocok dengan filter pencarian Anda."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredKits.map((kit) => {
            const bundledItems = kit.bundled_item_ids
              .map((id) => itemMap.get(id))
              .filter((item): item is ItemMaster => Boolean(item));
            const activeBorrow = activeBorrowsByKitId[kit.id] ?? null;
            const rowBusy = isPending && pendingKitId === kit.id;

            return (
              <Card key={kit.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {kit.kit_code}
                        </Badge>
                        <KitStatusBadge status={kit.status} />
                        {kit.assigned_room && (
                          <Badge variant="secondary">
                            {kit.assigned_room} · {LOCATION_LABELS[kit.assigned_room]}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg">{kit.kit_name}</CardTitle>
                      {kit.description && (
                        <CardDescription>{kit.description}</CardDescription>
                      )}
                    </div>

                    <Can action="kits.manage">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit Kit"
                          onClick={() => {
                            setEditingKit(kit);
                            setFormOpen(true);
                          }}
                          disabled={rowBusy}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Hapus Kit"
                          onClick={() => setDeleteTarget(kit)}
                          disabled={rowBusy || kit.status === "DIPINJAM"}
                        >
                          <Trash2 className="text-destructive size-4" />
                        </Button>
                      </div>
                    </Can>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {activeBorrow && (
                    <div className="rounded-md border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
                      <p className="font-medium">
                        Sedang dipinjam oleh {activeBorrow.borrower_name || "Terapis"}
                      </p>
                      <p className="opacity-80">
                        {activeBorrow.transaction_code} · Sejak{" "}
                        {formatDateWIB(activeBorrow.borrowed_at, true)}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium">
                      Komposisi Item ({bundledItems.length} barang)
                    </p>
                    {bundledItems.length === 0 ? (
                      <p className="text-muted-foreground text-xs italic">
                        Tidak ada item aktif dalam kit ini.
                      </p>
                    ) : (
                      <ul className="divide-y rounded-md border">
                        {bundledItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <Link
                                href={`/inventory/${item.id}`}
                                className="font-medium hover:underline"
                              >
                                {item.name}
                              </Link>
                              <p className="text-muted-foreground font-mono text-[11px]">
                                {item.item_code}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <PartProgressIndicator
                                currentParts={item.current_parts}
                                totalParts={item.total_parts}
                                unitLabel={item.unit_label}
                              />
                              <HygieneBadge
                                status={item.hygiene_status}
                                assetType={item.asset_type}
                                nextDue={item.next_sanitization_due}
                                todayWib={todayWib}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/scan?code=${encodeURIComponent(kit.kit_code)}`}>
                      <QrCode className="size-3.5" />
                      Buka di Scanner
                    </Link>
                  </Button>

                  <Can action="kits.checkout">
                    {kit.status === "DIPINJAM" ? (
                      canReturnAnyKit || activeBorrow?.borrower_id === user.id ? (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleOpenReturnDialog(kit)}
                          disabled={rowBusy}
                        >
                          {rowBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ArrowLeftRight className="size-4" />
                          )}
                          Kembalikan Kit
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-xs font-normal">
                          Dipinjam oleh {activeBorrow?.borrower_name || "rekan terapis"}
                        </Badge>
                      )
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleCheckout(kit)}
                        disabled={rowBusy || kit.status === "NONAKTIF"}
                      >
                        {rowBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ArrowLeftRight className="size-4" />
                        )}
                        Check-Out Kit (1 Klik)
                      </Button>
                    )}
                  </Can>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Riwayat Transaksi Kit Terbaru
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentKitBorrows.length === 0 ? (
            <p className="text-muted-foreground px-6 pb-6 text-sm">
              Belum ada transaksi peminjaman kit.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode Trx</TableHead>
                  <TableHead>Kode Kit</TableHead>
                  <TableHead>Peminjam</TableHead>
                  <TableHead>Ruangan</TableHead>
                  <TableHead>Total Part</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentKitBorrows.map((trx) => (
                  <TableRow key={trx.id}>
                    <TableCell className="font-mono text-xs">{trx.transaction_code}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {trx.kit_id ? kitCodeMap.get(trx.kit_id) ?? "-" : "-"}
                    </TableCell>
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

      {canManageKits && (
        <KitFormDialog
          key={editingKit?.id ?? (formOpen ? "kit-new-open" : "kit-new-closed")}
          open={formOpen}
          onOpenChange={setFormOpen}
          editingKit={editingKit}
          availableItems={items}
          onSaved={(_saved, message) => {
            if (message) setFeedback({ type: "success", text: message });
          }}
        />
      )}

      <Dialog
        open={Boolean(returnTarget)}
        onOpenChange={(open) => {
          if (!open) setReturnTarget(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Kembalikan Kit ({returnTarget?.kit_code})</DialogTitle>
            <DialogDescription>
              Verifikasi kelengkapan part dan status sanitasi mainan setelah sesi terapi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmReturn} className="space-y-4">
            <div className="space-y-2">
              <Label>Status Kebersihan Mainan Setelah Sesi</Label>
              <Select
                value={returnHygiene}
                onValueChange={(v) => setReturnHygiene(v as HygieneStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(HYGIENE_LABELS) as HygieneStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {HYGIENE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {returnTarget && returnTarget.bundled_item_ids.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <Label className="text-xs font-medium">Cek Kepingan / Part Item</Label>
                <div className="space-y-2.5">
                  {returnTarget.bundled_item_ids.map((itemId) => {
                    const item = itemMap.get(itemId);
                    if (!item) return null;
                    const countVal = returnPartCounts[item.id] ?? item.current_parts;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="text-muted-foreground font-mono text-[11px]">
                            {item.item_code} · Total: {item.total_parts} {item.unit_label}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={item.total_parts}
                          value={countVal}
                          onChange={(e) =>
                            setReturnPartCounts((prev) => ({
                              ...prev,
                              [item.id]: Math.trunc(Number(e.target.value) || 0),
                            }))
                          }
                          className="h-8 w-20 text-right font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="kit-return-notes">Catatan Pengembalian (Opsional)</Label>
              <Textarea
                id="kit-return-notes"
                rows={2}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Catat jika ada kerusakan atau kepingan tertinggal…"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReturnTarget(null)}
                disabled={isPending}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="size-4 animate-spin" />}
                Konfirmasi Pengembalian
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
            <DialogTitle>Hapus Kit?</DialogTitle>
            <DialogDescription>
              Kit <strong className="font-mono">{deleteTarget?.kit_code}</strong> (
              {deleteTarget?.kit_name}) akan dipindahkan ke Recycle Bin. Item di dalamnya tetap aman di inventaris.
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
              Ya, Hapus Kit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
