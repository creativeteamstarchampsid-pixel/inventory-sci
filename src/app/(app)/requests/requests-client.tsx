"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  KeyRound,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
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
  CardHeader,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  approveRequestAction,
  completeRequestAction,
  rejectRequestAction,
  softDeleteRequestAction,
} from "@/lib/actions/requests";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import type {
  InternalRequest,
  RequestStatus,
  RequestType,
} from "@/types/database";
import {
  REQUEST_STATUS_BADGE_VARIANT,
  isActionableByRole,
  profileDisplayName,
  requiresOwnerFinalApproval,
  type RequestItemSummary,
  type RequestProfileSummary,
  type RequestSubSummary,
} from "./helpers";
import { RequestDetailDialog } from "./request-detail-dialog";
import { RequestFormDialog } from "./request-form-dialog";

type RequestsClientProps = {
  initialRequests: InternalRequest[];
  profiles: RequestProfileSummary[];
  items: RequestItemSummary[];
  subscriptions: RequestSubSummary[];
  schemaError?: string | null;
};

type RequestTab = "ACTIONABLE" | "ALL" | "MINE" | "CLOSED";

const KAWAII_STATUS_CLASSES: Record<RequestStatus, string> = {
  MENUNGGU_TEAM_LEADER:
    "border-2 border-[#2C2623] bg-[#FEF3C7] text-[#78350F] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-amber-400/50 dark:bg-amber-950/60 dark:text-amber-200 dark:shadow-none",
  MENUNGGU_ADMIN:
    "border-2 border-[#2C2623] bg-[#DFF2FF] text-[#0C4A6E] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-sky-400/50 dark:bg-sky-950/60 dark:text-sky-200 dark:shadow-none",
  MENUNGGU_OWNER:
    "border-2 border-[#2C2623] bg-[#F3E8FF] text-[#5B21B6] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-purple-400/50 dark:bg-purple-950/60 dark:text-purple-200 dark:shadow-none",
  DISETUJUI:
    "border-2 border-[#2C2623] bg-[#D9F9E8] text-[#115E3B] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-emerald-400/50 dark:bg-emerald-950/60 dark:text-emerald-200 dark:shadow-none",
  DITOLAK:
    "border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-rose-400/50 dark:bg-rose-950/60 dark:text-rose-200 dark:shadow-none",
  SELESAI:
    "border-2 border-[#2C2623] bg-[#CCFBF1] text-[#115E59] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-teal-400/50 dark:bg-teal-950/60 dark:text-teal-200 dark:shadow-none",
};

const KAWAII_TYPE_CLASSES: Record<RequestType, string> = {
  PENGADAAN_BARANG:
    "border-[#2C2623]/70 bg-[#E8F8F0] text-[#115E3B] dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-200",
  LAPORAN_KERUSAKAN:
    "border-[#2C2623]/70 bg-[#FFE4EC] text-[#881337] dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-200",
  PART_HILANG:
    "border-[#2C2623]/70 bg-[#FFEDD5] text-[#9A3412] dark:border-orange-500/40 dark:bg-orange-950/40 dark:text-orange-200",
  AKSES_AKUN:
    "border-[#2C2623]/70 bg-[#DFF2FF] text-[#075985] dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-200",
  PENGHAPUSAN_ASET:
    "border-[#2C2623]/70 bg-[#F3E8FF] text-[#5B21B6] dark:border-purple-500/40 dark:bg-purple-950/40 dark:text-purple-200",
};

function MiniApprovalProgress({
  req,
  ownerNeeded,
}: {
  req: InternalRequest;
  ownerNeeded: boolean;
}) {
  const step1Done = Boolean(req.team_leader_approved_at);
  const step2Done = Boolean(req.admin_verified_at);
  const step3Done = Boolean(req.owner_approved_at);
  const isRejected = req.status === "DITOLAK";
  const step3Skipped =
    !ownerNeeded &&
    (req.status === "DISETUJUI" || req.status === "SELESAI") &&
    !step3Done;

  const steps = [
    {
      label: "TL",
      done: step1Done,
      active: req.status === "MENUNGGU_TEAM_LEADER",
      skipped: false,
      rejected: isRejected && !step1Done,
    },
    {
      label: "ADM",
      done: step2Done,
      active: req.status === "MENUNGGU_ADMIN",
      skipped: false,
      rejected: isRejected && step1Done && !step2Done,
    },
    {
      label: "OWN",
      done: step3Done,
      active: req.status === "MENUNGGU_OWNER",
      skipped: step3Skipped,
      rejected: isRejected && step2Done && !step3Done,
    },
  ];

  return (
    <div
      className="flex items-center gap-1 pt-0.5"
      aria-label="Progres persetujuan berjenjang"
    >
      {steps.map((s, idx) => (
        <div key={s.label} className="flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-extrabold tracking-tight ${
              s.done
                ? "border-[#2C2623] bg-[#A7F3D0] text-[#115E3B] dark:border-emerald-400/60 dark:bg-emerald-950/60 dark:text-emerald-200"
                : s.rejected
                  ? "border-[#2C2623] bg-[#FECDD3] text-[#9F1239] dark:border-rose-400/60 dark:bg-rose-950/60 dark:text-rose-200"
                  : s.active
                    ? "border-[#2C2623] bg-[#FDE68A] text-[#78350F] dark:border-amber-400/60 dark:bg-amber-950/60 dark:text-amber-200"
                    : s.skipped
                      ? "border-[#2C2623]/30 bg-[#CCFBF1]/70 text-[#115E59] dark:border-teal-500/30 dark:bg-teal-950/40 dark:text-teal-200"
                      : "border-dashed border-[#2C2623]/35 bg-white/80 text-muted-foreground dark:border-border dark:bg-background/40"
            }`}
          >
            {s.done && <Check className="size-2.5 stroke-[3]" />}
            {s.rejected && <XCircle className="size-2.5" />}
            {s.label}
          </span>
          {idx < steps.length - 1 && (
            <span className="h-[2px] w-2 rounded-full bg-[#2C2623]/30 dark:bg-border" />
          )}
        </div>
      ))}
    </div>
  );
}

export function RequestsClient({
  initialRequests,
  profiles,
  items,
  subscriptions,
  schemaError,
}: RequestsClientProps) {
  const { user, role, can } = useRole();
  const { runWithFeedback } = useCartoonFeedback();
  const isManagement = can("request.view_all");
  const canApproveStage1 = can("request.approve");
  const canApproveAdmin = can("request.approve_admin");
  const canApproveFinal = can("approval.final");
  const canComplete = can("request.complete");
  const canDelete = can("request.delete");
  const canRequestWriteoff = can("inventory.writeoff_request");
  const canLinkVault = can("vault.view_limited");

  const availableTypeFilters = (
    Object.keys(REQUEST_TYPE_LABELS) as RequestType[]
  ).filter((rt) => rt !== "PENGHAPUSAN_ASET" || canRequestWriteoff);

  const [requests, setRequests] = useState<InternalRequest[]>(initialRequests);
  const [activeTab, setActiveTab] = useState<RequestTab>(
    isManagement ? "ACTIONABLE" : "MINE",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | RequestType>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | RequestStatus>(
    "ALL",
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<InternalRequest | null>(
    null,
  );
  const [detailRequest, setDetailRequest] = useState<InternalRequest | null>(
    null,
  );

  const [rejectTarget, setRejectTarget] = useState<InternalRequest | null>(
    null,
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<InternalRequest | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  const profilesMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const itemsMap = useMemo(
    () => new Map(items.map((it) => [it.id, it])),
    [items],
  );
  const subsMap = useMemo(
    () => new Map(subscriptions.map((sub) => [sub.id, sub])),
    [subscriptions],
  );

  const stats = useMemo(() => {
    const actionableCount = requests.filter((r) =>
      isActionableByRole(r.status, role),
    ).length;
    const waitingOwnerCount = requests.filter(
      (r) => r.status === "MENUNGGU_OWNER",
    ).length;
    const pendingCount = requests.filter((r) =>
      [
        "MENUNGGU_TEAM_LEADER",
        "MENUNGGU_ADMIN",
        "MENUNGGU_OWNER",
      ].includes(r.status),
    ).length;
    const approvedCount = requests.filter(
      (r) => r.status === "DISETUJUI" || r.status === "SELESAI",
    ).length;

    return {
      totalCount: requests.length,
      actionableCount,
      waitingOwnerCount,
      pendingCount,
      approvedCount,
    };
  }, [requests, role]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((r) => {
      if (activeTab === "ACTIONABLE" && !isActionableByRole(r.status, role)) {
        return false;
      }
      if (activeTab === "MINE" && r.requested_by !== user.id) {
        return false;
      }
      if (
        activeTab === "CLOSED" &&
        !["DISETUJUI", "DITOLAK", "SELESAI"].includes(r.status)
      ) {
        return false;
      }
      if (typeFilter !== "ALL" && r.request_type !== typeFilter) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!q) return true;

      const requesterName = profileDisplayName(
        profilesMap,
        r.requested_by,
      ).toLowerCase();
      const linkedItem = r.related_item_id
        ? itemsMap.get(r.related_item_id)
        : undefined;

      return (
        r.request_code.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        requesterName.includes(q) ||
        (linkedItem?.item_code.toLowerCase().includes(q) ?? false) ||
        (linkedItem?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    requests,
    activeTab,
    role,
    user.id,
    typeFilter,
    statusFilter,
    searchQuery,
    profilesMap,
    itemsMap,
  ]);

  function handleSavedRequest(saved: InternalRequest) {
    setRequests((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      if (exists) return prev.map((r) => (r.id === saved.id ? saved : r));
      return [saved, ...prev];
    });
    if (detailRequest?.id === saved.id) {
      setDetailRequest(saved);
    }
    setBannerError(null);
    setBannerSuccess(
      `Tiket ${saved.request_code} berhasil disimpan.`,
    );
  }

  async function handleApprove(
    request: InternalRequest,
    options?: { escalateToOwner?: boolean; finalizeImmediately?: boolean },
  ) {
    setBusyActionId(request.id);
    setBannerError(null);
    setBannerSuccess(null);

    const ownerNeeded = requiresOwnerFinalApproval(request);
    let workingTitle = "Memproses Persetujuan Tiket...";
    let workingMessage = `Dino Joguman lagi mencatat persetujuan tiket ${request.request_code} nih! Sebentar ya~`;

    if (request.status === "MENUNGGU_TEAM_LEADER") {
      workingTitle = `Menyetujui Tahap ${ROLE_LABELS.TEAM_LEADER.title}...`;
      workingMessage = `Sedang memproses persetujuan tiket ${request.request_code} untuk diteruskan ke tahap ${ROLE_LABELS.SUPER_ADMIN.title}~`;
    } else if (request.status === "MENUNGGU_ADMIN") {
      if (canApproveFinal) {
        workingTitle = "Mengesahkan Tiket Langsung...";
        workingMessage = `Sedang memverifikasi sekaligus mengesahkan tiket ${request.request_code} secara langsung~`;
      } else if (options?.escalateToOwner || ownerNeeded) {
        workingTitle = "Memverifikasi & Eskalasi ke Owner...";
        workingMessage = `Admin lagi memverifikasi tiket ${request.request_code} dan meneruskannya ke pengesahan final Owner~`;
      } else {
        workingTitle = "Memverifikasi & Menyetujui Tiket...";
        workingMessage = `Admin lagi menyelesaikan verifikasi tiket ${request.request_code} biar segera disetujui~`;
      }
    } else if (request.status === "MENUNGGU_OWNER") {
      workingTitle = options?.finalizeImmediately
        ? "Mengesahkan & Menyelesaikan Tiket..."
        : "Mengesahkan Persetujuan Final Owner...";
      workingMessage = `Sedang mencatat pengesahan final Owner untuk tiket ${request.request_code}. Tunggu sebentar ya~`;
    }

    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle,
          workingMessage,
          successTitle: "Persetujuan Berhasil Tercatat! ✨",
          successMessage: (result) =>
            result.ok
              ? `Yeay! Tiket ${result.data.request.request_code} sekarang berstatus "${REQUEST_STATUS_LABELS[result.data.request.status]}"~`
              : "Tiket berhasil diperbarui!",
          errorTitle: "Gagal Menyetujui Tiket",
          isResultError: (result) => (result.ok ? null : result.error),
        },
        () => approveRequestAction(request.id, options),
      );

      if (!res.ok) {
        setBannerError(res.error);
        return;
      }

      const updated = res.data.request;
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      if (detailRequest?.id === updated.id) {
        setDetailRequest(updated);
      }
      setBannerSuccess(
        `Tiket ${updated.request_code} diperbarui menjadi "${REQUEST_STATUS_LABELS[updated.status]}".`,
      );
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Gagal menyetujui tiket.",
      );
    } finally {
      setBusyActionId(null);
    }
  }

  function openRejectModal(request: InternalRequest) {
    setRejectTarget(request);
    setRejectionReason("");
    setBannerError(null);
  }

  async function handleConfirmReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    setRejecting(true);
    setBannerError(null);
    setBannerSuccess(null);

    const targetCode = rejectTarget.request_code;
    const targetId = rejectTarget.id;

    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Mencatat Penolakan Tiket...",
          workingMessage: `Dino Joguman lagi menyimpan alasan penolakan tiket ${targetCode} supaya pemohon tahu tindak lanjutnya~`,
          successTitle: "Penolakan Tiket Tercatat",
          successMessage: (result) =>
            result.ok
              ? `Tiket ${result.data.request.request_code} resmi ditolak beserta catatan alasannya.`
              : `Tiket ${targetCode} telah ditolak.`,
          errorTitle: "Gagal Menolak Tiket",
          isResultError: (result) => (result.ok ? null : result.error),
        },
        () => rejectRequestAction(targetId, rejectionReason),
      );

      if (!res.ok) {
        setBannerError(res.error);
        return;
      }

      const updated = res.data.request;
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      if (detailRequest?.id === updated.id) {
        setDetailRequest(updated);
      }
      setRejectTarget(null);
      setBannerSuccess(`Tiket ${updated.request_code} telah ditolak.`);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Gagal menolak tiket.",
      );
    } finally {
      setRejecting(false);
    }
  }

  async function handleComplete(request: InternalRequest) {
    setBusyActionId(request.id);
    setBannerError(null);
    setBannerSuccess(null);

    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Menyelesaikan Tiket Pengajuan...",
          workingMessage: `Dino Joguman lagi menandai tiket ${request.request_code} sebagai Selesai nih! Sebentar ya~`,
          successTitle: "Tiket Selesai! 🎉",
          successMessage: (result) =>
            result.ok
              ? `Mantap! Tiket ${result.data.request.request_code} resmi selesai diproses~`
              : `Tiket ${request.request_code} selesai!`,
          errorTitle: "Gagal Menyelesaikan Tiket",
          isResultError: (result) => (result.ok ? null : result.error),
        },
        () => completeRequestAction(request.id),
      );

      if (!res.ok) {
        setBannerError(res.error);
        return;
      }

      const updated = res.data.request;
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      if (detailRequest?.id === updated.id) {
        setDetailRequest(updated);
      }
      setBannerSuccess(`Tiket ${updated.request_code} ditandai Selesai.`);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Gagal menyelesaikan tiket.",
      );
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setBannerError(null);
    setBannerSuccess(null);

    const targetId = deleteTarget.id;
    const targetCode = deleteTarget.request_code;

    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Memindahkan Tiket ke Recycle Bin...",
          workingMessage: `Dino Joguman lagi memindahkan tiket ${targetCode} ke Recycle Bin (tetap aman dipulihkan 30 hari)~`,
          successTitle: "Tiket Dipindahkan ke Recycle Bin",
          successMessage: `Tiket ${targetCode} berhasil dipindahkan ke Recycle Bin.`,
          errorTitle: "Gagal Menghapus Tiket",
          isResultError: (result) => (result.ok ? null : result.error),
        },
        () => softDeleteRequestAction(targetId),
      );

      if (!res.ok) {
        setBannerError(res.error);
        return;
      }

      setRequests((prev) => prev.filter((r) => r.id !== targetId));
      if (detailRequest?.id === targetId) {
        setDetailRequest(null);
      }
      setDeleteTarget(null);
      setBannerSuccess("Tiket dipindahkan ke Recycle Bin.");
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Gagal menghapus tiket.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Kawaii Page Banner */}
      <KawaiiPageHeader
        mascot="clipboard"
        accent="pink"
        badge={isManagement ? "E-Approval Berjenjang ✨" : "Tiket Permintaan ✨"}
        title={isManagement ? "Pengajuan & Persetujuan" : "Pengajuan Saya"}
        description={
          isManagement
            ? canRequestWriteoff
              ? "Pusat pengajuan pengadaan barang, laporan kerusakan/part hilang, akses akun, dan penghapusan aset dengan persetujuan berjenjang."
              : "Pusat pengajuan pengadaan barang, laporan kerusakan/part hilang, dan akses akun dengan persetujuan berjenjang."
            : "Ajukan kebutuhan barang, lapor kerusakan atau kepingan hilang, dan pantau status pengajuan Anda."
        }
        actions={
          <Can action="request.create">
            <Button
              onClick={() => {
                setEditingRequest(null);
                setFormOpen(true);
              }}
              className="rounded-2xl border-2 border-[#2C2623] bg-[#2AB673] px-4 font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-[#F5EFE6]/30"
            >
              <Plus className="size-4" />
              Buat Pengajuan Baru
            </Button>
          </Can>
        }
      />

      {schemaError && (
        <Alert
          variant="warning"
          className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-500/40 dark:bg-amber-950/40 dark:shadow-none"
        >
          <AlertTriangle className="size-4" />
          <AlertTitle className="font-extrabold">Skema Database Belum Siap</AlertTitle>
          <AlertDescription>
            Gagal memuat tiket permintaan: {schemaError}
          </AlertDescription>
        </Alert>
      )}

      {bannerError && (
        <Alert
          variant="destructive"
          className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] shadow-[3px_3px_0px_0px_#2C2623] dark:border-rose-500/40 dark:bg-rose-950/40 dark:shadow-none"
        >
          <AlertTriangle className="size-4" />
          <AlertTitle className="font-extrabold">Gagal Memproses Tiket</AlertTitle>
          <AlertDescription>{bannerError}</AlertDescription>
        </Alert>
      )}

      {bannerSuccess && (
        <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#D9F9E8] text-[#115E3B] shadow-[3px_3px_0px_0px_#2C2623] dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100 dark:shadow-none">
          <CheckCircle2 className="size-4 text-[#15803D] dark:text-emerald-300" />
          <AlertTitle className="font-extrabold">Pembaruan Berhasil</AlertTitle>
          <AlertDescription>{bannerSuccess}</AlertDescription>
        </Alert>
      )}

      {/* Kawaii KPI Cards */}
      <div
        className={`grid gap-4 ${
          isManagement ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
        }`}
      >
        <KawaiiStatCard
          accent="pink"
          label={isManagement ? "Total Tiket Terlihat" : "Total Pengajuan Saya"}
          value={stats.totalCount}
          hint={
            isManagement
              ? "Seluruh pengajuan tim Star Champs"
              : "Pengajuan yang Anda kirimkan"
          }
          icon={<ClipboardCheck className="size-4" />}
        />

        <KawaiiStatCard
          accent="butter"
          label={isManagement ? "Perlu Tindakan Anda" : "Sedang Diproses"}
          value={isManagement ? stats.actionableCount : stats.pendingCount}
          hint={
            isManagement
              ? `Antrean persetujuan untuk ${ROLE_LABELS[role].title}`
              : "Menunggu peninjauan dan tindak lanjut"
          }
          icon={<Clock className="size-4" />}
        />

        {isManagement && (
          <KawaiiStatCard
            accent="lavender"
            label="Menunggu Pengesahan Owner"
            value={stats.waitingOwnerCount}
            hint="Pengadaan beranggaran & penghapusan aset"
            icon={<ShieldCheck className="size-4" />}
          />
        )}

        <KawaiiStatCard
          accent="mint"
          label="Disetujui / Selesai"
          value={stats.approvedCount}
          hint={
            isManagement
              ? "Tiket telah lolos persetujuan"
              : "Pengajuan Anda yang telah disetujui"
          }
          icon={<CheckCircle2 className="size-4" />}
        />
      </div>

      {/* Tabs, Filters & Table */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5EFE6]/25 dark:bg-card dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]">
        <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#FFF4F7] py-4 dark:border-border dark:bg-muted/30">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as RequestTab)}
            >
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border-2 border-[#2C2623] bg-white p-1 shadow-[2px_2px_0px_0px_#2C2623] sm:w-auto dark:border-border dark:bg-background dark:shadow-none">
                {isManagement && (
                  <TabsTrigger
                    value="ACTIONABLE"
                    className="rounded-xl text-xs font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FFE4EC] data-[state=active]:text-[#7A1C3C] dark:data-[state=active]:border-pink-400/50 dark:data-[state=active]:bg-pink-950/60 dark:data-[state=active]:text-pink-100"
                  >
                    Perlu Tindakan ({stats.actionableCount})
                  </TabsTrigger>
                )}
                {isManagement && (
                  <TabsTrigger
                    value="ALL"
                    className="rounded-xl text-xs font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#DFF2FF] data-[state=active]:text-[#0C4A6E] dark:data-[state=active]:border-sky-400/50 dark:data-[state=active]:bg-sky-950/60 dark:data-[state=active]:text-sky-100"
                  >
                    Semua ({requests.length})
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="MINE"
                  className="rounded-xl text-xs font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FEF3C7] data-[state=active]:text-[#78350F] dark:data-[state=active]:border-amber-400/50 dark:data-[state=active]:bg-amber-950/60 dark:data-[state=active]:text-amber-100"
                >
                  Pengajuan Saya{!isManagement ? ` (${requests.length})` : ""}
                </TabsTrigger>
                <TabsTrigger
                  value="CLOSED"
                  className="rounded-xl text-xs font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#D9F9E8] data-[state=active]:text-[#115E3B] dark:data-[state=active]:border-emerald-400/50 dark:data-[state=active]:bg-emerald-950/60 dark:data-[state=active]:text-emerald-100"
                >
                  Selesai / Ditolak
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-60">
                <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isManagement
                      ? "Cari kode, judul, pemohon..."
                      : "Cari kode atau judul pengajuan..."
                  }
                  className="rounded-xl border-2 border-[#2C2623] bg-white pl-9 dark:border-border dark:bg-background"
                />
              </div>

              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as "ALL" | RequestType)}
              >
                <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold sm:w-[185px] dark:border-border dark:bg-background">
                  <SelectValue placeholder="Semua Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Jenis</SelectItem>
                  {availableTypeFilters.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {REQUEST_TYPE_LABELS[rt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as "ALL" | RequestStatus)
                }
              >
                <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold sm:w-[205px] dark:border-border dark:bg-background">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  {(Object.keys(REQUEST_STATUS_LABELS) as RequestStatus[]).map(
                    (st) => (
                      <SelectItem key={st} value={st}>
                        {REQUEST_STATUS_LABELS[st]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {filteredRequests.length === 0 ? (
            <KawaiiEmptyState
              mascot="clipboard"
              title="Belum ada tiket pengajuan di sini~"
              description="Coba ubah filter pencarian, atau klik tombol di bawah untuk membuat tiket permintaan baru."
              action={
                <Can action="request.create">
                  <Button
                    onClick={() => {
                      setEditingRequest(null);
                      setFormOpen(true);
                    }}
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62]"
                  >
                    <Plus className="size-4" />
                    Buat Pengajuan Baru
                  </Button>
                </Can>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 border-[#2C2623] bg-[#FEF9E7] hover:bg-[#FEF9E7] dark:border-border dark:bg-muted/50">
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Kode &amp; Jenis
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Judul &amp; Tautan
                    </TableHead>
                    {isManagement && (
                      <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                        Pemohon
                      </TableHead>
                    )}
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Estimasi Biaya
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Status &amp; Tahap
                    </TableHead>
                    {isManagement && (
                      <TableHead className="text-right font-extrabold text-[#2C2623] dark:text-foreground">
                        Aksi E-Approval
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((req) => {
                    const requester = profilesMap.get(req.requested_by);
                    const linkedItem = req.related_item_id
                      ? itemsMap.get(req.related_item_id)
                      : undefined;
                    const linkedSub =
                      canLinkVault && req.related_sub_id
                        ? subsMap.get(req.related_sub_id)
                        : undefined;
                    const ownerNeeded = requiresOwnerFinalApproval(req);
                    const canEditRow =
                      req.status === "MENUNGGU_TEAM_LEADER" &&
                      (req.requested_by === user.id || canApproveAdmin);
                    const isBusy = busyActionId === req.id;

                    return (
                      <TableRow
                        key={req.id}
                        className="border-b border-[#2C2623]/15 transition-colors hover:bg-[#FFF5F8]/70 dark:border-border dark:hover:bg-muted/40"
                      >
                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <span className="inline-block rounded-lg border border-[#2C2623]/50 bg-[#FFF8EE] px-2 py-0.5 font-mono text-xs font-extrabold text-[#2C2623] dark:border-border dark:bg-muted dark:text-foreground">
                              {req.request_code}
                            </span>
                            <div>
                              <Badge
                                variant="outline"
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${KAWAII_TYPE_CLASSES[req.request_type]}`}
                              >
                                {REQUEST_TYPE_LABELS[req.request_type]}
                              </Badge>
                            </div>
                            {isManagement && ownerNeeded && (
                              <div>
                                <Badge
                                  variant="secondary"
                                  className="rounded-full border border-[#2C2623] bg-[#FEF3C7] text-[10px] font-extrabold text-[#92400E] dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200"
                                >
                                  <ShieldCheck className="size-2.5" />
                                  Wajib Owner
                                </Badge>
                              </div>
                            )}
                            <p className="text-muted-foreground text-[11px] font-medium">
                              {formatDateWIB(req.created_at)}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="max-w-[290px] align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <p className="font-extrabold leading-snug text-[#2C2623] dark:text-foreground">
                              {req.title}
                            </p>
                            <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                              {req.description}
                            </p>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {linkedItem && (
                                <Link
                                  href={`/inventory/${linkedItem.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#2C2623]/60 bg-[#DFF2FF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#0C4A6E] transition-transform hover:-translate-y-0.5 dark:border-sky-500/40 dark:bg-sky-950/50 dark:text-sky-200"
                                >
                                  <Package className="size-2.5" />
                                  {linkedItem.item_code}
                                </Link>
                              )}
                              {linkedSub && (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-[#2C2623]/60 bg-[#F3E8FF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#5B21B6] dark:border-purple-500/40 dark:bg-purple-950/50 dark:text-purple-200">
                                  <KeyRound className="size-2.5" />
                                  {linkedSub.sub_code} · {linkedSub.service_name}
                                </span>
                              )}
                            </div>
                            {!isManagement && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-xl border-2 border-[#2C2623] bg-white px-2.5 text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FFF5F7] dark:border-border dark:bg-background dark:shadow-none"
                                  onClick={() => setDetailRequest(req)}
                                >
                                  <Eye className="size-3" />
                                  Detail
                                </Button>
                                {canEditRow && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 rounded-xl px-2 text-xs font-bold hover:bg-[#FEF3C7]"
                                    onClick={() => {
                                      setEditingRequest(req);
                                      setFormOpen(true);
                                    }}
                                  >
                                    <Pencil className="size-3" />
                                    Ubah
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {isManagement && (
                          <TableCell className="align-top whitespace-normal text-xs">
                            <p className="font-bold text-[#2C2623] dark:text-foreground">
                              {profileDisplayName(profilesMap, req.requested_by)}
                            </p>
                            {requester && (
                              <p className="text-muted-foreground text-[11px]">
                                {ROLE_LABELS[requester.role]?.title}
                              </p>
                            )}
                          </TableCell>
                        )}

                        <TableCell className="align-top font-mono text-xs font-bold">
                          {req.estimated_cost !== null ? (
                            <span className="inline-block rounded-lg border border-[#2C2623]/40 bg-[#FEF9E7] px-2 py-0.5 text-[#78350F] dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
                              {formatRupiah(req.estimated_cost)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <Badge
                              variant={REQUEST_STATUS_BADGE_VARIANT[req.status]}
                              className={`rounded-full px-2.5 py-0.5 text-[11px] ${KAWAII_STATUS_CLASSES[req.status]}`}
                            >
                              {REQUEST_STATUS_LABELS[req.status]}
                            </Badge>

                            <MiniApprovalProgress
                              req={req}
                              ownerNeeded={ownerNeeded}
                            />

                            {req.status === "DITOLAK" && req.rejection_reason && (
                              <p className="text-destructive line-clamp-2 max-w-[210px] rounded-lg bg-[#FFE4E6]/70 px-2 py-1 text-[11px] font-medium dark:bg-rose-950/40">
                                Alasan: {req.rejection_reason}
                              </p>
                            )}
                            {req.team_leader_approved_at && (
                              <p className="text-muted-foreground text-[11px]">
                                {ROLE_LABELS.TEAM_LEADER.title}:{" "}
                                <span className="font-semibold text-foreground/85">
                                  {profileDisplayName(
                                    profilesMap,
                                    req.team_leader_approved_by,
                                    "Disetujui",
                                  )}
                                </span>
                              </p>
                            )}
                            {req.admin_verified_at && (
                              <p className="text-muted-foreground text-[11px]">
                                {ROLE_LABELS.SUPER_ADMIN.title}:{" "}
                                <span className="font-semibold text-foreground/85">
                                  {profileDisplayName(
                                    profilesMap,
                                    req.admin_verified_by,
                                    "Diverifikasi",
                                  )}
                                </span>
                              </p>
                            )}
                            {req.owner_approved_at && (
                              <p className="text-muted-foreground text-[11px]">
                                {ROLE_LABELS.OWNER.title}:{" "}
                                <span className="font-semibold text-foreground/85">
                                  {profileDisplayName(
                                    profilesMap,
                                    req.owner_approved_by,
                                    "Disahkan",
                                  )}
                                </span>
                              </p>
                            )}
                          </div>
                        </TableCell>

                        {isManagement && (
                          <TableCell className="text-right align-top">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {req.status === "MENUNGGU_TEAM_LEADER" &&
                                canApproveStage1 && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApprove(req)}
                                      disabled={isBusy}
                                      className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                    >
                                      {isBusy && (
                                        <Loader2 className="size-3.5 animate-spin" />
                                      )}
                                      {canApproveAdmin
                                        ? "Teruskan ke Tahap Admin"
                                        : "Setujui"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FECDD3] hover:text-[#881337] dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200 dark:shadow-none"
                                      onClick={() => openRejectModal(req)}
                                      disabled={isBusy}
                                      title="Tolak Pengajuan"
                                    >
                                      <XCircle className="size-3.5" />
                                    </Button>
                                  </>
                                )}

                              {req.status === "MENUNGGU_ADMIN" &&
                                canApproveAdmin && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApprove(req)}
                                      disabled={isBusy}
                                      className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                    >
                                      {isBusy && (
                                        <Loader2 className="size-3.5 animate-spin" />
                                      )}
                                      {canApproveFinal
                                        ? "Sahkan Langsung"
                                        : ownerNeeded
                                          ? "Verifikasi → Owner"
                                          : "Setujui"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FECDD3] hover:text-[#881337] dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200 dark:shadow-none"
                                      onClick={() => openRejectModal(req)}
                                      disabled={isBusy}
                                      title="Tolak Pengajuan"
                                    >
                                      <XCircle className="size-3.5" />
                                    </Button>
                                  </>
                                )}

                              {req.status === "MENUNGGU_OWNER" && (
                                <Can
                                  action="approval.final"
                                  fallback={
                                    <Badge
                                      variant="outline"
                                      className="self-center rounded-full border-2 border-[#2C2623]/40 bg-[#F3E8FF] px-2.5 text-[11px] font-bold text-[#5B21B6] dark:border-purple-500/40 dark:bg-purple-950/40 dark:text-purple-200"
                                    >
                                      Menunggu Pengesahan Owner
                                    </Badge>
                                  }
                                >
                                  <Button
                                    size="sm"
                                    onClick={() => handleApprove(req)}
                                    disabled={isBusy}
                                    className="rounded-xl border-2 border-[#2C2623] bg-[#8B5CF6] font-extrabold text-white shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#7C3AED] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                  >
                                    {isBusy && (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    )}
                                    Sahkan Owner
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FECDD3] hover:text-[#881337] dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200 dark:shadow-none"
                                    onClick={() => openRejectModal(req)}
                                    disabled={isBusy}
                                    title="Tolak Pengajuan"
                                  >
                                    <XCircle className="size-3.5" />
                                  </Button>
                                </Can>
                              )}

                              {req.status === "DISETUJUI" && canComplete && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleComplete(req)}
                                  disabled={isBusy}
                                  className="rounded-xl border-2 border-[#2C2623] bg-[#CCFBF1] font-extrabold text-[#115E59] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#99F6E4] dark:border-teal-500/40 dark:bg-teal-950/50 dark:text-teal-200 dark:shadow-none"
                                >
                                  {isBusy && (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  )}
                                  Selesai
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDetailRequest(req)}
                                title="Detail & Timeline E-Approval"
                                className="rounded-xl hover:bg-[#DFF2FF] dark:hover:bg-sky-950/40"
                              >
                                <Eye className="size-3.5" />
                              </Button>

                              {canEditRow && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingRequest(req);
                                    setFormOpen(true);
                                  }}
                                  title="Ubah Pengajuan"
                                  className="rounded-xl hover:bg-[#FEF3C7] dark:hover:bg-amber-950/40"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              )}

                              {canDelete && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:bg-[#FFE4E6] hover:text-destructive rounded-xl dark:hover:bg-rose-950/40"
                                  onClick={() => setDeleteTarget(req)}
                                  title="Hapus ke Recycle Bin"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <RequestFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingRequest={editingRequest}
        items={items}
        subscriptions={subscriptions}
        onSaved={handleSavedRequest}
      />

      {/* Detail & E-Approval Stepper Dialog */}
      <RequestDetailDialog
        open={Boolean(detailRequest)}
        onOpenChange={(open) => {
          if (!open) setDetailRequest(null);
        }}
        request={detailRequest}
        profilesMap={profilesMap}
        itemsMap={itemsMap}
        subsMap={subsMap}
        busyActionId={busyActionId}
        onApprove={handleApprove}
        onOpenReject={openRejectModal}
        onComplete={handleComplete}
      />

      {/* Reject Reason Dialog */}
      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open && !rejecting) setRejectTarget(null);
        }}
      >
        <DialogContent className="rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-md dark:border-[#F5EFE6]/30 dark:bg-card dark:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.6)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-extrabold text-[#9F1239] dark:text-rose-200">
              <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] shadow-[2px_2px_0px_0px_#2C2623] dark:border-rose-500/40 dark:bg-rose-950/60 dark:shadow-none">
                <XCircle className="size-4" />
              </span>
              <span>Tolak Pengajuan ({rejectTarget?.request_code})</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Berikan alasan penolakan yang jelas agar pemohon dapat menindaklanjuti.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmReject} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="reject_reason"
                className="text-xs font-bold text-[#2C2623] dark:text-foreground"
              >
                Alasan Penolakan
              </Label>
              <Textarea
                id="reject_reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Contoh: Anggaran dialihkan ke bulan depan / stok masih mencukupi di gudang..."
                rows={4}
                required
                minLength={3}
                className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectTarget(null)}
                disabled={rejecting}
                className="rounded-xl border-2 border-[#2C2623] bg-white font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={rejecting}
                className="rounded-xl border-2 border-[#2C2623] font-extrabold shadow-[3px_3px_0px_0px_#2C2623] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
              >
                {rejecting && <Loader2 className="size-4 animate-spin" />}
                Tolak Pengajuan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Soft Delete Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-md dark:border-[#F5EFE6]/30 dark:bg-card dark:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.6)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-extrabold text-[#9F1239] dark:text-rose-200">
              <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] shadow-[2px_2px_0px_0px_#2C2623] dark:border-rose-500/40 dark:bg-rose-950/60 dark:shadow-none">
                <Trash2 className="size-4" />
              </span>
              <span>Hapus Tiket Pengajuan?</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Tiket{" "}
              <strong className="font-mono">{deleteTarget?.request_code}</strong>{" "}
              akan dipindahkan ke Recycle Bin selama 30 hari.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-xl border-2 border-[#2C2623] bg-white font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="rounded-xl border-2 border-[#2C2623] font-extrabold shadow-[3px_3px_0px_0px_#2C2623] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Hapus ke Recycle Bin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
