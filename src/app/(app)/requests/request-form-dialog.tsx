"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Info,
  KeyRound,
  Loader2,
  Package,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  createRequestAction,
  updateRequestAction,
} from "@/lib/actions/requests";
import { REQUEST_TYPE_LABELS } from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import type { InternalRequest, RequestType } from "@/types/database";
import {
  requiresOwnerFinalApproval,
  type RequestItemSummary,
  type RequestSubSummary,
} from "./helpers";

type RequestFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRequest: InternalRequest | null;
  items: RequestItemSummary[];
  subscriptions: RequestSubSummary[];
  onSaved: (request: InternalRequest) => void;
};

const NONE_OPTION = "__none__";

export function RequestFormDialog({
  open,
  onOpenChange,
  editingRequest,
  items,
  subscriptions,
  onSaved,
}: RequestFormDialogProps) {
  const { can } = useRole();
  const { runWithFeedback } = useCartoonFeedback();
  const canLinkVault = can("vault.view_limited");
  const canRequestWriteoff = can("inventory.writeoff_request");
  const isManagement = can("request.view_all");
  const isEditing = Boolean(editingRequest);

  const availableRequestTypes = (
    Object.keys(REQUEST_TYPE_LABELS) as RequestType[]
  ).filter((rt) => rt !== "PENGHAPUSAN_ASET" || canRequestWriteoff);

  const [requestType, setRequestType] =
    useState<RequestType>("PENGADAAN_BARANG");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [relatedItemId, setRelatedItemId] = useState<string>(NONE_OPTION);
  const [relatedSubId, setRelatedSubId] = useState<string>(NONE_OPTION);
  const [estimatedCost, setEstimatedCost] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    if (editingRequest) {
      setRequestType(editingRequest.request_type);
      setTitle(editingRequest.title);
      setDescription(editingRequest.description);
      setRelatedItemId(editingRequest.related_item_id ?? NONE_OPTION);
      setRelatedSubId(editingRequest.related_sub_id ?? NONE_OPTION);
      setEstimatedCost(
        editingRequest.estimated_cost !== null &&
          editingRequest.estimated_cost !== undefined
          ? String(editingRequest.estimated_cost)
          : "",
      );
    } else {
      setRequestType("PENGADAAN_BARANG");
      setTitle("");
      setDescription("");
      setRelatedItemId(NONE_OPTION);
      setRelatedSubId(NONE_OPTION);
      setEstimatedCost("");
    }
  }, [open, editingRequest]);

  const parsedCost =
    estimatedCost.trim() === "" ? null : Math.max(0, Number(estimatedCost) || 0);
  const needsOwnerFinal = requiresOwnerFinalApproval({
    request_type: requestType,
    estimated_cost: parsedCost,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const itemId = relatedItemId === NONE_OPTION ? null : relatedItemId;
      const subId =
        canLinkVault && relatedSubId !== NONE_OPTION ? relatedSubId : null;

      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: isEditing
            ? "Menyimpan Revisi Tiket..."
            : "Mengirim Pengajuan Baru...",
          workingMessage: isEditing
            ? `Dino Joguman lagi merapikan perubahan tiket ${editingRequest?.request_code ?? ""} nih! Tunggu sebentar ya~`
            : "Dino Joguman lagi mencatat tiket pengajuanmu ke antrean E-Approval nih! Sebentar ya~",
          successTitle: isEditing
            ? "Revisi Tiket Tersimpan! ✨"
            : "Pengajuan Berhasil Dikirim! 🎉",
          successMessage: (result) =>
            result.ok
              ? isEditing
                ? `Yeay! Perubahan pada tiket ${result.data.request.request_code} sudah tersimpan rapi~`
                : `Yeay! Tiket ${result.data.request.request_code} sudah masuk antrean persetujuan berjenjang~`
              : "Perubahan berhasil disimpan!",
          errorTitle: isEditing
            ? "Gagal Memperbarui Tiket"
            : "Gagal Mengirim Pengajuan",
          isResultError: (result) => (result.ok ? null : result.error),
        },
        () =>
          isEditing && editingRequest
            ? updateRequestAction(editingRequest.id, {
                title,
                description,
                related_item_id: itemId,
                related_sub_id: subId,
                estimated_cost: parsedCost,
              })
            : createRequestAction({
                request_type: requestType,
                title,
                description,
                related_item_id: itemId,
                related_sub_id: subId,
                estimated_cost: parsedCost,
              }),
      );

      if (!res.ok) {
        setErrorMsg(res.error);
        setSubmitting(false);
        return;
      }

      onSaved(res.data.request);
      onOpenChange(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menyimpan tiket pengajuan.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-xl dark:border-[#F5EFE6]/30 dark:bg-card dark:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.6)]">
        <DialogHeader className="space-y-2 border-b-2 border-dashed border-[#2C2623]/20 pb-3 dark:border-border">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FFE4EC] px-3 py-0.5 text-[11px] font-extrabold text-[#7A1C3C] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5EFE6]/30 dark:bg-pink-950/60 dark:text-pink-200 dark:shadow-none">
            <Sparkles className="size-3" />
            <span>{isEditing ? "Revisi Tiket E-Approval" : "Formulir Tiket Baru"}</span>
          </div>
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-[#2C2623] dark:text-foreground">
            <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDA4AF] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5EFE6]/30 dark:shadow-none">
              <ClipboardList className="size-4" />
            </span>
            <span>
              {isEditing
                ? `Ubah Tiket (${editingRequest?.request_code})`
                : "Buat Tiket Pengajuan Internal"}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {isManagement
              ? `Tiket akan diproses secara berjenjang (${ROLE_LABELS.TEAM_LEADER.title} → ${ROLE_LABELS.SUPER_ADMIN.title} → ${ROLE_LABELS.OWNER.title} bila diperlukan).`
              : "Ajukan kebutuhan barang, laporan kerusakan, kepingan hilang, atau akses akun untuk ditindaklanjuti."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {errorMsg && (
            <Alert variant="destructive" className="rounded-2xl border-2 border-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623]">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {/* Core Request Info Box */}
          <div className="space-y-3.5 rounded-2xl border-2 border-[#2C2623] bg-[#FFF5F8] p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5EFE6]/25 dark:bg-muted/30 dark:shadow-none">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#2C2623] dark:text-foreground">
                Jenis Pengajuan
              </Label>
              <Select
                value={requestType}
                onValueChange={(v) => setRequestType(v as RequestType)}
                disabled={isEditing}
              >
                <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-border dark:bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRequestTypes.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {REQUEST_TYPE_LABELS[rt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="req_title"
                className="text-xs font-bold text-[#2C2623] dark:text-foreground"
              >
                Judul Pengajuan
              </Label>
              <Input
                id="req_title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Pengadaan 2 set puzzle kayu ruang R02"
                required
                minLength={3}
                className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="req_desc"
                className="text-xs font-bold text-[#2C2623] dark:text-foreground"
              >
                Deskripsi &amp; Alasan Lengkap
              </Label>
              <Textarea
                id="req_desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  canRequestWriteoff
                    ? "Jelaskan kebutuhan, detail kerusakan, bagian yang hilang, atau alasan penghapusan aset..."
                    : "Jelaskan kebutuhan barang, detail kerusakan, atau bagian mainan yang hilang..."
                }
                rows={4}
                required
                minLength={5}
                className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
              />
            </div>
          </div>

          {/* Optional Links & Cost Box */}
          <div className="space-y-3.5 rounded-2xl border-2 border-[#2C2623] bg-[#F2FBF7] p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5EFE6]/25 dark:bg-muted/30 dark:shadow-none">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-bold text-[#2C2623] dark:text-foreground">
                  <Package className="size-3.5 text-[#1D8F59]" />
                  Tautkan Barang Inventaris (Opsional)
                </Label>
                <Select value={relatedItemId} onValueChange={setRelatedItemId}>
                  <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background">
                    <SelectValue placeholder="Pilih item terkait..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPTION}>Tidak ditautkan</SelectItem>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.item_code} · {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="req_cost"
                  className="flex items-center gap-1.5 text-xs font-bold text-[#2C2623] dark:text-foreground"
                >
                  <Wallet className="size-3.5 text-[#C27803]" />
                  Estimasi Biaya (Rp, Opsional)
                </Label>
                <Input
                  id="req_cost"
                  type="number"
                  min={0}
                  step={1000}
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  placeholder="0"
                  className="rounded-xl border-2 border-[#2C2623] bg-white font-mono dark:border-border dark:bg-background"
                />
              </div>
            </div>

            {canLinkVault && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-bold text-[#2C2623] dark:text-foreground">
                  <KeyRound className="size-3.5 text-[#6D28D9]" />
                  Tautkan Akun Brankas Digital (Opsional)
                </Label>
                <Select value={relatedSubId} onValueChange={setRelatedSubId}>
                  <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background">
                    <SelectValue placeholder="Pilih akun langganan..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPTION}>Tidak ditautkan</SelectItem>
                    {subscriptions.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.sub_code} · {sub.service_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Workflow Callout */}
          {isManagement ? (
            needsOwnerFinal ? (
              <Alert
                variant="warning"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#5C3A00] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100 dark:shadow-none"
              >
                <ShieldAlert className="size-4 text-[#B45309] dark:text-amber-300" />
                <AlertDescription className="text-xs leading-relaxed text-[#5C3A00] dark:text-amber-100">
                  Pengajuan{" "}
                  <strong>
                    {requestType === "PENGHAPUSAN_ASET"
                      ? "Penghapusan Aset"
                      : "Pengadaan Barang Beranggaran"}
                  </strong>{" "}
                  wajib melalui verifikasi {ROLE_LABELS.SUPER_ADMIN.title} dan{" "}
                  <strong>Pengesahan Final {ROLE_LABELS.OWNER.title}</strong>.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#E8F8F0] text-[#115E3B] shadow-[3px_3px_0px_0px_#2C2623] dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-100 dark:shadow-none">
                <Info className="size-4 text-[#16A34A] dark:text-emerald-300" />
                <AlertDescription className="text-xs leading-relaxed text-[#115E3B] dark:text-emerald-100">
                  Alur standar: Persetujuan {ROLE_LABELS.TEAM_LEADER.title} →
                  Verifikasi {ROLE_LABELS.SUPER_ADMIN.title}.
                </AlertDescription>
              </Alert>
            )
          ) : (
            <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#E0F2FE] text-[#0C4A6E] shadow-[3px_3px_0px_0px_#2C2623] dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-100 dark:shadow-none">
              <Info className="size-4 text-[#0284C7] dark:text-sky-300" />
              <AlertDescription className="text-xs leading-relaxed text-[#0C4A6E] dark:text-sky-100">
                Pengajuan Anda akan ditinjau oleh {ROLE_LABELS.TEAM_LEADER.title}{" "}
                dan diproses lebih lanjut oleh tim operasional.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-xl border-2 border-[#2C2623] bg-white font-bold shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FFF5F7] dark:border-border dark:bg-background dark:shadow-none"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-[#F5EFE6]/30"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Simpan Perubahan" : "Kirim Pengajuan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
