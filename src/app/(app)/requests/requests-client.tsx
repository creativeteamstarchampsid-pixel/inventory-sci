"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
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

export function RequestsClient({
  initialRequests,
  profiles,
  items,
  subscriptions,
  schemaError,
}: RequestsClientProps) {
  const { user, role, can } = useRole();
  const isManagement = can("request.view_all");
  const isAdmin = role === "OWNER" || role === "SUPER_ADMIN";
  const canLinkVault = can("vault.view_limited");

  const [requests, setRequests] = useState<InternalRequest[]>(initialRequests);
  const [activeTab, setActiveTab] = useState<RequestTab>(
    isManagement ? "ACTIONABLE" : "ALL",
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

    const res = await approveRequestAction(request.id, options);
    setBusyActionId(null);

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

    const res = await rejectRequestAction(rejectTarget.id, rejectionReason);
    setRejecting(false);

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
  }

  async function handleComplete(request: InternalRequest) {
    setBusyActionId(request.id);
    setBannerError(null);
    setBannerSuccess(null);

    const res = await completeRequestAction(request.id);
    setBusyActionId(null);

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
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setBannerError(null);
    setBannerSuccess(null);

    const res = await softDeleteRequestAction(deleteTarget.id);
    setDeleting(false);

    if (!res.ok) {
      setBannerError(res.error);
      return;
    }

    setRequests((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    if (detailRequest?.id === deleteTarget.id) {
      setDetailRequest(null);
    }
    setDeleteTarget(null);
    setBannerSuccess("Tiket dipindahkan ke Recycle Bin.");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Permintaan Internal &amp; E-Approval
          </h1>
          <p className="text-muted-foreground text-sm">
            Pusat pengajuan pengadaan barang, laporan kerusakan/part hilang,
            akses akun, dan penghapusan aset dengan persetujuan berjenjang.
          </p>
        </div>

        <Can action="request.create">
          <Button
            onClick={() => {
              setEditingRequest(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            Buat Pengajuan Baru
          </Button>
        </Can>
      </div>

      {schemaError && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>Skema Database Belum Siap</AlertTitle>
          <AlertDescription>
            Gagal memuat tiket permintaan: {schemaError}
          </AlertDescription>
        </Alert>
      )}

      {bannerError && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Gagal Memproses Tiket</AlertTitle>
          <AlertDescription>{bannerError}</AlertDescription>
        </Alert>
      )}

      {bannerSuccess && (
        <Alert>
          <CheckCircle2 className="size-4 text-emerald-600" />
          <AlertTitle>Pembaruan Berhasil</AlertTitle>
          <AlertDescription>{bannerSuccess}</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Total Tiket Terlihat</span>
              <ClipboardCheck className="text-muted-foreground size-4" />
            </CardDescription>
            <CardTitle className="text-2xl">{stats.totalCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {isManagement
              ? "Seluruh pengajuan tim Star Champs"
              : "Pengajuan yang Anda kirimkan"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>
                {isManagement ? "Perlu Tindakan Anda" : "Sedang Diproses"}
              </span>
              <Clock className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl">
              {isManagement ? stats.actionableCount : stats.pendingCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {isManagement
              ? `Antrean approval untuk ${ROLE_LABELS[role].title}`
              : "Menunggu Team Leader / Admin / Owner"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Menunggu Owner Final</span>
              <ShieldCheck className="size-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl">
              {stats.waitingOwnerCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Penghapusan aset &amp; pengadaan beranggaran
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Disetujui / Selesai</span>
              <CheckCircle2 className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{stats.approvedCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Tiket telah lolos persetujuan
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as RequestTab)}
            >
              <TabsList>
                {isManagement && (
                  <TabsTrigger value="ACTIONABLE">
                    Perlu Tindakan ({stats.actionableCount})
                  </TabsTrigger>
                )}
                <TabsTrigger value="ALL">
                  Semua ({requests.length})
                </TabsTrigger>
                <TabsTrigger value="MINE">Pengajuan Saya</TabsTrigger>
                <TabsTrigger value="CLOSED">Selesai / Ditolak</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-60">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kode, judul, pemohon..."
                  className="pl-8"
                />
              </div>

              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as "ALL" | RequestType)}
              >
                <SelectTrigger className="w-[185px]">
                  <SelectValue placeholder="Semua Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Jenis</SelectItem>
                  {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map(
                    (rt) => (
                      <SelectItem key={rt} value={rt}>
                        {REQUEST_TYPE_LABELS[rt]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as "ALL" | RequestStatus)
                }
              >
                <SelectTrigger className="w-[205px]">
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

        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <ClipboardCheck className="mb-2 size-8 opacity-40" />
              <p className="font-medium">Tidak ada tiket pengajuan</p>
              <p className="mt-1 text-xs">
                Klik tombol Buat Pengajuan Baru untuk membuat tiket permintaan.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode &amp; Jenis</TableHead>
                  <TableHead>Judul &amp; Tautan</TableHead>
                  <TableHead>Pemohon</TableHead>
                  <TableHead>Estimasi Biaya</TableHead>
                  <TableHead>Status &amp; Tahap</TableHead>
                  <TableHead className="text-right">Aksi E-Approval</TableHead>
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
                    (req.requested_by === user.id || isAdmin);
                  const isBusy = busyActionId === req.id;

                  return (
                    <TableRow key={req.id}>
                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1">
                          <span className="font-mono text-xs font-semibold">
                            {req.request_code}
                          </span>
                          <div>
                            <Badge variant="outline" className="text-[10px]">
                              {REQUEST_TYPE_LABELS[req.request_type]}
                            </Badge>
                          </div>
                          {ownerNeeded && (
                            <div>
                              <Badge
                                variant="secondary"
                                className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                              >
                                Wajib Owner
                              </Badge>
                            </div>
                          )}
                          <p className="text-muted-foreground text-[11px]">
                            {formatDateWIB(req.created_at)}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell className="max-w-[290px] align-top whitespace-normal">
                        <div className="space-y-1">
                          <p className="font-medium leading-snug">{req.title}</p>
                          <p className="text-muted-foreground line-clamp-2 text-xs">
                            {req.description}
                          </p>
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {linkedItem && (
                              <Link
                                href={`/inventory/${linkedItem.id}`}
                                className="bg-muted hover:bg-accent inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
                              >
                                <Package className="size-2.5" />
                                {linkedItem.item_code}
                              </Link>
                            )}
                            {linkedSub && (
                              <span className="bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]">
                                <KeyRound className="size-2.5" />
                                {linkedSub.sub_code} · {linkedSub.service_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-top whitespace-normal text-xs">
                        <p className="font-medium">
                          {profileDisplayName(profilesMap, req.requested_by)}
                        </p>
                        {requester && (
                          <p className="text-muted-foreground text-[11px]">
                            {ROLE_LABELS[requester.role]?.title}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="align-top font-mono text-xs">
                        {req.estimated_cost !== null
                          ? formatRupiah(req.estimated_cost)
                          : "-"}
                      </TableCell>

                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1">
                          <Badge
                            variant={REQUEST_STATUS_BADGE_VARIANT[req.status]}
                          >
                            {REQUEST_STATUS_LABELS[req.status]}
                          </Badge>
                          {req.status === "DITOLAK" && req.rejection_reason && (
                            <p className="text-destructive line-clamp-2 max-w-[200px] text-[11px]">
                              Alasan: {req.rejection_reason}
                            </p>
                          )}
                          {req.team_leader_approved_at && (
                            <p className="text-muted-foreground text-[11px]">
                              TL:{" "}
                              {profileDisplayName(
                                profilesMap,
                                req.team_leader_approved_by,
                              )}
                            </p>
                          )}
                          {req.admin_verified_at && (
                            <p className="text-muted-foreground text-[11px]">
                              Admin:{" "}
                              {profileDisplayName(
                                profilesMap,
                                req.admin_verified_by,
                              )}
                            </p>
                          )}
                          {req.owner_approved_at && (
                            <p className="text-muted-foreground text-[11px]">
                              Owner:{" "}
                              {profileDisplayName(
                                profilesMap,
                                req.owner_approved_by,
                              )}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right align-top">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {req.status === "MENUNGGU_TEAM_LEADER" &&
                            can("request.approve") && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(req)}
                                  disabled={isBusy}
                                >
                                  {isBusy && (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  )}
                                  Setujui
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => openRejectModal(req)}
                                  disabled={isBusy}
                                >
                                  <XCircle className="size-3.5" />
                                </Button>
                              </>
                            )}

                          {req.status === "MENUNGGU_ADMIN" && isAdmin && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleApprove(req)}
                                disabled={isBusy}
                              >
                                {isBusy && (
                                  <Loader2 className="size-3.5 animate-spin" />
                                )}
                                {ownerNeeded
                                  ? "Verifikasi → Owner"
                                  : "Setujui"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => openRejectModal(req)}
                                disabled={isBusy}
                              >
                                <XCircle className="size-3.5" />
                              </Button>
                            </>
                          )}

                          {req.status === "MENUNGGU_OWNER" && (
                            <Can action="approval.final">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(req)}
                                disabled={isBusy}
                              >
                                {isBusy && (
                                  <Loader2 className="size-3.5 animate-spin" />
                                )}
                                Sahkan Owner
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => openRejectModal(req)}
                                disabled={isBusy}
                              >
                                <XCircle className="size-3.5" />
                              </Button>
                            </Can>
                          )}

                          {req.status === "DISETUJUI" && isAdmin && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleComplete(req)}
                              disabled={isBusy}
                            >
                              Selesai
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailRequest(req)}
                            title="Detail & Timeline E-Approval"
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
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          )}

                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(req)}
                              title="Hapus ke Recycle Bin"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Tolak Pengajuan ({rejectTarget?.request_code})
            </DialogTitle>
            <DialogDescription>
              Berikan alasan penolakan yang jelas agar pemohon dapat menindaklanjuti.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmReject} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reject_reason">Alasan Penolakan</Label>
              <Textarea
                id="reject_reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Contoh: Anggaran dialihkan ke bulan depan / stok masih mencukupi di gudang..."
                rows={4}
                required
                minLength={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectTarget(null)}
                disabled={rejecting}
              >
                Batal
              </Button>
              <Button type="submit" variant="destructive" disabled={rejecting}>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Tiket Pengajuan?</DialogTitle>
            <DialogDescription>
              Tiket{" "}
              <strong className="font-mono">{deleteTarget?.request_code}</strong>{" "}
              akan dipindahkan ke Recycle Bin selama 30 hari.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
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
