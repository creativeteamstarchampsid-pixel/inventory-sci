"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  KeyRound,
  Package,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import type { InternalRequest } from "@/types/database";
import {
  REQUEST_STATUS_BADGE_VARIANT,
  profileDisplayName,
  requiresOwnerFinalApproval,
  type RequestItemSummary,
  type RequestProfileSummary,
  type RequestSubSummary,
} from "./helpers";

type RequestDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: InternalRequest | null;
  profilesMap: Map<string, RequestProfileSummary>;
  itemsMap: Map<string, RequestItemSummary>;
  subsMap: Map<string, RequestSubSummary>;
  busyActionId: string | null;
  onApprove: (
    request: InternalRequest,
    options?: { escalateToOwner?: boolean; finalizeImmediately?: boolean },
  ) => void;
  onOpenReject: (request: InternalRequest) => void;
  onComplete: (request: InternalRequest) => void;
};

export function RequestDetailDialog({
  open,
  onOpenChange,
  request,
  profilesMap,
  itemsMap,
  subsMap,
  busyActionId,
  onApprove,
  onOpenReject,
  onComplete,
}: RequestDetailDialogProps) {
  const { role, can } = useRole();

  if (!request) return null;

  const linkedItem = request.related_item_id
    ? itemsMap.get(request.related_item_id)
    : undefined;
  const linkedSub =
    can("vault.view_limited") && request.related_sub_id
      ? subsMap.get(request.related_sub_id)
      : undefined;

  const ownerRequired = requiresOwnerFinalApproval(request);
  const isBusy = busyActionId === request.id;
  const isAdmin = role === "OWNER" || role === "SUPER_ADMIN";

  const step1Done = Boolean(request.team_leader_approved_at);
  const step2Done = Boolean(request.admin_verified_at);
  const step3Done = Boolean(request.owner_approved_at);
  const step3Skipped =
    !ownerRequired &&
    (request.status === "DISETUJUI" || request.status === "SELESAI") &&
    !step3Done;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{request.request_code}</span>
            <Badge variant={REQUEST_STATUS_BADGE_VARIANT[request.status]}>
              {REQUEST_STATUS_LABELS[request.status]}
            </Badge>
            {ownerRequired && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                Wajib Pengesahan Owner
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {REQUEST_TYPE_LABELS[request.request_type]} · Diajukan oleh{" "}
            <strong>{profileDisplayName(profilesMap, request.requested_by)}</strong>{" "}
            pada {formatDateWIB(request.created_at, true)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border p-3.5">
            <h3 className="font-semibold">{request.title}</h3>
            <p className="text-muted-foreground mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">
              {request.description}
            </p>
            {request.estimated_cost !== null && (
              <p className="mt-2.5 text-xs">
                <span className="text-muted-foreground">Estimasi Biaya:</span>{" "}
                <strong className="font-mono">
                  {formatRupiah(request.estimated_cost)}
                </strong>
              </p>
            )}
          </div>

          {(linkedItem || linkedSub || request.related_sub_id) && (
            <div className="flex flex-wrap gap-2">
              {linkedItem && (
                <Link
                  href={`/inventory/${linkedItem.id}`}
                  className="bg-muted/40 hover:bg-muted inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors"
                >
                  <Package className="size-3.5 text-primary" />
                  <span className="font-mono font-semibold">
                    {linkedItem.item_code}
                  </span>
                  <span>{linkedItem.name}</span>
                </Link>
              )}
              {linkedSub && (
                <div className="bg-muted/40 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                  <KeyRound className="size-3.5 text-primary" />
                  <span className="font-mono font-semibold">
                    {linkedSub.sub_code}
                  </span>
                  <span>{linkedSub.service_name}</span>
                </div>
              )}
              {!linkedSub && request.related_sub_id && (
                <div className="bg-muted/40 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  <span>Tertaut ke akun Subscription Vault</span>
                </div>
              )}
            </div>
          )}

          {request.status === "DITOLAK" && request.rejection_reason && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertTitle>Pengajuan Ditolak</AlertTitle>
              <AlertDescription>{request.rejection_reason}</AlertDescription>
            </Alert>
          )}

          {/* 3-Tier E-Approval Stepper */}
          <div className="space-y-2 rounded-lg border p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Alur E-Approval Bertingkat
            </p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {/* Tier 1 */}
              <div
                className={`rounded-md border p-2.5 text-xs ${
                  step1Done
                    ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
                    : request.status === "MENUNGGU_TEAM_LEADER"
                      ? "border-primary bg-primary/5"
                      : "opacity-75"
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-semibold">
                  <span>1. Team Leader</span>
                  {step1Done ? (
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                  ) : (
                    <Clock className="text-muted-foreground size-3.5" />
                  )}
                </div>
                {step1Done ? (
                  <div className="text-muted-foreground mt-1 space-y-0.5 text-[11px]">
                    <p className="text-foreground font-medium">
                      {profileDisplayName(
                        profilesMap,
                        request.team_leader_approved_by,
                      )}
                    </p>
                    <p>{formatDateWIB(request.team_leader_approved_at, true)}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {request.status === "MENUNGGU_TEAM_LEADER"
                      ? "Menunggu persetujuan"
                      : "Belum disetujui"}
                  </p>
                )}
              </div>

              {/* Tier 2 */}
              <div
                className={`rounded-md border p-2.5 text-xs ${
                  step2Done
                    ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
                    : request.status === "MENUNGGU_ADMIN"
                      ? "border-primary bg-primary/5"
                      : "opacity-75"
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-semibold">
                  <span>2. Super Admin</span>
                  {step2Done ? (
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                  ) : (
                    <Clock className="text-muted-foreground size-3.5" />
                  )}
                </div>
                {step2Done ? (
                  <div className="text-muted-foreground mt-1 space-y-0.5 text-[11px]">
                    <p className="text-foreground font-medium">
                      {profileDisplayName(
                        profilesMap,
                        request.admin_verified_by,
                      )}
                    </p>
                    <p>{formatDateWIB(request.admin_verified_at, true)}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {request.status === "MENUNGGU_ADMIN"
                      ? "Menunggu verifikasi Admin"
                      : "Tahap berikutnya"}
                  </p>
                )}
              </div>

              {/* Tier 3 */}
              <div
                className={`rounded-md border p-2.5 text-xs ${
                  step3Done
                    ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
                    : request.status === "MENUNGGU_OWNER"
                      ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30"
                      : "opacity-75"
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-semibold">
                  <span>3. Owner (Final)</span>
                  {step3Done ? (
                    <ShieldCheck className="size-3.5 text-emerald-600" />
                  ) : (
                    <Clock className="text-muted-foreground size-3.5" />
                  )}
                </div>
                {step3Done ? (
                  <div className="text-muted-foreground mt-1 space-y-0.5 text-[11px]">
                    <p className="text-foreground font-medium">
                      {profileDisplayName(
                        profilesMap,
                        request.owner_approved_by,
                      )}
                    </p>
                    <p>{formatDateWIB(request.owner_approved_at, true)}</p>
                  </div>
                ) : step3Skipped ? (
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    Selesai di tahap Admin
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {request.status === "MENUNGGU_OWNER"
                      ? "Menunggu pengesahan Owner"
                      : ownerRequired
                        ? "Wajib pengesahan Owner"
                        : "Opsional / Eskalasi"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {request.status === "MENUNGGU_TEAM_LEADER" && can("request.approve") && (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => onOpenReject(request)}
                disabled={isBusy}
              >
                Tolak
              </Button>
              <Button
                type="button"
                onClick={() => onApprove(request)}
                disabled={isBusy}
              >
                Setujui (Team Leader) → Admin
              </Button>
            </>
          )}

          {request.status === "MENUNGGU_ADMIN" && isAdmin && (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => onOpenReject(request)}
                disabled={isBusy}
              >
                Tolak
              </Button>
              {!ownerRequired && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onApprove(request, { escalateToOwner: true })
                  }
                  disabled={isBusy}
                >
                  Eskalasi ke Owner
                </Button>
              )}
              <Button
                type="button"
                onClick={() => onApprove(request)}
                disabled={isBusy}
              >
                {ownerRequired
                  ? "Verifikasi → Teruskan ke Owner"
                  : "Verifikasi & Setujui"}
              </Button>
            </>
          )}

          {request.status === "MENUNGGU_OWNER" && (
            <Can
              action="approval.final"
              fallback={
                <span className="text-muted-foreground text-xs">
                  Hanya Owner yang dapat mengesahkan tahap ini.
                </span>
              }
            >
              <Button
                type="button"
                variant="destructive"
                onClick={() => onOpenReject(request)}
                disabled={isBusy}
              >
                Tolak
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onApprove(request, { finalizeImmediately: true })
                }
                disabled={isBusy}
              >
                Sahkan &amp; Selesai
              </Button>
              <Button
                type="button"
                onClick={() => onApprove(request)}
                disabled={isBusy}
              >
                Sahkan Final (Disetujui)
              </Button>
            </Can>
          )}

          {request.status === "DISETUJUI" && isAdmin && (
            <Button
              type="button"
              onClick={() => onComplete(request)}
              disabled={isBusy}
            >
              Tandai Selesai
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
