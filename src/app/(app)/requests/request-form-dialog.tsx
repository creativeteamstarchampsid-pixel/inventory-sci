"use client";

import { useEffect, useState } from "react";
import { Info, Loader2, ShieldAlert } from "lucide-react";

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
  const canLinkVault = can("vault.view_limited");
  const isEditing = Boolean(editingRequest);

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

      const res =
        isEditing && editingRequest
          ? await updateRequestAction(editingRequest.id, {
              title,
              description,
              related_item_id: itemId,
              related_sub_id: subId,
              estimated_cost: parsedCost,
            })
          : await createRequestAction({
              request_type: requestType,
              title,
              description,
              related_item_id: itemId,
              related_sub_id: subId,
              estimated_cost: parsedCost,
            });

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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? `Ubah Tiket (${editingRequest?.request_code})`
              : "Buat Tiket Pengajuan Internal"}
          </DialogTitle>
          <DialogDescription>
            Tiket akan masuk ke alur persetujuan bertingkat (Team Leader →
            Super Admin → Owner jika diperlukan).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>Jenis Pengajuan</Label>
            <Select
              value={requestType}
              onValueChange={(v) => setRequestType(v as RequestType)}
              disabled={isEditing}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map(
                  (rt) => (
                    <SelectItem key={rt} value={rt}>
                      {REQUEST_TYPE_LABELS[rt]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="req_title">Judul Pengajuan</Label>
            <Input
              id="req_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Pengadaan 2 set puzzle kayu ruang R02"
              required
              minLength={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="req_desc">Deskripsi &amp; Alasan Lengkap</Label>
            <Textarea
              id="req_desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Jelaskan kebutuhan, detail kerusakan, bagian yang hilang, atau alasan penghapusan aset..."
              rows={4}
              required
              minLength={5}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tautkan Barang Inventaris (Opsional)</Label>
              <Select value={relatedItemId} onValueChange={setRelatedItemId}>
                <SelectTrigger className="w-full">
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
              <Label htmlFor="req_cost">Estimasi Biaya (Rp, Opsional)</Label>
              <Input
                id="req_cost"
                type="number"
                min={0}
                step={1000}
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {canLinkVault && (
            <div className="space-y-1.5">
              <Label>Tautkan Akun Subscription Vault (Opsional)</Label>
              <Select value={relatedSubId} onValueChange={setRelatedSubId}>
                <SelectTrigger className="w-full">
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

          {needsOwnerFinal ? (
            <Alert variant="warning">
              <ShieldAlert className="size-4" />
              <AlertDescription>
                Pengajuan{" "}
                <strong>
                  {requestType === "PENGHAPUSAN_ASET"
                    ? "Penghapusan Aset"
                    : "Pengadaan Barang Beranggaran"}
                </strong>{" "}
                wajib melalui verifikasi Admin dan{" "}
                <strong>Pengesahan Final Owner</strong>.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Info className="size-4" />
              <AlertDescription>
                Alur standar: Persetujuan Team Leader → Verifikasi Admin Ops.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Simpan Perubahan" : "Kirim Pengajuan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
