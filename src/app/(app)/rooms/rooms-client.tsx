"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  DoorOpen,
  Info,
  Lock,
  MapPin,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createLocationAction,
  deleteLocationAction,
  toggleLocationActiveAction,
  toggleLocationOpnameAction,
  updateLocationAction,
} from "@/lib/actions/locations";
import {
  LIVE_SUPPORTED_ENUM_CODES,
  LOCATION_GROUP_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LocationGroup, LocationMaster } from "@/types/database";

export type LocationUsageCounts = Record<
  string,
  {
    items: number;
    kits: number;
    archives: number;
  }
>;

type RoomsClientProps = {
  locations: LocationMaster[];
  usageCounts: LocationUsageCounts;
  schemaReady: boolean;
  schemaError: string | null;
};

type GroupTab = "ALL" | LocationGroup;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type CreatableGroup = "THERAPY" | "OFFICE" | "ARCHIVE";

const CODE_REGEX = /^[A-Z0-9]{2,8}$/;
const LEGACY_ARCHIVE_CODES = new Set(["L01", "L02", "L03", "L04"]);
const PRESET_ENUM_CODE_SET = new Set<string>(LIVE_SUPPORTED_ENUM_CODES);

const SUGGESTION_HINTS: Record<string, string> = {
  R07: "Ruang Terapi 7",
  R08: "Ruang Terapi 8",
  R09: "Ruang Terapi 9",
  R10: "Ruang Terapi 10",
  R11: "Ruang Terapi 11",
  R12: "Ruang Terapi 12",
  FAC: "Ruang Fasilitas",
  RTG: "Ruang Tunggu",
  KLS: "Ruang Kelas",
  UKS: "Ruang Kesehatan",
  DPR: "Dapur / Pantry",
  MUS: "Musala",
  LAB: "Ruang Asesmen / Lab",
  GDG2: "Gudang Tambahan",
  KTR1: "Kantor 1",
  KTR2: "Kantor 2",
  L05: "Lemari Arsip 5",
  L06: "Lemari Arsip 6",
  L07: "Lemari Arsip 7",
  L08: "Lemari Arsip 8",
};

const GROUP_STYLES: Record<
  LocationGroup,
  {
    headerBg: string;
    codeBg: string;
    badgeBg: string;
    icon: typeof DoorOpen;
  }
> = {
  THERAPY: {
    headerBg: "bg-[#E6FBF0]/85 dark:bg-[#1B3328]/70",
    codeBg: "bg-[#6EE7B7] text-[#115E3B]",
    badgeBg: "bg-[#D8F8E7] text-[#14532D] dark:bg-emerald-950/70 dark:text-emerald-200",
    icon: DoorOpen,
  },
  OFFICE: {
    headerBg: "bg-[#E8F6FF]/85 dark:bg-[#1A2D3B]/70",
    codeBg: "bg-[#7CC4FA] text-[#0C4A6E]",
    badgeBg: "bg-[#DFF2FE] text-[#0C4A6E] dark:bg-sky-950/70 dark:text-sky-200",
    icon: Building2,
  },
  ARCHIVE: {
    headerBg: "bg-[#FFF8DC]/90 dark:bg-[#382E1B]/70",
    codeBg: "bg-[#FDE68A] text-[#78350F]",
    badgeBg: "bg-[#FEF3C7] text-[#78350F] dark:bg-amber-950/70 dark:text-amber-200",
    icon: Archive,
  },
  DIGITAL: {
    headerBg: "bg-[#F3EEFF]/85 dark:bg-[#2C233D]/70",
    codeBg: "bg-[#DDD6FE] text-[#4C1D95]",
    badgeBg: "bg-[#EDE9FE] text-[#4C1D95] dark:bg-violet-950/70 dark:text-violet-200",
    icon: Lock,
  },
};

function getPresetGroupForCode(code: string): LocationGroup {
  if (code === "DIG") return "DIGITAL";
  if (/^R\d+$/.test(code)) return "THERAPY";
  if (/^L\d+$/.test(code)) return "ARCHIVE";
  return "OFFICE";
}

function getNextSortOrder(records: readonly LocationMaster[]): number {
  if (records.length === 0) return 10;
  const maxOrder = records.reduce(
    (max, r) => (r.sort_order > max ? r.sort_order : max),
    0,
  );
  return Math.min(9999, Math.ceil((maxOrder + 10) / 10) * 10);
}

export function RoomsClient({
  locations: initialLocations,
  usageCounts,
  schemaReady,
  schemaError,
}: RoomsClientProps) {
  const router = useRouter();
  const { runWithFeedback } = useCartoonFeedback();
  const [isPending, startTransition] = useTransition();

  const [locations, setLocations] = useState<LocationMaster[]>(initialLocations);
  useEffect(() => {
    setLocations(initialLocations);
  }, [initialLocations]);

  const [groupTab, setGroupTab] = useState<GroupTab>("ALL");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createGroup, setCreateGroup] = useState<CreatableGroup>("THERAPY");
  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPic, setCreatePic] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createSortOrder, setCreateSortOrder] = useState("150");
  const [createOpname, setCreateOpname] = useState(true);
  const [createActive, setCreateActive] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit / Rename dialog state
  const [editingLocation, setEditingLocation] = useState<LocationMaster | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState<LocationGroup>("THERAPY");
  const [editPic, setEditPic] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("10");
  const [editOpname, setEditOpname] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);
  const editNameInputRef = useRef<HTMLInputElement | null>(null);

  // Delete confirmation dialog state
  const [deletingLocation, setDeletingLocation] =
    useState<LocationMaster | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const usedCodesSet = useMemo(
    () => new Set(locations.map((loc) => loc.code.toUpperCase())),
    [locations],
  );

  const suggestedCodesByGroup = useMemo(() => {
    const map: Record<CreatableGroup, string[]> = {
      THERAPY: [],
      OFFICE: [],
      ARCHIVE: [],
    };
    for (const code of LIVE_SUPPORTED_ENUM_CODES) {
      if (usedCodesSet.has(code)) continue;
      const g = getPresetGroupForCode(code);
      if (g === "THERAPY" || g === "OFFICE" || g === "ARCHIVE") {
        map[g].push(code);
      }
    }
    return map;
  }, [usedCodesSet]);

  const stats = useMemo(() => {
    const activeTotal = locations.filter((l) => l.is_active).length;
    const therapyAll = locations.filter((l) => l.location_group === "THERAPY");
    const officeAll = locations.filter((l) => l.location_group === "OFFICE");
    const archiveAll = locations.filter((l) => l.location_group === "ARCHIVE");
    const digitalAll = locations.filter((l) => l.location_group === "DIGITAL");
    const activeRoomsCount =
      therapyAll.filter((l) => l.is_active).length +
      officeAll.filter((l) => l.is_active).length;
    const activeArchiveCount = archiveAll.filter((l) => l.is_active).length;
    const opnameActiveCount = locations.filter(
      (l) =>
        l.is_active &&
        l.include_in_opname &&
        l.location_group !== "DIGITAL",
    ).length;

    return {
      activeTotal,
      total: locations.length,
      therapyCount: therapyAll.length,
      officeCount: officeAll.length,
      archiveCount: archiveAll.length,
      digitalCount: digitalAll.length,
      activeRoomsCount,
      activeArchiveCount,
      opnameActiveCount,
    };
  }, [locations]);

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return locations.filter((loc) => {
      if (groupTab !== "ALL" && loc.location_group !== groupTab) {
        return false;
      }
      if (statusFilter === "ACTIVE" && !loc.is_active) {
        return false;
      }
      if (statusFilter === "INACTIVE" && loc.is_active) {
        return false;
      }
      if (!query) return true;
      return (
        loc.code.toLowerCase().includes(query) ||
        loc.name.toLowerCase().includes(query) ||
        (loc.pic_name?.toLowerCase().includes(query) ?? false) ||
        (loc.description?.toLowerCase().includes(query) ?? false) ||
        LOCATION_GROUP_LABELS[loc.location_group].toLowerCase().includes(query)
      );
    });
  }, [locations, groupTab, statusFilter, search]);

  const hasActiveFilters =
    groupTab !== "ALL" || statusFilter !== "ALL" || search.trim().length > 0;

  const resetFilters = () => {
    setGroupTab("ALL");
    setStatusFilter("ALL");
    setSearch("");
  };

  const openCreateDialog = () => {
    const defaultGroup: CreatableGroup =
      groupTab === "OFFICE" || groupTab === "ARCHIVE" ? groupTab : "THERAPY";
    const firstSuggestion = suggestedCodesByGroup[defaultGroup][0] ?? "";
    setCreateGroup(defaultGroup);
    setCreateCode(firstSuggestion);
    setCreateName("");
    setCreatePic("");
    setCreateDesc("");
    setCreateSortOrder(String(getNextSortOrder(locations)));
    setCreateOpname(defaultGroup === "THERAPY");
    setCreateActive(true);
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreateGroupChange = (nextGroup: CreatableGroup) => {
    setCreateGroup(nextGroup);
    setCreateOpname(nextGroup === "THERAPY");
    // Swap suggested code if current code is empty or was another group's suggestion
    const currentNormalized = createCode.trim().toUpperCase();
    const isPresetSuggestion =
      !currentNormalized ||
      (PRESET_ENUM_CODE_SET.has(currentNormalized) &&
        !usedCodesSet.has(currentNormalized));
    if (isPresetSuggestion) {
      setCreateCode(suggestedCodesByGroup[nextGroup][0] ?? "");
    }
  };

  const openEditDialog = (loc: LocationMaster) => {
    setEditingLocation(loc);
    setEditName(loc.name);
    setEditGroup(loc.location_group);
    setEditPic(loc.pic_name ?? "");
    setEditDesc(loc.description ?? "");
    setEditSortOrder(String(loc.sort_order));
    setEditOpname(loc.include_in_opname);
    setEditActive(loc.is_active);
    setEditError(null);
  };

  const closeEditDialog = () => {
    setEditingLocation(null);
    setEditError(null);
  };

  const handleCreateSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    setFeedback(null);

    const normalizedCode = createCode.trim().toUpperCase();
    if (!CODE_REGEX.test(normalizedCode)) {
      setCreateError(
        "Kode lokasi wajib 2–8 karakter huruf kapital atau angka (A–Z, 0–9) tanpa spasi.",
      );
      return;
    }

    const trimmedName = createName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setCreateError(
        "Nama lokasi minimal 2 karakter dan maksimal 80 karakter.",
      );
      return;
    }

    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Menambahkan Lokasi Baru...",
            workingMessage: `Dino Joguman lagi mendaftarkan ${normalizedCode} (${trimmedName}) ke master ruangan~`,
            successTitle: "Lokasi Baru Tersimpan! ✨",
            successMessage: (r) =>
              r.ok ? r.message : "Lokasi baru berhasil ditambahkan!",
            errorTitle: "Gagal Menambah Lokasi",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () =>
            createLocationAction({
              code: normalizedCode,
              name: trimmedName,
              location_group: createGroup,
              pic_name: createPic.trim() || null,
              description: createDesc.trim() || null,
              include_in_opname: createOpname,
              is_active: createActive,
              sort_order: Number(createSortOrder) || 100,
            }),
        );

        if (!res.ok) {
          setCreateError(res.error);
          return;
        }

        setLocations((prev) =>
          [...prev, res.data].sort((a, b) =>
            a.sort_order !== b.sort_order
              ? a.sort_order - b.sort_order
              : a.code.localeCompare(b.code, "id"),
          ),
        );
        setCreateOpen(false);
        setFeedback({ type: "success", text: res.message });
        router.refresh();
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : "Gagal menambahkan lokasi baru.",
        );
      }
    });
  };

  const handleEditSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingLocation) return;

    setEditError(null);
    setFeedback(null);

    const trimmedName = editName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setEditError(
        "Nama lokasi minimal 2 karakter dan maksimal 80 karakter.",
      );
      return;
    }

    const targetCode = editingLocation.code;
    setPendingCode(targetCode);

    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Menyimpan Perubahan Lokasi...",
            workingMessage: `Dino Joguman lagi memperbarui ${targetCode} menjadi "${trimmedName}" di seluruh sistem~`,
            successTitle: "Lokasi Diperbarui! ♪",
            successMessage: (r) =>
              r.ok ? r.message : "Perubahan lokasi berhasil disimpan!",
            errorTitle: "Gagal Menyimpan Lokasi",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () =>
            updateLocationAction({
              code: targetCode,
              name: trimmedName,
              location_group: editGroup,
              pic_name: editPic.trim() || null,
              description: editDesc.trim() || null,
              include_in_opname: editOpname,
              is_active: editActive,
              sort_order: Number(editSortOrder) || editingLocation.sort_order,
            }),
        );

        if (!res.ok) {
          setEditError(res.error);
          return;
        }

        setLocations((prev) =>
          prev
            .map((loc) => (loc.code === res.data.code ? res.data : loc))
            .sort((a, b) =>
              a.sort_order !== b.sort_order
                ? a.sort_order - b.sort_order
                : a.code.localeCompare(b.code, "id"),
            ),
        );
        closeEditDialog();
        setFeedback({ type: "success", text: res.message });
        router.refresh();
      } catch (err) {
        setEditError(
          err instanceof Error
            ? err.message
            : "Gagal memperbarui data lokasi.",
        );
      } finally {
        setPendingCode(null);
      }
    });
  };

  const handleToggleOpname = (loc: LocationMaster, nextValue: boolean) => {
    setFeedback(null);
    setPendingCode(loc.code);

    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Mengatur Checklist Opname...",
            workingMessage: `${nextValue ? "Memasukkan" : "Mengeluarkan"} ${loc.code} (${loc.name}) ${nextValue ? "ke" : "dari"} daftar opname bulanan~`,
            successTitle: "Opname Diperbarui! ✓",
            successMessage: (r) =>
              r.ok ? r.message : "Pengaturan opname berhasil diperbarui!",
            errorTitle: "Gagal Mengubah Status Opname",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () =>
            toggleLocationOpnameAction({
              code: loc.code,
              include_in_opname: nextValue,
            }),
        );

        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }

        setLocations((prev) =>
          prev.map((item) => (item.code === res.data.code ? res.data : item)),
        );
        setFeedback({ type: "success", text: res.message });
        router.refresh();
      } catch (err) {
        setFeedback({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : "Gagal mengubah status opname lokasi.",
        });
      } finally {
        setPendingCode(null);
      }
    });
  };

  const handleToggleActive = (loc: LocationMaster, nextValue: boolean) => {
    setFeedback(null);
    setPendingCode(loc.code);

    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: nextValue
              ? "Mengaktifkan Lokasi..."
              : "Menonaktifkan Lokasi...",
            workingMessage: `Dino Joguman lagi memperbarui status ${loc.code} (${loc.name})~`,
            successTitle: "Status Lokasi Diperbarui! ✨",
            successMessage: (r) =>
              r.ok ? r.message : "Status lokasi berhasil diperbarui!",
            errorTitle: "Gagal Mengubah Status Lokasi",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () =>
            toggleLocationActiveAction({
              code: loc.code,
              is_active: nextValue,
            }),
        );

        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }

        setLocations((prev) =>
          prev.map((item) => (item.code === res.data.code ? res.data : item)),
        );
        setFeedback({ type: "success", text: res.message });
        router.refresh();
      } catch (err) {
        setFeedback({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : "Gagal mengubah status aktif lokasi.",
        });
      } finally {
        setPendingCode(null);
      }
    });
  };

  const handleConfirmDelete = () => {
    if (!deletingLocation) return;
    const target = deletingLocation;
    setDeleteError(null);
    setFeedback(null);
    setPendingCode(target.code);

    startTransition(async () => {
      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Menghapus Lokasi...",
            workingMessage: `Memeriksa keterkaitan data & menghapus ${target.code} (${target.name})~`,
            successTitle: "Lokasi Dihapus!",
            successMessage: (r) =>
              r.ok ? r.message : "Lokasi berhasil dihapus!",
            errorTitle: "Tidak Dapat Menghapus Lokasi",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () => deleteLocationAction(target.code),
        );

        if (!res.ok) {
          setDeleteError(res.error);
          return;
        }

        setLocations((prev) => prev.filter((item) => item.code !== target.code));
        setDeletingLocation(null);
        setFeedback({ type: "success", text: res.message });
        router.refresh();
      } catch (err) {
        setDeleteError(
          err instanceof Error ? err.message : "Gagal menghapus lokasi.",
        );
      } finally {
        setPendingCode(null);
      }
    });
  };

  const normalizedCreateCode = createCode.trim().toUpperCase();
  const showLegacyArchiveWarning =
    createGroup === "ARCHIVE" &&
    normalizedCreateCode.length >= 2 &&
    !LEGACY_ARCHIVE_CODES.has(normalizedCreateCode);
  const showCustomEnumWarning =
    !showLegacyArchiveWarning &&
    CODE_REGEX.test(normalizedCreateCode) &&
    !PRESET_ENUM_CODE_SET.has(normalizedCreateCode);

  const editingUsage = editingLocation
    ? usageCounts[editingLocation.code] ?? { items: 0, kits: 0, archives: 0 }
    : null;
  const editingIsDigital = Boolean(
    editingLocation &&
      (editingLocation.code === "DIG" ||
        editingLocation.location_group === "DIGITAL"),
  );
  const editingLocksArchiveGroup = Boolean(
    editingLocation &&
      editingLocation.location_group === "ARCHIVE" &&
      (editingUsage?.archives ?? 0) > 0,
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <KawaiiPageHeader
          accent="mint"
          mascot="room"
          badge="Master Lokasi & Arsip"
          title="Ruangan & Lemari Arsip"
          description="Atur nama ruangan terapi, ruang kantor & gudang, serta lemari arsip. Ganti nama kapan saja tanpa memutus data barang atau berkas."
          actions={
            <Button onClick={openCreateDialog} className="font-extrabold">
              <Plus className="size-4" />
              Tambah Lokasi Baru
            </Button>
          }
        />

        {/* Friendly Info Banner explaining dynamic renaming */}
        <div className="flex items-start gap-3.5 rounded-3xl border-2 border-[#2C2623] bg-gradient-to-r from-[#FFFBEB] via-[#FFFDF7] to-[#E8F6FF]/85 p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:from-[#332B1E] dark:via-[#28221F] dark:to-[#1C2D3A] dark:shadow-[3px_3px_0px_0px_#0E0B0A]">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
            <Sparkles className="size-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-black tracking-tight text-[#2C2623] dark:text-[#FDF8F0]">
              Bebas Ganti Nama Ruangan &amp; Lemari Arsip Kapan Saja ♪
            </h2>
            <p className="text-xs leading-relaxed font-semibold text-[#5A4D46] dark:text-[#D5C6BA]">
              Semua lokasi bawaan — baik <strong>Ruang Terapi 1–6</strong>,{" "}
              <strong>Admin / Resepsionis / Gudang</strong>,{" "}
              <strong>Lemari Arsip 1–4</strong>, maupun{" "}
              <strong>Digital Vault</strong> — dapat diganti namanya kapan saja
              lewat tombol <strong>Ganti Nama / Edit</strong>. Kode singkat (seperti{" "}
              <code className="rounded bg-[#F5E9D6] px-1 py-0.5 font-mono text-[11px] font-bold text-[#2C2623] dark:bg-[#3A312C] dark:text-[#FDF8F0]">
                R01
              </code>{" "}
              atau{" "}
              <code className="rounded bg-[#F5E9D6] px-1 py-0.5 font-mono text-[11px] font-bold text-[#2C2623] dark:bg-[#3A312C] dark:text-[#FDF8F0]">
                L01
              </code>
              ) tetap aman sehingga seluruh{" "}
              <strong>
                barang inventaris, paket kit, rak arsip, label stiker barcode,
                checklist opname bulanan, dan ekspor Excel/PDF
              </strong>{" "}
              langsung otomatis memakai nama terbaru!
            </p>
          </div>
        </div>

        {!schemaReady && (
          <Alert
            variant="warning"
            className="rounded-3xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-amber-950/50 dark:text-amber-100"
          >
            <AlertTriangle className="size-4 text-amber-700 dark:text-amber-300" />
            <AlertTitle className="font-extrabold">
              Migrasi Database Lokasi Belum Dijalankan
            </AlertTitle>
            <AlertDescription className="text-xs font-semibold">
              Saat ini tampilan memakai 14 lokasi bawaan sementara. Jalankan file{" "}
              <code className="rounded bg-black/10 px-1 py-0.5 font-mono">
                supabase/migrations/20261124_locations_master.sql
              </code>{" "}
              di Supabase SQL Editor agar perubahan nama &amp; penambahan ruangan
              baru tersimpan permanen.
              {schemaError ? ` (${schemaError})` : ""}
            </AlertDescription>
          </Alert>
        )}

        {feedback && (
          <Alert
            variant={feedback.type === "error" ? "destructive" : "default"}
            className={
              feedback.type === "success"
                ? "rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5] text-[#14532D] shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-emerald-950/60 dark:text-emerald-100"
                : "rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#881337] shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-rose-950/60 dark:text-rose-100"
            }
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertTriangle className="size-4" />
            )}
            <AlertDescription className="font-semibold">
              {feedback.text}
            </AlertDescription>
          </Alert>
        )}

        {/* 4 Kawaii Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KawaiiStatCard
            label="Total Lokasi Aktif"
            value={stats.activeTotal}
            hint={`dari ${stats.total} lokasi terdaftar`}
            accent="mint"
            icon={<MapPin className="size-4" />}
          />
          <KawaiiStatCard
            label="Ruang Terapi & Kantor"
            value={stats.activeRoomsCount}
            hint={`${stats.therapyCount} Terapi · ${stats.officeCount} Kantor & Gudang`}
            accent="sky"
            icon={<DoorOpen className="size-4" />}
          />
          <KawaiiStatCard
            label="Lemari Arsip"
            value={stats.activeArchiveCount}
            hint={`${stats.archiveCount} lemari arsip fisik terdaftar`}
            accent="butter"
            icon={<Archive className="size-4" />}
          />
          <KawaiiStatCard
            label="Masuk Cek Opname"
            value={stats.opnameActiveCount}
            hint="Aktif di checklist opname bulanan"
            accent="lavender"
            icon={<ClipboardCheck className="size-4" />}
          />
        </div>

        {/* Filter Bar */}
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#28221F] dark:shadow-[4px_4px_0px_0px_#0E0B0A]">
          <CardContent className="space-y-4 pt-5">
            <Tabs
              value={groupTab}
              onValueChange={(val) => setGroupTab(val as GroupTab)}
            >
              <TabsList className="h-auto w-full flex-wrap justify-start">
                <TabsTrigger value="ALL" className="flex-none">
                  Semua ({stats.total})
                </TabsTrigger>
                <TabsTrigger value="THERAPY" className="flex-none">
                  Ruang Terapi ({stats.therapyCount})
                </TabsTrigger>
                <TabsTrigger value="OFFICE" className="flex-none">
                  Kantor &amp; Gudang ({stats.officeCount})
                </TabsTrigger>
                <TabsTrigger value="ARCHIVE" className="flex-none">
                  Lemari Arsip ({stats.archiveCount})
                </TabsTrigger>
                <TabsTrigger value="DIGITAL" className="flex-none">
                  Digital Vault ({stats.digitalCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari kode (R01, L01), nama ruangan, atau PIC..."
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(val) => setStatusFilter(val as StatusFilter)}
                >
                  <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold sm:w-44 dark:border-[#6D5D54] dark:bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Status</SelectItem>
                    <SelectItem value="ACTIVE">Aktif Saja</SelectItem>
                    <SelectItem value="INACTIVE">Nonaktif Saja</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetFilters}
                    className="shrink-0 font-bold"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locations Grid */}
        {filteredLocations.length === 0 ? (
          <KawaiiEmptyState
            mascot="room"
            title="Tidak ada lokasi yang cocok"
            description={
              hasActiveFilters
                ? "Coba ubah filter grup, status, atau kata kunci pencarian Anda."
                : "Belum ada ruangan atau lemari arsip yang terdaftar."
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" onClick={resetFilters}>
                  <RotateCcw className="size-4" />
                  Tampilkan Semua Lokasi
                </Button>
              ) : (
                <Button onClick={openCreateDialog}>
                  <Plus className="size-4" />
                  Tambah Lokasi Pertama
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
            {filteredLocations.map((loc) => {
              const style = GROUP_STYLES[loc.location_group];
              const GroupIcon = style.icon;
              const usage = usageCounts[loc.code] ?? {
                items: 0,
                kits: 0,
                archives: 0,
              };
              const totalActiveRefs = usage.items + usage.kits + usage.archives;
              const isDigital =
                loc.code === "DIG" || loc.location_group === "DIGITAL";
              const isRowBusy = isPending && pendingCode === loc.code;

              const refParts: string[] = [];
              if (usage.items > 0) refParts.push(`${usage.items} barang`);
              if (usage.archives > 0) refParts.push(`${usage.archives} arsip`);
              if (usage.kits > 0) refParts.push(`${usage.kits} kit`);

              const deleteDisabledReason = loc.is_system
                ? "Lokasi bawaan sistem tidak dapat dihapus. Anda dapat mengganti namanya atau menonaktifkannya."
                : totalActiveRefs > 0
                  ? `Tidak dapat dihapus karena masih digunakan oleh ${refParts.join(", ")}.`
                  : null;

              return (
                <div
                  key={loc.code}
                  className={cn(
                    "flex min-w-0 flex-col justify-between overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] transition-transform duration-200 hover:-translate-y-0.5 dark:border-[#6D5D54] dark:bg-[#28221F] dark:shadow-[4px_4px_0px_0px_#0E0B0A]",
                    !loc.is_active && "opacity-80",
                  )}
                >
                  {/* Pastel Header */}
                  <div
                    className={cn(
                      "flex items-start justify-between gap-3 border-b-2 border-dashed border-[#2C2623]/20 p-4 dark:border-[#6D5D54]/40",
                      style.headerBg,
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "inline-flex min-w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] px-2.5 py-1.5 font-mono text-sm font-black tracking-wide shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54]",
                          style.codeBg,
                        )}
                      >
                        {loc.code}
                      </span>

                      <div className="min-w-0 space-y-1">
                        <h3 className="truncate text-base font-black tracking-tight text-[#2C2623] dark:text-[#FDF8F0]">
                          {loc.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-[#2C2623] text-[11px] font-extrabold dark:border-[#6D5D54]",
                              style.badgeBg,
                            )}
                          >
                            <GroupIcon className="size-3" />
                            {LOCATION_GROUP_LABELS[loc.location_group]}
                          </Badge>

                          {loc.is_system && (
                            <Badge
                              variant="outline"
                              className="border-[#2C2623]/50 bg-[#FFFDF7]/90 text-[10px] font-bold text-[#5A4D46] dark:border-[#6D5D54] dark:bg-[#2C2522] dark:text-[#D5C6BA]"
                            >
                              <Lock className="size-2.5" />
                              Bawaan Sistem
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant={loc.is_active ? "secondary" : "destructive"}
                      className={
                        loc.is_active
                          ? "shrink-0 border-[#2C2623] bg-[#D8F8E7] font-extrabold text-[#14532D] dark:border-[#6D5D54] dark:bg-emerald-950/70 dark:text-emerald-200"
                          : "shrink-0 font-extrabold"
                      }
                    >
                      {loc.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </div>

                  {/* Body: Description, Usage Pills, PIC & Quick Switches */}
                  <div className="space-y-3.5 p-4">
                    {loc.description && (
                      <p className="line-clamp-2 text-xs font-medium text-[#5A4D46] dark:text-[#C8B9AE]">
                        {loc.description}
                      </p>
                    )}

                    {/* Usage count pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623]/35 px-2.5 py-0.5 text-[11px] font-extrabold dark:border-[#6D5D54]",
                          usage.items > 0
                            ? "bg-[#E6F5FE] text-[#0C4A6E] dark:bg-sky-950/60 dark:text-sky-200"
                            : "bg-[#FFFDF7] text-[#6B5E57] dark:bg-[#221D1A] dark:text-[#A99B90]",
                        )}
                      >
                        <Package className="size-3" />
                        {usage.items} barang
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623]/35 px-2.5 py-0.5 text-[11px] font-extrabold dark:border-[#6D5D54]",
                          usage.archives > 0
                            ? "bg-[#FEF3C7] text-[#78350F] dark:bg-amber-950/60 dark:text-amber-200"
                            : "bg-[#FFFDF7] text-[#6B5E57] dark:bg-[#221D1A] dark:text-[#A99B90]",
                        )}
                      >
                        <Archive className="size-3" />
                        {usage.archives} arsip
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623]/35 px-2.5 py-0.5 text-[11px] font-extrabold dark:border-[#6D5D54]",
                          usage.kits > 0
                            ? "bg-[#EDE9FE] text-[#4C1D95] dark:bg-violet-950/60 dark:text-violet-200"
                            : "bg-[#FFFDF7] text-[#6B5E57] dark:bg-[#221D1A] dark:text-[#A99B90]",
                        )}
                      >
                        <Boxes className="size-3" />
                        {usage.kits} kit
                      </span>
                    </div>

                    {/* PIC & Sort Order */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#5A4D46] dark:text-[#C8B9AE]">
                      <span className="inline-flex items-center gap-1.5">
                        <UserCheck className="size-3.5 shrink-0 text-[#2AB673] dark:text-[#4ADE9B]" />
                        <span>
                          PIC:{" "}
                          <strong className="font-extrabold text-[#2C2623] dark:text-[#FDF8F0]">
                            {loc.pic_name || "Belum ditentukan"}
                          </strong>
                        </span>
                      </span>
                      <span className="text-[11px] font-bold opacity-75">
                        Urutan #{loc.sort_order}
                      </span>
                    </div>

                    {/* Quick Toggles */}
                    <div className="grid gap-3 rounded-2xl border-2 border-[#2C2623]/20 bg-[#FAF6EE]/80 p-3 sm:grid-cols-2 dark:border-[#6D5D54]/50 dark:bg-[#211C19]">
                      <div className="space-y-1">
                        <span className="text-[11px] font-extrabold tracking-wide text-[#6B5E57] uppercase dark:text-[#B8AAA0]">
                          Cek Opname Bulanan
                        </span>
                        <div className="flex items-center gap-2 pt-0.5">
                          {isDigital ? (
                            <>
                              <Switch
                                checked={false}
                                disabled
                                aria-label="Digital Vault tidak ikut opname fisik"
                              />
                              <span className="text-[11px] font-bold text-[#6B5E57] dark:text-[#A99B90]">
                                Tidak untuk Digital
                              </span>
                            </>
                          ) : (
                            <>
                              <Switch
                                checked={loc.include_in_opname}
                                disabled={isPending || isRowBusy}
                                onCheckedChange={(checked) =>
                                  handleToggleOpname(loc, checked)
                                }
                                aria-label={`Ikutkan ${loc.name} di cek opname`}
                              />
                              <span className="text-xs font-extrabold text-[#2C2623] dark:text-[#FDF8F0]">
                                {loc.include_in_opname
                                  ? "Masuk Opname"
                                  : "Tidak Ikut"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] font-extrabold tracking-wide text-[#6B5E57] uppercase dark:text-[#B8AAA0]">
                          Status Lokasi
                        </span>
                        <div className="flex items-center gap-2 pt-0.5">
                          <Switch
                            checked={loc.is_active}
                            disabled={isDigital || isPending || isRowBusy}
                            onCheckedChange={(checked) =>
                              handleToggleActive(loc, checked)
                            }
                            aria-label={`Aktifkan atau nonaktifkan ${loc.name}`}
                          />
                          <span className="text-xs font-extrabold text-[#2C2623] dark:text-[#FDF8F0]">
                            {isDigital
                              ? "Selalu Aktif (Sistem)"
                              : loc.is_active
                                ? "Aktif Dipakai"
                                : "Nonaktif"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-dashed border-[#2C2623]/15 bg-[#FAF6EE]/60 px-4 py-3 dark:border-[#6D5D54]/40 dark:bg-[#221D1A]">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => openEditDialog(loc)}
                      className="bg-[#E8F6FF] font-extrabold text-[#2C2623] hover:bg-[#BAE6FD] dark:bg-sky-950/60 dark:text-sky-100 dark:hover:bg-sky-900/70"
                    >
                      <Pencil className="size-3.5" />
                      Ganti Nama / Edit
                    </Button>

                    {deleteDisabledReason ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            tabIndex={0}
                            title={deleteDisabledReason}
                            className="inline-flex cursor-not-allowed rounded-xl"
                          >
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled
                              className="pointer-events-none bg-[#FFE4E6]/60 font-extrabold text-[#9F1239] dark:bg-rose-950/30 dark:text-rose-300"
                            >
                              <Trash2 className="size-3.5" />
                              Hapus
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-xs border-2 border-[#2C2623] bg-[#FFFDF7] font-semibold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#28221F] dark:text-[#FDF8F0]"
                        >
                          {deleteDisabledReason}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          setDeleteError(null);
                          setDeletingLocation(loc);
                        }}
                        className="bg-[#FFE4E6] font-extrabold text-[#9F1239] hover:bg-[#FECDD3] dark:bg-rose-950/60 dark:text-rose-200 dark:hover:bg-rose-900/70"
                      >
                        <Trash2 className="size-3.5" />
                        Hapus
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Location Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#6EE7B7] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <Plus className="size-4" />
                </span>
                Tambah Ruangan / Lemari Arsip Baru
              </DialogTitle>
              <DialogDescription>
                Buat ruangan terapi, ruang kantor/gudang, atau lemari arsip baru
                yang langsung tersedia di seluruh StarOps.
              </DialogDescription>
            </DialogHeader>

            {createError && (
              <Alert
                variant="destructive"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-rose-950/40"
              >
                <AlertTriangle className="size-4" />
                <AlertTitle className="font-extrabold">Periksa Input</AlertTitle>
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                <div className="space-y-1.5">
                  <Label className="font-bold">Grup Lokasi *</Label>
                  <Select
                    value={createGroup}
                    onValueChange={(val) =>
                      handleCreateGroupChange(val as CreatableGroup)
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold dark:border-[#6D5D54] dark:bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="THERAPY">
                        {LOCATION_GROUP_LABELS.THERAPY}
                      </SelectItem>
                      <SelectItem value="OFFICE">
                        {LOCATION_GROUP_LABELS.OFFICE}
                      </SelectItem>
                      <SelectItem value="ARCHIVE">
                        {LOCATION_GROUP_LABELS.ARCHIVE}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="create-loc-code" className="font-bold">
                    Kode Lokasi * (2–8 huruf/angka)
                  </Label>
                  <Input
                    id="create-loc-code"
                    value={createCode}
                    onChange={(e) =>
                      setCreateCode(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 8),
                      )
                    }
                    required
                    minLength={2}
                    maxLength={8}
                    placeholder={
                      createGroup === "ARCHIVE"
                        ? "Contoh: L05"
                        : createGroup === "THERAPY"
                          ? "Contoh: R07"
                          : "Contoh: KLS"
                    }
                    className="font-mono font-extrabold uppercase"
                    disabled={isPending}
                  />
                </div>
              </div>

              {/* Smart Code Suggestions */}
              {suggestedCodesByGroup[createGroup].length > 0 && (
                <div className="space-y-1.5 rounded-2xl border-2 border-dashed border-[#2C2623]/30 bg-[#FAF6EE]/80 p-3 dark:border-[#6D5D54]/50 dark:bg-[#221D1A]">
                  <p className="text-[11px] font-extrabold text-[#5A4D46] dark:text-[#C8B9AE]">
                    Saran Kode Siap Pakai (klik untuk memilih):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedCodesByGroup[createGroup].map((code) => {
                      const isSelected = normalizedCreateCode === code;
                      const hint = SUGGESTION_HINTS[code];
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setCreateCode(code)}
                          disabled={isPending}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] px-2.5 py-0.5 text-xs font-extrabold transition-all hover:-translate-y-0.5 dark:border-[#6D5D54]",
                            isSelected
                              ? "bg-[#6EE7B7] text-[#115E3B] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
                              : "bg-[#FFFDF7] text-[#2C2623] hover:bg-[#FEF3C7] dark:bg-[#2C2522] dark:text-[#FDF8F0] dark:hover:bg-[#3A311E]",
                          )}
                        >
                          <span className="font-mono">{code}</span>
                          {hint && (
                            <span className="text-[10px] font-semibold opacity-75">
                              ({hint})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Migration notes for archive codes outside L01..L04 or custom codes */}
              {showLegacyArchiveWarning && (
                <div className="flex items-start gap-2 rounded-2xl border-2 border-[#2C2623]/60 bg-[#FFFBE6] px-3 py-2.5 text-xs font-semibold text-[#57493F] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-amber-950/40 dark:text-amber-100">
                  <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  <span className="min-w-0">
                    <strong>Catatan Lemari Baru ({normalizedCreateCode}):</strong>{" "}
                    Jika Anda belum menjalankan migrasi{" "}
                    <code className="font-mono break-all">
                      supabase/migrations/20261124_locations_master.sql
                    </code>{" "}
                    di Supabase SQL Editor, batasan tabel arsip lama hanya
                    mengizinkan{" "}
                    <code className="font-mono">L01–L04</code>. Jalankan migrasi
                    tersebut agar lemari{" "}
                    <code className="font-mono">{normalizedCreateCode}</code>{" "}
                    dapat menyimpan berkas arsip.
                  </span>
                </div>
              )}

              {showCustomEnumWarning && (
                <div className="flex items-start gap-2 rounded-2xl border-2 border-[#2C2623]/60 bg-[#FFFBE6] px-3 py-2.5 text-xs font-semibold text-[#57493F] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-amber-950/40 dark:text-amber-100">
                  <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  <span className="min-w-0">
                    <strong>Catatan Kode Kustom ({normalizedCreateCode}):</strong>{" "}
                    Kode di luar daftar preset standar memerlukan migrasi{" "}
                    <code className="font-mono break-all">
                      supabase/migrations/20261124_locations_master.sql
                    </code>{" "}
                    di Supabase SQL Editor (konversi kolom lokasi ke{" "}
                    <code className="font-mono">text</code> + FK) sebelum dipakai
                    untuk menyimpan item atau arsip baru.
                  </span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                <div className="space-y-1.5">
                  <Label htmlFor="create-loc-name" className="font-bold">
                    Nama Lokasi *
                  </Label>
                  <Input
                    id="create-loc-name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder={
                      createGroup === "ARCHIVE"
                        ? "Misal: Lemari Dokumen Legal"
                        : createGroup === "THERAPY"
                          ? "Misal: Ruang Sensori Integrasi"
                          : "Misal: Ruang Kelas Kelompok"
                    }
                    disabled={isPending}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="create-loc-pic" className="font-bold">
                    Penanggung Jawab / PIC (Opsional)
                  </Label>
                  <Input
                    id="create-loc-pic"
                    value={createPic}
                    onChange={(e) => setCreatePic(e.target.value)}
                    maxLength={100}
                    placeholder="Nama PIC ruangan / lemari"
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="create-loc-desc" className="font-bold">
                    Deskripsi / Catatan (Opsional)
                  </Label>
                  <Textarea
                    id="create-loc-desc"
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder="Keterangan lantai, posisi rak, atau fungsi ruangan..."
                    disabled={isPending}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="create-loc-sort" className="font-bold">
                    Urutan Tampil
                  </Label>
                  <Input
                    id="create-loc-sort"
                    type="number"
                    min={0}
                    max={9999}
                    value={createSortOrder}
                    onChange={(e) => setCreateSortOrder(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border-2 border-[#2C2623]/20 bg-[#FAF6EE]/80 p-3.5 sm:grid-cols-2 dark:border-[#6D5D54]/40 dark:bg-[#221D1A]">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="create-loc-opname"
                      className="text-xs font-extrabold"
                    >
                      Sertakan di Cek Opname Bulanan
                    </Label>
                    <p className="text-[11px] font-medium text-[#6B5E57] dark:text-[#A99B90]">
                      Muncul di checklist opname akhir bulan
                    </p>
                  </div>
                  <Switch
                    id="create-loc-opname"
                    checked={createOpname}
                    onCheckedChange={setCreateOpname}
                    disabled={isPending}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="create-loc-active"
                      className="text-xs font-extrabold"
                    >
                      Status Aktif
                    </Label>
                    <p className="text-[11px] font-medium text-[#6B5E57] dark:text-[#A99B90]">
                      Tampil di pilihan dropdown lokasi
                    </p>
                  </div>
                  <Switch
                    id="create-loc-active"
                    checked={createActive}
                    onCheckedChange={setCreateActive}
                    disabled={isPending}
                  />
                </div>
              </div>

              <DialogFooter className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={isPending}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={isPending} className="font-extrabold">
                  {isPending ? "Menyimpan..." : "Simpan Lokasi Baru"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit / Rename Location Dialog */}
        <Dialog
          open={Boolean(editingLocation)}
          onOpenChange={(open) => {
            if (!open && !isPending) closeEditDialog();
          }}
        >
          <DialogContent
            className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              editNameInputRef.current?.focus();
              editNameInputRef.current?.select();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#BAE6FD] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <Pencil className="size-4" />
                </span>
                Ganti Nama &amp; Edit Lokasi
              </DialogTitle>
              <DialogDescription>
                Ubah nama ruangan atau lemari arsip beserta detail PIC dan
                pengaturan opname. Seluruh modul otomatis mengikuti nama baru.
              </DialogDescription>
            </DialogHeader>

            {editingLocation && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623] bg-[#E8F6FF]/80 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-sky-950/35 dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] px-2.5 py-1 font-mono text-sm font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#28221F] dark:text-[#FDF8F0]">
                      {editingLocation.code}
                    </span>
                    <div className="text-xs">
                      <p className="font-extrabold text-[#2C2623] dark:text-[#FDF8F0]">
                        Kode Lokasi Tetap
                      </p>
                      <p className="font-medium text-[#5A4D46] dark:text-[#C8B9AE]">
                        Stiker barcode dengan kode{" "}
                        <code className="font-mono font-bold">
                          {editingLocation.code}
                        </code>{" "}
                        tetap valid selamanya.
                      </p>
                    </div>
                  </div>
                </div>

                {editError && (
                  <Alert
                    variant="destructive"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-rose-950/40"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Perubahan Belum Tersimpan
                    </AlertTitle>
                    <AlertDescription>{editError}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleEditSubmit} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-loc-name" className="font-bold">
                        Nama Lokasi *
                      </Label>
                      <Input
                        ref={editNameInputRef}
                        id="edit-loc-name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={80}
                        placeholder="Masukkan nama ruangan atau lemari..."
                        disabled={isPending}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="font-bold">Grup Lokasi *</Label>
                      <Select
                        value={editGroup}
                        onValueChange={(val) =>
                          setEditGroup(val as LocationGroup)
                        }
                        disabled={isPending || editingIsDigital}
                      >
                        <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold dark:border-[#6D5D54] dark:bg-card">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {editingIsDigital ? (
                            <SelectItem value="DIGITAL">
                              {LOCATION_GROUP_LABELS.DIGITAL}
                            </SelectItem>
                          ) : (
                            <>
                              <SelectItem value="THERAPY">
                                {LOCATION_GROUP_LABELS.THERAPY}
                              </SelectItem>
                              <SelectItem value="OFFICE">
                                {LOCATION_GROUP_LABELS.OFFICE}
                              </SelectItem>
                              <SelectItem value="ARCHIVE">
                                {LOCATION_GROUP_LABELS.ARCHIVE}
                              </SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {editingLocksArchiveGroup && (
                    <div className="flex items-start gap-2 rounded-2xl border-2 border-[#2C2623]/50 bg-[#FFFBE6] px-3 py-2 text-xs font-semibold text-[#57493F] dark:border-[#6D5D54] dark:bg-amber-950/40 dark:text-amber-100">
                      <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
                      <span>
                        Lemari ini sedang menyimpan{" "}
                        <strong>{editingUsage?.archives ?? 0} arsip</strong>,
                        sehingga grup harus tetap <strong>Lemari Arsip</strong>.
                      </span>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-loc-pic" className="font-bold">
                        Penanggung Jawab / PIC (Opsional)
                      </Label>
                      <Input
                        id="edit-loc-pic"
                        value={editPic}
                        onChange={(e) => setEditPic(e.target.value)}
                        maxLength={100}
                        placeholder="Nama PIC ruangan / lemari"
                        disabled={isPending}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="edit-loc-sort" className="font-bold">
                        Urutan Tampil
                      </Label>
                      <Input
                        id="edit-loc-sort"
                        type="number"
                        min={0}
                        max={9999}
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(e.target.value)}
                        disabled={isPending}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-loc-desc" className="font-bold">
                      Deskripsi / Catatan (Opsional)
                    </Label>
                    <Textarea
                      id="edit-loc-desc"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      maxLength={300}
                      rows={2}
                      placeholder="Keterangan lantai, posisi rak, atau fungsi ruangan..."
                      disabled={isPending}
                    />
                  </div>

                  <div className="grid gap-3 rounded-2xl border-2 border-[#2C2623]/20 bg-[#FAF6EE]/80 p-3.5 sm:grid-cols-2 dark:border-[#6D5D54]/40 dark:bg-[#221D1A] [&>*]:min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <Label
                          htmlFor="edit-loc-opname"
                          className="text-xs font-extrabold"
                        >
                          Sertakan di Cek Opname
                        </Label>
                        <p className="text-[11px] font-medium text-[#6B5E57] dark:text-[#A99B90]">
                          {editingIsDigital
                            ? "Tidak berlaku untuk Digital Vault"
                            : "Checklist opname bulanan"}
                        </p>
                      </div>
                      <Switch
                        id="edit-loc-opname"
                        checked={editingIsDigital ? false : editOpname}
                        onCheckedChange={setEditOpname}
                        disabled={isPending || editingIsDigital}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <Label
                          htmlFor="edit-loc-active"
                          className="text-xs font-extrabold"
                        >
                          Status Aktif
                        </Label>
                        <p className="text-[11px] font-medium text-[#6B5E57] dark:text-[#A99B90]">
                          {editingIsDigital
                            ? "DIG wajib selalu aktif"
                            : "Tampil di dropdown pilihan"}
                        </p>
                      </div>
                      <Switch
                        id="edit-loc-active"
                        checked={editingIsDigital ? true : editActive}
                        onCheckedChange={setEditActive}
                        disabled={isPending || editingIsDigital}
                      />
                    </div>
                  </div>

                  <DialogFooter className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeEditDialog}
                      disabled={isPending}
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="font-extrabold"
                    >
                      {isPending ? "Menyimpan..." : "Simpan Perubahan"}
                    </Button>
                  </DialogFooter>
                </form>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={Boolean(deletingLocation)}
          onOpenChange={(open) => {
            if (!open && !isPending) {
              setDeletingLocation(null);
              setDeleteError(null);
            }
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold text-[#9F1239] dark:text-rose-300">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDA4AF] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <Trash2 className="size-4" />
                </span>
                Hapus Lokasi Permanen
              </DialogTitle>
              <DialogDescription>
                Lokasi yang dihapus akan hilang dari master ruangan &amp; lemari
                arsip dan tidak dapat dipulihkan.
              </DialogDescription>
            </DialogHeader>

            {deletingLocation && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-rose-950/35 dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDA4AF] px-2.5 py-1 font-mono text-sm font-black text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]">
                      {deletingLocation.code}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-[#2C2623] dark:text-[#FDF8F0]">
                        {deletingLocation.name}
                      </p>
                      <p className="text-xs font-semibold text-[#5A4D46] dark:text-[#C8B9AE]">
                        {LOCATION_GROUP_LABELS[deletingLocation.location_group]}
                      </p>
                    </div>
                  </div>
                </div>

                {deleteError && (
                  <Alert
                    variant="destructive"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-rose-950/40"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Tidak Dapat Menghapus Lokasi
                    </AlertTitle>
                    <AlertDescription>{deleteError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-start gap-2.5 rounded-2xl border-2 border-[#2C2623]/60 bg-[#FFFBE6] p-3 text-xs font-semibold text-[#57493F] dark:border-[#6D5D54] dark:bg-amber-950/40 dark:text-amber-100">
                  <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  <p>
                    Jika masih terdapat riwayat peminjaman atau catatan arsip di
                    tempat sampah yang terhubung dengan kode ini, sistem akan
                    menolak penghapusan secara otomatis. Sebagai alternatif,
                    Anda dapat menonaktifkan lokasi melalui{" "}
                    <strong>Ganti Nama / Edit</strong>.
                  </p>
                </div>

                <DialogFooter className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDeletingLocation(null);
                      setDeleteError(null);
                    }}
                    disabled={isPending}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={isPending}
                    className="font-extrabold"
                  >
                    <Trash2 className="size-4" />
                    {isPending ? "Menghapus..." : "Ya, Hapus Permanen"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
