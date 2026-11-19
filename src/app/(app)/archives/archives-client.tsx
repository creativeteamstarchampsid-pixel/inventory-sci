"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  History,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
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
import { Switch } from "@/components/ui/switch";
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
  createArchiveAction,
  createArchiveUploadUrlAction,
  getArchiveSignedUrlAction,
  getArchiveVersionsAction,
  softDeleteArchiveAction,
  updateArchiveAction,
  updateArchivePhysicalStatusAction,
  type ArchiveCabinetCode,
  type ArchiveVersionItem,
} from "@/lib/actions/archives";
import {
  ARCHIVE_CABINET_OPTIONS,
  ARCHIVE_CATEGORIES,
  ARCHIVE_STATUS_LABELS,
  LOCATION_LABELS,
  formatDateWIB,
} from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import type { ArchiveHybrid, ArchivePhysicalStatus, UserRole } from "@/types/database";

export type ArchiveListItem = ArchiveHybrid & {
  borrower_name: string | null;
};

export type ArchiveProfileOption = {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
};

type ArchivesClientProps = {
  archives: ArchiveListItem[];
  profiles: ArchiveProfileOption[];
  initialCode?: string;
  schemaError?: string | null;
};

type ArchiveFormState = {
  id?: string;
  title: string;
  categoryPreset: string;
  customCategory: string;
  branch_building: string;
  cabinet_code: ArchiveCabinetCode;
  drawer_no: string;
  folder_code: string;
  physical_status: ArchivePhysicalStatus;
  borrowed_by: string;
  existing_file_url: string | null;
  existing_file_name: string | null;
  remove_existing_file: boolean;
  drive_link: string;
  is_sop_public_to_staff: boolean;
  notes: string;
  change_notes: string;
};

const CUSTOM_CAT_VALUE = "__custom__";
const NONE_BORROWER_VALUE = "__none__";

const EMPTY_FORM: ArchiveFormState = {
  title: "",
  categoryPreset: ARCHIVE_CATEGORIES[0],
  customCategory: "",
  branch_building: "Pusat",
  cabinet_code: "L01",
  drawer_no: "",
  folder_code: "",
  physical_status: "TERSEDIA_DI_LEMARI",
  borrowed_by: NONE_BORROWER_VALUE,
  existing_file_url: null,
  existing_file_name: null,
  remove_existing_file: false,
  drive_link: "",
  is_sop_public_to_staff: false,
  notes: "",
  change_notes: "",
};

function statusBadgeVariant(
  status: ArchivePhysicalStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "TERSEDIA_DI_LEMARI") return "default";
  if (status === "DIPINJAM") return "destructive";
  return "secondary";
}

function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function ArchivesClient({
  archives,
  profiles,
  initialCode,
  schemaError,
}: ArchivesClientProps) {
  const { role, can } = useRole();
  const isStaff = role === "STAFF";
  const canManage = can("archive.manage");

  const [search, setSearch] = useState(initialCode ?? "");
  const [cabinetFilter, setCabinetFilter] = useState<"ALL" | ArchiveCabinetCode>(
    "ALL",
  );
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | ArchivePhysicalStatus
  >("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [digitalTab, setDigitalTab] = useState<
    "all" | "sop" | "storage" | "drive"
  >("all");

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
    fallbackUrl?: string;
    fallbackLabel?: string;
  } | null>(null);

  // Create / Edit Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<ArchiveFormState>(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Version History Dialog state
  const [historyDoc, setHistoryDoc] = useState<ArchiveListItem | null>(null);
  const [historyVersions, setHistoryVersions] = useState<ArchiveVersionItem[]>(
    [],
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Quick Physical Status Dialog state
  const [statusTarget, setStatusTarget] = useState<ArchiveListItem | null>(null);
  const [quickStatus, setQuickStatus] =
    useState<ArchivePhysicalStatus>("TERSEDIA_DI_LEMARI");
  const [quickBorrower, setQuickBorrower] = useState<string>(NONE_BORROWER_VALUE);

  // Delete Confirmation Dialog
  const [deleteTarget, setDeleteTarget] = useState<ArchiveListItem | null>(null);

  // Signed URL loading marker
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  const activeProfiles = useMemo(
    () => profiles.filter((p) => p.is_active),
    [profiles],
  );

  const availableCategories = useMemo(() => {
    const set = new Set<string>(ARCHIVE_CATEGORIES);
    for (const a of archives) {
      if (a.category) set.add(a.category);
    }
    return Array.from(set);
  }, [archives]);

  const cabinetStats = useMemo(() => {
    const map = new Map<
      ArchiveCabinetCode,
      { total: number; available: number; borrowed: number; old: number }
    >();
    for (const opt of ARCHIVE_CABINET_OPTIONS) {
      map.set(opt.value as ArchiveCabinetCode, {
        total: 0,
        available: 0,
        borrowed: 0,
        old: 0,
      });
    }
    for (const doc of archives) {
      const code = doc.cabinet_code as ArchiveCabinetCode;
      const entry = map.get(code);
      if (!entry) continue;
      entry.total += 1;
      if (doc.physical_status === "TERSEDIA_DI_LEMARI") entry.available += 1;
      else if (doc.physical_status === "DIPINJAM") entry.borrowed += 1;
      else entry.old += 1;
    }
    return map;
  }, [archives]);

  const filteredArchives = useMemo(() => {
    const q = search.trim().toLowerCase();
    return archives.filter((doc) => {
      if (cabinetFilter !== "ALL" && doc.cabinet_code !== cabinetFilter) {
        return false;
      }
      if (statusFilter !== "ALL" && doc.physical_status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== "ALL" && doc.category !== categoryFilter) {
        return false;
      }
      if (digitalTab === "sop" && !doc.is_sop_public_to_staff) {
        return false;
      }
      if (digitalTab === "storage" && !doc.digital_file_url) {
        return false;
      }
      if (digitalTab === "drive" && !doc.drive_link) {
        return false;
      }
      if (!q) return true;

      const haystack = [
        doc.doc_code,
        doc.title,
        doc.category,
        doc.branch_building,
        doc.cabinet_code,
        doc.drawer_no,
        doc.folder_code ?? "",
        doc.digital_file_name ?? "",
        doc.borrower_name ?? "",
        doc.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [archives, cabinetFilter, statusFilter, categoryFilter, digitalTab, search]);

  const editingDoc = useMemo(
    () => (form.id ? archives.find((a) => a.id === form.id) ?? null : null),
    [archives, form.id],
  );

  const editHasDigitalChange = useMemo(() => {
    if (formMode !== "edit" || !editingDoc) return false;
    if (selectedFile !== null) return true;
    if (form.remove_existing_file && editingDoc.digital_file_url) return true;
    const prevDrive = (editingDoc.drive_link ?? "").trim();
    const nextDrive = form.drive_link.trim();
    return prevDrive !== nextDrive;
  }, [formMode, editingDoc, selectedFile, form.remove_existing_file, form.drive_link]);

  function openCreateDialog() {
    setFormMode("create");
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFormOpen(true);
  }

  function openEditDialog(doc: ArchiveListItem) {
    const isPreset = (ARCHIVE_CATEGORIES as readonly string[]).includes(
      doc.category,
    );
    setFormMode("edit");
    setForm({
      id: doc.id,
      title: doc.title,
      categoryPreset: isPreset ? doc.category : CUSTOM_CAT_VALUE,
      customCategory: isPreset ? "" : doc.category,
      branch_building: doc.branch_building,
      cabinet_code: doc.cabinet_code as ArchiveCabinetCode,
      drawer_no: doc.drawer_no,
      folder_code: doc.folder_code ?? "",
      physical_status: doc.physical_status,
      borrowed_by: doc.borrowed_by ?? NONE_BORROWER_VALUE,
      existing_file_url: doc.digital_file_url,
      existing_file_name: doc.digital_file_name,
      remove_existing_file: false,
      drive_link: doc.drive_link ?? "",
      is_sop_public_to_staff: doc.is_sop_public_to_staff,
      notes: doc.notes ?? "",
      change_notes: "",
    });
    setSelectedFile(null);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFormOpen(true);
  }

  async function handleOpenSignedFile(
    archiveId: string,
    download: boolean,
    versionId?: string | null,
  ) {
    const key = `${archiveId}-${versionId ?? "active"}-${download ? "dl" : "view"}`;
    setOpeningKey(key);
    setFeedback(null);

    const previewPopup = !download ? window.open("about:blank", "_blank") : null;
    if (previewPopup) {
      previewPopup.opener = null;
    }

    const res = await getArchiveSignedUrlAction({
      archiveId,
      versionId: versionId ?? null,
      download,
    });
    setOpeningKey(null);

    if (!res.ok) {
      if (previewPopup) previewPopup.close();
      setFeedback({ type: "error", message: res.error });
      return;
    }

    if (download) {
      const a = document.createElement("a");
      a.href = res.data.signedUrl;
      a.download = res.data.fileName;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    if (previewPopup) {
      previewPopup.location.href = res.data.signedUrl;
    } else {
      setFeedback({
        type: "success",
        message: "Tautan pratinjau sementara siap dibuka:",
        fallbackUrl: res.data.signedUrl,
        fallbackLabel: res.data.fileName,
      });
    }
  }

  async function handleOpenVersionHistory(doc: ArchiveListItem) {
    setHistoryDoc(doc);
    setHistoryVersions([]);
    setHistoryError(null);
    setHistoryLoading(true);

    const res = await getArchiveVersionsAction(doc.id);
    setHistoryLoading(false);

    if (!res.ok) {
      setHistoryError(res.error);
      return;
    }
    setHistoryVersions(res.data);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const resolvedCategory =
      form.categoryPreset === CUSTOM_CAT_VALUE
        ? form.customCategory.trim()
        : form.categoryPreset;

    if (!form.title.trim()) {
      setFormError("Judul dokumen wajib diisi.");
      return;
    }
    if (!resolvedCategory) {
      setFormError("Kategori dokumen wajib diisi.");
      return;
    }
    if (!form.drawer_no.trim()) {
      setFormError("Nomor laci wajib diisi.");
      return;
    }

    startTransition(async () => {
      let finalFileUrl = form.remove_existing_file ? null : form.existing_file_url;
      let finalFileName = form.remove_existing_file ? null : form.existing_file_name;

      if (selectedFile) {
        const uploadTicket = await createArchiveUploadUrlAction({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
        });

        if (!uploadTicket.ok) {
          setFormError(uploadTicket.error);
          return;
        }

        const browserSupabase = createBrowserSupabase();
        const { error: uploadErr } = await browserSupabase.storage
          .from("archives")
          .uploadToSignedUrl(
            uploadTicket.data.path,
            uploadTicket.data.token,
            selectedFile,
            {
              contentType: selectedFile.type || undefined,
            },
          );

        if (uploadErr) {
          setFormError(
            uploadErr.message || "Gagal mengunggah file ke bucket arsip privat.",
          );
          return;
        }

        finalFileUrl = uploadTicket.data.path;
        finalFileName = uploadTicket.data.originalName;
      }

      const borrowedBy =
        form.physical_status === "DIPINJAM" &&
        form.borrowed_by !== NONE_BORROWER_VALUE
          ? form.borrowed_by
          : null;

      if (formMode === "create") {
        const res = await createArchiveAction({
          title: form.title,
          category: resolvedCategory,
          branch_building: form.branch_building,
          cabinet_code: form.cabinet_code,
          drawer_no: form.drawer_no,
          folder_code: form.folder_code || null,
          physical_status: form.physical_status,
          borrowed_by: borrowedBy,
          digital_file_url: finalFileUrl,
          digital_file_name: finalFileName,
          drive_link: form.drive_link || null,
          is_sop_public_to_staff: form.is_sop_public_to_staff,
          notes: form.notes || null,
        });

        if (!res.ok) {
          setFormError(res.error);
          return;
        }

        setFormOpen(false);
        setFeedback({
          type: "success",
          message: `Arsip ${form.title} (${res.data.doc_code}) berhasil didaftarkan.`,
        });
      } else if (form.id) {
        const res = await updateArchiveAction({
          id: form.id,
          title: form.title,
          category: resolvedCategory,
          branch_building: form.branch_building,
          cabinet_code: form.cabinet_code,
          drawer_no: form.drawer_no,
          folder_code: form.folder_code || null,
          physical_status: form.physical_status,
          borrowed_by: borrowedBy,
          digital_file_url: finalFileUrl,
          digital_file_name: finalFileName,
          drive_link: form.drive_link || null,
          is_sop_public_to_staff: form.is_sop_public_to_staff,
          notes: form.notes || null,
          change_notes: form.change_notes || null,
        });

        if (!res.ok) {
          setFormError(res.error);
          return;
        }

        setFormOpen(false);
        setFeedback({
          type: "success",
          message: `Dokumen ${res.data.doc_code} berhasil diperbarui (Versi v${res.data.version_no}).`,
        });
      }
    });
  }

  function handleQuickStatusSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!statusTarget) return;

    startTransition(async () => {
      const res = await updateArchivePhysicalStatusAction({
        id: statusTarget.id,
        physical_status: quickStatus,
        borrowed_by:
          quickStatus === "DIPINJAM" && quickBorrower !== NONE_BORROWER_VALUE
            ? quickBorrower
            : null,
      });

      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        setStatusTarget(null);
        return;
      }

      const code = statusTarget.doc_code;
      setStatusTarget(null);
      setFeedback({
        type: "success",
        message: `Status fisik ${code} diubah menjadi ${ARCHIVE_STATUS_LABELS[quickStatus]}.`,
      });
    });
  }

  function handleSoftDelete() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const res = await softDeleteArchiveAction(deleteTarget.id);
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        setDeleteTarget(null);
        return;
      }

      const title = deleteTarget.title;
      setDeleteTarget(null);
      setFeedback({
        type: "success",
        message: `Dokumen "${title}" dipindahkan ke Recycle Bin (30 hari).`,
      });
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Archive className="text-primary size-6" />
            {isStaff ? "Panduan SOP" : "Arsip Hybrid (Fisik & Digital)"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isStaff
              ? "Direktori panduan SOP terapi dan dokumen operasional untuk Tim Terapis."
              : "Pemetaan lemari fisik (L01–L04), penyimpanan file privat terenkripsi, tautan Google Drive & riwayat versi."}
          </p>
        </div>

        <Can action="archive.manage">
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            Tambah Arsip
          </Button>
        </Can>
      </div>

      {schemaError && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>Gagal Memuat Data Arsip</AlertTitle>
          <AlertDescription>{schemaError}</AlertDescription>
        </Alert>
      )}

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Check className="size-4 text-emerald-600" />
          )}
          <AlertTitle>
            {feedback.type === "error" ? "Terjadi Kendala" : "Informasi"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{feedback.message}</span>
            {feedback.fallbackUrl && (
              <a
                href={feedback.fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium underline"
              >
                Buka {feedback.fallbackLabel || "Dokumen"}
              </a>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Cabinet Mapping Overview Cards (L01 - L04) — hidden for STAFF */}
      {!isStaff && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ARCHIVE_CABINET_OPTIONS.map((cab) => {
            const code = cab.value as ArchiveCabinetCode;
            const stats = cabinetStats.get(code) ?? {
              total: 0,
              available: 0,
              borrowed: 0,
              old: 0,
            };
            const selected = cabinetFilter === code;

            return (
              <button
                key={code}
                type="button"
                onClick={() =>
                  setCabinetFilter((prev) => (prev === code ? "ALL" : code))
                }
                className={`bg-card text-card-foreground hover:border-primary/60 flex flex-col gap-2 rounded-xl border p-4 text-left shadow-xs transition-colors ${
                  selected ? "border-primary ring-primary/20 ring-2" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">{code}</span>
                  <FolderOpen className="text-muted-foreground size-4" />
                </div>
                <div className="font-semibold">{cab.shortLabel}</div>
                <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                  <span>{stats.total} berkas</span>
                  <span>·</span>
                  <span>{stats.available} tersedia</span>
                  {stats.borrowed > 0 && (
                    <span className="text-destructive font-medium">
                      · {stats.borrowed} dipinjam
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters & Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isStaff ? "Daftar Dokumen SOP" : "Daftar Dokumen Arsip"}
          </CardTitle>
          <CardDescription>
            Menampilkan {filteredArchives.length} dari {archives.length}{" "}
            {isStaff ? "dokumen SOP" : "dokumen arsip"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={digitalTab}
              onValueChange={(v) => setDigitalTab(v as typeof digitalTab)}
            >
              <TabsList className="flex-wrap">
                <TabsTrigger value="all">Semua</TabsTrigger>
                {!isStaff && (
                  <TabsTrigger value="sop">SOP Publik Terapis</TabsTrigger>
                )}
                <TabsTrigger value="storage">Ada File Storage</TabsTrigger>
                <TabsTrigger value="drive">Ada Google Drive</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    isStaff
                      ? "Cari kode atau judul SOP..."
                      : "Cari kode, judul, laci..."
                  }
                  className="pl-8"
                />
              </div>

              {!isStaff && (
                <>
                  <Select
                    value={cabinetFilter}
                    onValueChange={(v) =>
                      setCabinetFilter(v as "ALL" | ArchiveCabinetCode)
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Semua Lemari" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Lemari</SelectItem>
                      {ARCHIVE_CABINET_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={statusFilter}
                    onValueChange={(v) =>
                      setStatusFilter(v as "ALL" | ArchivePhysicalStatus)
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Semua Status Fisik" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Status Fisik</SelectItem>
                      {Object.entries(ARCHIVE_STATUS_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Semua Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Kategori</SelectItem>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode &amp; Dokumen</TableHead>
                <TableHead>Pemetaan Lokasi Fisik</TableHead>
                <TableHead>Berkas Digital &amp; Tautan</TableHead>
                <TableHead>Versi &amp; Riwayat</TableHead>
                {canManage && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredArchives.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 5 : 4}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    Belum ada dokumen arsip yang cocok dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredArchives.map((doc) => {
                  const previewKey = `${doc.id}-active-view`;
                  const downloadKey = `${doc.id}-active-dl`;
                  const safeDocDriveLink = safeExternalUrl(doc.drive_link);

                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold">{doc.title}</span>
                            <Badge variant="outline" className="font-mono text-[11px]">
                              v{doc.version_no}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground font-mono text-xs">
                            {doc.doc_code}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <Badge variant="secondary" className="text-[11px]">
                              {doc.category}
                            </Badge>
                            {isStaff ? (
                              <Badge className="bg-emerald-600 text-[11px] text-white hover:bg-emerald-600">
                                <Globe className="size-3" />
                                SOP Resmi
                              </Badge>
                            ) : doc.is_sop_public_to_staff ? (
                              <Badge className="bg-emerald-600 text-[11px] text-white hover:bg-emerald-600">
                                <Globe className="size-3" />
                                SOP Publik Terapis
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px]">
                                <Lock className="size-3" />
                                Internal Manajemen
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1 text-xs">
                          <div className="font-medium">
                            {doc.branch_building} ·{" "}
                            {LOCATION_LABELS[doc.cabinet_code] || doc.cabinet_code}
                          </div>
                          <div className="text-muted-foreground">
                            Laci <span className="font-mono">{doc.drawer_no}</span>
                            {doc.folder_code ? (
                              <>
                                {" "}
                                · Map <span className="font-mono">{doc.folder_code}</span>
                              </>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <Badge variant={statusBadgeVariant(doc.physical_status)}>
                              {ARCHIVE_STATUS_LABELS[doc.physical_status]}
                            </Badge>
                            {doc.physical_status === "DIPINJAM" &&
                              doc.borrower_name && (
                                <span className="text-muted-foreground">
                                  oleh {doc.borrower_name}
                                </span>
                              )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1.5">
                          {doc.digital_file_url ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs font-medium">
                                <FileText className="text-primary size-3.5 shrink-0" />
                                <span className="max-w-52 truncate">
                                  {doc.digital_file_name || "File Terlampir"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={openingKey === previewKey}
                                  onClick={() =>
                                    handleOpenSignedFile(doc.id, false)
                                  }
                                >
                                  <ExternalLink className="size-3" />
                                  {openingKey === previewKey
                                    ? "Membuka..."
                                    : "Pratinjau"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={openingKey === downloadKey}
                                  onClick={() =>
                                    handleOpenSignedFile(doc.id, true)
                                  }
                                >
                                  <Download className="size-3" />
                                  {openingKey === downloadKey
                                    ? "Mengunduh..."
                                    : "Unduh"}
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          {safeDocDriveLink ? (
                            <div>
                              <Button asChild size="sm" variant="outline">
                                <a
                                  href={safeDocDriveLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="size-3" />
                                  Buka Google Drive
                                </a>
                              </Button>
                            </div>
                          ) : null}

                          {!doc.digital_file_url && !safeDocDriveLink && (
                            <span className="text-muted-foreground text-xs">
                              Berkas fisik saja (belum ada lampiran digital)
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1.5">
                          <div className="text-muted-foreground text-xs">
                            Diperbarui {formatDateWIB(doc.updated_at, true)}
                          </div>
                          {!isStaff ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenVersionHistory(doc)}
                            >
                              <History className="size-3.5" />
                              Riwayat Versi (v{doc.version_no})
                            </Button>
                          ) : (
                            <Badge variant="outline" className="font-mono text-[11px]">
                              Versi Aktif v{doc.version_no}
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      {canManage && (
                        <TableCell className="text-right align-top">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              title="Ubah status fisik lemari/pinjam"
                              onClick={() => {
                                setStatusTarget(doc);
                                setQuickStatus(doc.physical_status);
                                setQuickBorrower(
                                  doc.borrowed_by ?? NONE_BORROWER_VALUE,
                                );
                              }}
                            >
                              <FolderOpen className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              title="Edit arsip / unggah revisi"
                              onClick={() => openEditDialog(doc)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              title="Hapus arsip"
                              onClick={() => setDeleteTarget(doc)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Archive Dialog (OWNER & SUPER_ADMIN) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create"
                ? "Tambah Dokumen Arsip Hybrid"
                : `Edit Dokumen Arsip (${editingDoc?.doc_code ?? ""})`}
            </DialogTitle>
            <DialogDescription>
              Petakan lokasi fisik lemari (L01–L04) serta unggah file digital ke bucket privat{" "}
              <code>archives</code> dan/atau tautkan Google Drive.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>Validasi Gagal</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="arc-title">Judul Dokumen *</Label>
                <Input
                  id="arc-title"
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="cth. SOP Sterilisasi Mainan Sensorik"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Kategori Dokumen *</Label>
                <Select
                  value={form.categoryPreset}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, categoryPreset: v }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ARCHIVE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CAT_VALUE}>
                      Kategori Lainnya (Isi Manual)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {form.categoryPreset === CUSTOM_CAT_VALUE && (
                  <Input
                    required
                    value={form.customCategory}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, customCategory: e.target.value }))
                    }
                    placeholder="Nama kategori baru..."
                    className="mt-2"
                  />
                )}
              </div>
            </div>

            {/* Physical location mapping */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="text-sm font-medium">Pemetaan Lokasi Fisik</div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="arc-branch">Gedung / Cabang</Label>
                  <Input
                    id="arc-branch"
                    value={form.branch_building}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, branch_building: e.target.value }))
                    }
                    placeholder="Pusat"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Lemari (L01–L04) *</Label>
                  <Select
                    value={form.cabinet_code}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        cabinet_code: v as ArchiveCabinetCode,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ARCHIVE_CABINET_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="arc-drawer">Nomor Laci *</Label>
                  <Input
                    id="arc-drawer"
                    required
                    value={form.drawer_no}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, drawer_no: e.target.value }))
                    }
                    placeholder="cth. Laci 2 / Rak B"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="arc-folder">Kode Map / Ordner</Label>
                  <Input
                    id="arc-folder"
                    value={form.folder_code}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, folder_code: e.target.value }))
                    }
                    placeholder="cth. MAP-SOP-01"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Status Fisik</Label>
                  <Select
                    value={form.physical_status}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        physical_status: v as ArchivePhysicalStatus,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ARCHIVE_STATUS_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.physical_status === "DIPINJAM" && (
                  <div className="space-y-1.5">
                    <Label>Dipinjam Oleh</Label>
                    <Select
                      value={form.borrowed_by}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, borrowed_by: v }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih peminjam" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_BORROWER_VALUE}>
                          Tidak ditentukan
                        </SelectItem>
                        {activeProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.id} ({ROLE_LABELS[p.role]?.title ?? p.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Digital upload & Google Drive */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="text-sm font-medium">
                Berkas Digital &amp; Tautan Eksternal
              </div>

              {formMode === "edit" &&
                form.existing_file_url &&
                !form.remove_existing_file && (
                  <div className="bg-muted/50 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <FileText className="text-primary size-3.5 shrink-0" />
                      <span className="truncate font-medium">
                        File saat ini: {form.existing_file_name || "Terlampir"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        setForm((p) => ({ ...p, remove_existing_file: true }))
                      }
                    >
                      <X className="size-3" />
                      Lepas File
                    </Button>
                  </div>
                )}

              <div className="space-y-1.5">
                <Label htmlFor="arc-file" className="flex items-center gap-1.5">
                  <Upload className="size-3.5" />
                  Unggah File ke Bucket Privat (PDF, DOCX, XLSX, Gambar — Maks 25 MB)
                </Label>
                <Input
                  id="arc-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    if (file) {
                      setForm((p) => ({ ...p, remove_existing_file: false }));
                    }
                  }}
                />
                {selectedFile && (
                  <p className="text-muted-foreground text-xs">
                    Dipilih: <strong>{selectedFile.name}</strong> (
                    {(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="arc-drive">Tautan Google Drive (Opsional)</Label>
                <Input
                  id="arc-drive"
                  type="url"
                  value={form.drive_link}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, drive_link: e.target.value }))
                  }
                  placeholder="https://drive.google.com/drive/folders/..."
                />
              </div>

              {editHasDigitalChange && editingDoc && (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                    Perubahan file/tautan akan mengarsipkan{" "}
                    <strong>v{editingDoc.version_no}</strong> ke riwayat versi dan menaikkan
                    versi aktif menjadi <strong>v{editingDoc.version_no + 1}</strong>.
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="arc-change-notes" className="text-xs">
                      Catatan Perubahan Versi (Opsional)
                    </Label>
                    <Input
                      id="arc-change-notes"
                      value={form.change_notes}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, change_notes: e.target.value }))
                      }
                      placeholder="cth. Revisi jadwal sterilisasi Q4 2026"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="arc-sop" className="cursor-pointer">
                  Publikasikan untuk {ROLE_LABELS.STAFF.title}
                </Label>
                <p className="text-muted-foreground text-xs">
                  Jika aktif, seluruh {ROLE_LABELS.STAFF.title} dapat membaca dan mengunduh dokumen SOP ini.
                </p>
              </div>
              <Switch
                id="arc-sop"
                checked={form.is_sop_public_to_staff}
                onCheckedChange={(v) =>
                  setForm((p) => ({ ...p, is_sop_public_to_staff: v }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="arc-notes">Catatan Tambahan</Label>
              <Textarea
                id="arc-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Keterangan isi map fisik, masa berlaku izin, dsb."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Menyimpan..."
                  : formMode === "create"
                    ? "Simpan Dokumen"
                    : "Simpan Perubahan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog
        open={Boolean(historyDoc)}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryDoc(null);
            setHistoryVersions([]);
            setHistoryError(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="text-primary size-5" />
              Riwayat Versi Dokumen
            </DialogTitle>
            <DialogDescription>
              {historyDoc?.doc_code} · {historyDoc?.title}
            </DialogDescription>
          </DialogHeader>

          {historyDoc && (
            <div className="space-y-4">
              {/* Current Active Version */}
              <div className="border-primary/40 bg-primary/5 space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge>Versi Aktif v{historyDoc.version_no}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDateWIB(historyDoc.updated_at, true)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {historyDoc.digital_file_url ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenSignedFile(historyDoc.id, false)}
                      >
                        <ExternalLink className="size-3.5" />
                        Pratinjau ({historyDoc.digital_file_name || "File"})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenSignedFile(historyDoc.id, true)}
                      >
                        <Download className="size-3.5" />
                        Unduh
                      </Button>
                    </>
                  ) : null}

                  {safeExternalUrl(historyDoc.drive_link) ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={safeExternalUrl(historyDoc.drive_link) ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-3.5" />
                        Google Drive
                      </a>
                    </Button>
                  ) : null}

                  {!historyDoc.digital_file_url &&
                    !safeExternalUrl(historyDoc.drive_link) && (
                    <span className="text-muted-foreground text-xs">
                      Tidak ada lampiran digital pada versi aktif.
                    </span>
                  )}
                </div>
              </div>

              {/* Historical Versions — hidden completely for STAFF */}
              {!isStaff && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Versi Sebelumnya</div>

                  {historyLoading && (
                    <p className="text-muted-foreground py-4 text-center text-sm">
                      Memuat riwayat versi...
                    </p>
                  )}

                  {historyError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="size-4" />
                      <AlertDescription>{historyError}</AlertDescription>
                    </Alert>
                  )}

                  {!historyLoading && !historyError && historyVersions.length === 0 && (
                    <p className="text-muted-foreground rounded-md border py-4 text-center text-sm">
                      Belum ada revisi sebelumnya. Dokumen masih berada di versi awal (v1).
                    </p>
                  )}

                  {historyVersions.map((ver) => {
                    const safeVerDriveLink = safeExternalUrl(ver.drive_link);

                    return (
                      <div
                        key={ver.id}
                        className="space-y-2 rounded-lg border p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono">
                              v{ver.version_no}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              {formatDateWIB(ver.created_at, true)}
                            </span>
                          </div>
                          {ver.uploader_name && (
                            <span className="text-muted-foreground text-xs">
                              Oleh {ver.uploader_name}
                            </span>
                          )}
                        </div>

                        {ver.change_notes && (
                          <p className="text-muted-foreground text-xs">
                            Catatan: {ver.change_notes}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {ver.digital_file_url ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleOpenSignedFile(
                                    historyDoc.id,
                                    false,
                                    ver.id,
                                  )
                                }
                              >
                                <ExternalLink className="size-3.5" />
                                Pratinjau ({ver.digital_file_name || "File"})
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  handleOpenSignedFile(
                                    historyDoc.id,
                                    true,
                                    ver.id,
                                  )
                                }
                              >
                                <Download className="size-3.5" />
                                Unduh
                              </Button>
                            </>
                          ) : null}

                          {safeVerDriveLink ? (
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={safeVerDriveLink}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="size-3.5" />
                                Google Drive (v{ver.version_no})
                              </a>
                            </Button>
                          ) : null}

                          {!ver.digital_file_url && !safeVerDriveLink && (
                            <span className="text-muted-foreground text-xs">
                              Versi ini belum memiliki lampiran digital.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setHistoryDoc(null)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Physical Status Dialog */}
      <Dialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Status Fisik Berkas</DialogTitle>
            <DialogDescription>
              {statusTarget?.doc_code} · {statusTarget?.title}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickStatusSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Status Fisik di Lemari</Label>
              <Select
                value={quickStatus}
                onValueChange={(v) =>
                  setQuickStatus(v as ArchivePhysicalStatus)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ARCHIVE_STATUS_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {quickStatus === "DIPINJAM" && (
              <div className="space-y-1.5">
                <Label>Peminjam Berkas Fisik</Label>
                <Select value={quickBorrower} onValueChange={setQuickBorrower}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih peminjam" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_BORROWER_VALUE}>
                      Tidak ditentukan
                    </SelectItem>
                    {activeProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.id} ({ROLE_LABELS[p.role]?.title ?? p.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStatusTarget(null)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Simpan Status"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Soft Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Dokumen Arsip?</DialogTitle>
            <DialogDescription>
              Dokumen <strong>{deleteTarget?.title}</strong> ({deleteTarget?.doc_code})
              akan dipindahkan ke Recycle Bin dan masih dapat dipulihkan selama 30 hari.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleSoftDelete}
            >
              {isPending ? "Menghapus..." : "Hapus ke Recycle Bin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
