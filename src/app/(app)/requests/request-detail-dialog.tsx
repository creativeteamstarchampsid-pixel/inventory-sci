"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Package,
  ShieldCheck,
  Sparkles,
  Wallet,
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
import { ROLE_LABELS } from "@/lib/rbac";
import type { InternalRequest, RequestStatus } from "@/types/database";
import {
  REQUEST_STATUS_BADGE_VARIANT,
  profileDisplayName,
  requiresOwnerFinalApproval,
  type RequestItemSummary,
  type RequestProfileSummary,
  type RequestSubSummary,
} from "./helpers";

const KAWAII_STATUS_PILL: Record<RequestStatus, string> = {
  MENUNGGU_TEAM_LEADER:
    "border-2 border-[#2C2623] bg-[#FEF3C7] text-[#78350F] font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-400/50 dark:bg-amber-950/60 dark:text-amber-200 dark:shadow-none",
  MENUNGGU_ADMIN:
    "border-2 border-[#2C2623] bg-[#DFF2FF] text-[#0C4A6E] font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-sky-400/50 dark:bg-sky-950/60 dark:text-sky-200 dark:shadow-none",
  MENUNGGU_OWNER:
    "border-2 border-[#2C2623] bg-[#F3E8FF] text-[#5B21B6] font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-purple-400/50 dark:bg-purple-950/60 dark:text-purple-200 dark:shadow-none",
  DISETUJUI:
    "border-2 border-[#2C2623] bg-[#D9F9E8] text-[#115E3B] font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-emerald-400/50 dark:bg-emerald-950/60 dark:text-emerald-200 dark:shadow-none",
  DITOLAK:
    "border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-rose-400/50 dark:bg-rose-950/60 dark:text-rose-200 dark:shadow-none",
  SELESAI:
    "border-2 border-[#2C2623] bg-[#CCFBF1] text-[#115E59] font-extrabold shadow-[2px_2px_0px_0px_#2C2623] dark:border-teal-400/50 dark:bg-teal-950/60 dark:text-teal-200 dark:shadow-none",
};

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
  const { can } = useRole();

  if (!request) return null;

  const isManagement = can("request.view_all");
  const canLinkVault = can("vault.view_limited");
  const canApproveStage1 = can("request.approve");
  const canApproveAdmin = can("request.approve_admin");
  const canApproveFinal = can("approval.final");
  const canComplete = can("request.complete");

  const linkedItem = request.related_item_id
    ? itemsMap.get(request.related_item_id)
    : undefined;
  const linkedSub =
    canLinkVault && request.related_sub_id
      ? subsMap.get(request.related_sub_id)
      : undefined;

  const ownerRequired = requiresOwnerFinalApproval(request);
  const isBusy = busyActionId === request.id;

  const step1Done = Boolean(request.team_leader_approved_at);
  const step2Done = Boolean(request.admin_verified_at);
  const step3Done = Boolean(request.owner_approved_at);
  const step3Skipped =
    !ownerRequired &&
    (request.status === "DISETUJUI" || request.status === "SELESAI") &&
    !step3Done;
  const isRejected = request.status === "DITOLAK";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-2xl dark:border-[#F5EFE6]/30 dark:bg-card dark:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.6)]">
        <DialogHeader className="space-y-2 border-b-2 border-dashed border-[#2C2623]/20 pb-3 dark:border-border">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-xl border-2 border-[#2C2623] bg-[#FFE4EC] px-2.5 py-0.5 font-mono text-sm font-extrabold text-[#7A1C3C] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5EFE6]/30 dark:bg-pink-950/60 dark:text-pink-200 dark:shadow-none">
              {request.request_code}
            </span>
            <Badge
              variant={REQUEST_STATUS_BADGE_VARIANT[request.status]}
              className={`rounded-full px-2.5 py-0.5 text-xs ${KAWAII_STATUS_PILL[request.status]}`}
            >
              {REQUEST_STATUS_LABELS[request.status]}
            </Badge>
            {isManagement && ownerRequired && (
              <Badge
                variant="outline"
                className="rounded-full border-2 border-[#2C2623] bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-extrabold text-[#92400E] shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200 dark:shadow-none"
              >
                <ShieldCheck className="size-3" />
                Wajib Pengesahan Owner
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            <span className="font-semibold text-[#2C2623] dark:text-foreground">
              {REQUEST_TYPE_LABELS[request.request_type]}
            </span>{" "}
            · Diajukan oleh{" "}
            <strong className="text-[#2C2623] dark:text-foreground">
              {profileDisplayName(profilesMap, request.requested_by)}
            </strong>{" "}
            pada {formatDateWIB(request.created_at, true)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-sm">
          {/* Request Body Card */}
          <div className="rounded-2xl border-2 border-[#2C2623] bg-white p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5EFE6]/25 dark:bg-muted/30 dark:shadow-none">
            <h3 className="text-base font-extrabold text-[#2C2623] dark:text-foreground">
              {request.title}
            </h3>
            <p className="text-muted-foreground mt-2 whitespace-pre-wrap text-xs leading-relaxed">
              {request.description}
            </p>
            {request.estimated_cost !== null && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] px-3 py-1.5 text-xs font-bold text-[#78350F] shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200 dark:shadow-none">
                <Wallet className="size-3.5" />
                <span>Estimasi Biaya:</span>
                <strong className="font-mono font-extrabold">
                  {formatRupiah(request.estimated_cost)}
                </strong>
              </div>
            )}
          </div>

          {/* Linked Asset / Vault Chips */}
          {(linkedItem || linkedSub) && (
            <div className="flex flex-wrap gap-2">
              {linkedItem && (
                <Link
                  href={`/inventory/${linkedItem.id}`}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-[#2C2623] bg-[#DFF2FF] px-3 py-1.5 text-xs font-bold text-[#0C4A6E] shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-sky-500/40 dark:bg-sky-950/50 dark:text-sky-100 dark:shadow-none"
                >
                  <Package className="size-3.5" />
                  <span className="font-mono font-extrabold">
                    {linkedItem.item_code}
                  </span>
                  <span>{linkedItem.name}</span>
                </Link>
              )}
              {linkedSub && (
                <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[#2C2623] bg-[#F3E8FF] px-3 py-1.5 text-xs font-bold text-[#5B21B6] shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-purple-500/40 dark:bg-purple-950/50 dark:text-purple-100 dark:shadow-none">
                  <KeyRound className="size-3.5" />
                  <span className="font-mono font-extrabold">
                    {linkedSub.sub_code}
                  </span>
                  <span>{linkedSub.service_name}</span>
                </div>
              )}
            </div>
          )}

          {isRejected && request.rejection_reason && (
            <Alert
              variant="destructive"
              className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#881337] shadow-[3px_3px_0px_0px_#2C2623] dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-100 dark:shadow-none"
            >
              <XCircle className="size-4 text-[#BE123C] dark:text-rose-300" />
              <AlertTitle className="font-extrabold">Pengajuan Ditolak</AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                {request.rejection_reason}
              </AlertDescription>
            </Alert>
          )}

          {/* 3-Tier Kawaii E-Approval Stepper */}
          <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFF8EE] p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5EFE6]/25 dark:bg-muted/25 dark:shadow-none">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-foreground">
                <Sparkles className="size-3.5 text-[#E11D48]" />
                Alur E-Approval Bertingkat
              </p>
              <span className="rounded-full border border-[#2C2623]/30 bg-white px-2 py-0.5 text-[10px] font-bold text-[#2C2623] dark:border-border dark:bg-background dark:text-foreground">
                {[step1Done, step2Done, step3Done || step3Skipped].filter(Boolean).length}/3 Tahap
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Tier 1 */}
              <div
                className={`relative rounded-2xl border-2 p-3 text-xs transition-all ${
                  step1Done
                    ? "border-[#2C2623] bg-[#D9F9E8] shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:shadow-none"
                    : request.status === "MENUNGGU_TEAM_LEADER"
                      ? "border-[#2C2623] bg-[#FEF3C7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-400/60 dark:bg-amber-950/40 dark:shadow-none"
                      : "border-dashed border-[#2C2623]/40 bg-white/75 opacity-80 dark:border-border dark:bg-background/50"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 font-extrabold text-[#2C2623] dark:text-foreground">
                    <span className="inline-flex size-5 items-center justify-center rounded-full border-2 border-[#2C2623] bg-white text-[10px] font-black text-[#2C2623] dark:border-foreground/40 dark:bg-background dark:text-foreground">
                      1
                    </span>
                    <span>{ROLE_LABELS.TEAM_LEADER.title}</span>
                  </div>
                  {step1Done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-[#15803D] dark:text-emerald-400" />
                  ) : (
                    <Clock className="size-4 shrink-0 text-[#92400E] dark:text-amber-300" />
                  )}
                </div>
                {step1Done ? (
                  <div className="mt-2 space-y-0.5 text-[11px] text-[#14532D] dark:text-emerald-200">
                    <p className="font-bold">
                      {profileDisplayName(
                        profilesMap,
                        request.team_leader_approved_by,
                        ROLE_LABELS.TEAM_LEADER.title,
                      )}
                    </p>
                    <p className="opacity-80">
                      {formatDateWIB(request.team_leader_approved_at, true)}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 text-[11px] font-medium">
                    {request.status === "MENUNGGU_TEAM_LEADER"
                      ? "⏳ Menunggu persetujuan"
                      : "Belum disetujui"}
                  </p>
                )}
              </div>

              {/* Tier 2 */}
              <div
                className={`relative rounded-2xl border-2 p-3 text-xs transition-all ${
                  step2Done
                    ? "border-[#2C2623] bg-[#D9F9E8] shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:shadow-none"
                    : request.status === "MENUNGGU_ADMIN"
                      ? "border-[#2C2623] bg-[#DFF2FF] shadow-[3px_3px_0px_0px_#2C2623] dark:border-sky-400/60 dark:bg-sky-950/40 dark:shadow-none"
                      : "border-dashed border-[#2C2623]/40 bg-white/75 opacity-80 dark:border-border dark:bg-background/50"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 font-extrabold text-[#2C2623] dark:text-foreground">
                    <span className="inline-flex size-5 items-center justify-center rounded-full border-2 border-[#2C2623] bg-white text-[10px] font-black text-[#2C2623] dark:border-foreground/40 dark:bg-background dark:text-foreground">
                      2
                    </span>
                    <span>{ROLE_LABELS.SUPER_ADMIN.title}</span>
                  </div>
                  {step2Done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-[#15803D] dark:text-emerald-400" />
                  ) : (
                    <Clock className="size-4 shrink-0 text-[#0369A1] dark:text-sky-300" />
                  )}
                </div>
                {step2Done ? (
                  <div className="mt-2 space-y-0.5 text-[11px] text-[#14532D] dark:text-emerald-200">
                    <p className="font-bold">
                      {profileDisplayName(
                        profilesMap,
                        request.admin_verified_by,
                        ROLE_LABELS.SUPER_ADMIN.title,
                      )}
                    </p>
                    <p className="opacity-80">
                      {formatDateWIB(request.admin_verified_at, true)}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 text-[11px] font-medium">
                    {request.status === "MENUNGGU_ADMIN"
                      ? `⏳ Menunggu verifikasi ${ROLE_LABELS.SUPER_ADMIN.title}`
                      : "Tahap berikutnya"}
                  </p>
                )}
              </div>

              {/* Tier 3 */}
              <div
                className={`relative rounded-2xl border-2 p-3 text-xs transition-all ${
                  step3Done
                    ? "border-[#2C2623] bg-[#D9F9E8] shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:shadow-none"
                    : request.status === "MENUNGGU_OWNER"
                      ? "border-[#2C2623] bg-[#F3E8FF] shadow-[3px_3px_0px_0px_#2C2623] dark:border-purple-400/60 dark:bg-purple-950/40 dark:shadow-none"
                      : step3Skipped
                        ? "border-[#2C2623]/40 bg-[#CCFBF1]/60 dark:border-teal-500/30 dark:bg-teal-950/20"
                        : "border-dashed border-[#2C2623]/40 bg-white/75 opacity-80 dark:border-border dark:bg-background/50"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 font-extrabold text-[#2C2623] dark:text-foreground">
                    <span className="inline-flex size-5 items-center justify-center rounded-full border-2 border-[#2C2623] bg-white text-[10px] font-black text-[#2C2623] dark:border-foreground/40 dark:bg-background dark:text-foreground">
                      3
                    </span>
                    <span>{ROLE_LABELS.OWNER.title} (Final)</span>
                  </div>
                  {step3Done ? (
                    <ShieldCheck className="size-4 shrink-0 text-[#15803D] dark:text-emerald-400" />
                  ) : (
                    <Clock className="size-4 shrink-0 text-[#6D28D9] dark:text-purple-300" />
                  )}
                </div>
                {step3Done ? (
                  <div className="mt-2 space-y-0.5 text-[11px] text-[#14532D] dark:text-emerald-200">
                    <p className="font-bold">
                      {profileDisplayName(
                        profilesMap,
                        request.owner_approved_by,
                        ROLE_LABELS.OWNER.title,
                      )}
                    </p>
                    <p className="opacity-80">
                      {formatDateWIB(request.owner_approved_at, true)}
                    </p>
                  </div>
                ) : step3Skipped ? (
                  <p className="mt-2 text-[11px] font-semibold text-[#115E59] dark:text-teal-200">
                    ✓ Selesai di tahap {ROLE_LABELS.SUPER_ADMIN.title}
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-2 text-[11px] font-medium">
                    {request.status === "MENUNGGU_OWNER"
                      ? `⏳ Menunggu pengesahan ${ROLE_LABELS.OWNER.title}`
                      : ownerRequired
                        ? `Wajib pengesahan ${ROLE_LABELS.OWNER.title}`
                        : "Opsional / Eskalasi"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 pt-2">
          {request.status === "MENUNGGU_TEAM_LEADER" && canApproveStage1 && (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => onOpenReject(request)}
                disabled={isBusy}
                className="rounded-xl border-2 border-[#2C2623] font-bold shadow-[2.5px_2.5px_0px_0px_#2C2623] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                <XCircle className="size-4" />
                Tolak
              </Button>
              <Button
                type="button"
                onClick={() => onApprove(request)}
                disabled={isBusy}
                className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
              >
                {isBusy && <Loader2 className="size-4 animate-spin" />}
                {canApproveAdmin
                  ? "Teruskan ke Tahap Admin"
                  : `Setujui (${ROLE_LABELS.TEAM_LEADER.title}) → ${ROLE_LABELS.SUPER_ADMIN.title}`}
              </Button>
            </>
          )}

          {request.status === "MENUNGGU_ADMIN" && canApproveAdmin && (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => onOpenReject(request)}
                disabled={isBusy}
                className="rounded-xl border-2 border-[#2C2623] font-bold shadow-[2.5px_2.5px_0px_0px_#2C2623] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                <XCircle className="size-4" />
                Tolak
              </Button>
              {!canApproveFinal && !ownerRequired && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onApprove(request, { escalateToOwner: true })
                  }
                  disabled={isBusy}
                  className="rounded-xl border-2 border-[#2C2623] bg-[#F3E8FF] font-bold text-[#5B21B6] shadow-[2.5px_2.5px_0px_0px_#2C2623] hover:bg-[#E9D5FF] dark:bg-purple-950/50 dark:text-purple-200"
                >
                  Eskalasi ke Owner
                </Button>
              )}
              <Button
                type="button"
                onClick={() => onApprove(request)}
                disabled={isBusy}
                className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
              >
                {isBusy && <Loader2 className="size-4 animate-spin" />}
                {canApproveFinal
                  ? "Sahkan Langsung (Disetujui)"
                  : ownerRequired
                    ? "Verifikasi → Teruskan ke Owner"
                    : "Verifikasi & Setujui"}
              </Button>
            </>
          )}

          {request.status === "MENUNGGU_OWNER" && (
            <Can
              action="approval.final"
              fallback={
                isManagement ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-2 border-[#2C2623] bg-[#F3E8FF] px-3 py-1 text-xs font-extrabold text-[#5B21B6] dark:bg-purple-950/50 dark:text-purple-200"
                  >
                    Menunggu Pengesahan Owner
                  </Badge>
                ) : null
              }
            >
              <Button
                type="button"
                variant="destructive"
                onClick={() => onOpenReject(request)}
                disabled={isBusy}
                className="rounded-xl border-2 border-[#2C2623] font-bold shadow-[2.5px_2.5px_0px_0px_#2C2623] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                <XCircle className="size-4" />
                Tolak
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onApprove(request, { finalizeImmediately: true })
                }
                disabled={isBusy}
                className="rounded-xl border-2 border-[#2C2623] bg-[#CCFBF1] font-extrabold text-[#115E59] shadow-[2.5px_2.5px_0px_0px_#2C2623] hover:bg-[#99F6E4] dark:bg-teal-950/50 dark:text-teal-200"
              >
                Sahkan &amp; Selesai
              </Button>
              <Button
                type="button"
                onClick={() => onApprove(request)}
                disabled={isBusy}
                className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
              >
                {isBusy && <Loader2 className="size-4 animate-spin" />}
                Sahkan Final (Disetujui)
              </Button>
            </Can>
          )}

          {request.status === "DISETUJUI" && canComplete && (
            <Button
              type="button"
              onClick={() => onComplete(request)}
              disabled={isBusy}
              className="rounded-xl border-2 border-[#2C2623] bg-[#14B8A6] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#0D9488] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
            >
              {isBusy && <Loader2 className="size-4 animate-spin" />}
              Tandai Selesai
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
