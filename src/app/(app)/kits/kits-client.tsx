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
  KIT_STATUS_LABELS,
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
  const { runWithFeedback } = useCartoonFeedback();
  const { inventoryOptions, getOptionWithCurrent, getLabel } = useLocations();
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

  const hasActiveFilters = Boolean(search || roomFilter !== ALL_OPTION || statusFilter !== ALL_OPTION);

  const handleCheckout = (kit: ItemKit) => {
    setFeedback(null);
    setPendingKitId(kit.id);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Memproses Check-Out Kit...",
            workingMessage: `Dino Joguman lagi mencatat peminjaman paket ${kit.kit_code} (${kit.kit_name}) untuk sesimu~`,
            successTitle: "Kit Siap Dipakai! 🎉",
            successMessage: (r) =>
              r.ok ? r.message ?? "Kit berhasil di-check-out!" : "",
            errorTitle: "Gagal Check-Out Kit...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => checkoutKitAction(kit.id),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setFeedback({ type: "success", text: res.message ?? "Kit berhasil di-check-out." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal melakukan check-out kit.",
        });
      } finally {
        setPendingKitId(null);
      }
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

    const isMultiItemReturn = itemUpdates.length > 1;

    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: isMultiItemReturn ? "batch" : "working",
            workingTitle: isMultiItemReturn
              ? "Memverifikasi Semua Item Kit..."
              : "Memproses Pengembalian Kit...",
            workingMessage: isMultiItemReturn
              ? `Tim mini lagi memperbarui kelengkapan kepingan & status sanitasi untuk ${itemUpdates.length} barang dalam ${kit.kit_code} sekaligus~`
              : `Dino Joguman lagi mencatat pengembalian ${kit.kit_code} dan status kebersihannya nih~`,
            successTitle: "Kit Berhasil Dikembalikan! ✨",
            successMessage: (r) =>
              r.ok ? r.message ?? "Kit berhasil dikembalikan!" : "",
            errorTitle: "Gagal Mengembalikan Kit...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () =>
            returnKitAction(kit.id, {
              hygieneStatus: returnHygiene,
              itemUpdates,
              notes: returnNotes.trim() || null,
            }),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setReturnTarget(null);
        setFeedback({ type: "success", text: res.message ?? "Kit berhasil dikembalikan." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal memproses pengembalian kit.",
        });
      } finally {
        setPendingKitId(null);
      }
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const kit = deleteTarget;
    setFeedback(null);
    setPendingKitId(kit.id);
    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Memindahkan Kit ke Recycle Bin...",
            workingMessage: `Sedang memindahkan ${kit.kit_code} (${kit.kit_name}) ke Recycle Bin, item di dalamnya tetap aman ya~`,
            successTitle: "Kit Dipindahkan! 🗑️",
            successMessage: (r) => (r.ok ? r.message ?? "Kit berhasil dihapus." : ""),
            errorTitle: "Gagal Menghapus Kit...",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => softDeleteKitAction(kit.id),
        );
        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        setDeleteTarget(null);
        setFeedback({ type: "success", text: res.message ?? "Kit dihapus." });
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Gagal menghapus kit.",
        });
      } finally {
        setPendingKitId(null);
      }
    });
  };

  const getKitHeaderBg = (status: KitStatus) => {
    switch (status) {
      case "TERSEDIA":
        return "bg-[#D1FAE5]/55 dark:bg-emerald-950/25";
      case "DIPINJAM":
        return "bg-[#E0F2FE]/60 dark:bg-sky-950/25";
      case "TIDAK_LENGKAP":
        return "bg-[#FFE4E6]/60 dark:bg-rose-950/25";
      case "NONAKTIF":
        return "bg-stone-200/60 dark:bg-stone-800/40";
    }
  };

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        badge="Bundling Paket Terapi"
        title="Manajemen Kit Terapi"
        description="Bundling paket alat terapi per ruangan dengan check-out dan pengembalian 1 klik."
        accent="lavender"
        mascot="chiikawa"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild className="bg-[#FFFDF7] dark:bg-stone-900">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KawaiiStatCard
          label="Total Kit Aktif"
          value={stats.total}
          hint="Paket bundling terdaftar"
          accent="lavender"
          icon={<Boxes className="size-4" />}
        />
        <KawaiiStatCard
          label="Kit Tersedia"
          value={stats.available}
          hint="Siap langsung check-out 1 klik"
          accent="mint"
          icon={<CheckCircle2 className="size-4" />}
        />
        <KawaiiStatCard
          label="Sedang Dipinjam"
          value={stats.borrowed}
          hint="Sedang dipakai sesi terapi"
          accent="sky"
          icon={<ArrowLeftRight className="size-4" />}
        />
        <KawaiiStatCard
          label="Kit Tidak Lengkap"
          value={stats.incomplete}
          hint="Ada item dengan part kurang"
          accent="butter"
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      <Card className="rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative min-w-[220px] flex-1">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode kit (KIT-...), nama kit, atau nama item…"
              className="bg-white pl-8 dark:bg-stone-900"
            />
          </div>

          <div className="w-48">
            <Select value={roomFilter} onValueChange={setRoomFilter}>
              <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
                <SelectValue placeholder="Ruangan" />
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
          </div>

          <div className="w-44">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
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

          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setRoomFilter(ALL_OPTION);
                setStatusFilter(ALL_OPTION);
              }}
              className="rounded-full bg-[#FEF3C7] font-bold text-[#2C2623] hover:bg-[#FDE68A] dark:bg-amber-950/60 dark:text-amber-100"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </CardContent>
      </Card>

      {filteredKits.length === 0 ? (
        <KawaiiEmptyState
          mascot="chiikawa"
          title="Belum ada kit yang sesuai"
          description={
            canManageKits
              ? "Buat kit baru untuk mengelompokkan beberapa mainan terapi dalam satu check-out praktis~"
              : "Belum ada paket alat (kit) yang cocok dengan filter pencarian Anda."
          }
          action={
            hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setRoomFilter(ALL_OPTION);
                  setStatusFilter(ALL_OPTION);
                }}
              >
                <RotateCcw className="size-3.5" />
                Reset Filter
              </Button>
            ) : canManageKits ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingKit(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-4" />
                Buat Kit Baru
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredKits.map((kit) => {
            const bundledItems = kit.bundled_item_ids
              .map((id) => itemMap.get(id))
              .filter((item): item is ItemMaster => Boolean(item));
            const activeBorrow = activeBorrowsByKitId[kit.id] ?? null;
            const rowBusy = isPending && pendingKitId === kit.id;

            return (
              <Card
                key={kit.id}
                className="flex flex-col justify-between overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]"
              >
                <CardHeader className={`border-b-2 border-[#2C2623]/15 dark:border-stone-700 ${getKitHeaderBg(kit.status)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="rounded-full border-[1.5px] border-[#2C2623] bg-white font-mono text-xs font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900"
                        >
                          {kit.kit_code}
                        </Badge>
                        <KitStatusBadge status={kit.status} />
                        {kit.assigned_room && (
                          <Badge
                            variant="outline"
                            className="rounded-full border-[1.5px] border-[#2C2623] bg-[#FEF3C7] text-xs font-bold text-[#78350F] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-amber-950/70 dark:text-amber-200"
                          >
                            {kit.assigned_room} · {getLabel(kit.assigned_room)}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg font-extrabold">{kit.kit_name}</CardTitle>
                      {kit.description && (
                        <CardDescription className="font-medium text-[#2C2623]/75 dark:text-stone-300">
                          {kit.description}
                        </CardDescription>
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
                          className="rounded-xl bg-white/70 hover:bg-[#FEF3C7] dark:bg-stone-900/60 dark:hover:bg-amber-950/60"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Hapus Kit"
                          onClick={() => setDeleteTarget(kit)}
                          disabled={rowBusy || kit.status === "DIPINJAM"}
                          className="rounded-xl bg-white/70 hover:bg-[#FFE4E6] dark:bg-stone-900/60 dark:hover:bg-rose-950/60"
                        >
                          <Trash2 className="text-destructive size-4" />
                        </Button>
                      </div>
                    </Can>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-4">
                  {activeBorrow && (
                    <div className="rounded-2xl border-2 border-[#2C2623] bg-[#E0F2FE] p-3 text-xs text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-sky-950/50 dark:text-sky-100">
                      <p className="font-extrabold">
                        Sedang dipinjam oleh {activeBorrow.borrower_name || "Terapis"}
                      </p>
                      <p className="mt-0.5 font-medium opacity-85">
                        {activeBorrow.transaction_code} · Sejak{" "}
                        {formatDateWIB(activeBorrow.borrowed_at, true)}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide">
                      <Sparkles className="size-3.5 text-amber-500" />
                      Komposisi Item ({bundledItems.length} barang)
                    </p>
                    {bundledItems.length === 0 ? (
                      <p className="rounded-2xl border-2 border-dashed border-[#2C2623]/20 bg-white/70 p-3 text-xs italic text-muted-foreground dark:border-stone-700 dark:bg-stone-900/40">
                        Tidak ada item aktif dalam kit ini.
                      </p>
                    ) : (
                      <ul className="divide-y-2 divide-[#2C2623]/10 overflow-hidden rounded-2xl border-2 border-[#2C2623]/20 bg-white dark:divide-stone-800 dark:border-stone-700 dark:bg-stone-900/50">
                        {bundledItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs transition-colors hover:bg-[#FEF3C7]/35 dark:hover:bg-stone-800/40"
                          >
                            <div className="min-w-0">
                              <Link
                                href={`/inventory/${item.id}`}
                                className="font-bold text-[#2C2623] hover:underline dark:text-stone-100"
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

                <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-[#2C2623]/15 bg-white/60 pt-4 dark:border-stone-700 dark:bg-stone-900/30">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="rounded-full bg-[#FFFDF7] font-bold dark:bg-stone-900"
                  >
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
                          className="rounded-full font-extrabold"
                        >
                          {rowBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ArrowLeftRight className="size-4" />
                          )}
                          Kembalikan Kit
                        </Button>
                      ) : (
                        <Badge
                          variant="outline"
                          className="rounded-full border-[1.5px] border-[#2C2623] bg-[#E0F2FE] text-xs font-bold text-[#0C4A6E] dark:border-stone-400 dark:bg-sky-950/70 dark:text-sky-200"
                        >
                          Dipinjam oleh {activeBorrow?.borrower_name || "rekan terapis"}
                        </Badge>
                      )
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleCheckout(kit)}
                        disabled={rowBusy || kit.status === "NONAKTIF"}
                        className="rounded-full font-extrabold"
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

      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[3px_3px_0px_0px_#0c0a09]">
        <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#FFEDD5]/55 dark:border-stone-700 dark:bg-orange-950/25">
          <CardTitle className="flex items-center gap-2 text-base font-extrabold">
            <span className="inline-flex size-7 items-center justify-center rounded-xl border-[1.5px] border-[#2C2623] bg-[#FFFDF7] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-stone-900">
              <History className="size-3.5 text-orange-600 dark:text-orange-300" />
            </span>
            Riwayat Transaksi Kit Terbaru
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentKitBorrows.length === 0 ? (
            <div className="p-5">
              <KawaiiEmptyState
                mascot="history"
                title="Belum Ada Transaksi Kit"
                description="Riwayat peminjaman dan pengembalian paket kit terapi akan tampil di sini."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-[#FEF3C7]/60 hover:bg-[#FEF3C7]/60 dark:bg-stone-800/80">
                  <TableHead className="font-extrabold">Kode Trx</TableHead>
                  <TableHead className="font-extrabold">Kode Kit</TableHead>
                  <TableHead className="font-extrabold">Peminjam</TableHead>
                  <TableHead className="font-extrabold">Ruangan</TableHead>
                  <TableHead className="font-extrabold">Total Part</TableHead>
                  <TableHead className="font-extrabold">Waktu</TableHead>
                  <TableHead className="font-extrabold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentKitBorrows.map((trx) => (
                  <TableRow key={trx.id}>
                    <TableCell className="font-mono text-xs font-bold">
                      {trx.transaction_code}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold">
                      {trx.kit_id ? kitCodeMap.get(trx.kit_id) ?? "-" : "-"}
                    </TableCell>
                    <TableCell className="font-semibold">{trx.borrower_name || "-"}</TableCell>
                    <TableCell className="font-semibold">
                      {trx.room_code ? `${trx.room_code} · ${getLabel(trx.room_code)}` : "-"}
                    </TableCell>
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
            <DialogTitle className="font-extrabold">
              Kembalikan Kit ({returnTarget?.kit_code})
            </DialogTitle>
            <DialogDescription>
              Verifikasi kelengkapan part dan status sanitasi mainan setelah sesi terapi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmReturn} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-bold">Status Kebersihan Mainan Setelah Sesi</Label>
              <Select
                value={returnHygiene}
                onValueChange={(v) => setReturnHygiene(v as HygieneStatus)}
              >
                <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
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
              <div className="space-y-2.5 rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7]/45 p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-amber-950/25">
                <Label className="text-xs font-extrabold">Cek Kepingan / Part Item</Label>
                <div className="space-y-2.5">
                  {returnTarget.bundled_item_ids.map((itemId) => {
                    const item = itemMap.get(itemId);
                    if (!item) return null;
                    const countVal = returnPartCounts[item.id] ?? item.current_parts;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#2C2623]/15 bg-white px-2.5 py-2 text-xs dark:border-stone-700 dark:bg-stone-900/70"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{item.name}</p>
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
                          className="h-8 w-20 bg-white text-right font-mono font-bold dark:bg-stone-900"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="kit-return-notes" className="font-bold">
                Catatan Pengembalian (Opsional)
              </Label>
              <Textarea
                id="kit-return-notes"
                rows={2}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Catat jika ada kerusakan atau kepingan tertinggal…"
                className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
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
            <DialogTitle className="font-extrabold">Hapus Kit?</DialogTitle>
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
