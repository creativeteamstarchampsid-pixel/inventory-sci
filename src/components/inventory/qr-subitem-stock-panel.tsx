"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Layers,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
} from "lucide-react";

import {
  ConditionBadge,
  HygieneBadge,
} from "@/app/(app)/inventory/inventory-badges";
import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  quickUpdateItemStockHierarchyAction,
  type SubmitOpnameResult,
} from "@/lib/actions/stock-opname";
import type { ItemMaster } from "@/types/database";

export type QrSubItemStockPanelProps = {
  /** The scanned or opened item */
  item: ItemMaster;
  /** Parent item when `item` is a Sub-Item */
  parentItem?: ItemMaster | null;
  /** All active Sub-Items belonging to the Parent Item (or sibling Sub-Items when a Sub-Item is opened) */
  subItems: ItemMaster[];
  /** Whether the active user has permission (`inventory.validate_opname`) to save stock updates */
  canUpdateStock: boolean;
  /** Today's WIB YYYY-MM-DD for sanitization overdue badges */
  todayWib?: string;
  /**
   * "full": renders BOTH the Sub-Item Rincian card and the interactive Update Stok card (ideal for /s/[slug]).
   * "update_only": renders only the interactive Update Stok editor (ideal for /scan tab or /inventory/[id] inline panel).
   */
  variant?: "full" | "update_only";
  /** Optional callback invoked after a successful save */
  onUpdated?: (result: SubmitOpnameResult) => void | Promise<void>;
  /** Optional callback for switching the focused item inside /scan */
  onSelectSubItemCode?: (itemCode: string) => void;
};

function sanitizeDigits(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

function parseNonNegInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

function isStrictlyLowStock(item: ItemMaster): boolean {
  return (
    !item.has_sub_items &&
    item.asset_type === "CONSUMABLE" &&
    item.min_stock_threshold > 0 &&
    item.stock_qty < item.min_stock_threshold
  );
}

export function QrSubItemStockPanel({
  item,
  parentItem = null,
  subItems,
  canUpdateStock,
  todayWib,
  variant = "full",
  onUpdated,
  onSelectSubItemCode,
}: QrSubItemStockPanelProps) {
  const router = useRouter();
  const { runWithFeedback } = useCartoonFeedback();

  const isHierarchy = Boolean(parentItem) || item.has_sub_items || subItems.length > 0;
  const effectiveParent = parentItem ?? (isHierarchy ? item : null);
  const highlightedSubId = parentItem ? item.id : null;
  const opnameCode = effectiveParent?.item_code ?? item.item_code;
  const stockOpnameHref = `/stock-opname?code=${encodeURIComponent(opnameCode)}`;

  // Local editable stocks keyed by item.id (never coerces empty input to 0!)
  const [stockInputs, setStockInputs] = React.useState<Record<string, string>>(() => {
    if (isHierarchy && subItems.length > 0) {
      const map: Record<string, string> = {};
      for (const sub of subItems) {
        map[sub.id] = String(sub.stock_qty);
      }
      return map;
    }
    return { [item.id]: String(item.stock_qty) };
  });
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Sync inputs whenever the scanned/opened target changes or server data refreshes
  const syncSignature = React.useMemo(() => {
    if (isHierarchy && subItems.length > 0) {
      return subItems.map((s) => `${s.id}:${s.stock_qty}`).join("|");
    }
    return `${item.id}:${item.stock_qty}`;
  }, [isHierarchy, item.id, item.stock_qty, subItems]);

  React.useEffect(() => {
    if (isHierarchy && subItems.length > 0) {
      const next: Record<string, string> = {};
      for (const sub of subItems) {
        next[sub.id] = String(sub.stock_qty);
      }
      setStockInputs(next);
    } else {
      setStockInputs({ [item.id]: String(item.stock_qty) });
    }
    setNotes("");
  }, [syncSignature, isHierarchy, item.id, item.stock_qty, subItems]);

  const setItemStockValue = (itemId: string, raw: string) => {
    setStockInputs((prev) => ({ ...prev, [itemId]: sanitizeDigits(raw) }));
  };

  const stepItemStock = (itemId: string, fallbackCurrent: number, delta: number) => {
    setStockInputs((prev) => {
      const parsed = parseNonNegInt(prev[itemId] ?? "");
      const base = parsed ?? fallbackCurrent;
      return { ...prev, [itemId]: String(Math.max(0, base + delta)) };
    });
  };

  const resetToSystemStock = () => {
    if (isHierarchy && subItems.length > 0) {
      const next: Record<string, string> = {};
      for (const sub of subItems) {
        next[sub.id] = String(sub.stock_qty);
      }
      setStockInputs(next);
    } else {
      setStockInputs({ [item.id]: String(item.stock_qty) });
    }
    setFeedback(null);
  };

  // Live summary calculations (usable stock excludes DIHAPUSBUKU just like the DB trigger)
  const hierarchyTotals = React.useMemo(() => {
    if (!isHierarchy || subItems.length === 0) {
      const parsed = parseNonNegInt(stockInputs[item.id] ?? "");
      return {
        systemTotal: item.stock_qty,
        actualTotal: parsed,
        filledCount: parsed !== null ? 1 : 0,
        totalCount: 1,
        changedCount: parsed !== null && parsed !== item.stock_qty ? 1 : 0,
        missingNames: parsed === null ? [item.name] : [],
      };
    }

    let systemTotal = 0;
    let actualTotal = 0;
    let filledCount = 0;
    let changedCount = 0;
    const missingNames: string[] = [];

    for (const sub of subItems) {
      const countsTowardParent = sub.condition !== "DIHAPUSBUKU";
      if (countsTowardParent) {
        systemTotal += sub.stock_qty;
      }
      const parsed = parseNonNegInt(stockInputs[sub.id] ?? "");
      if (parsed === null) {
        missingNames.push(sub.name);
      } else {
        filledCount += 1;
        if (countsTowardParent) {
          actualTotal += parsed;
        }
        if (parsed !== sub.stock_qty) {
          changedCount += 1;
        }
      }
    }

    return {
      systemTotal,
      actualTotal: missingNames.length === 0 ? actualTotal : null,
      filledCount,
      totalCount: subItems.length,
      changedCount,
      missingNames,
    };
  }, [isHierarchy, item.id, item.name, item.stock_qty, stockInputs, subItems]);

  const handleSaveStock = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    if (isHierarchy && subItems.length === 0) {
      setFeedback({
        type: "error",
        text: "Parent Item ini belum memiliki Sub-Item aktif. Tambahkan Sub-Item terlebih dahulu melalui halaman Detail Inventaris.",
      });
      return;
    }

    if (hierarchyTotals.missingNames.length > 0) {
      setFeedback({
        type: "error",
        text: `Masih ada ${hierarchyTotals.missingNames.length} input stok kosong (contoh: "${hierarchyTotals.missingNames[0]}"). Isi angka >= 0 terlebih dahulu.`,
      });
      return;
    }

    const entries =
      isHierarchy && subItems.length > 0
        ? subItems.map((sub) => ({
            itemId: sub.id,
            actualStock: parseNonNegInt(stockInputs[sub.id] ?? "") ?? sub.stock_qty,
            condition: sub.condition,
            hygieneStatus: sub.hygiene_status,
          }))
        : [
            {
              itemId: item.id,
              actualStock: parseNonNegInt(stockInputs[item.id] ?? "") ?? item.stock_qty,
              condition: item.condition,
              hygieneStatus: item.hygiene_status,
            },
          ];

    setSaving(true);
    try {
      const targetName = effectiveParent?.name ?? item.name;
      const res = await runWithFeedback(
        {
          mode: entries.length > 1 ? "batch" : "working",
          workingTitle:
            entries.length > 1
              ? "Menyimpan Stok Semua Sub-Item..."
              : "Menyimpan Update Stok...",
          workingMessage:
            entries.length > 1
              ? `Memperbarui ${entries.length} varian "${targetName}" dan menghitung ulang total Parent secara otomatis~`
              : `Memperbarui stok fisik "${targetName}" ke database inventaris~`,
          successTitle: "Stok Berhasil Diperbarui! ✨",
          successMessage: (r) =>
            r.ok && r.message
              ? r.message
              : `Stok "${targetName}" berhasil diperbarui.`,
          errorTitle: "Gagal Update Stok...",
          isResultError: (r) => (!r.ok ? r.error : null),
        },
        () =>
          quickUpdateItemStockHierarchyAction({
            targetItemId: effectiveParent?.id ?? item.id,
            entries,
            notes: notes.trim() || null,
          }),
      );

      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }

      setFeedback({
        type: "success",
        text:
          res.message ??
          `Stok ${targetName} berhasil diperbarui dan tercatat pada sesi Stock Opname aktif.`,
      });
      setNotes("");

      if (onUpdated) {
        await onUpdated(res.data);
      }
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat menyimpan pembaruan stok.",
      });
    } finally {
      setSaving(false);
    }
  };

  const totalDiff =
    hierarchyTotals.actualTotal !== null
      ? hierarchyTotals.actualTotal - hierarchyTotals.systemTotal
      : null;

  const unitDisplay = effectiveParent?.unit_label ?? item.unit_label;

  return (
    <div className="space-y-4">
      {/* 1. Rincian Sub-Item Card (Shown in "full" mode whenever item is Parent or Sub-Item) */}
      {variant === "full" && isHierarchy && (
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
          <CardHeader className="border-b-2 border-[#2C2623] bg-[#EDE9FE] px-5 py-3.5 dark:border-stone-500 dark:bg-violet-950/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm font-black text-[#2C2623] dark:text-stone-100">
                  <Layers className="size-4 shrink-0 text-[#5B21B6] dark:text-violet-300" />
                  Rincian Sub-Item / Varian ({subItems.length})
                </CardTitle>
                <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
                  {parentItem
                    ? `Seluruh varian di bawah Parent "${parentItem.name}" (${parentItem.item_code}).`
                    : `Total stok Parent (${item.stock_qty} ${item.unit_label}) dihitung otomatis dari seluruh Sub-Item aktif.`}
                </CardDescription>
              </div>
              {effectiveParent && (
                <Badge
                  variant="outline"
                  className="rounded-full border-2 border-[#2C2623] bg-white px-3 py-1 font-mono text-xs font-black text-[#14532D] dark:border-stone-400 dark:bg-stone-950 dark:text-emerald-300"
                >
                  Total: {effectiveParent.stock_qty} {effectiveParent.unit_label}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {subItems.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-[#2C2623]/25 bg-[#FEF3C7]/40 p-4 text-center text-xs font-semibold text-[#574E49] dark:border-stone-600 dark:bg-amber-950/20 dark:text-stone-300">
                Belum ada Sub-Item aktif yang terdaftar pada Parent Item ini.
              </p>
            ) : (
              <div className="divide-y-2 divide-dashed divide-[#2C2623]/15 dark:divide-stone-700">
                {subItems.map((sub) => {
                  const isScannedRow = sub.id === highlightedSubId;
                  const lowStock = isStrictlyLowStock(sub);
                  return (
                    <div
                      key={sub.id}
                      className={`flex flex-wrap items-center justify-between gap-2.5 py-2.5 first:pt-0 last:pb-0 ${
                        isScannedRow
                          ? "-mx-2 rounded-xl border border-[#2C2623]/30 bg-[#FEF3C7]/65 px-2.5 dark:border-amber-500/40 dark:bg-amber-950/35"
                          : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-[#14532D] dark:text-emerald-300">
                            {sub.item_code}
                          </span>
                          {isScannedRow && (
                            <Badge className="rounded-full border border-[#2C2623] bg-[#FDE68A] px-2 py-0 text-[10px] font-black text-[#2C2623]">
                              QR Dipindai
                            </Badge>
                          )}
                          {lowStock && (
                            <Badge className="rounded-full border border-[#2C2623] bg-[#FECDD3] px-2 py-0 text-[10px] font-extrabold text-[#881337]">
                              Low-Stock
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                          {sub.name}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-xl border-2 border-[#2C2623] bg-white px-2.5 py-1 font-mono text-xs font-black text-[#2C2623] dark:border-stone-500 dark:bg-stone-950 dark:text-stone-100">
                          {sub.stock_qty} {sub.unit_label}
                        </span>
                        <ConditionBadge condition={sub.condition} />
                        {todayWib && sub.asset_type === "THERAPY_TOY" && (
                          <HygieneBadge
                            status={sub.hygiene_status}
                            assetType={sub.asset_type}
                            nextDue={sub.next_sanitization_due}
                            todayWib={todayWib}
                          />
                        )}
                        {onSelectSubItemCode ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onSelectSubItemCode(sub.item_code)}
                            className="h-7 rounded-lg border-2 border-[#2C2623] bg-white px-2 text-[11px] font-bold"
                          >
                            Pilih
                          </Button>
                        ) : (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg border-2 border-[#2C2623] bg-white px-2 text-[11px] font-bold dark:border-stone-500 dark:bg-stone-950"
                          >
                            <Link href={`/inventory/${sub.id}`}>
                              Detail
                              <ExternalLink className="size-3" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. Interactive Update Stok Card (Parent with Sub-Items OR Simple Item) */}
      {canUpdateStock && (
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
          <CardHeader className="border-b-2 border-[#2C2623] bg-[#FEF3C7] px-5 py-3.5 dark:border-stone-500 dark:bg-amber-950/45">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm font-black text-[#2C2623] dark:text-stone-100">
                  <Boxes className="size-4 shrink-0 text-[#B45309] dark:text-amber-300" />
                  {isHierarchy
                    ? `Update Stok Cepat · Semua Sub-Item (${subItems.length} Varian)`
                    : "Update Stok Cepat"}
                </CardTitle>
                <CardDescription className="text-xs font-medium text-[#463F3A] dark:text-stone-300">
                  {isHierarchy
                    ? `Isi jumlah aktual per varian. Total Parent "${effectiveParent?.name ?? item.name}" dihitung otomatis & langsung tersimpan ke Stock Opname.`
                    : `Perbarui stok fisik "${item.name}" langsung dari hasil scan QR tanpa membuka banyak halaman.`}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={resetToSystemStock}
                  disabled={saving}
                  className="h-8 rounded-xl border-2 border-[#2C2623] bg-white text-xs font-extrabold text-[#2C2623] hover:bg-[#D1FAE5] dark:border-stone-500 dark:bg-stone-950 dark:text-stone-100"
                >
                  <RotateCcw className="size-3.5" />
                  Reset Sistem
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#DDD6FE] text-xs font-extrabold text-[#2C2623] hover:bg-[#C4B5FD] dark:border-stone-500 dark:bg-violet-950/70 dark:text-violet-100"
                >
                  <Link href={stockOpnameHref}>
                    <ClipboardCheck className="size-3.5" />
                    Stock Opname Penuh
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-4 sm:p-5">
            {feedback && (
              <Alert
                variant={feedback.type === "error" ? "destructive" : "default"}
                className={
                  feedback.type === "success"
                    ? "rounded-2xl border-2 border-[#2C2623] bg-[#ECFDF5] text-[#14532D] dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100"
                    : "rounded-2xl border-2 border-[#2C2623] bg-[#FFF1F2] dark:border-rose-500 dark:bg-rose-950/50"
                }
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="size-4 text-[#2AB673]" />
                ) : (
                  <AlertTriangle className="size-4" />
                )}
                <AlertDescription className="text-xs font-bold">
                  {feedback.text}
                </AlertDescription>
              </Alert>
            )}

            {/* Live Totals Strip */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-2xl border-2 border-[#2C2623]/20 bg-white p-2.5 dark:border-stone-700 dark:bg-stone-950">
                <p className="text-muted-foreground text-[10px] font-bold uppercase">
                  Stok Sistem
                </p>
                <p className="mt-0.5 font-mono text-sm font-black text-[#2C2623] sm:text-base dark:text-stone-100">
                  {hierarchyTotals.systemTotal}{" "}
                  <span className="text-[11px] font-bold">{unitDisplay}</span>
                </p>
              </div>
              <div className="rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5]/75 p-2.5 dark:border-emerald-500/50 dark:bg-emerald-950/40">
                <p className="text-[10px] font-bold text-[#14532D] uppercase dark:text-emerald-200">
                  {isHierarchy ? "Total Aktual (Auto)" : "Stok Aktual"}
                </p>
                <p className="mt-0.5 font-mono text-sm font-black text-[#14532D] sm:text-base dark:text-emerald-100">
                  {hierarchyTotals.actualTotal !== null ? (
                    <>
                      {hierarchyTotals.actualTotal}{" "}
                      <span className="text-[11px] font-bold">{unitDisplay}</span>
                    </>
                  ) : (
                    <span className="text-xs text-amber-800 dark:text-amber-300">
                      Belum lengkap
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-2xl border-2 border-[#2C2623]/20 bg-white p-2.5 dark:border-stone-700 dark:bg-stone-950">
                <p className="text-muted-foreground text-[10px] font-bold uppercase">
                  Selisih
                </p>
                <p
                  className={`mt-0.5 font-mono text-sm font-black sm:text-base ${
                    totalDiff === null
                      ? "text-muted-foreground"
                      : totalDiff === 0
                        ? "text-[#14532D] dark:text-emerald-300"
                        : totalDiff > 0
                          ? "text-[#0369A1] dark:text-sky-300"
                          : "text-[#BE123C] dark:text-rose-300"
                  }`}
                >
                  {totalDiff === null
                    ? "-"
                    : totalDiff === 0
                      ? "0 (Sesuai)"
                      : totalDiff > 0
                        ? `+${totalDiff}`
                        : `${totalDiff}`}
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void handleSaveStock(e)} className="space-y-4">
              {isHierarchy ? (
                subItems.length === 0 ? (
                  <p className="rounded-2xl border-2 border-dashed border-[#2C2623]/30 bg-white p-4 text-center text-xs font-semibold text-[#574E49]">
                    Parent Item belum memiliki Sub-Item aktif. Tambahkan Sub-Item terlebih dahulu di halaman Detail Barang.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {subItems.map((sub) => {
                      const rawVal = stockInputs[sub.id] ?? "";
                      const parsedVal = parseNonNegInt(rawVal);
                      const diff = parsedVal !== null ? parsedVal - sub.stock_qty : null;
                      const isScannedRow = sub.id === highlightedSubId;
                      const isWrittenOff = sub.condition === "DIHAPUSBUKU";

                      return (
                        <div
                          key={sub.id}
                          className={`flex flex-col gap-2.5 rounded-2xl border-2 p-3 sm:flex-row sm:items-center sm:justify-between ${
                            isScannedRow
                              ? "border-[#2C2623] bg-[#FEF3C7]/70 shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-400 dark:bg-amber-950/35"
                              : diff !== null && diff !== 0
                                ? "border-[#0284C7] bg-[#E0F2FE]/45 dark:border-sky-500/60 dark:bg-sky-950/25"
                                : "border-[#2C2623]/25 bg-white dark:border-stone-700 dark:bg-stone-950/70"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[11px] font-extrabold text-[#14532D] dark:text-emerald-300">
                                {sub.item_code}
                              </span>
                              {isScannedRow && (
                                <Badge className="rounded-full border border-[#2C2623] bg-[#FDE68A] px-2 py-0 text-[10px] font-black text-[#2C2623]">
                                  Dipindai
                                </Badge>
                              )}
                              {isWrittenOff && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full px-1.5 py-0 text-[10px] font-bold"
                                >
                                  Dihapusbuku
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                              {sub.name}
                            </p>
                            <p className="text-muted-foreground text-[11px] font-semibold">
                              Sistem: <span className="font-mono font-bold">{sub.stock_qty}</span>{" "}
                              {sub.unit_label}
                              {diff !== null && (
                                <span
                                  className={`ml-2 font-mono font-extrabold ${
                                    diff === 0
                                      ? "text-emerald-700 dark:text-emerald-300"
                                      : diff > 0
                                        ? "text-sky-700 dark:text-sky-300"
                                        : "text-rose-700 dark:text-rose-300"
                                  }`}
                                >
                                  ({diff === 0 ? "Sesuai" : diff > 0 ? `+${diff}` : diff})
                                </span>
                              )}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-center">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              disabled={saving}
                              onClick={() => stepItemStock(sub.id, sub.stock_qty, -1)}
                              aria-label={`Kurangi stok ${sub.name}`}
                              className="size-9 rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#2C2623] hover:bg-[#FECDD3] dark:border-stone-500"
                            >
                              <Minus className="size-3.5" />
                            </Button>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={rawVal}
                              onChange={(e) => setItemStockValue(sub.id, e.target.value)}
                              placeholder="Isi"
                              disabled={saving}
                              aria-label={`Stok aktual ${sub.name}`}
                              className="h-9 w-20 rounded-xl border-2 border-[#2C2623] bg-white text-center font-mono text-sm font-black dark:border-stone-500 dark:bg-stone-900"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              disabled={saving}
                              onClick={() => stepItemStock(sub.id, sub.stock_qty, 1)}
                              aria-label={`Tambah stok ${sub.name}`}
                              className="size-9 rounded-xl border-2 border-[#2C2623] bg-[#D1FAE5] text-[#2C2623] hover:bg-[#A7F3D0] dark:border-stone-500"
                            >
                              <Plus className="size-3.5" />
                            </Button>
                            <span className="text-muted-foreground min-w-[38px] text-xs font-bold">
                              {sub.unit_label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-3 rounded-2xl border-2 border-[#2C2623]/25 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-stone-700 dark:bg-stone-950/70">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                      {item.name}
                    </p>
                    <p className="text-muted-foreground text-xs font-semibold">
                      Stok sistem: <span className="font-mono font-bold">{item.stock_qty}</span>{" "}
                      {item.unit_label}
                      {item.asset_type === "CONSUMABLE" && item.min_stock_threshold > 0
                        ? ` · Min. ${item.min_stock_threshold} ${item.unit_label}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={saving}
                      onClick={() => stepItemStock(item.id, item.stock_qty, -1)}
                      aria-label={`Kurangi stok ${item.name}`}
                      className="size-9 rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#2C2623] hover:bg-[#FECDD3]"
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={stockInputs[item.id] ?? ""}
                      onChange={(e) => setItemStockValue(item.id, e.target.value)}
                      placeholder="Isi"
                      disabled={saving}
                      aria-label={`Stok aktual ${item.name}`}
                      className="h-9 w-24 rounded-xl border-2 border-[#2C2623] bg-white text-center font-mono text-sm font-black dark:border-stone-500 dark:bg-stone-900"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={saving}
                      onClick={() => stepItemStock(item.id, item.stock_qty, 1)}
                      aria-label={`Tambah stok ${item.name}`}
                      className="size-9 rounded-xl border-2 border-[#2C2623] bg-[#D1FAE5] text-[#2C2623] hover:bg-[#A7F3D0]"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    <span className="text-muted-foreground text-xs font-bold">
                      {item.unit_label}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`qr-stock-note-${item.id}`} className="text-xs font-bold">
                  Catatan Update Stok (Opsional)
                </Label>
                <Textarea
                  id={`qr-stock-note-${item.id}`}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={saving}
                  placeholder="Contoh: Penambahan stok baru / cek fisik setelah sesi terapi..."
                  className="rounded-xl border-2 border-[#2C2623] bg-white text-xs dark:border-stone-500 dark:bg-stone-900"
                />
              </div>

              <Button
                type="submit"
                disabled={
                  saving ||
                  (isHierarchy && subItems.length === 0) ||
                  hierarchyTotals.missingNames.length > 0
                }
                className="h-11 w-full rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#229c61] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {isHierarchy
                  ? `Simpan Update Stok (${subItems.length} Sub-Item)`
                  : "Simpan Update Stok"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
