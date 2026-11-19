"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Can } from "@/components/rbac/can";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<RecycleTable>("items_master");
  const [purgeTarget, setPurgeTarget] = useState<DeletedRecordRow | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const totalDeleted = useMemo(
    () =>
      Object.values(recordsByTable).reduce((sum, list) => sum + list.length, 0),
    [recordsByTable],
  );

  const handleRestore = (row: DeletedRecordRow) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await restoreDeletedRecordAction({
        table: row.table,
        id: row.id,
      });
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleConfirmPurge = () => {
    if (!purgeTarget) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await purgeDeletedRecordAction({
        table: purgeTarget.table,
        id: purgeTarget.id,
      });
      setPurgeTarget(null);
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handlePurgeExpired = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await purgeExpiredRecycleBinAction();
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Recycle Bin (Retensi 30 Hari)
          </h1>
          <p className="text-muted-foreground text-sm">
            Data yang dihapus lunak (soft-delete) disimpan selama 30 hari sebelum
            dibersihkan permanen oleh sistem cron atau Super Admin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{totalDeleted} item di Recycle Bin</Badge>
          <Can action="recycle.purge">
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={handlePurgeExpired}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Bersihkan Kadaluarsa (&gt; 30 Hari)
            </Button>
          </Can>
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600" />
          )}
          <AlertTitle>
            {feedback.type === "error" ? "Gagal" : "Berhasil"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="size-4" />
            Daftar Data Terhapus per Modul
          </CardTitle>
          <CardDescription>
            Pulihkan data ke status aktif atau hapus permanen (khusus Super Admin).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as RecycleTable)}
          >
            <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1">
              {TAB_CONFIG.map((tab) => {
                const count = recordsByTable[tab.table].length;
                return (
                  <TabsTrigger key={tab.table} value={tab.table}>
                    {tab.label}
                    <Badge variant="secondary" className="ml-1.5 text-[10px]">
                      {count}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {TAB_CONFIG.map((tab) => {
              const rows = recordsByTable[tab.table];
              return (
                <TabsContent key={tab.table} value={tab.table}>
                  {rows.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Tidak ada data terhapus di modul {tab.label}.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kode</TableHead>
                          <TableHead>Nama / Judul</TableHead>
                          <TableHead>Dihapus Pada (WIB)</TableHead>
                          <TableHead>Dihapus Oleh</TableHead>
                          <TableHead>Sisa Retensi</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-mono text-xs font-semibold">
                              {row.code}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{row.title}</div>
                              <div className="text-muted-foreground text-xs">
                                {row.subtitle}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatDateWIB(row.deletedAt, true)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.deletedByName}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  row.daysRemaining <= 5 ? "destructive" : "outline"
                                }
                              >
                                <Clock className="mr-1 size-3" />
                                {row.daysRemaining === 0
                                  ? "Siap purge (< 1 hari)"
                                  : `${row.daysRemaining} hari tersisa`}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                <Can action="recycle.restore">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isPending}
                                    onClick={() => handleRestore(row)}
                                  >
                                    <RotateCcw className="mr-1 size-3.5" />
                                    Pulihkan
                                  </Button>
                                </Can>
                                <Can action="recycle.purge">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={isPending}
                                    onClick={() => setPurgeTarget(row)}
                                  >
                                    <Trash2 className="mr-1 size-3.5" />
                                    Purge
                                  </Button>
                                </Can>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {/* Permanent Purge Confirmation Dialog */}
      <Dialog
        open={Boolean(purgeTarget)}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
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
    </div>
  );
}
