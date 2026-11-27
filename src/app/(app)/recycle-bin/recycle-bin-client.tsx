"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Clock,
  Layers,
  RotateCcw,
  Sparkles,
  Trash2,
  UserCircle2,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  purgeDeletedRecordAction,
  purgeExpiredRecycleBinAction,
  restoreDeletedRecordAction,
  type RecycleTable,
} from "@/lib/actions/recycle-bin";
import { formatDateWIB } from "@/lib/constants";

export type DeletedRecordRow = {
  id: string;
  table: RecycleTable;
  code: string;
  title: string;
  subtitle: string;
  deletedAt: string;
  deletedByName: string;
  daysRemaining: number;
};

type RecycleBinClientProps = {
  recordsByTable: Record<RecycleTable, DeletedRecordRow[]>;
};

const TAB_CONFIG: Array<{
  table: RecycleTable;
  label: string;
}> = [
  { table: "items_master", label: "Inventaris" },
  { table: "item_kits", label: "Kit" },
  { table: "subscriptions_vault", label: "Vault Langganan" },
  { table: "archives_hybrid", label: "Arsip" },
  { table: "deliveries_log", label: "Pengiriman" },
  { table: "internal_requests", label: "Permintaan" },
];

export function RecycleBinClient({ recordsByTable }: RecycleBinClientProps) {
  const router = useRouter();
  const { runWithFeedback } = useCartoonFeedback();
  const { can } = useRole();
  const canRestore = can("recycle.restore");
  const canPurge = can("recycle.purge");
  const canSelectRows = canRestore || canPurge;
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<RecycleTable>("items_master");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [purgeTarget, setPurgeTarget] = useState<DeletedRecordRow | null>(null);
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const allDeletedRows = useMemo(
    () => Object.values(recordsByTable).flat(),
    [recordsByTable],
  );

  const totalDeleted = allDeletedRows.length;

  const expiringSoonCount = useMemo(
    () => allDeletedRows.filter((row) => row.daysRemaining <= 5).length,
    [allDeletedRows],
  );

  const populatedModulesCount = useMemo(
    () =>
      TAB_CONFIG.filter((tab) => recordsByTable[tab.table].length > 0).length,
    [recordsByTable],
  );

  const activeRows = recordsByTable[activeTab];
  const validSelectedIds = useMemo(() => {
    const activeIdSet = new Set(activeRows.map((r) => r.id));
    return selectedIds.filter((id) => activeIdSet.has(id));
  }, [activeRows, selectedIds]);

  const selectedRows = useMemo(() => {
    const picked = new Set(validSelectedIds);
    return activeRows.filter((r) => picked.has(r.id));
  }, [activeRows, validSelectedIds]);

  const toggleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((item) => item !== id);
    });
  };

  const toggleSelectAllActive = () => {
    if (validSelectedIds.length === activeRows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(activeRows.map((r) => r.id));
    }
  };

  const handleTabChange = (val: string) => {
    setActiveTab(val as RecycleTable);
    setSelectedIds([]);
  };

  const handleRestore = (row: DeletedRecordRow) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: `Memulihkan ${row.code}... ♻️`,
          workingMessage: `Dino Joguman lagi mengangkat kembali "${row.title}" dari Recycle Bin biar aktif lagi~`,
          successTitle: "Data Berhasil Dipulihkan! ✨",
          successMessage: (result) =>
            result.ok
              ? result.message
              : "",
          errorTitle: "Yah, Pemulihan Gagal...",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          restoreDeletedRecordAction({
            table: row.table,
            id: row.id,
          }),
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleConfirmPurge = () => {
    if (!purgeTarget) return;
    const target = purgeTarget;
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: `Menghapus Permanen ${target.code}... 🧹`,
          workingMessage: `Dino Joguman lagi membersihkan permanen "${target.title}" dari Recycle Bin...`,
          successTitle: "Data Dihapus Permanen",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Menghapus Permanen",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          purgeDeletedRecordAction({
            table: target.table,
            id: target.id,
          }),
      );
      setPurgeTarget(null);
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setSelectedIds((prev) => prev.filter((id) => id !== target.id));
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleBulkRestore = () => {
    if (selectedRows.length === 0) return;
    const targets = [...selectedRows];
    setFeedback(null);
    startTransition(async () => {
      const summary = await runWithFeedback(
        {
          mode: "batch",
          workingTitle: `Memulihkan ${targets.length} Data Sekaligus! ♻️`,
          workingMessage: `Tim mini lagi memulihkan ${targets.length} item terpilih kembali ke status aktif sekaligus. Tunggu sebentar ya~`,
          successTitle: "Pemulihan Massal Selesai! 🎉",
          successMessage: (s) =>
            `${s.restored} dari ${targets.length} data berhasil dipulihkan kembali ke daftar aktif!`,
          errorTitle: "Sebagian / Semua Pemulihan Gagal",
          isResultError: (s) =>
            s.restored === 0 && s.errors.length > 0 ? s.errors[0] : null,
        },
        async () => {
          let restored = 0;
          const errors: string[] = [];
          for (const row of targets) {
            const res = await restoreDeletedRecordAction({
              table: row.table,
              id: row.id,
            });
            if (res.ok) restored += 1;
            else errors.push(`${row.code}: ${res.error}`);
          }
          return { restored, errors };
        },
      );

      setSelectedIds([]);
      if (summary.restored === 0 && summary.errors.length > 0) {
        setFeedback({ type: "error", message: summary.errors.join("; ") });
      } else if (summary.errors.length > 0) {
        setFeedback({
          type: "success",
          message: `${summary.restored} data berhasil dipulihkan. Gagal (${summary.errors.length}): ${summary.errors.slice(0, 2).join("; ")}`,
        });
      } else {
        setFeedback({
          type: "success",
          message: `${summary.restored} data berhasil dipulihkan dari Recycle Bin.`,
        });
      }
      router.refresh();
    });
  };

  const handleConfirmBulkPurge = () => {
    if (selectedRows.length === 0) return;
    const targets = [...selectedRows];
    setFeedback(null);
    startTransition(async () => {
      const summary = await runWithFeedback(
        {
          mode: "batch",
          workingTitle: `Menghapus Permanen ${targets.length} Data! 🧹`,
          workingMessage: `Tim mini lagi membersihkan permanen ${targets.length} data terpilih dari Recycle Bin sekaligus...`,
          successTitle: "Penghapusan Massal Selesai",
          successMessage: (s) =>
            `${s.purged} dari ${targets.length} data berhasil dihapus secara permanen.`,
          errorTitle: "Gagal Menghapus Massal",
          isResultError: (s) =>
            s.purged === 0 && s.errors.length > 0 ? s.errors[0] : null,
        },
        async () => {
          let purged = 0;
          const errors: string[] = [];
          for (const row of targets) {
            const res = await purgeDeletedRecordAction({
              table: row.table,
              id: row.id,
            });
            if (res.ok) purged += 1;
            else errors.push(`${row.code}: ${res.error}`);
          }
          return { purged, errors };
        },
      );

      setBulkPurgeOpen(false);
      setSelectedIds([]);
      if (summary.purged === 0 && summary.errors.length > 0) {
        setFeedback({ type: "error", message: summary.errors.join("; ") });
      } else if (summary.errors.length > 0) {
        setFeedback({
          type: "success",
          message: `${summary.purged} data dihapus permanen. Gagal (${summary.errors.length}): ${summary.errors.slice(0, 2).join("; ")}`,
        });
      } else {
        setFeedback({
          type: "success",
          message: `${summary.purged} data berhasil dihapus secara permanen.`,
        });
      }
      router.refresh();
    });
  };

  const handlePurgeExpired = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "batch",
          workingTitle: "Membersihkan Data > 30 Hari! 🧹",
          workingMessage:
            "Tim mini lagi menyapu bersih seluruh data yang sudah melewati masa retensi 30 hari di semua modul sekaligus~",
          successTitle: "Pembersihan Kadaluarsa Selesai! ✨",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Membersihkan Data Kadaluarsa",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () => purgeExpiredRecycleBinAction(),
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setSelectedIds([]);
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        accent="pink"
        mascot="trash"
        badge="Retensi Aman 30 Hari"
        title="Recycle Bin (Retensi 30 Hari)"
        description="Data yang dihapus lunak (soft-delete) disimpan selama 30 hari sebelum dibersihkan permanen oleh sistem otomatis atau Owner."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-2 border-[#2C2623] bg-[#FFFDF7] px-3 py-1 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40 dark:bg-card dark:text-foreground"
            >
              {totalDeleted} item di Recycle Bin
            </Badge>
            <Can action="recycle.purge">
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                onClick={handlePurgeExpired}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Bersihkan &gt; 30 Hari
              </Button>
            </Can>
          </div>
        }
      />

      {/* Pastel KPI Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KawaiiStatCard
          label="Total Item di Recycle Bin"
          value={totalDeleted}
          hint="Tersimpan aman sebelum penghapusan permanen"
          accent="pink"
          icon={<Trash2 className="size-4" />}
        />
        <KawaiiStatCard
          label="Segera Kadaluarsa (≤ 5 Hari)"
          value={expiringSoonCount}
          hint={
            expiringSoonCount > 0
              ? "Perlu segera ditinjau sebelum terhapus otomatis"
              : "Tidak ada data yang mendesak kadaluarsa"
          }
          accent={expiringSoonCount > 0 ? "coral" : "mint"}
          icon={
            expiringSoonCount > 0 ? (
              <Clock className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )
          }
        />
        <KawaiiStatCard
          label="Modul Terisi"
          value={`${populatedModulesCount} / ${TAB_CONFIG.length}`}
          hint="Kategori modul yang memiliki item terhapus"
          accent="lavender"
          icon={<Layers className="size-4" />}
        />
      </div>

      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          className={
            feedback.type === "error"
              ? "rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-rose-950/40"
              : "rounded-2xl border-2 border-[#2C2623] bg-[#E8FBF1] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-emerald-950/40"
          }
        >
          {feedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600" />
          )}
          <AlertTitle className="font-extrabold">
            {feedback.type === "error" ? "Gagal" : "Berhasil! ♪"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
        <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#FFF0F5]/75 dark:bg-pink-950/25">
          <CardTitle className="flex items-center gap-2 text-base font-extrabold">
            <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDA4AF] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
              <Trash2 className="size-4" />
            </span>
            Daftar Data Terhapus per Modul
          </CardTitle>
          <CardDescription>
            {canPurge
              ? "Pulihkan data ke status aktif atau hapus permanen (khusus Owner). Centang beberapa kartu untuk aksi massal sekaligus!"
              : "Pulihkan data yang terhapus kembali ke status aktif. Penghapusan permanen hanya dapat dilakukan oleh Owner."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1.5">
              {TAB_CONFIG.map((tab) => {
                const count = recordsByTable[tab.table].length;
                return (
                  <TabsTrigger key={tab.table} value={tab.table} className="font-bold">
                    {tab.label}
                    <Badge
                      variant={count > 0 ? "default" : "secondary"}
                      className="ml-1.5 text-[10px]"
                    >
                      {count}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Bulk Selection Action Bar */}
            {canSelectRows && activeRows.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6]/90 px-4 py-2.5 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40 dark:bg-amber-950/30">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 bg-[#FFFDF7] text-xs font-bold dark:bg-background"
                    disabled={isPending}
                    onClick={toggleSelectAllActive}
                  >
                    <CheckSquare className="mr-1.5 size-3.5" />
                    {validSelectedIds.length === activeRows.length
                      ? "Batal Pilih Semua"
                      : `Pilih Semua (${activeRows.length})`}
                  </Button>
                  <span className="text-xs font-extrabold">
                    {validSelectedIds.length > 0
                      ? `${validSelectedIds.length} item dipilih`
                      : "Centang kartu untuk pulihkan atau hapus massal"}
                  </span>
                </div>

                {validSelectedIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Can action="recycle.restore">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 bg-[#E8FBF1] text-xs font-extrabold text-[#14532D] hover:bg-[#DCFCE7] dark:bg-emerald-950/60 dark:text-emerald-200"
                        disabled={isPending}
                        onClick={handleBulkRestore}
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        Pulihkan Terpilih ({validSelectedIds.length})
                      </Button>
                    </Can>
                    <Can action="recycle.purge">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs font-extrabold"
                        disabled={isPending}
                        onClick={() => setBulkPurgeOpen(true)}
                      >
                        <Trash2 className="mr-1.5 size-3.5" />
                        Hapus Permanen ({validSelectedIds.length})
                      </Button>
                    </Can>
                  </div>
                )}
              </div>
            )}

            {TAB_CONFIG.map((tab) => {
              const rows = recordsByTable[tab.table];
              return (
                <TabsContent key={tab.table} value={tab.table}>
                  {rows.length === 0 ? (
                    <KawaiiEmptyState
                      mascot="trash"
                      title="Yeay, Bersih Kinclong! ✨"
                      description={`Tidak ada data terhapus di modul ${tab.label}. Semua catatan masih aman rapi di tempatnya~`}
                    />
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
                      {rows.map((row) => {
                        const isSelected = validSelectedIds.includes(row.id);
                        const isUrgent = row.daysRemaining <= 5;
                        const isWarn = !isUrgent && row.daysRemaining <= 14;
                        const retentionPct = Math.min(
                          100,
                          Math.max(4, Math.round((row.daysRemaining / 30) * 100)),
                        );
                        const topStripClass = isUrgent
                          ? "bg-[#FFE4E6]/90 dark:bg-rose-950/40"
                          : isWarn
                            ? "bg-[#FFFBE6]/90 dark:bg-amber-950/35"
                            : "bg-[#E8FBF1]/80 dark:bg-emerald-950/30";
                        const barFillClass = isUrgent
                          ? "bg-[#FB7185]"
                          : isWarn
                            ? "bg-[#FBBF24]"
                            : "bg-[#34D399]";

                        return (
                          <div
                            key={row.id}
                            className={`flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5E9D6]/40 dark:bg-card ${
                              isSelected ? "ring-2 ring-[#2AB673] ring-offset-2" : ""
                            }`}
                          >
                            {/* Card Top Pastel Strip */}
                            <div
                              className={`flex flex-wrap items-center justify-between gap-2 border-b-2 border-dashed border-[#2C2623]/25 px-4 py-2.5 ${topStripClass}`}
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                {canSelectRows && (
                                  <Checkbox
                                    checked={isSelected}
                                    disabled={isPending}
                                    onCheckedChange={(val) =>
                                      toggleSelectRow(row.id, val === true)
                                    }
                                    aria-label={`Pilih ${row.code}`}
                                    className="border-2 border-[#2C2623] bg-[#FFFDF7]"
                                  />
                                )}
                                <span className="truncate rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-2.5 py-0.5 font-mono text-xs font-extrabold text-[#2C2623] dark:bg-background dark:text-foreground">
                                  {row.code}
                                </span>
                              </div>
                              <Badge
                                variant={isUrgent ? "destructive" : "outline"}
                                className={
                                  isUrgent
                                    ? "shrink-0 font-extrabold"
                                    : "shrink-0 border-[#2C2623] bg-[#FFFDF7] font-bold text-[#2C2623] dark:bg-background dark:text-foreground"
                                }
                              >
                                <Clock className="mr-1 size-3" />
                                {row.daysRemaining === 0
                                  ? "Siap purge (< 1 hari)"
                                  : `${row.daysRemaining} hari tersisa`}
                              </Badge>
                            </div>

                            {/* Card Body */}
                            <div className="space-y-3 p-4">
                              <div className="min-w-0">
                                <h3 className="text-sm leading-snug font-extrabold break-words">
                                  {row.title}
                                </h3>
                                <p className="text-muted-foreground mt-0.5 text-xs break-words">
                                  {row.subtitle}
                                </p>
                              </div>

                              {/* Mini Retention Countdown Bar */}
                              <div className="space-y-1">
                                <div className="h-2 w-full overflow-hidden rounded-full border border-[#2C2623]/60 bg-[#F5E9D6]/60 dark:bg-muted">
                                  <div
                                    className={`h-full rounded-full ${barFillClass}`}
                                    style={{ width: `${retentionPct}%` }}
                                  />
                                </div>
                                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                  <span className="inline-flex items-center gap-1 font-semibold">
                                    <UserCircle2 className="size-3.5" />
                                    {row.deletedByName}
                                  </span>
                                  <span>{formatDateWIB(row.deletedAt, true)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Card Footer Actions */}
                            <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-dashed border-[#2C2623]/15 bg-[#FFFDF7]/80 px-4 py-3 dark:bg-muted/20">
                              <Can action="recycle.restore">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="bg-[#E8FBF1] font-bold text-[#14532D] hover:bg-[#DCFCE7] dark:bg-emerald-950/50 dark:text-emerald-200"
                                  disabled={isPending}
                                  onClick={() => handleRestore(row)}
                                >
                                  <RotateCcw className="mr-1.5 size-3.5" />
                                  Pulihkan
                                </Button>
                              </Can>
                              <Can action="recycle.purge">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="font-bold"
                                  disabled={isPending}
                                  onClick={() => setPurgeTarget(row)}
                                >
                                  <Trash2 className="mr-1.5 size-3.5" />
                                  Hapus Permanen
                                </Button>
                              </Can>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {/* Permanent Purge Confirmation Dialog (OWNER only) */}
      {canPurge && (
        <Dialog
          open={Boolean(purgeTarget)}
          onOpenChange={(open) => !open && setPurgeTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2 font-extrabold">
                <AlertTriangle className="size-4" />
                Hapus Permanen (Tidak Dapat Dibatalkan)
              </DialogTitle>
              <DialogDescription>
                Anda akan menghapus permanen{" "}
                <code className="font-semibold">{purgeTarget?.code}</code> (
                {purgeTarget?.title}). Data yang di-purge tidak dapat dipulihkan lagi dari
                Recycle Bin.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPurgeTarget(null)}
                disabled={isPending}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                disabled={isPending}
                onClick={handleConfirmPurge}
              >
                {isPending ? "Menghapus..." : "Hapus Permanen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Permanent Purge Confirmation Dialog (OWNER only) */}
      {canPurge && (
        <Dialog open={bulkPurgeOpen} onOpenChange={setBulkPurgeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2 font-extrabold">
                <AlertTriangle className="size-4" />
                Hapus Permanen {selectedRows.length} Data Terpilih?
              </DialogTitle>
              <DialogDescription>
                Anda akan menghapus permanen{" "}
                <strong>{selectedRows.length} data terpilih</strong> sekaligus. Tindakan
                ini tidak dapat dibatalkan dan data tidak bisa dipulihkan lagi.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5]/60 p-3 text-xs dark:bg-rose-950/30">
              {selectedRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold">{r.title}</span>
                  <code className="shrink-0 font-mono text-[11px]">{r.code}</code>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setBulkPurgeOpen(false)}
                disabled={isPending}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                disabled={isPending}
                onClick={handleConfirmBulkPurge}
              >
                {isPending
                  ? "Menghapus..."
                  : `Hapus Permanen (${selectedRows.length})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
