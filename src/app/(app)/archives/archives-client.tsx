"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  History,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
import { useLocations } from "@/components/providers/locations-provider";
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
  type ArchiveVersionItem,
} from "@/lib/actions/archives";
import {
  ARCHIVE_CATEGORIES,
  ARCHIVE_STATUS_LABELS,
  formatDateWIB,
} from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  UPLOAD_SIZE_LIMITS,
  compressImageFile,
  formatBytes,
  sanitizeStorageFilename,
  scanAndValidateUploadFile,
} from "@/lib/upload-security";
import type {
  ArchiveHybrid,
  ArchivePhysicalStatus,
  LocationCode,
  UserRole,
} from "@/types/database";

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
  cabinet_code: LocationCode;
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

type CabinetTheme = {
  bg: string;
  tabBg: string;
  drawerFill: string;
  folderFill: string;
  badgeBg: string;
  textAccent: string;
};

const CABINET_THEME_PALETTES: readonly CabinetTheme[] = [
  {
    bg: "bg-[#E8F6FF] dark:bg-sky-950/35",
    tabBg: "bg-[#BAE6FD] dark:bg-sky-900/60",
    drawerFill: "#BAE6FD",
    folderFill: "#FDE68A",
    badgeBg: "bg-[#7CC4FA] text-[#0C4A6E]",
    textAccent: "text-[#0C4A6E] dark:text-sky-200",
  },
  {
    bg: "bg-[#E8FBF0] dark:bg-emerald-950/35",
    tabBg: "bg-[#A7F3D0] dark:bg-emerald-900/60",
    drawerFill: "#A7F3D0",
    folderFill: "#FDA4AF",
    badgeBg: "bg-[#6EE7B7] text-[#115E3B]",
    textAccent: "text-[#115E3B] dark:text-emerald-200",
  },
  {
    bg: "bg-[#FFF8DC] dark:bg-amber-950/35",
    tabBg: "bg-[#FDE68A] dark:bg-amber-900/60",
    drawerFill: "#FDE68A",
    folderFill: "#7CC4FA",
    badgeBg: "bg-[#FCD34D] text-[#78350F]",
    textAccent: "text-[#78350F] dark:text-amber-200",
  },
  {
    bg: "bg-[#FFF0F5] dark:bg-pink-950/35",
    tabBg: "bg-[#FBCFE8] dark:bg-pink-900/60",
    drawerFill: "#FBCFE8",
    folderFill: "#A7F3D0",
    badgeBg: "bg-[#FDA4AF] text-[#881337]",
    textAccent: "text-[#881337] dark:text-pink-200",
  },
];

const PRESET_CABINET_THEME_INDEX: Record<string, number> = {
  L01: 0,
  L02: 1,
  L03: 2,
  L04: 3,
};

function getCabinetTheme(code: string, index = 0): CabinetTheme {
  const upper = code.trim().toUpperCase();
  if (upper in PRESET_CABINET_THEME_INDEX) {
    return CABINET_THEME_PALETTES[PRESET_CABINET_THEME_INDEX[upper]];
  }
  if (index > 0) {
    return CABINET_THEME_PALETTES[index % CABINET_THEME_PALETTES.length];
  }
  const trailingDigits = /(\d+)$/.exec(upper);
  if (trailingDigits) {
    const numIdx = Math.max(0, Number(trailingDigits[1]) - 1);
    return CABINET_THEME_PALETTES[numIdx % CABINET_THEME_PALETTES.length];
  }
  const charSum = Array.from(upper).reduce(
    (sum, ch) => sum + ch.charCodeAt(0),
    0,
  );
  return CABINET_THEME_PALETTES[(index + charSum) % CABINET_THEME_PALETTES.length];
}

const PHYSICAL_STATUS_CLASSES: Record<ArchivePhysicalStatus, string> = {
  TERSEDIA_DI_LEMARI:
    "border-2 border-[#2C2623] bg-[#D9F9E8] text-[#115E3B] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-emerald-400/50 dark:bg-emerald-950/60 dark:text-emerald-200 dark:shadow-none",
  DIPINJAM:
    "border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-rose-400/50 dark:bg-rose-950/60 dark:text-rose-200 dark:shadow-none",
  ARSIP_LAMA:
    "border-2 border-[#2C2623] bg-[#F3E8FF] text-[#5B21B6] font-extrabold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-purple-400/50 dark:bg-purple-950/60 dark:text-purple-200 dark:shadow-none",
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

function CabinetIllustrationSvg({
  drawerFill,
  folderFill,
}: {
  drawerFill: string;
  folderFill: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-12 shrink-0 select-none"
      aria-hidden="true"
    >
      {/* Peeking folder tabs on top */}
      <path
        d="M14 14h14l4 5H14z"
        fill={folderFill}
        stroke="#2C2623"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M34 15h14l3 4H34z"
        fill="#FFFFFF"
        stroke="#2C2623"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* Cabinet body */}
      <rect
        x="10"
        y="18"
        width="44"
        height="40"
        rx="8"
        fill="#FFFDF7"
        stroke="#2C2623"
        strokeWidth="2.6"
      />
      {/* Top drawer */}
      <rect
        x="15"
        y="23"
        width="34"
        height="13"
        rx="4"
        fill={drawerFill}
        stroke="#2C2623"
        strokeWidth="2.2"
      />
      <line
        x1="27"
        y1="29.5"
        x2="37"
        y2="29.5"
        stroke="#2C2623"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Bottom drawer */}
      <rect
        x="15"
        y="40"
        width="34"
        height="13"
        rx="4"
        fill={drawerFill}
        stroke="#2C2623"
        strokeWidth="2.2"
      />
      <line
        x1="27"
        y1="46.5"
        x2="37"
        y2="46.5"
        stroke="#2C2623"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Cute blush dots */}
      <circle cx="20" cy="29.5" r="1.6" fill="#FDA4AF" />
      <circle cx="44" cy="29.5" r="1.6" fill="#FDA4AF" />
    </svg>
  );
}

function ShelfBinderSvg({
  fill,
  isSop,
}: {
  fill: string;
  isSop: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-10 shrink-0 select-none"
      aria-hidden="true"
    >
      {/* Folder back tab */}
      <path
        d="M8 14a4 4 0 0 1 4-4h10l4 5h14a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V14Z"
        fill={fill}
        stroke="#2C2623"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Paper peeking inside */}
      <rect
        x="13"
        y="16"
        width="22"
        height="8"
        rx="2"
        fill="#FFFFFF"
        stroke="#2C2623"
        strokeWidth="2"
      />
      {/* Front folder flap */}
      <rect
        x="8"
        y="20"
        width="36"
        height="22"
        rx="5"
        fill={isSop ? "#A7F3D0" : fill}
        stroke="#2C2623"
        strokeWidth="2.5"
      />
      {/* Kawaii face */}
      <circle cx="21" cy="30" r="1.8" fill="#2C2623" />
      <circle cx="31" cy="30" r="1.8" fill="#2C2623" />
      <ellipse cx="17.5" cy="32.5" rx="2.2" ry="1.2" fill="#FDA4AF" />
      <ellipse cx="34.5" cy="32.5" rx="2.2" ry="1.2" fill="#FDA4AF" />
      <path
        d="M24 31.8q2 2.2 4 0"
        fill="none"
        stroke="#2C2623"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArchivesClient({
  archives,
  profiles,
  initialCode,
  schemaError,
}: ArchivesClientProps) {
  const { role, can } = useRole();
  const { showWorking, showSuccess, showError } = useCartoonFeedback();
  const { archiveCabinetOptions, getOptionWithCurrent, getLabel } =
    useLocations();
  const isStaff = role === "STAFF";
  const canManage = can("archive.manage");

  const [search, setSearch] = useState(initialCode ?? "");
  const [cabinetFilter, setCabinetFilter] = useState<"ALL" | LocationCode>(
    "ALL",
  );
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | ArchivePhysicalStatus
  >("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [digitalTab, setDigitalTab] = useState<
    "all" | "sop" | "storage" | "drive"
  >("all");
  const [viewMode, setViewMode] = useState<"shelf" | "table">("shelf");

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
  const [isScanningFile, setIsScanningFile] = useState(false);
  const [fileSecurityNote, setFileSecurityNote] = useState<string | null>(null);
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

  const summaryStats = useMemo(() => {
    let available = 0;
    let borrowed = 0;
    let publicSop = 0;
    let withFile = 0;
    let withDrive = 0;

    for (const doc of archives) {
      if (doc.physical_status === "TERSEDIA_DI_LEMARI") available += 1;
      if (doc.physical_status === "DIPINJAM") borrowed += 1;
      if (doc.is_sop_public_to_staff) publicSop += 1;
      if (doc.digital_file_url) withFile += 1;
      if (safeExternalUrl(doc.drive_link)) withDrive += 1;
    }

    return {
      total: archives.length,
      available,
      borrowed,
      publicSop,
      withFile,
      withDrive,
    };
  }, [archives]);

  const cabinetStats = useMemo(() => {
    const map = new Map<
      LocationCode,
      { total: number; available: number; borrowed: number; old: number }
    >();
    for (const opt of archiveCabinetOptions) {
      map.set(opt.value, {
        total: 0,
        available: 0,
        borrowed: 0,
        old: 0,
      });
    }
    for (const doc of archives) {
      const code = doc.cabinet_code;
      const entry = map.get(code);
      if (!entry) continue;
      entry.total += 1;
      if (doc.physical_status === "TERSEDIA_DI_LEMARI") entry.available += 1;
      else if (doc.physical_status === "DIPINJAM") entry.borrowed += 1;
      else entry.old += 1;
    }
    return map;
  }, [archives, archiveCabinetOptions]);

  const cabinetIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    archiveCabinetOptions.forEach((cab, idx) => {
      map.set(cab.value, idx);
    });
    return map;
  }, [archiveCabinetOptions]);

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
  }, [
    formMode,
    editingDoc,
    selectedFile,
    form.remove_existing_file,
    form.drive_link,
  ]);

  function openCreateDialog() {
    setFormMode("create");
    const defaultCab =
      archiveCabinetOptions.find((c) => c.value === "L01")?.value ??
      archiveCabinetOptions[0]?.value ??
      "L01";
    setForm({ ...EMPTY_FORM, cabinet_code: defaultCab });
    setSelectedFile(null);
    setFileSecurityNote(null);
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
      cabinet_code: doc.cabinet_code,
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
    setFileSecurityNote(null);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFormOpen(true);
  }

  async function handleArchiveFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const inputEl = e.target;
    const rawFile = inputEl.files?.[0] ?? null;
    if (!rawFile) {
      setSelectedFile(null);
      setFileSecurityNote(null);
      return;
    }

    setFormError(null);
    setIsScanningFile(true);
    try {
      const scan = await scanAndValidateUploadFile(rawFile, "archive");
      if (!scan.ok) {
        inputEl.value = "";
        setSelectedFile(null);
        setFileSecurityNote(null);
        setFormError(scan.error);
        showError({
          title: "Berkas Arsip Ditolak 🛡️",
          message: scan.error,
        });
        return;
      }

      if (scan.detectedMime.startsWith("image/")) {
        const compressed = await compressImageFile(rawFile);
        setSelectedFile(compressed);
        const note =
          compressed.size < rawFile.size
            ? `Lolos scan keamanan (${scan.detectedExt.toUpperCase()}) · Dikompresi ${formatBytes(rawFile.size)} → ${formatBytes(compressed.size)} (EXIF dibersihkan)`
            : `Lolos scan keamanan (${scan.detectedExt.toUpperCase()}) · ${formatBytes(compressed.size)} (EXIF dibersihkan)`;
        setFileSecurityNote(note);
      } else {
        const safeName = sanitizeStorageFilename(rawFile.name, "dokumen-arsip");
        const safeFile = new File([rawFile], safeName, {
          type: scan.detectedMime || rawFile.type || "application/octet-stream",
          lastModified: rawFile.lastModified,
        });
        setSelectedFile(safeFile);
        setFileSecurityNote(
          `Lolos scan magic-byte & struktur (${scan.detectedExt.toUpperCase()}) · ${formatBytes(safeFile.size)}`,
        );
      }
      setForm((p) => ({ ...p, remove_existing_file: false }));
    } finally {
      setIsScanningFile(false);
    }
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

    showWorking({
      title: download
        ? "Menyiapkan Unduhan Berkas..."
        : "Membuka Pratinjau Dokumen...",
      message: download
        ? "Dino Joguman lagi menyiapkan tautan unduhan aman dari brankas arsip privat nih! Sebentar ya~"
        : "Dino Joguman lagi membuka pratinjau dokumen dari brankas arsip nih! Tunggu sebentar ya~",
    });

    try {
      const res = await getArchiveSignedUrlAction({
        archiveId,
        versionId: versionId ?? null,
        download,
      });

      if (!res.ok) {
        if (previewPopup) previewPopup.close();
        setFeedback({ type: "error", message: res.error });
        showError({
          title: download
            ? "Gagal Mengunduh Berkas"
            : "Gagal Membuka Pratinjau",
          message: res.error,
        });
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
        showSuccess({
          title: "Unduhan Dimulai! 📥",
          message: `Yeay! Berkas "${res.data.fileName}" sedang diunduh ke perangkatmu~`,
        });
        return;
      }

      if (previewPopup) {
        previewPopup.location.href = res.data.signedUrl;
        showSuccess({
          title: "Pratinjau Siap! 👀",
          message: `Yeay! Dokumen "${res.data.fileName}" berhasil dibuka di tab baru~`,
        });
      } else {
        setFeedback({
          type: "success",
          message: "Tautan pratinjau sementara siap dibuka:",
          fallbackUrl: res.data.signedUrl,
          fallbackLabel: res.data.fileName,
        });
        showSuccess({
          title: "Tautan Pratinjau Siap! ✨",
          message: `Popup diblokir browser—klik tautan "${res.data.fileName}" pada banner di halaman ini ya~`,
        });
      }
    } catch (err) {
      if (previewPopup) previewPopup.close();
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal memproses tautan berkas digital.";
      setFeedback({ type: "error", message: msg });
      showError({
        title: download ? "Gagal Mengunduh Berkas" : "Gagal Membuka Pratinjau",
        message: msg,
      });
    } finally {
      setOpeningKey(null);
    }
  }

  async function handleOpenVersionHistory(doc: ArchiveListItem) {
    setHistoryDoc(doc);
    setHistoryVersions([]);
    setHistoryError(null);
    setHistoryLoading(true);

    try {
      const res = await getArchiveVersionsAction(doc.id);
      if (!res.ok) {
        setHistoryError(res.error);
        showError({
          title: "Gagal Memuat Riwayat Versi",
          message: res.error,
        });
        return;
      }
      setHistoryVersions(res.data);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal memuat riwayat versi dokumen.";
      setHistoryError(msg);
      showError({
        title: "Gagal Memuat Riwayat Versi",
        message: msg,
      });
    } finally {
      setHistoryLoading(false);
    }
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
      try {
        showWorking({
          title: selectedFile
            ? "Mengunggah Berkas Digital..."
            : formMode === "create"
              ? "Mendaftarkan Dokumen Arsip..."
              : "Menyimpan Perubahan Arsip...",
          message: selectedFile
            ? `Dino Joguman lagi mengunggah "${selectedFile.name}" ke bucket arsip privat terenkripsi nih! Tunggu sebentar ya~`
            : formMode === "create"
              ? `Dino Joguman lagi menata dokumen "${form.title.trim()}" ke lemari ${form.cabinet_code} nih! Sebentar ya~`
              : `Dino Joguman lagi merapikan pembaruan dokumen ${editingDoc?.doc_code ?? ""} nih! Tunggu sebentar ya~`,
        });

        let finalFileUrl = form.remove_existing_file
          ? null
          : form.existing_file_url;
        let finalFileName = form.remove_existing_file
          ? null
          : form.existing_file_name;

        if (selectedFile) {
          if (selectedFile.size > UPLOAD_SIZE_LIMITS.archive) {
            const msg = "Ukuran dokumen arsip melebihi batas maksimal 10 MB.";
            setFormError(msg);
            showError({
              title: "Berkas Arsip Terlalu Besar 🛡️",
              message: msg,
            });
            return;
          }

          const safeFileName = sanitizeStorageFilename(
            selectedFile.name,
            "dokumen-arsip",
          );
          const uploadTicket = await createArchiveUploadUrlAction({
            fileName: safeFileName,
            fileSize: selectedFile.size,
          });

          if (!uploadTicket.ok) {
            setFormError(uploadTicket.error);
            showError({
              title: "Gagal Menyiapkan Unggahan",
              message: uploadTicket.error,
            });
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
            const msg =
              uploadErr.message ||
              "Gagal mengunggah file ke bucket arsip privat.";
            setFormError(msg);
            showError({
              title: "Gagal Mengunggah Berkas",
              message: msg,
            });
            return;
          }

          finalFileUrl = uploadTicket.data.path;
          finalFileName = uploadTicket.data.originalName;

          showWorking({
            title:
              formMode === "create"
                ? "Menyimpan Data Arsip..."
                : "Mencatat Revisi Versi...",
            message:
              "Berkas sudah terunggah aman! Sekarang Dino Joguman lagi menyimpan metadata rak & versinya~",
          });
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
            showError({
              title: "Gagal Mendaftarkan Arsip",
              message: res.error,
            });
            return;
          }

          const successMsg = `Arsip ${form.title} (${res.data.doc_code}) berhasil didaftarkan.`;
          setFormOpen(false);
          setFeedback({
            type: "success",
            message: successMsg,
          });
          showSuccess({
            title: "Arsip Berhasil Didaftarkan! 📁",
            message: `Yeay! ${successMsg}`,
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
            showError({
              title: "Gagal Memperbarui Arsip",
              message: res.error,
            });
            return;
          }

          const successMsg = `Dokumen ${res.data.doc_code} berhasil diperbarui (Versi v${res.data.version_no}).`;
          setFormOpen(false);
          setFeedback({
            type: "success",
            message: successMsg,
          });
          showSuccess({
            title: "Dokumen Arsip Diperbarui! ✨",
            message: `Yeay! ${successMsg}`,
          });
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat menyimpan dokumen arsip.";
        setFormError(msg);
        showError({
          title: "Gagal Menyimpan Arsip",
          message: msg,
        });
      }
    });
  }

  function handleQuickStatusSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!statusTarget) return;

    const targetId = statusTarget.id;
    const targetCode = statusTarget.doc_code;
    const targetStatus = quickStatus;
    const targetBorrower =
      quickStatus === "DIPINJAM" && quickBorrower !== NONE_BORROWER_VALUE
        ? quickBorrower
        : null;

    startTransition(async () => {
      try {
        showWorking({
          title: "Memperbarui Status Fisik...",
          message: `Dino Joguman lagi memperbarui status lemari berkas ${targetCode} menjadi "${ARCHIVE_STATUS_LABELS[targetStatus]}"~`,
        });

        const res = await updateArchivePhysicalStatusAction({
          id: targetId,
          physical_status: targetStatus,
          borrowed_by: targetBorrower,
        });

        if (!res.ok) {
          setFeedback({ type: "error", message: res.error });
          setStatusTarget(null);
          showError({
            title: "Gagal Mengubah Status Fisik",
            message: res.error,
          });
          return;
        }

        const successMsg = `Status fisik ${targetCode} diubah menjadi ${ARCHIVE_STATUS_LABELS[targetStatus]}.`;
        setStatusTarget(null);
        setFeedback({
          type: "success",
          message: successMsg,
        });
        showSuccess({
          title: "Status Fisik Diperbarui! ✨",
          message: `Yeay! ${successMsg}`,
        });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Gagal memperbarui status fisik arsip.";
        setFeedback({ type: "error", message: msg });
        setStatusTarget(null);
        showError({
          title: "Gagal Mengubah Status Fisik",
          message: msg,
        });
      }
    });
  }

  function handleSoftDelete() {
    if (!deleteTarget) return;

    const targetId = deleteTarget.id;
    const targetTitle = deleteTarget.title;

    startTransition(async () => {
      try {
        showWorking({
          title: "Memindahkan Arsip ke Recycle Bin...",
          message: `Dino Joguman lagi memindahkan dokumen "${targetTitle}" ke Recycle Bin (tetap aman dipulihkan selama 30 hari)~`,
        });

        const res = await softDeleteArchiveAction(targetId);
        if (!res.ok) {
          setFeedback({ type: "error", message: res.error });
          setDeleteTarget(null);
          showError({
            title: "Gagal Menghapus Dokumen",
            message: res.error,
          });
          return;
        }

        const successMsg = `Dokumen "${targetTitle}" dipindahkan ke Recycle Bin (30 hari).`;
        setDeleteTarget(null);
        setFeedback({
          type: "success",
          message: successMsg,
        });
        showSuccess({
          title: "Arsip Dipindahkan ke Recycle Bin",
          message: successMsg,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Gagal menghapus dokumen arsip.";
        setFeedback({ type: "error", message: msg });
        setDeleteTarget(null);
        showError({
          title: "Gagal Menghapus Dokumen",
          message: msg,
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Kawaii Page Banner */}
      <KawaiiPageHeader
        mascot="folder"
        accent="sky"
        badge={isStaff ? "Direktori SOP Resmi ✨" : "Arsip Fisik & Digital ✨"}
        title={isStaff ? "Panduan SOP" : "Arsip Hybrid (Fisik & Digital)"}
        description={
          isStaff
            ? "Direktori panduan SOP terapi dan dokumen operasional untuk Tim Terapis."
            : "Pemetaan lemari fisik arsip, penyimpanan file privat terenkripsi, tautan Google Drive & riwayat versi."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Can action="locations.manage">
              <Button
                variant="outline"
                asChild
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] px-4 font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#CCFBF1] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-[#F5EFE6]/30 dark:bg-stone-900 dark:text-foreground"
              >
                <Link href="/rooms">
                  <MapPin className="size-4" />
                  Kelola Lemari &amp; Ruangan
                </Link>
              </Button>
            </Can>
            <Can action="archive.manage">
              <Button
                onClick={openCreateDialog}
                className="rounded-2xl border-2 border-[#2C2623] bg-[#2AB673] px-4 font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-[#F5EFE6]/30"
              >
                <Plus className="size-4" />
                Tambah Arsip
              </Button>
            </Can>
          </div>
        }
      />

      {schemaError && (
        <Alert
          variant="warning"
          className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-500/40 dark:bg-amber-950/40 dark:shadow-none"
        >
          <AlertTriangle className="size-4" />
          <AlertTitle className="font-extrabold">
            Gagal Memuat Data Arsip
          </AlertTitle>
          <AlertDescription>{schemaError}</AlertDescription>
        </Alert>
      )}

      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          className={`rounded-2xl border-2 border-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:shadow-none ${
            feedback.type === "error"
              ? "bg-[#FFE4E6] dark:border-rose-500/40 dark:bg-rose-950/40"
              : "bg-[#D9F9E8] text-[#115E3B] dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100"
          }`}
        >
          {feedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Check className="size-4 text-[#15803D] dark:text-emerald-300" />
          )}
          <AlertTitle className="font-extrabold">
            {feedback.type === "error" ? "Terjadi Kendala" : "Informasi"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{feedback.message}</span>
            {feedback.fallbackUrl && (
              <a
                href={feedback.fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-bold underline"
              >
                Buka {feedback.fallbackLabel || "Dokumen"}
              </a>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Kawaii Summary KPI Cards */}
      {isStaff ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <KawaiiStatCard
            accent="sky"
            label="Total Panduan SOP"
            value={summaryStats.total}
            hint="Dokumen SOP resmi aktif untuk Tim Terapis"
            icon={<BookOpen className="size-4" />}
          />
          <KawaiiStatCard
            accent="mint"
            label="File Siap Unduh"
            value={summaryStats.withFile}
            hint="Lampiran dokumen di brankas arsip"
            icon={<FileText className="size-4" />}
          />
          <KawaiiStatCard
            accent="butter"
            label="Tautan Google Drive"
            value={summaryStats.withDrive}
            hint="Panduan tersinkron di Google Drive"
            icon={<ExternalLink className="size-4" />}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KawaiiStatCard
            accent="sky"
            label="Total Dokumen Arsip"
            value={summaryStats.total}
            hint="Seluruh berkas fisik & digital aktif"
            icon={<FolderOpen className="size-4" />}
          />
          <KawaiiStatCard
            accent="mint"
            label="Tersedia di Lemari"
            value={summaryStats.available}
            hint="Berkas fisik rapi di lemari arsip"
            icon={<Check className="size-4" />}
          />
          <KawaiiStatCard
            accent="pink"
            label="Sedang Dipinjam"
            value={summaryStats.borrowed}
            hint="Berkas fisik sedang digunakan tim"
            icon={<History className="size-4" />}
          />
          <KawaiiStatCard
            accent="butter"
            label="SOP Publik Terapis"
            value={summaryStats.publicSop}
            hint="Dapat dibaca & diunduh Tim Terapis"
            icon={<Globe className="size-4" />}
          />
        </div>
      )}

      {/* Illustrated 2D Cabinet Shelf Mapping Cards — hidden for STAFF */}
      {!isStaff && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-extrabold tracking-tight text-[#2C2623] dark:text-foreground">
              <Sparkles className="size-4 text-[#0284C7]" />
              <span>Peta Rak Lemari Fisik</span>
            </h2>
            {cabinetFilter !== "ALL" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCabinetFilter("ALL")}
                className="h-7 rounded-full border-2 border-[#2C2623] bg-white px-3 text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
              >
                <X className="size-3" />
                Tampilkan Semua Lemari
              </Button>
            )}
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {archiveCabinetOptions.map((cab, cabIdx) => {
              const code = cab.value;
              const theme = getCabinetTheme(code, cabIdx);
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
                  className={`group relative flex flex-col gap-3 rounded-3xl border-2 border-[#2C2623] p-4 text-left transition-all active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-[#F5EFE6]/30 ${theme.bg} ${
                    selected
                      ? "-translate-y-1 shadow-[5px_5px_0px_0px_#2C2623] ring-2 ring-[#2C2623] ring-offset-2 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.65)]"
                      : "shadow-[3px_3px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#2C2623] dark:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.5)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full border-2 border-[#2C2623] px-2.5 py-0.5 font-mono text-xs font-black ${theme.badgeBg}`}
                        >
                          {code}
                        </span>
                        {selected && (
                          <span className="inline-flex items-center gap-0.5 rounded-full border-2 border-[#2C2623] bg-[#2AB673] px-2 py-0.5 text-[10px] font-extrabold text-white">
                            <Check className="size-2.5 stroke-[3]" />
                            Aktif
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-base font-extrabold leading-tight ${theme.textAccent}`}
                      >
                        {cab.shortLabel}
                      </div>
                    </div>

                    <CabinetIllustrationSvg
                      drawerFill={theme.drawerFill}
                      folderFill={theme.folderFill}
                    />
                  </div>

                  {/* Shelf Footer Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 border-t-2 border-dashed border-[#2C2623]/20 pt-2.5 text-[11px] font-bold dark:border-border">
                    <span className="rounded-full border border-[#2C2623]/50 bg-white/90 px-2 py-0.5 text-[#2C2623] dark:border-border dark:bg-background/80 dark:text-foreground">
                      {stats.total} berkas
                    </span>
                    <span className="rounded-full border border-[#2C2623]/50 bg-[#D9F9E8] px-2 py-0.5 text-[#115E3B] dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200">
                      {stats.available} tersedia
                    </span>
                    {stats.borrowed > 0 && (
                      <span className="rounded-full border border-[#2C2623] bg-[#FFE4E6] px-2 py-0.5 font-extrabold text-[#9F1239] dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-200">
                        {stats.borrowed} dipinjam
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Shelf & Table Container Card */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5EFE6]/25 dark:bg-card dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]">
        <CardHeader className="border-b-2 border-[#2C2623]/15 bg-[#EFF8FF] py-4 dark:border-border dark:bg-muted/30">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="text-base font-extrabold text-[#2C2623] dark:text-foreground">
                {isStaff ? "Rak Panduan SOP Terapi" : "Daftar Dokumen Arsip"}
              </CardTitle>
              <CardDescription className="text-xs font-medium">
                Menampilkan {filteredArchives.length} dari {archives.length}{" "}
                {isStaff ? "dokumen SOP" : "dokumen arsip"}.
              </CardDescription>
            </div>

            {/* Shelf vs Table View Switcher */}
            <div className="inline-flex w-fit items-center gap-1 rounded-2xl border-2 border-[#2C2623] bg-white p-1 shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none">
              <button
                type="button"
                onClick={() => setViewMode("shelf")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
                  viewMode === "shelf"
                    ? "border-2 border-[#2C2623] bg-[#DFF2FF] text-[#0C4A6E] dark:border-sky-400/50 dark:bg-sky-950/60 dark:text-sky-100"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="size-3.5" />
                Kartu Rak
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
                  viewMode === "table"
                    ? "border-2 border-[#2C2623] bg-[#FEF3C7] text-[#78350F] dark:border-amber-400/50 dark:bg-amber-950/60 dark:text-amber-100"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="size-3.5" />
                Tabel
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-4 sm:p-6">
          {/* Tabs & Filter Controls */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={digitalTab}
              onValueChange={(v) => setDigitalTab(v as typeof digitalTab)}
            >
              <TabsList className="h-auto flex-wrap gap-1 rounded-2xl border-2 border-[#2C2623] bg-white p-1 shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none">
                <TabsTrigger
                  value="all"
                  className="rounded-xl text-xs font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#DFF2FF] data-[state=active]:text-[#0C4A6E] dark:data-[state=active]:border-sky-400/50 dark:data-[state=active]:bg-sky-950/60 dark:data-[state=active]:text-sky-100"
                >
                  Semua
                </TabsTrigger>
                {!isStaff && (
                  <TabsTrigger
                    value="sop"
                    className="rounded-xl text-xs font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#D9F9E8] data-[state=active]:text-[#115E3B] dark:data-[state=active]:border-emerald-400/50 dark:data-[state=active]:bg-emerald-950/60 dark:data-[state=active]:text-emerald-100"
                  >
                    SOP Publik Terapis
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="storage"
                  className="rounded-xl text-xs font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FFE4EC] data-[state=active]:text-[#7A1C3C] dark:data-[state=active]:border-pink-400/50 dark:data-[state=active]:bg-pink-950/60 dark:data-[state=active]:text-pink-100"
                >
                  Ada File Storage
                </TabsTrigger>
                <TabsTrigger
                  value="drive"
                  className="rounded-xl text-xs font-bold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FEF3C7] data-[state=active]:text-[#78350F] dark:data-[state=active]:border-amber-400/50 dark:data-[state=active]:bg-amber-950/60 dark:data-[state=active]:text-amber-100"
                >
                  Ada Google Drive
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    isStaff
                      ? "Cari kode atau judul SOP..."
                      : "Cari kode, judul, laci..."
                  }
                  className="rounded-xl border-2 border-[#2C2623] bg-white pl-9 dark:border-border dark:bg-background"
                />
              </div>

              {!isStaff && (
                <>
                  <Select
                    value={cabinetFilter}
                    onValueChange={(v) =>
                      setCabinetFilter(v as "ALL" | LocationCode)
                    }
                  >
                    <SelectTrigger className="w-40 rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-border dark:bg-background">
                      <SelectValue placeholder="Semua Lemari" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Lemari</SelectItem>
                      {getOptionWithCurrent(
                        archiveCabinetOptions,
                        cabinetFilter === "ALL" ? null : cabinetFilter,
                      ).map((c) => (
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
                    <SelectTrigger className="w-44 rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-border dark:bg-background">
                      <SelectValue placeholder="Semua Status Fisik" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Status Fisik</SelectItem>
                      {Object.entries(ARCHIVE_STATUS_LABELS).map(
                        ([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </>
              )}

              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v)}
              >
                <SelectTrigger className="w-44 rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-border dark:bg-background">
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

          {/* Empty State */}
          {filteredArchives.length === 0 ? (
            <KawaiiEmptyState
              mascot="folder"
              title={
                isStaff
                  ? "Belum ada panduan SOP yang cocok~"
                  : "Belum ada dokumen arsip yang cocok~"
              }
              description={
                isStaff
                  ? "Coba ubah kata kunci pencarian atau pilih kategori SOP lainnya."
                  : "Coba ubah filter lemari/status, atau tambahkan dokumen arsip baru ke rak."
              }
              action={
                <Can action="archive.manage">
                  <Button
                    onClick={openCreateDialog}
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62]"
                  >
                    <Plus className="size-4" />
                    Tambah Arsip Baru
                  </Button>
                </Can>
              }
            />
          ) : viewMode === "shelf" ? (
            /* Illustrated Shelf Cards Grid (SOP & Physical/Digital Archives) */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredArchives.map((doc) => {
                const previewKey = `${doc.id}-active-view`;
                const downloadKey = `${doc.id}-active-dl`;
                const safeDocDriveLink = safeExternalUrl(doc.drive_link);
                const cabTheme = getCabinetTheme(
                  doc.cabinet_code,
                  cabinetIndexMap.get(doc.cabinet_code) ?? 0,
                );

                return (
                  <div
                    key={doc.id}
                    className="flex flex-col justify-between overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-white shadow-[4px_4px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5EFE6]/25 dark:bg-background dark:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.55)]"
                  >
                    {/* Top Pastel Shelf Tab Ribbon */}
                    <div
                      className={`flex items-center justify-between gap-2 border-b-2 border-[#2C2623] px-4 py-2.5 dark:border-border ${
                        isStaff ? "bg-[#D9F9E8] dark:bg-emerald-950/50" : cabTheme.tabBg
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-lg border-2 border-[#2C2623] bg-white px-2 py-0.5 font-mono text-[11px] font-black text-[#2C2623] dark:border-border dark:bg-background dark:text-foreground">
                          {doc.doc_code}
                        </span>
                        <Badge
                          variant="outline"
                          className="rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-2 py-0 text-[10px] font-extrabold text-[#2C2623] dark:border-border dark:bg-background dark:text-foreground"
                        >
                          v{doc.version_no}
                        </Badge>
                      </div>

                      {isStaff ? (
                        <Badge className="rounded-full border-2 border-[#2C2623] bg-[#2AB673] px-2 py-0.5 text-[10px] font-extrabold text-white hover:bg-[#2AB673]">
                          <Globe className="size-3" />
                          SOP Resmi
                        </Badge>
                      ) : doc.is_sop_public_to_staff ? (
                        <Badge className="rounded-full border-2 border-[#2C2623] bg-[#2AB673] px-2 py-0.5 text-[10px] font-extrabold text-white hover:bg-[#2AB673]">
                          <Globe className="size-3" />
                          SOP Publik
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="rounded-full border-2 border-[#2C2623] bg-white/90 px-2 py-0.5 text-[10px] font-extrabold text-[#2C2623] dark:border-border dark:bg-background dark:text-foreground"
                        >
                          <Lock className="size-3" />
                          Internal
                        </Badge>
                      )}
                    </div>

                    {/* Shelf Card Body */}
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      {/* Title & Cute Folder Illustration */}
                      <div className="flex items-start gap-3">
                        <ShelfBinderSvg
                          fill={cabTheme.drawerFill}
                          isSop={doc.is_sop_public_to_staff}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3 className="line-clamp-2 text-sm font-extrabold leading-snug text-[#2C2623] dark:text-foreground">
                            {doc.title}
                          </h3>
                          <Badge
                            variant="secondary"
                            className="rounded-full border border-[#2C2623]/50 bg-[#FEF9E7] px-2 py-0 text-[10px] font-bold text-[#78350F] dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200"
                          >
                            {doc.category}
                          </Badge>
                        </div>
                      </div>

                      {/* Physical Shelf Location Strip */}
                      <div className="space-y-1.5 rounded-2xl border-2 border-dashed border-[#2C2623]/30 bg-[#FFFDF7] p-3 text-xs dark:border-border dark:bg-muted/30">
                        <div className="flex items-center gap-1.5 font-bold text-[#2C2623] dark:text-foreground">
                          <MapPin className="size-3.5 shrink-0 text-[#0284C7]" />
                          <span className="truncate">
                            {doc.branch_building} · {getLabel(doc.cabinet_code)}
                          </span>
                        </div>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span>
                            Laci{" "}
                            <strong className="font-mono text-foreground">
                              {doc.drawer_no}
                            </strong>
                          </span>
                          {doc.folder_code && (
                            <>
                              <span>·</span>
                              <span>
                                Map{" "}
                                <strong className="font-mono text-foreground">
                                  {doc.folder_code}
                                </strong>
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <Badge
                            variant={statusBadgeVariant(doc.physical_status)}
                            className={`rounded-full px-2.5 py-0 text-[10px] ${PHYSICAL_STATUS_CLASSES[doc.physical_status]}`}
                          >
                            {ARCHIVE_STATUS_LABELS[doc.physical_status]}
                          </Badge>
                          {doc.physical_status === "DIPINJAM" &&
                            doc.borrower_name && (
                              <span className="text-[11px] font-semibold text-[#9F1239] dark:text-rose-300">
                                oleh {doc.borrower_name}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Notes if present */}
                      {doc.notes && (
                        <p className="text-muted-foreground line-clamp-2 text-[11px] leading-relaxed">
                          📝 {doc.notes}
                        </p>
                      )}

                      {/* Digital File & Google Drive Actions */}
                      <div className="mt-auto space-y-2 pt-1">
                        {doc.digital_file_url ? (
                          <div className="space-y-2 rounded-2xl border-2 border-[#2C2623]/25 bg-[#F2FBF7] p-2.5 dark:border-emerald-500/30 dark:bg-emerald-950/20">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#115E3B] dark:text-emerald-200">
                              <FileText className="size-3.5 shrink-0" />
                              <span className="truncate">
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
                                className="h-7 flex-1 rounded-xl border-2 border-[#2C2623] bg-white text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#DFF2FF] dark:border-border dark:bg-background dark:shadow-none"
                              >
                                {openingKey === previewKey ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <ExternalLink className="size-3" />
                                )}
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
                                className="h-7 flex-1 rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] text-xs font-extrabold text-[#115E3B] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#6EE7B7] dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200 dark:shadow-none"
                              >
                                {openingKey === downloadKey ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Download className="size-3" />
                                )}
                                {openingKey === downloadKey
                                  ? "Mengunduh..."
                                  : "Unduh"}
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {safeDocDriveLink ? (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-8 w-full rounded-xl border-2 border-[#2C2623] bg-[#FEF9E7] text-xs font-extrabold text-[#78350F] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE68A] dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200 dark:shadow-none"
                          >
                            <a
                              href={safeDocDriveLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="size-3.5" />
                              Buka Google Drive
                            </a>
                          </Button>
                        ) : null}

                        {!doc.digital_file_url && !safeDocDriveLink && (
                          <p className="text-muted-foreground rounded-xl border border-dashed border-[#2C2623]/25 bg-muted/30 px-2.5 py-1.5 text-center text-[11px]">
                            Berkas fisik saja (belum ada lampiran digital)
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Shelf Card Footer: Version History + Manage Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-[#2C2623]/15 bg-[#FFFDF7] px-4 py-2.5 dark:border-border dark:bg-muted/20">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground text-[10px]">
                          Diperbarui {formatDateWIB(doc.updated_at, true)}
                        </span>
                        {!isStaff ? (
                          <button
                            type="button"
                            onClick={() => handleOpenVersionHistory(doc)}
                            className="inline-flex w-fit items-center gap-1 text-[11px] font-extrabold text-[#0284C7] hover:underline dark:text-sky-300"
                          >
                            <History className="size-3" />
                            Riwayat Versi (v{doc.version_no})
                          </button>
                        ) : (
                          <span className="font-mono text-[10px] font-bold text-[#115E3B] dark:text-emerald-300">
                            Versi Aktif v{doc.version_no}
                          </span>
                        )}
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            title="Ubah status fisik lemari/pinjam"
                            className="h-7 w-7 rounded-xl p-0 hover:bg-[#DFF2FF] dark:hover:bg-sky-950/50"
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
                            className="h-7 w-7 rounded-xl p-0 hover:bg-[#FEF3C7] dark:hover:bg-amber-950/50"
                            onClick={() => openEditDialog(doc)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-[#FFE4E6] hover:text-destructive h-7 w-7 rounded-xl p-0 dark:hover:bg-rose-950/50"
                            title="Hapus arsip"
                            onClick={() => setDeleteTarget(doc)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Kawaii Styled Table View */
            <div className="overflow-x-auto rounded-2xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 border-[#2C2623] bg-[#FEF9E7] hover:bg-[#FEF9E7] dark:border-border dark:bg-muted/50">
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Kode &amp; Dokumen
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Pemetaan Lokasi Fisik
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Berkas Digital &amp; Tautan
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Versi &amp; Riwayat
                    </TableHead>
                    {canManage && (
                      <TableHead className="text-right font-extrabold text-[#2C2623] dark:text-foreground">
                        Aksi
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredArchives.map((doc) => {
                    const previewKey = `${doc.id}-active-view`;
                    const downloadKey = `${doc.id}-active-dl`;
                    const safeDocDriveLink = safeExternalUrl(doc.drive_link);

                    return (
                      <TableRow
                        key={doc.id}
                        className="border-b border-[#2C2623]/15 transition-colors hover:bg-[#EFF8FF]/70 dark:border-border dark:hover:bg-muted/40"
                      >
                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-extrabold text-[#2C2623] dark:text-foreground">
                                {doc.title}
                              </span>
                              <Badge
                                variant="outline"
                                className="rounded-full border border-[#2C2623] bg-[#FFF8EE] font-mono text-[11px] font-bold"
                              >
                                v{doc.version_no}
                              </Badge>
                            </div>
                            <div className="text-muted-foreground font-mono text-xs font-semibold">
                              {doc.doc_code}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <Badge
                                variant="secondary"
                                className="rounded-full border border-[#2C2623]/40 bg-[#FEF9E7] text-[11px] font-bold text-[#78350F] dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200"
                              >
                                {doc.category}
                              </Badge>
                              {isStaff ? (
                                <Badge className="rounded-full border-2 border-[#2C2623] bg-[#2AB673] text-[11px] font-extrabold text-white hover:bg-[#2AB673]">
                                  <Globe className="size-3" />
                                  SOP Resmi
                                </Badge>
                              ) : doc.is_sop_public_to_staff ? (
                                <Badge className="rounded-full border-2 border-[#2C2623] bg-[#2AB673] text-[11px] font-extrabold text-white hover:bg-[#2AB673]">
                                  <Globe className="size-3" />
                                  SOP Publik Terapis
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border border-[#2C2623]/60 text-[11px] font-bold"
                                >
                                  <Lock className="size-3" />
                                  Internal Manajemen
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1.5 text-xs">
                            <div className="font-bold text-[#2C2623] dark:text-foreground">
                              {doc.branch_building} ·{" "}
                              {getLabel(doc.cabinet_code)}
                            </div>
                            <div className="text-muted-foreground">
                              Laci{" "}
                              <span className="font-mono font-semibold text-foreground">
                                {doc.drawer_no}
                              </span>
                              {doc.folder_code ? (
                                <>
                                  {" "}
                                  · Map{" "}
                                  <span className="font-mono font-semibold text-foreground">
                                    {doc.folder_code}
                                  </span>
                                </>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <Badge
                                variant={statusBadgeVariant(doc.physical_status)}
                                className={`rounded-full px-2.5 text-[11px] ${PHYSICAL_STATUS_CLASSES[doc.physical_status]}`}
                              >
                                {ARCHIVE_STATUS_LABELS[doc.physical_status]}
                              </Badge>
                              {doc.physical_status === "DIPINJAM" &&
                                doc.borrower_name && (
                                  <span className="text-muted-foreground font-medium">
                                    oleh {doc.borrower_name}
                                  </span>
                                )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1.5">
                            {doc.digital_file_url ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1 text-xs font-bold text-[#115E3B] dark:text-emerald-200">
                                  <FileText className="size-3.5 shrink-0" />
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
                                    className="h-7 rounded-xl border-2 border-[#2C2623] bg-white text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#DFF2FF] dark:border-border dark:bg-background dark:shadow-none"
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
                                    className="h-7 rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] text-xs font-extrabold text-[#115E3B] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#6EE7B7] dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200 dark:shadow-none"
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
                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-xl border-2 border-[#2C2623] bg-[#FEF9E7] text-xs font-bold text-[#78350F] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE68A] dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200 dark:shadow-none"
                                >
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
                                className="h-7 rounded-xl border-2 border-[#2C2623] bg-white text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#DFF2FF] dark:border-border dark:bg-background dark:shadow-none"
                              >
                                <History className="size-3.5" />
                                Riwayat Versi (v{doc.version_no})
                              </Button>
                            ) : (
                              <Badge
                                variant="outline"
                                className="rounded-full border border-[#2C2623]/50 font-mono text-[11px] font-bold"
                              >
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
                                className="rounded-xl hover:bg-[#DFF2FF] dark:hover:bg-sky-950/40"
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
                                className="rounded-xl hover:bg-[#FEF3C7] dark:hover:bg-amber-950/40"
                                onClick={() => openEditDialog(doc)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:bg-[#FFE4E6] hover:text-destructive rounded-xl dark:hover:bg-rose-950/40"
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
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Archive Dialog (OWNER & SUPER_ADMIN) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-2xl dark:border-[#F5EFE6]/30 dark:bg-card dark:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.6)]">
          <DialogHeader className="space-y-2 border-b-2 border-dashed border-[#2C2623]/20 pb-3 dark:border-border">
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#DFF2FF] px-3 py-0.5 text-[11px] font-extrabold text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] dark:border-sky-400/40 dark:bg-sky-950/60 dark:text-sky-200 dark:shadow-none">
              <Sparkles className="size-3" />
              <span>
                {formMode === "create"
                  ? "Registrasi Arsip Baru"
                  : "Pembaruan & Revisi Dokumen"}
              </span>
            </div>
            <DialogTitle className="text-lg font-extrabold text-[#2C2623] dark:text-foreground">
              {formMode === "create"
                ? "Tambah Dokumen Arsip Hybrid"
                : `Edit Dokumen Arsip (${editingDoc?.doc_code ?? ""})`}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Petakan lokasi fisik lemari arsip serta unggah file digital ke
              bucket privat <code>archives</code> dan/atau tautkan Google Drive.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4 pt-1">
            {formError && (
              <Alert
                variant="destructive"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] shadow-[3px_3px_0px_0px_#2C2623] dark:border-rose-500/40 dark:bg-rose-950/50 dark:shadow-none"
              >
                <AlertTriangle className="size-4" />
                <AlertTitle className="font-extrabold">
                  Validasi Gagal
                </AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="arc-title"
                  className="text-xs font-bold text-[#2C2623] dark:text-foreground"
                >
                  Judul Dokumen *
                </Label>
                <Input
                  id="arc-title"
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="cth. SOP Sterilisasi Mainan Sensorik"
                  className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#2C2623] dark:text-foreground">
                  Kategori Dokumen *
                </Label>
                <Select
                  value={form.categoryPreset}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, categoryPreset: v }))
                  }
                >
                  <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-border dark:bg-background">
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
                    className="mt-2 rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
                  />
                )}
              </div>
            </div>

            {/* Physical location mapping */}
            <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#EFF8FF] p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5EFE6]/25 dark:bg-muted/30 dark:shadow-none">
              <div className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-[#0C4A6E] uppercase dark:text-sky-200">
                <MapPin className="size-3.5" />
                <span>Pemetaan Lokasi Fisik</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="arc-branch" className="text-xs font-bold">
                    Gedung / Cabang
                  </Label>
                  <Input
                    id="arc-branch"
                    value={form.branch_building}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        branch_building: e.target.value,
                      }))
                    }
                    placeholder="Pusat"
                    className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Lemari Arsip *</Label>
                  <Select
                    value={form.cabinet_code}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        cabinet_code: v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-border dark:bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getOptionWithCurrent(
                        archiveCabinetOptions,
                        form.cabinet_code,
                      ).map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="arc-drawer" className="text-xs font-bold">
                    Nomor Laci *
                  </Label>
                  <Input
                    id="arc-drawer"
                    required
                    value={form.drawer_no}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, drawer_no: e.target.value }))
                    }
                    placeholder="cth. Laci 2 / Rak B"
                    className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="arc-folder" className="text-xs font-bold">
                    Kode Map / Ordner
                  </Label>
                  <Input
                    id="arc-folder"
                    value={form.folder_code}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, folder_code: e.target.value }))
                    }
                    placeholder="cth. MAP-SOP-01"
                    className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Status Fisik</Label>
                  <Select
                    value={form.physical_status}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        physical_status: v as ArchivePhysicalStatus,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-border dark:bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ARCHIVE_STATUS_LABELS).map(
                        ([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {form.physical_status === "DIPINJAM" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Dipinjam Oleh</Label>
                    <Select
                      value={form.borrowed_by}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, borrowed_by: v }))
                      }
                    >
                      <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background">
                        <SelectValue placeholder="Pilih peminjam" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_BORROWER_VALUE}>
                          Tidak ditentukan
                        </SelectItem>
                        {activeProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.id} (
                            {ROLE_LABELS[p.role]?.title ?? p.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Digital upload & Google Drive */}
            <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#F2FBF7] p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#F5EFE6]/25 dark:bg-muted/30 dark:shadow-none">
              <div className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-[#115E3B] uppercase dark:text-emerald-200">
                <Upload className="size-3.5" />
                <span>Berkas Digital &amp; Tautan Eksternal</span>
              </div>

              {formMode === "edit" &&
                form.existing_file_url &&
                !form.remove_existing_file && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-[#2C2623]/30 bg-white px-3 py-2 text-xs dark:border-border dark:bg-background">
                    <div className="flex items-center gap-1.5 truncate">
                      <FileText className="size-3.5 shrink-0 text-[#15803D]" />
                      <span className="truncate font-bold">
                        File saat ini: {form.existing_file_name || "Terlampir"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-xl px-2 text-xs font-bold text-[#9F1239] hover:bg-[#FFE4E6]"
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
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <Label
                    htmlFor="arc-file"
                    className="flex items-center gap-1.5 text-xs font-bold"
                  >
                    <Upload className="size-3.5" />
                    Unggah File ke Bucket Privat (PDF, DOCX, XLSX, ZIP, Gambar —
                    Maks 10 MB)
                  </Label>
                  <Badge
                    variant="outline"
                    className="rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] px-2 py-0 text-[10px] font-extrabold text-[#14532D] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-emerald-400/50 dark:bg-emerald-950/70 dark:text-emerald-200 dark:shadow-none"
                  >
                    <ShieldCheck className="size-3" />
                    Scan Magic-Byte &amp; Auto-Kompresi Gambar
                  </Badge>
                </div>
                <Input
                  id="arc-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg,.webp"
                  disabled={isPending || isScanningFile}
                  className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
                  onChange={handleArchiveFileChange}
                />
                {isScanningFile && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0C4A6E] dark:text-sky-300">
                    <Loader2 className="size-3.5 animate-spin" />
                    Memindai magic-byte &amp; keamanan file...
                  </p>
                )}
                {selectedFile && !isScanningFile && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-[#115E3B] dark:text-emerald-200">
                      📎 Dipilih: <strong>{selectedFile.name}</strong> (
                      {formatBytes(selectedFile.size)})
                    </p>
                    {fileSecurityNote && (
                      <p className="inline-flex items-center gap-1 text-[11px] font-bold text-[#14532D] dark:text-emerald-300">
                        <ShieldCheck className="size-3.5 shrink-0" />
                        {fileSecurityNote}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="arc-drive" className="text-xs font-bold">
                  Tautan Google Drive (Opsional)
                </Label>
                <Input
                  id="arc-drive"
                  type="url"
                  value={form.drive_link}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, drive_link: e.target.value }))
                  }
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
                />
              </div>

              {editHasDigitalChange && editingDoc && (
                <div className="space-y-2 rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-500/40 dark:bg-amber-950/40 dark:shadow-none">
                  <p className="text-xs font-semibold text-[#78350F] dark:text-amber-100">
                    Perubahan file/tautan akan mengarsipkan{" "}
                    <strong>v{editingDoc.version_no}</strong> ke riwayat versi
                    dan menaikkan versi aktif menjadi{" "}
                    <strong>v{editingDoc.version_no + 1}</strong>.
                  </p>
                  <div className="space-y-1">
                    <Label
                      htmlFor="arc-change-notes"
                      className="text-xs font-bold"
                    >
                      Catatan Perubahan Versi (Opsional)
                    </Label>
                    <Input
                      id="arc-change-notes"
                      value={form.change_notes}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, change_notes: e.target.value }))
                      }
                      placeholder="cth. Revisi jadwal sterilisasi Q4 2026"
                      className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFF8DC] px-4 py-3 shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-500/35 dark:bg-amber-950/30 dark:shadow-none">
              <div className="space-y-0.5">
                <Label
                  htmlFor="arc-sop"
                  className="cursor-pointer text-xs font-extrabold text-[#2C2623] dark:text-foreground"
                >
                  Publikasikan untuk {ROLE_LABELS.STAFF.title}
                </Label>
                <p className="text-muted-foreground text-xs">
                  Jika aktif, seluruh {ROLE_LABELS.STAFF.title} dapat membaca
                  dan mengunduh dokumen SOP ini.
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
              <Label
                htmlFor="arc-notes"
                className="text-xs font-bold text-[#2C2623] dark:text-foreground"
              >
                Catatan Tambahan
              </Label>
              <Textarea
                id="arc-notes"
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="Keterangan isi map fisik, masa berlaku izin, dsb."
                className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background"
              />
            </div>

            <DialogFooter className="gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                className="rounded-xl border-2 border-[#2C2623] bg-white font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isPending || isScanningFile}
                className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
              >
                {(isPending || isScanningFile) && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {isScanningFile
                  ? "Memindai..."
                  : isPending
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
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-xl dark:border-[#F5EFE6]/30 dark:bg-card dark:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.6)]">
          <DialogHeader className="border-b-2 border-dashed border-[#2C2623]/20 pb-3 dark:border-border">
            <DialogTitle className="flex items-center gap-2 font-extrabold text-[#2C2623] dark:text-foreground">
              <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#DFF2FF] text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] dark:border-sky-400/40 dark:bg-sky-950/60 dark:text-sky-200 dark:shadow-none">
                <History className="size-4" />
              </span>
              <span>Riwayat Versi Dokumen</span>
            </DialogTitle>
            <DialogDescription className="font-mono text-xs font-semibold">
              {historyDoc?.doc_code} · {historyDoc?.title}
            </DialogDescription>
          </DialogHeader>

          {historyDoc && (
            <div className="space-y-4 pt-1">
              {/* Current Active Version */}
              <div className="space-y-2.5 rounded-2xl border-2 border-[#2C2623] bg-[#D9F9E8] p-3.5 shadow-[3px_3px_0px_0px_#2C2623] dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:shadow-none">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white">
                      Versi Aktif v{historyDoc.version_no}
                    </Badge>
                    <span className="text-xs font-semibold text-[#115E3B] dark:text-emerald-200">
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
                        onClick={() =>
                          handleOpenSignedFile(historyDoc.id, false)
                        }
                        className="rounded-xl border-2 border-[#2C2623] bg-white text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
                      >
                        <ExternalLink className="size-3.5" />
                        Pratinjau ({historyDoc.digital_file_name || "File"})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          handleOpenSignedFile(historyDoc.id, true)
                        }
                        className="rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] text-xs font-extrabold text-[#78350F] shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200 dark:shadow-none"
                      >
                        <Download className="size-3.5" />
                        Unduh
                      </Button>
                    </>
                  ) : null}

                  {safeExternalUrl(historyDoc.drive_link) ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-2 border-[#2C2623] bg-white text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
                    >
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
                      <span className="text-xs font-medium text-[#115E3B]/80 dark:text-emerald-200/80">
                        Tidak ada lampiran digital pada versi aktif.
                      </span>
                    )}
                </div>
              </div>

              {/* Historical Versions — hidden completely for STAFF */}
              {!isStaff && (
                <div className="space-y-2.5">
                  <div className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-foreground">
                    Versi Sebelumnya
                  </div>

                  {historyLoading && (
                    <div className="text-muted-foreground flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#2C2623]/30 py-6 text-sm font-medium">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Memuat riwayat versi...</span>
                    </div>
                  )}

                  {historyError && (
                    <Alert
                      variant="destructive"
                      className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6]"
                    >
                      <AlertTriangle className="size-4" />
                      <AlertDescription>{historyError}</AlertDescription>
                    </Alert>
                  )}

                  {!historyLoading &&
                    !historyError &&
                    historyVersions.length === 0 && (
                      <p className="text-muted-foreground rounded-2xl border-2 border-dashed border-[#2C2623]/30 bg-white/80 py-5 text-center text-xs font-medium dark:border-border dark:bg-muted/20">
                        Belum ada revisi sebelumnya. Dokumen masih berada di
                        versi awal (v1).
                      </p>
                    )}

                  {historyVersions.map((ver) => {
                    const safeVerDriveLink = safeExternalUrl(ver.drive_link);

                    return (
                      <div
                        key={ver.id}
                        className="space-y-2 rounded-2xl border-2 border-[#2C2623]/80 bg-white p-3.5 text-sm shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-border dark:bg-muted/30 dark:shadow-none"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="rounded-full border-2 border-[#2C2623] bg-[#FFF8EE] font-mono font-extrabold"
                            >
                              v{ver.version_no}
                            </Badge>
                            <span className="text-muted-foreground text-xs font-medium">
                              {formatDateWIB(ver.created_at, true)}
                            </span>
                          </div>
                          {ver.uploader_name && (
                            <span className="text-muted-foreground text-xs font-semibold">
                              Oleh {ver.uploader_name}
                            </span>
                          )}
                        </div>

                        {ver.change_notes && (
                          <p className="rounded-xl bg-[#FFF8EE] px-2.5 py-1.5 text-xs font-medium text-[#5C3A00] dark:bg-muted dark:text-foreground">
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
                                className="h-7 rounded-xl border-2 border-[#2C2623] bg-white text-xs font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
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
                                className="h-7 rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] text-xs font-extrabold text-[#115E3B] shadow-[2px_2px_0px_0px_#2C2623] dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200 dark:shadow-none"
                              >
                                <Download className="size-3.5" />
                                Unduh
                              </Button>
                            </>
                          ) : null}

                          {safeVerDriveLink ? (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-xl border-2 border-[#2C2623] bg-[#FEF9E7] text-xs font-bold text-[#78350F] shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200 dark:shadow-none"
                            >
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
              className="rounded-xl border-2 border-[#2C2623] bg-white font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
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
        <DialogContent className="rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-md dark:border-[#F5EFE6]/30 dark:bg-card dark:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.6)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-extrabold text-[#2C2623] dark:text-foreground">
              <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#DFF2FF] text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] dark:border-sky-400/40 dark:bg-sky-950/60 dark:text-sky-200 dark:shadow-none">
                <FolderOpen className="size-4" />
              </span>
              <span>Ubah Status Fisik Berkas</span>
            </DialogTitle>
            <DialogDescription className="font-mono text-xs font-semibold">
              {statusTarget?.doc_code} · {statusTarget?.title}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickStatusSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Status Fisik di Lemari</Label>
              <Select
                value={quickStatus}
                onValueChange={(v) =>
                  setQuickStatus(v as ArchivePhysicalStatus)
                }
              >
                <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-border dark:bg-background">
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
                <Label className="text-xs font-bold">
                  Peminjam Berkas Fisik
                </Label>
                <Select value={quickBorrower} onValueChange={setQuickBorrower}>
                  <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-border dark:bg-background">
                    <SelectValue placeholder="Pilih peminjam" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_BORROWER_VALUE}>
                      Tidak ditentukan
                    </SelectItem>
                    {activeProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.id} (
                        {ROLE_LABELS[p.role]?.title ?? p.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStatusTarget(null)}
                className="rounded-xl border-2 border-[#2C2623] bg-white font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#239D62] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
              >
                {isPending && <Loader2 className="size-4 animate-spin" />}
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
        <DialogContent className="rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-md dark:border-[#F5EFE6]/30 dark:bg-card dark:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.6)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-extrabold text-[#9F1239] dark:text-rose-200">
              <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#9F1239] shadow-[2px_2px_0px_0px_#2C2623] dark:border-rose-500/40 dark:bg-rose-950/60 dark:shadow-none">
                <Trash2 className="size-4" />
              </span>
              <span>Hapus Dokumen Arsip?</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Dokumen <strong>{deleteTarget?.title}</strong> (
              {deleteTarget?.doc_code}) akan dipindahkan ke Recycle Bin dan
              masih dapat dipulihkan selama 30 hari.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border-2 border-[#2C2623] bg-white font-bold shadow-[2px_2px_0px_0px_#2C2623] dark:border-border dark:bg-background dark:shadow-none"
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleSoftDelete}
              className="rounded-xl border-2 border-[#2C2623] font-extrabold shadow-[3px_3px_0px_0px_#2C2623] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isPending ? "Menghapus..." : "Hapus ke Recycle Bin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
