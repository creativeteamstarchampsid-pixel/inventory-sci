"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import {
  AlertTriangle,
  Barcode,
  Boxes,
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eraser,
  ExternalLink,
  Layers,
  Loader2,
  Package,
  QrCode,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
import { useLocations } from "@/components/providers/locations-provider";
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
  lookupOpnameTargetAction,
  saveOpnameDraftAction,
  searchOpnameItemsAction,
  submitStockOpnameAction,
  type OpnameSearchGroupEntry,
  type OpnameSessionPayload,
  type OpnameTargetLookupResult,
  type ResolvedBarcodeAlias,
} from "@/lib/actions/stock-opname";
import {
  ASSET_TYPE_LABELS,
  CONDITION_LABELS,
  HYGIENE_LABELS,
  formatDateWIB,
} from "@/lib/constants";
import type {
  BarcodeAliasReason,
  HygieneStatus,
  ItemBarcodeAlias,
  ItemCondition,
  ItemMaster,
  OpnameItemStatus,
  StockOpnameItem,
} from "@/types/database";
import { ConditionBadge, HygieneBadge } from "../inventory/inventory-badges";

const OPNAME_QR_READER_ID = "starops-opname-qrcode-reader";

const OPNAME_STATUS_META: Record<
  OpnameItemStatus,
  { label: string; pillClass: string }
> = {
  BELUM_DIPERIKSA: {
    label: "Belum diperiksa",
    pillClass:
      "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  },
  SEDANG_DIPERIKSA: {
    label: "Sedang diperiksa",
    pillClass:
      "bg-[#E0F2FE] text-[#0C4A6E] dark:bg-sky-950/70 dark:text-sky-200",
  },
  MENUNGGU_PENYIMPANAN: {
    label: "Menunggu penyimpanan",
    pillClass:
      "bg-[#FEF3C7] text-[#78350F] dark:bg-amber-950/70 dark:text-amber-200",
  },
  SUDAH_DIPERIKSA: {
    label: "Sudah diperiksa",
    pillClass:
      "bg-[#D1FAE5] text-[#14532D] dark:bg-emerald-950/70 dark:text-emerald-200",
  },
};

const ALIAS_REASON_LABELS: Record<BarcodeAliasReason, string> = {
  MERGED_DUPLICATE: "Barcode Gabungan",
  LEGACY_BARCODE: "Barcode Lama",
  SUB_ITEM_REDIRECT: "Dialihkan ke Varian",
};

type ParentSubDraftRow = {
  actualStock: string;
  condition: ItemCondition;
  hygieneStatus: HygieneStatus;
  notes: string;
};

type LocalOpnameDraft =
  | {
      mode: "PARENT";
      updatedAt: number;
      parentNotes: string;
      entries: Record<string, ParentSubDraftRow>;
    }
  | {
      mode: "SIMPLE";
      updatedAt: number;
      actualStock: string;
      actualParts: number;
      condition: ItemCondition;
      hygieneStatus: HygieneStatus;
      notes: string;
    };

type ActiveWorkspace =
  | {
      mode: "PARENT";
      parentItem: ItemMaster;
      subItems: ItemMaster[];
      photoSignedUrl: string | null;
      highlightedSubItemId: string | null;
      resolvedAlias: ResolvedBarcodeAlias | null;
      aliasesForTarget: ItemBarcodeAlias[];
      parentNotes: string;
      entries: Record<string, ParentSubDraftRow>;
    }
  | {
      mode: "SIMPLE";
      item: ItemMaster;
      photoSignedUrl: string | null;
      resolvedAlias: ResolvedBarcodeAlias | null;
      aliasesForTarget: ItemBarcodeAlias[];
      actualStock: string;
      actualParts: number;
      condition: ItemCondition;
      hygieneStatus: HygieneStatus;
      notes: string;
    };

type CameraDeviceInfo = {
  id: string;
  label: string;
};

type StockOpnameClientProps = {
  initialSessionData: OpnameSessionPayload;
  initialCode: string;
  initialLookup: OpnameTargetLookupResult | null;
  initialLookupError: string | null;
  todayWib: string;
};

function getDraftStorageKey(sessionId: string, topLevelItemId: string): string {
  return `starops:opname:draft:${sessionId}:${topLevelItemId}`;
}

function getDraftStoragePrefix(sessionId: string): string {
  return `starops:opname:draft:${sessionId}:`;
}

function parseNonNegIntInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 0) return null;
  return num;
}

function sanitizeDigitInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

function sortItemsConsistently(items: ItemMaster[]): ItemMaster[] {
  return [...items].sort((a, b) => {
    const codeCmp = a.item_code.localeCompare(b.item_code, "id", { numeric: true });
    if (codeCmp !== 0) return codeCmp;
    return a.name.localeCompare(b.name, "id");
  });
}

function buildWorkspaceFromLookup(
  lookup: OpnameTargetLookupResult,
  opnameByItemId: Map<string, StockOpnameItem>,
  localDraft?: LocalOpnameDraft | null,
): ActiveWorkspace {
  if (lookup.mode === "PARENT") {
    const parentOpname =
      lookup.parentOpnameItem ?? opnameByItemId.get(lookup.parentItem.id) ?? null;
    const subOpnameMap = new Map<string, StockOpnameItem>();
    for (const row of lookup.subOpnameItems) {
      subOpnameMap.set(row.item_id, row);
    }

    const entries: Record<string, ParentSubDraftRow> = {};
    for (const sub of lookup.subItems) {
      const savedRow = subOpnameMap.get(sub.id) ?? opnameByItemId.get(sub.id) ?? null;
      const localRow =
        localDraft?.mode === "PARENT" ? localDraft.entries[sub.id] : undefined;

      if (localRow) {
        entries[sub.id] = { ...localRow };
      } else {
        entries[sub.id] = {
          actualStock:
            savedRow?.actual_stock !== null && savedRow?.actual_stock !== undefined
              ? String(savedRow.actual_stock)
              : "",
          condition: savedRow?.condition ?? sub.condition,
          hygieneStatus: savedRow?.hygiene_status ?? sub.hygiene_status,
          notes: savedRow?.notes ?? "",
        };
      }
    }

    return {
      mode: "PARENT",
      parentItem: lookup.parentItem,
      subItems: lookup.subItems,
      photoSignedUrl: lookup.photoSignedUrl,
      highlightedSubItemId: lookup.highlightedSubItemId,
      resolvedAlias: lookup.resolvedAlias,
      aliasesForTarget: lookup.aliasesForTarget,
      parentNotes:
        localDraft?.mode === "PARENT"
          ? localDraft.parentNotes
          : (parentOpname?.notes ?? ""),
      entries,
    };
  }

  const savedRow = lookup.opnameItem ?? opnameByItemId.get(lookup.item.id) ?? null;
  const simpleDraft = localDraft?.mode === "SIMPLE" ? localDraft : null;

  return {
    mode: "SIMPLE",
    item: lookup.item,
    photoSignedUrl: lookup.photoSignedUrl,
    resolvedAlias: lookup.resolvedAlias,
    aliasesForTarget: lookup.aliasesForTarget,
    actualStock: simpleDraft
      ? simpleDraft.actualStock
      : savedRow?.actual_stock !== null && savedRow?.actual_stock !== undefined
        ? String(savedRow.actual_stock)
        : "",
    actualParts: simpleDraft
      ? simpleDraft.actualParts
      : (savedRow?.actual_parts ?? lookup.item.current_parts),
    condition: simpleDraft
      ? simpleDraft.condition
      : (savedRow?.condition ?? lookup.item.condition),
    hygieneStatus: simpleDraft
      ? simpleDraft.hygieneStatus
      : (savedRow?.hygiene_status ?? lookup.item.hygiene_status),
    notes: simpleDraft ? simpleDraft.notes : (savedRow?.notes ?? ""),
  };
}

function formatDiffText(diff: number | null): {
  text: string;
  className: string;
} {
  if (diff === null) {
    return {
      text: "—",
      className: "text-muted-foreground",
    };
  }
  if (diff === 0) {
    return {
      text: "0 (Sesuai)",
      className: "text-emerald-700 dark:text-emerald-300",
    };
  }
  if (diff > 0) {
    return {
      text: `+${diff}`,
      className: "text-sky-700 dark:text-sky-300",
    };
  }
  return {
    text: `${diff}`,
    className: "text-rose-700 dark:text-rose-300",
  };
}

export function StockOpnameClient({
  initialSessionData,
  initialCode,
  initialLookup,
  initialLookupError,
  todayWib,
}: StockOpnameClientProps) {
  const { can } = useRole();
  const { showWorking, showError, runWithFeedback } = useCartoonFeedback();
  const { opnameRoomCodes, inventoryOptions, getLabel } = useLocations();

  const canApproveWriteoff = can("writeoff.approve");
  const session = initialSessionData.session;

  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const qrInstanceRef = useRef<Html5Qrcode | null>(null);
  const lastDecodedRef = useRef<{ text: string; at: number } | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);
  const highlightedCardRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<ItemMaster[]>(initialSessionData.items);
  const [aliases] = useState<ItemBarcodeAlias[]>(initialSessionData.aliases);
  const [opnameItems, setOpnameItems] = useState<StockOpnameItem[]>(
    initialSessionData.opnameItems,
  );
  const [localDrafts, setLocalDrafts] = useState<Record<string, LocalOpnameDraft>>({});

  const [roomFilter, setRoomFilter] = useState<string>(
    initialSessionData.roomCode ?? "ALL",
  );
  const [listTab, setListTab] = useState<"pending" | "processed">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [serverSearchGroups, setServerSearchGroups] = useState<
    OpnameSearchGroupEntry[] | null
  >(null);
  const [isSearchingServer, setIsSearchingServer] = useState(false);

  const [codeInput, setCodeInput] = useState(initialCode);
  const [lastScannedCode, setLastScannedCode] = useState(initialCode);
  const [isLookupPending, setIsLookupPending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(initialLookupError ? { type: "error", text: initialLookupError } : null);

  const opnameByItemId = useMemo(() => {
    const map = new Map<string, StockOpnameItem>();
    for (const row of opnameItems) {
      map.set(row.item_id, row);
    }
    return map;
  }, [opnameItems]);

  const [workspace, setWorkspace] = useState<ActiveWorkspace | null>(() => {
    if (!initialLookup) return null;
    const initialMap = new Map<string, StockOpnameItem>(
      initialSessionData.opnameItems.map((row) => [row.item_id, row]),
    );
    return buildWorkspaceFromLookup(initialLookup, initialMap, null);
  });

  // Hydrate unsaved local drafts from localStorage after mount (SSR-safe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefix = getDraftStoragePrefix(session.id);
    const loaded: Record<string, LocalOpnameDraft> = {};

    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const itemId = key.slice(prefix.length);
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as LocalOpnameDraft;
        if (parsed && (parsed.mode === "PARENT" || parsed.mode === "SIMPLE")) {
          loaded[itemId] = parsed;
        }
      }
    } catch {
      // Ignore malformed storage entries
    }

    setLocalDrafts(loaded);

    if (initialLookup) {
      const topId =
        initialLookup.mode === "PARENT"
          ? initialLookup.parentItem.id
          : initialLookup.item.id;
      const matchingDraft = loaded[topId];
      if (matchingDraft) {
        setWorkspace(
          buildWorkspaceFromLookup(initialLookup, opnameByItemId, matchingDraft),
        );
      }
    }
    // Run once on mount for current session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // Scroll highlighted Sub-Item into view when opened via Sub-Item barcode
  useEffect(() => {
    if (workspace?.mode !== "PARENT" || !workspace.highlightedSubItemId) return;
    const timer = setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      highlightedCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [workspace]);

  const persistDraftToStorage = useCallback(
    (topLevelId: string, draft: LocalOpnameDraft) => {
      setLocalDrafts((prev) => ({ ...prev, [topLevelId]: draft }));
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            getDraftStorageKey(session.id, topLevelId),
            JSON.stringify(draft),
          );
        } catch {
          // Ignore storage quota errors
        }
      }
    },
    [session.id],
  );

  const removeDraftFromStorage = useCallback(
    (topLevelId: string) => {
      setLocalDrafts((prev) => {
        if (!(topLevelId in prev)) return prev;
        const next = { ...prev };
        delete next[topLevelId];
        return next;
      });
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(getDraftStorageKey(session.id, topLevelId));
        } catch {
          // Ignore
        }
      }
    },
    [session.id],
  );

  // Build Parent-grouped structure from active items
  const allGroups = useMemo<OpnameSearchGroupEntry[]>(() => {
    const topLevel = items.filter((item) => item.parent_item_id === null);
    const childrenByParent = new Map<string, ItemMaster[]>();
    for (const item of items) {
      if (item.parent_item_id) {
        const list = childrenByParent.get(item.parent_item_id) ?? [];
        list.push(item);
        childrenByParent.set(item.parent_item_id, list);
      }
    }

    return sortItemsConsistently(topLevel).map((top) => {
      const subItems = sortItemsConsistently(childrenByParent.get(top.id) ?? []);
      return {
        item: top,
        isParent: top.has_sub_items || subItems.length > 0,
        subItemCount: subItems.length,
        subItems,
        matchedSubItems: [],
        matchedAliases: [],
      };
    });
  }, [items]);

  const aliasesByTarget = useMemo(() => {
    const map = new Map<string, ItemBarcodeAlias[]>();
    for (const alias of aliases) {
      const list = map.get(alias.target_item_id) ?? [];
      list.push(alias);
      map.set(alias.target_item_id, list);
    }
    return map;
  }, [aliases]);

  // Debounced server search via searchOpnameItemsAction when typing a query
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setServerSearchGroups(null);
      setIsSearchingServer(false);
      return;
    }

    let cancelled = false;
    setIsSearchingServer(true);
    const timer = setTimeout(async () => {
      const res = await searchOpnameItemsAction(
        q,
        roomFilter === "ALL" ? null : roomFilter,
      );
      if (cancelled) return;
      setIsSearchingServer(false);
      if (res.ok) {
        setServerSearchGroups(res.data);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, roomFilter]);

  // Instant local Parent-grouped filter (merged seamlessly with debounced server search)
  const visibleGroups = useMemo<OpnameSearchGroupEntry[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return allGroups.filter(
        (g) => roomFilter === "ALL" || g.item.room_code === roomFilter,
      );
    }

    if (serverSearchGroups) {
      return serverSearchGroups;
    }

    const matchesText = (it: ItemMaster) =>
      it.name.toLowerCase().includes(q) ||
      it.item_code.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q) ||
      (it.rack_location?.toLowerCase().includes(q) ?? false);

    const matchesAlias = (a: ItemBarcodeAlias) =>
      a.alias_code.toLowerCase().includes(q) ||
      (a.legacy_name?.toLowerCase().includes(q) ?? false);

    const out: OpnameSearchGroupEntry[] = [];
    for (const group of allGroups) {
      if (roomFilter !== "ALL" && group.item.room_code !== roomFilter) continue;

      const topMatch = matchesText(group.item);
      const matchedAliases: OpnameSearchGroupEntry["matchedAliases"] = [];

      for (const a of aliasesByTarget.get(group.item.id) ?? []) {
        if (matchesAlias(a)) {
          matchedAliases.push({
            alias_code: a.alias_code,
            legacy_name: a.legacy_name,
            alias_reason: a.alias_reason,
            target_item_id: a.target_item_id,
          });
        }
      }

      const matchedSubItems: OpnameSearchGroupEntry["matchedSubItems"] = [];
      for (const sub of group.subItems) {
        let subMatch = matchesText(sub);
        for (const a of aliasesByTarget.get(sub.id) ?? []) {
          if (matchesAlias(a)) {
            subMatch = true;
            matchedAliases.push({
              alias_code: a.alias_code,
              legacy_name: a.legacy_name,
              alias_reason: a.alias_reason,
              target_item_id: a.target_item_id,
            });
          }
        }
        if (subMatch) {
          matchedSubItems.push({
            id: sub.id,
            item_code: sub.item_code,
            name: sub.name,
          });
        }
      }

      if (topMatch || matchedSubItems.length > 0 || matchedAliases.length > 0) {
        out.push({
          ...group,
          matchedSubItems,
          matchedAliases,
        });
      }
    }

    return out;
  }, [allGroups, aliasesByTarget, roomFilter, searchQuery, serverSearchGroups]);

  // Compute effective opname status for each top-level group
  const getGroupEffectiveStatus = useCallback(
    (group: OpnameSearchGroupEntry): {
      status: OpnameItemStatus;
      hasLocalDraft: boolean;
    } => {
      const localDraft = localDrafts[group.item.id];
      if (localDraft) {
        if (localDraft.mode === "PARENT") {
          const anyFilled = Object.values(localDraft.entries).some(
            (e) => e.actualStock.trim() !== "",
          );
          return {
            status: anyFilled ? "MENUNGGU_PENYIMPANAN" : "SEDANG_DIPERIKSA",
            hasLocalDraft: true,
          };
        }
        return {
          status:
            localDraft.actualStock.trim() !== ""
              ? "MENUNGGU_PENYIMPANAN"
              : "SEDANG_DIPERIKSA",
          hasLocalDraft: true,
        };
      }

      if (group.isParent) {
        const parentRow = opnameByItemId.get(group.item.id);
        const subRows = group.subItems
          .map((s) => opnameByItemId.get(s.id))
          .filter((r): r is StockOpnameItem => Boolean(r));

        if (
          parentRow?.status === "MENUNGGU_PENYIMPANAN" ||
          subRows.some((r) => r.status === "MENUNGGU_PENYIMPANAN")
        ) {
          return { status: "MENUNGGU_PENYIMPANAN", hasLocalDraft: false };
        }
        if (
          parentRow?.status === "SEDANG_DIPERIKSA" ||
          subRows.some((r) => r.status === "SEDANG_DIPERIKSA")
        ) {
          return { status: "SEDANG_DIPERIKSA", hasLocalDraft: false };
        }
        if (
          parentRow?.status === "SUDAH_DIPERIKSA" ||
          (group.subItems.length > 0 &&
            subRows.length === group.subItems.length &&
            subRows.every((r) => r.status === "SUDAH_DIPERIKSA"))
        ) {
          return { status: "SUDAH_DIPERIKSA", hasLocalDraft: false };
        }
        return { status: "BELUM_DIPERIKSA", hasLocalDraft: false };
      }

      const row = opnameByItemId.get(group.item.id);
      return {
        status: row?.status ?? "BELUM_DIPERIKSA",
        hasLocalDraft: false,
      };
    },
    [localDrafts, opnameByItemId],
  );

  // Room-scoped status counters (independent of search query so KPI stays stable)
  const roomStatusSummary = useMemo(() => {
    const counts: Record<OpnameItemStatus, number> = {
      BELUM_DIPERIKSA: 0,
      SEDANG_DIPERIKSA: 0,
      MENUNGGU_PENYIMPANAN: 0,
      SUDAH_DIPERIKSA: 0,
    };

    const roomGroups = allGroups.filter(
      (g) => roomFilter === "ALL" || g.item.room_code === roomFilter,
    );
    for (const group of roomGroups) {
      const { status } = getGroupEffectiveStatus(group);
      counts[status] += 1;
    }

    return {
      total: roomGroups.length,
      ...counts,
    };
  }, [allGroups, getGroupEffectiveStatus, roomFilter]);

  const { pendingList, processedList } = useMemo(() => {
    const pending: Array<
      OpnameSearchGroupEntry & { status: OpnameItemStatus; hasLocalDraft: boolean }
    > = [];
    const processed: Array<
      OpnameSearchGroupEntry & { status: OpnameItemStatus; hasLocalDraft: boolean }
    > = [];

    for (const group of visibleGroups) {
      const meta = getGroupEffectiveStatus(group);
      const entry = { ...group, ...meta };
      if (meta.status === "SUDAH_DIPERIKSA") {
        processed.push(entry);
      } else {
        pending.push(entry);
      }
    }

    return { pendingList: pending, processedList: processed };
  }, [getGroupEffectiveStatus, visibleGroups]);

  const activeList = listTab === "pending" ? pendingList : processedList;

  // Room filter options: active opname rooms + any room code existing on active items
  const roomSelectOptions = useMemo(() => {
    const codeSet = new Set<string>(opnameRoomCodes);
    for (const g of allGroups) {
      codeSet.add(g.item.room_code);
    }
    const optionMap = new Map(inventoryOptions.map((o) => [o.value, o.label]));
    return Array.from(codeSet)
      .sort((a, b) => a.localeCompare(b, "id"))
      .map((code) => ({
        value: code,
        label: optionMap.get(code) ?? `${code} — ${getLabel(code)}`,
      }));
  }, [allGroups, getLabel, inventoryOptions, opnameRoomCodes]);

  // Camera lifecycle
  const stopCamera = async () => {
    const instance = qrInstanceRef.current;
    if (!instance) {
      setCameraActive(false);
      return;
    }
    try {
      if (instance.isScanning) {
        await instance.stop();
      }
      instance.clear();
    } catch {
      // Ignore cleanup errors
    } finally {
      qrInstanceRef.current = null;
      setCameraActive(false);
    }
  };

  useEffect(() => {
    return () => {
      const instance = qrInstanceRef.current;
      if (instance) {
        if (instance.isScanning) {
          void instance.stop().then(() => instance.clear()).catch(() => {});
        } else {
          try {
            instance.clear();
          } catch {
            // ignore
          }
        }
        qrInstanceRef.current = null;
      }
    };
  }, []);

  const openLookupResult = useCallback(
    (result: OpnameTargetLookupResult, scannedLabel?: string) => {
      const topId =
        result.mode === "PARENT" ? result.parentItem.id : result.item.id;
      const existingLocalDraft = localDrafts[topId] ?? null;

      const nextWorkspace = buildWorkspaceFromLookup(
        result,
        opnameByItemId,
        existingLocalDraft,
      );
      setWorkspace(nextWorkspace);

      if (result.mode === "PARENT") {
        setFeedback({
          type: "success",
          text: result.highlightedSubItemId
            ? `Parent Item "${result.parentItem.name}" dibuka (${result.subItems.length} Sub-Item) · menyorot varian yang dipindai.`
            : `Parent Item "${result.parentItem.name}" siap diperiksa (${result.subItems.length} Sub-Item).`,
        });
      } else {
        setFeedback({
          type: "success",
          text: scannedLabel
            ? `Berhasil memuat "${result.item.name}" (${result.item.item_code}) dari scan "${scannedLabel}".`
            : `Barang "${result.item.name}" (${result.item.item_code}) siap diperiksa.`,
        });
      }
    },
    [localDrafts, opnameByItemId],
  );

  const performLookup = async (rawCode: string, clearInputAfter = false) => {
    const trimmed = rawCode.trim();
    if (!trimmed) {
      setFeedback({
        type: "error",
        text: "Masukkan atau scan kode barcode/QR terlebih dahulu.",
      });
      showError({
        title: "Kode Masih Kosong!",
        message: "Yuk scan stiker barcode atau ketik kode barang terlebih dahulu~",
      });
      return;
    }

    setFeedback(null);
    setLastScannedCode(trimmed);
    setIsLookupPending(true);

    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Mencari Barang Opname...",
          workingMessage: `Mengecek kode "${trimmed}" & alias barcode lama di database...`,
          skipSuccess: true,
          errorTitle: "Kode Tidak Ditemukan",
          errorMessage: (err) =>
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : `Kode "${trimmed}" tidak ditemukan.`,
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () => lookupOpnameTargetAction(trimmed, session.id),
      );

      if (clearInputAfter) {
        setCodeInput("");
      }
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      openLookupResult(res.data, trimmed);
    } catch (err) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Terjadi kendala saat mencari barang.",
      });
    } finally {
      setIsLookupPending(false);
    }
  };

  const handleOpenFromList = (
    group: OpnameSearchGroupEntry,
    highlightedSubId?: string | null,
  ) => {
    setFeedback(null);
    const existingLocalDraft = localDrafts[group.item.id] ?? null;

    if (group.isParent) {
      const syntheticLookup: OpnameTargetLookupResult = {
        mode: "PARENT",
        parentItem: group.item,
        subItems: group.subItems,
        photoSignedUrl: null,
        highlightedSubItemId: highlightedSubId ?? null,
        resolvedAlias: null,
        aliasesForTarget: [
          ...(aliasesByTarget.get(group.item.id) ?? []),
          ...group.subItems.flatMap((s) => aliasesByTarget.get(s.id) ?? []),
        ],
        parentOpnameItem: opnameByItemId.get(group.item.id) ?? null,
        subOpnameItems: group.subItems
          .map((s) => opnameByItemId.get(s.id))
          .filter((r): r is StockOpnameItem => Boolean(r)),
      };

      setWorkspace(
        buildWorkspaceFromLookup(syntheticLookup, opnameByItemId, existingLocalDraft),
      );
    } else {
      const syntheticLookup: OpnameTargetLookupResult = {
        mode: "SIMPLE",
        item: group.item,
        photoSignedUrl: null,
        resolvedAlias: null,
        aliasesForTarget: aliasesByTarget.get(group.item.id) ?? [],
        opnameItem: opnameByItemId.get(group.item.id) ?? null,
      };
      setWorkspace(
        buildWorkspaceFromLookup(syntheticLookup, opnameByItemId, existingLocalDraft),
      );
    }
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performLookup(codeInput, true);
  };

  const startCamera = async () => {
    setCameraError(null);
    setCameraBusy(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
        "html5-qrcode"
      );

      let availableCameras = cameras;
      if (availableCameras.length === 0) {
        const fetched = await Html5Qrcode.getCameras();
        availableCameras = fetched.map((c) => ({
          id: c.id,
          label: c.label || `Kamera ${c.id.slice(0, 6)}`,
        }));
        setCameras(availableCameras);
      }

      if (availableCameras.length === 0) {
        const msg = "Tidak ada kamera yang terdeteksi pada perangkat ini.";
        setCameraError(msg);
        showError({
          title: "Kamera Tidak Terdeteksi",
          message:
            "Gunakan USB Scanner atau unggah foto stiker barcode untuk memindai ya!",
        });
        setCameraBusy(false);
        return;
      }

      const preferredCamera =
        selectedCameraId ||
        availableCameras.find((c) => /back|rear|environment/i.test(c.label))
          ?.id ||
        availableCameras[0].id;

      if (!selectedCameraId) {
        setSelectedCameraId(preferredCamera);
      }

      await stopCamera();

      const scanner = new Html5Qrcode(OPNAME_QR_READER_ID, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.ITF,
        ],
      });
      qrInstanceRef.current = scanner;

      await scanner.start(
        preferredCamera,
        {
          fps: 10,
          qrbox: { width: 240, height: 140 },
        },
        (decodedText) => {
          const now = Date.now();
          if (
            lastDecodedRef.current &&
            lastDecodedRef.current.text === decodedText &&
            now - lastDecodedRef.current.at < 2500
          ) {
            return;
          }
          lastDecodedRef.current = { text: decodedText, at: now };
          void stopCamera();
          setCodeInput(decodedText);
          void performLookup(decodedText, true);
        },
        () => {
          // Ignore per-frame miss
        },
      );

      setCameraActive(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Gagal mengakses kamera: ${err.message}`
          : "Gagal mengaktifkan kamera pemindai.";
      setCameraError(msg);
      await stopCamera();
    } finally {
      setCameraBusy(false);
    }
  };

  const handleScanImageFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    setCameraBusy(true);
    showWorking({
      title: "Membaca Foto Barcode...",
      message: "Memindai kode QR / barcode dari gambar yang diunggah~",
    });
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
        "html5-qrcode"
      );
      await stopCamera();
      const scanner = new Html5Qrcode(OPNAME_QR_READER_ID, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
        ],
      });
      const decodedText = await scanner.scanFile(file, false);
      scanner.clear();
      setCodeInput(decodedText);
      await performLookup(decodedText, true);
    } catch {
      const msg = "Barcode / QR Code tidak terbaca pada gambar tersebut.";
      setCameraError(msg);
      showError({
        title: "Foto Tidak Terbaca",
        message: "Pastikan foto barcode tajam dan terang lalu coba unggah ulang.",
      });
    } finally {
      setCameraBusy(false);
      event.target.value = "";
    }
  };

  // Workspace update helpers (with immediate localStorage draft persistence)
  const updateParentEntry = (
    subItemId: string,
    patch: Partial<ParentSubDraftRow>,
  ) => {
    setWorkspace((prev) => {
      if (!prev || prev.mode !== "PARENT") return prev;
      const currentRow = prev.entries[subItemId] ?? {
        actualStock: "",
        condition: "BAIK" as ItemCondition,
        hygieneStatus: "STERIL" as HygieneStatus,
        notes: "",
      };
      const nextEntries = {
        ...prev.entries,
        [subItemId]: { ...currentRow, ...patch },
      };
      persistDraftToStorage(prev.parentItem.id, {
        mode: "PARENT",
        updatedAt: Date.now(),
        parentNotes: prev.parentNotes,
        entries: nextEntries,
      });
      return { ...prev, entries: nextEntries };
    });
  };

  const updateParentNotes = (notesValue: string) => {
    setWorkspace((prev) => {
      if (!prev || prev.mode !== "PARENT") return prev;
      persistDraftToStorage(prev.parentItem.id, {
        mode: "PARENT",
        updatedAt: Date.now(),
        parentNotes: notesValue,
        entries: prev.entries,
      });
      return { ...prev, parentNotes: notesValue };
    });
  };

  const fillParentMatchingSystem = () => {
    setWorkspace((prev) => {
      if (!prev || prev.mode !== "PARENT") return prev;
      const nextEntries: Record<string, ParentSubDraftRow> = {};
      for (const sub of prev.subItems) {
        const current = prev.entries[sub.id];
        nextEntries[sub.id] = {
          actualStock: String(sub.stock_qty),
          condition: current?.condition ?? sub.condition,
          hygieneStatus: current?.hygieneStatus ?? sub.hygiene_status,
          notes: current?.notes ?? "",
        };
      }
      persistDraftToStorage(prev.parentItem.id, {
        mode: "PARENT",
        updatedAt: Date.now(),
        parentNotes: prev.parentNotes,
        entries: nextEntries,
      });
      return { ...prev, entries: nextEntries };
    });
  };

  const clearParentInputs = () => {
    setWorkspace((prev) => {
      if (!prev || prev.mode !== "PARENT") return prev;
      const nextEntries: Record<string, ParentSubDraftRow> = {};
      for (const sub of prev.subItems) {
        const current = prev.entries[sub.id];
        nextEntries[sub.id] = {
          actualStock: "",
          condition: current?.condition ?? sub.condition,
          hygieneStatus: current?.hygieneStatus ?? sub.hygiene_status,
          notes: current?.notes ?? "",
        };
      }
      persistDraftToStorage(prev.parentItem.id, {
        mode: "PARENT",
        updatedAt: Date.now(),
        parentNotes: prev.parentNotes,
        entries: nextEntries,
      });
      return { ...prev, entries: nextEntries };
    });
  };

  const updateSimpleWorkspace = (
    patch: Partial<{
      actualStock: string;
      actualParts: number;
      condition: ItemCondition;
      hygieneStatus: HygieneStatus;
      notes: string;
    }>,
  ) => {
    setWorkspace((prev) => {
      if (!prev || prev.mode !== "SIMPLE") return prev;
      const next = { ...prev, ...patch };
      persistDraftToStorage(prev.item.id, {
        mode: "SIMPLE",
        updatedAt: Date.now(),
        actualStock: next.actualStock,
        actualParts: next.actualParts,
        condition: next.condition,
        hygieneStatus: next.hygieneStatus,
        notes: next.notes,
      });
      return next;
    });
  };

  const mergeSavedOpnameItems = (savedRows: StockOpnameItem[]) => {
    if (savedRows.length === 0) return;
    setOpnameItems((prev) => {
      const map = new Map(prev.map((r) => [r.item_id, r]));
      for (const row of savedRows) {
        map.set(row.item_id, row);
      }
      return Array.from(map.values());
    });
  };

  const mergeUpdatedMasterItems = (updatedList: ItemMaster[]) => {
    if (updatedList.length === 0) return;
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      for (const updated of updatedList) {
        map.set(updated.id, updated);
      }
      return Array.from(map.values());
    });
  };

  const handleSaveDraft = async () => {
    if (!workspace) return;
    setFeedback(null);
    setIsSavingDraft(true);

    try {
      if (workspace.mode === "PARENT") {
        const anyFilled = workspace.subItems.some((sub) => {
          const val = workspace.entries[sub.id]?.actualStock ?? "";
          return parseNonNegIntInput(val) !== null;
        });

        const draftStatus = anyFilled
          ? "MENUNGGU_PENYIMPANAN"
          : "SEDANG_DIPERIKSA";

        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Menyimpan Draft Opname...",
            workingMessage: `Menyimpan sementara hitungan "${workspace.parentItem.name}"...`,
            successTitle: "Draft Tersimpan!",
            successMessage: `Draft "${workspace.parentItem.name}" tersimpan aman (${
              draftStatus === "MENUNGGU_PENYIMPANAN"
                ? "Menunggu penyimpanan"
                : "Sedang diperiksa"
            }).`,
            errorTitle: "Gagal Simpan Draft",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () =>
            saveOpnameDraftAction({
              sessionId: session.id,
              parentItemId: workspace.parentItem.id,
              parentNotes: workspace.parentNotes,
              status: draftStatus,
              entries: workspace.subItems.map((sub) => {
                const row = workspace.entries[sub.id];
                return {
                  itemId: sub.id,
                  actualStock: parseNonNegIntInput(row?.actualStock ?? ""),
                  condition: row?.condition ?? sub.condition,
                  hygieneStatus: row?.hygieneStatus ?? sub.hygiene_status,
                  notes: row?.notes ?? null,
                  status: draftStatus,
                };
              }),
            }),
        );

        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        mergeSavedOpnameItems(res.data.savedItems);
        removeDraftFromStorage(workspace.parentItem.id);
        setFeedback({
          type: "success",
          text: `Draft "${workspace.parentItem.name}" berhasil disimpan ke sesi opname.`,
        });
      } else {
        const parsedStock = parseNonNegIntInput(workspace.actualStock);
        const draftStatus =
          parsedStock !== null ? "MENUNGGU_PENYIMPANAN" : "SEDANG_DIPERIKSA";

        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: "Menyimpan Draft Opname...",
            workingMessage: `Menyimpan sementara hitungan "${workspace.item.name}"...`,
            successTitle: "Draft Tersimpan!",
            successMessage: `Draft "${workspace.item.name}" berhasil disimpan.`,
            errorTitle: "Gagal Simpan Draft",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () =>
            saveOpnameDraftAction({
              sessionId: session.id,
              status: draftStatus,
              entries: [
                {
                  itemId: workspace.item.id,
                  actualStock: parsedStock,
                  actualParts: workspace.actualParts,
                  condition: workspace.condition,
                  hygieneStatus: workspace.hygieneStatus,
                  notes: workspace.notes,
                  status: draftStatus,
                },
              ],
            }),
        );

        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }
        mergeSavedOpnameItems(res.data.savedItems);
        removeDraftFromStorage(workspace.item.id);
        setFeedback({
          type: "success",
          text: `Draft "${workspace.item.name}" berhasil disimpan ke sesi opname.`,
        });
      }
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Parent live totals & validation
  const parentLiveMetrics = useMemo(() => {
    if (workspace?.mode !== "PARENT") return null;

    let totalSystemStock = 0;
    let totalActualStock = 0;
    let filledCount = 0;
    const missingSubItems: ItemMaster[] = [];

    for (const sub of workspace.subItems) {
      const row = workspace.entries[sub.id];
      const effectiveCond = row?.condition ?? sub.condition;
      if (sub.condition !== "DIHAPUSBUKU") {
        totalSystemStock += sub.stock_qty;
      }
      const parsed = parseNonNegIntInput(row?.actualStock ?? "");
      if (parsed === null) {
        missingSubItems.push(sub);
      } else {
        filledCount += 1;
        if (effectiveCond !== "DIHAPUSBUKU") {
          totalActualStock += parsed;
        }
      }
    }

    const allFilled =
      workspace.subItems.length > 0 && missingSubItems.length === 0;
    const totalDiff = filledCount > 0 ? totalActualStock - totalSystemStock : null;

    return {
      totalSystemStock,
      totalActualStock,
      filledCount,
      totalSubCount: workspace.subItems.length,
      missingSubItems,
      allFilled,
      totalDiff,
    };
  }, [workspace]);

  const simpleParsedStock =
    workspace?.mode === "SIMPLE"
      ? parseNonNegIntInput(workspace.actualStock)
      : null;

  const handleSubmitOpname = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspace) return;
    setFeedback(null);

    if (workspace.mode === "PARENT") {
      if (!parentLiveMetrics || !parentLiveMetrics.allFilled) {
        const missingCount = parentLiveMetrics?.missingSubItems.length ?? 0;
        const msg =
          workspace.subItems.length === 0
            ? "Parent Item belum memiliki Sub-Item aktif."
            : `Masih ada ${missingCount} Sub-Item yang stok aktualnya belum diisi. Lengkapi semua Sub-Item terlebih dahulu.`;
        setFeedback({ type: "error", text: msg });
        showError({ title: "Isian Belum Lengkap", message: msg });
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await runWithFeedback(
          {
            mode: workspace.subItems.length > 1 ? "batch" : "working",
            workingTitle: "Menyimpan Hasil Stock Opname...",
            workingMessage: `Memperbarui stok & audit trail untuk "${workspace.parentItem.name}" (${workspace.subItems.length} Sub-Item)...`,
            successTitle: "Stock Opname Selesai! ♪",
            successMessage: (r) =>
              r.ok && r.message
                ? r.message
                : `Stock Opname "${workspace.parentItem.name}" berhasil disimpan!`,
            errorTitle: "Gagal Simpan Stock Opname",
            isResultError: (r) => (!r.ok ? r.error : null),
          },
          () =>
            submitStockOpnameAction({
              sessionId: session.id,
              parentItemId: workspace.parentItem.id,
              notes: workspace.parentNotes.trim() || null,
              entries: workspace.subItems.map((sub) => {
                const row = workspace.entries[sub.id];
                const parsed = parseNonNegIntInput(row?.actualStock ?? "")!;
                return {
                  itemId: sub.id,
                  actualStock: parsed,
                  condition: row?.condition ?? sub.condition,
                  hygieneStatus: row?.hygieneStatus ?? sub.hygiene_status,
                  notes: row?.notes?.trim() || null,
                };
              }),
            }),
        );

        if (!res.ok) {
          setFeedback({ type: "error", text: res.error });
          return;
        }

        const updatedMaster: ItemMaster[] = [
          ...(res.data.parentItem ? [res.data.parentItem] : []),
          ...res.data.subItems,
        ];
        mergeUpdatedMasterItems(updatedMaster);
        mergeSavedOpnameItems(res.data.opnameItems);
        removeDraftFromStorage(workspace.parentItem.id);

        if (res.data.parentItem) {
          const freshOpnameMap = new Map(opnameByItemId);
          for (const row of res.data.opnameItems) {
            freshOpnameMap.set(row.item_id, row);
          }
          setWorkspace(
            buildWorkspaceFromLookup(
              {
                mode: "PARENT",
                parentItem: res.data.parentItem,
                subItems: res.data.subItems,
                photoSignedUrl: workspace.photoSignedUrl,
                highlightedSubItemId: workspace.highlightedSubItemId,
                resolvedAlias: workspace.resolvedAlias,
                aliasesForTarget: workspace.aliasesForTarget,
                parentOpnameItem:
                  freshOpnameMap.get(res.data.parentItem.id) ?? null,
                subOpnameItems: res.data.subItems
                  .map((s) => freshOpnameMap.get(s.id))
                  .filter((r): r is StockOpnameItem => Boolean(r)),
              },
              freshOpnameMap,
              null,
            ),
          );
        }

        setFeedback({
          type: "success",
          text:
            res.message ??
            `Hasil Stock Opname "${workspace.parentItem.name}" berhasil disimpan.`,
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // SIMPLE ITEM MODE
    if (simpleParsedStock === null) {
      const msg =
        "Stok aktual wajib diisi dengan angka bulat >= 0 sebelum menyimpan hasil opname.";
      setFeedback({ type: "error", text: msg });
      showError({ title: "Stok Aktual Belum Diisi", message: msg });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Menyimpan Hasil Stock Opname...",
          workingMessage: `Menyimpan hasil verifikasi fisik "${workspace.item.name}"...`,
          successTitle: "Stock Opname Selesai! ♪",
          successMessage: (r) =>
            r.ok && r.message
              ? r.message
              : `Hasil Stock Opname "${workspace.item.name}" berhasil disimpan!`,
          errorTitle: "Gagal Simpan Stock Opname",
          isResultError: (r) => (!r.ok ? r.error : null),
        },
        () =>
          submitStockOpnameAction({
            sessionId: session.id,
            entries: [
              {
                itemId: workspace.item.id,
                actualStock: simpleParsedStock,
                actualParts: workspace.actualParts,
                condition: workspace.condition,
                hygieneStatus: workspace.hygieneStatus,
                notes: workspace.notes.trim() || null,
              },
            ],
            notes: workspace.notes.trim() || null,
          }),
      );

      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }

      if (res.data.item) {
        mergeUpdatedMasterItems([res.data.item]);
      }
      mergeSavedOpnameItems(res.data.opnameItems);
      removeDraftFromStorage(workspace.item.id);

      if (res.data.item) {
        const freshOpnameMap = new Map(opnameByItemId);
        for (const row of res.data.opnameItems) {
          freshOpnameMap.set(row.item_id, row);
        }
        setWorkspace(
          buildWorkspaceFromLookup(
            {
              mode: "SIMPLE",
              item: res.data.item,
              photoSignedUrl: workspace.photoSignedUrl,
              resolvedAlias: workspace.resolvedAlias,
              aliasesForTarget: workspace.aliasesForTarget,
              opnameItem: freshOpnameMap.get(res.data.item.id) ?? null,
            },
            freshOpnameMap,
            null,
          ),
        );
      }

      setFeedback({
        type: "success",
        text:
          res.message ??
          `Hasil Stock Opname "${workspace.item.name}" berhasil disimpan.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnToScanner = () => {
    setWorkspace(null);
    setCodeInput("");
    setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 50);
  };

  const focusScannerInput = () => {
    setCodeInput("");
    scannerInputRef.current?.focus();
  };

  const activeTopId =
    workspace?.mode === "PARENT"
      ? workspace.parentItem.id
      : workspace?.mode === "SIMPLE"
        ? workspace.item.id
        : null;

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        badge={`Sesi ${initialSessionData.session.session_code} · ${initialSessionData.periodLabel}`}
        title="Stock Opname Terpadu"
        description="Scan barcode atau cari barang untuk menghitung stok fisik Parent Item (beserta semua Sub-Item varian) dan barang satuan. Draft tersimpan otomatis di browser maupun sesi."
        accent="butter"
        mascot="clipboard"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={roomFilter} onValueChange={setRoomFilter}>
              <SelectTrigger className="w-full min-w-[200px] rounded-xl border-2 border-[#2C2623] bg-white font-bold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] sm:w-[230px] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100">
                <SelectValue placeholder="Filter Ruangan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Ruangan</SelectItem>
                {roomSelectOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              onClick={focusScannerInput}
              className="rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#6EE7B7] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
            >
              <ScanLine className="size-4" />
              Fokus Scanner USB
            </Button>
          </div>
        }
      />

      {/* 4 Status Summary Counters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KawaiiStatCard
          label="Belum diperiksa"
          value={roomStatusSummary.BELUM_DIPERIKSA}
          hint={`Dari ${roomStatusSummary.total} grup barang`}
          accent="pink"
          icon={<Package className="size-4" />}
        />
        <KawaiiStatCard
          label="Sedang diperiksa"
          value={roomStatusSummary.SEDANG_DIPERIKSA}
          hint="Sudah dibuka / draft awal"
          accent="sky"
          icon={<Clock className="size-4" />}
        />
        <KawaiiStatCard
          label="Menunggu penyimpanan"
          value={roomStatusSummary.MENUNGGU_PENYIMPANAN}
          hint="Sudah diisi, belum final"
          accent="butter"
          icon={<Save className="size-4" />}
        />
        <KawaiiStatCard
          label="Sudah diperiksa"
          value={roomStatusSummary.SUDAH_DIPERIKSA}
          hint={
            roomStatusSummary.total > 0
              ? `${Math.round(
                  (roomStatusSummary.SUDAH_DIPERIKSA / roomStatusSummary.total) *
                    100,
                )}% selesai`
              : "Belum ada barang"
          }
          accent="mint"
          icon={<CheckCircle2 className="size-4" />}
        />
      </div>

      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          className={
            feedback.type === "success"
              ? "rounded-2xl border-2 border-[#2C2623] bg-[#ECFDF5] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100"
              : "rounded-2xl border-2 border-[#2C2623] bg-[#FFF1F2] shadow-[3px_3px_0px_0px_#2C2623] dark:border-rose-500 dark:bg-rose-950/50"
          }
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4 text-[#2AB673]" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          <AlertDescription className="font-semibold">
            {feedback.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Responsive Split Workspace */}
      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        {/* LEFT PANE: Scanner + Unified Parent-Grouped Search + Tabbed Item List */}
        <div className="min-w-0 space-y-5 lg:col-span-5 xl:col-span-4">
          {/* Dedicated Barcode Scanner Panel */}
          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#FEF3C7]/75 pb-3.5 dark:border-stone-600 dark:bg-amber-950/35">
              <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <Barcode className="size-4" />
                </span>
                Pemindai Barcode Opname
              </CardTitle>
              <CardDescription className="text-xs text-[#2C2623]/75 dark:text-stone-300">
                Laser USB (auto-Enter), kamera QR/Barcode, atau foto label — termasuk barcode lama/gabungan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-4">
              <form onSubmit={handleScanSubmit} className="flex gap-2">
                <Input
                  ref={scannerInputRef}
                  autoFocus
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Scan atau ketik kode SC-… / URL"
                  className="min-w-0 flex-1 rounded-xl border-2 border-[#2C2623] bg-white font-mono text-sm font-semibold shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900"
                  disabled={isLookupPending}
                />
                <Button
                  type="submit"
                  disabled={isLookupPending}
                  className="shrink-0 rounded-xl border-2 border-[#2C2623] bg-[#2AB673] px-4 font-extrabold text-white shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#229c61]"
                >
                  {isLookupPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Scan"
                  )}
                </Button>
              </form>

              {lastScannedCode && (
                <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#E0F2FE] px-2.5 py-0.5 text-[11px] font-semibold text-[#2C2623] dark:border-stone-500 dark:bg-sky-950/60 dark:text-sky-100">
                  <Sparkles className="size-3 shrink-0 text-[#0284C7]" />
                  <span>Terakhir:</span>
                  <span className="font-mono font-extrabold break-all">
                    {lastScannedCode}
                  </span>
                </div>
              )}

              {cameraError && (
                <Alert
                  variant="destructive"
                  className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF1F2] py-2 dark:border-rose-500 dark:bg-rose-950/40"
                >
                  <AlertDescription className="text-xs font-semibold">
                    {cameraError}
                  </AlertDescription>
                </Alert>
              )}

              {cameras.length > 1 && (
                <Select
                  value={selectedCameraId}
                  onValueChange={setSelectedCameraId}
                  disabled={cameraActive || cameraBusy}
                >
                  <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white text-xs font-semibold dark:border-stone-500 dark:bg-stone-900">
                    <SelectValue placeholder="Pilih kamera" />
                  </SelectTrigger>
                  <SelectContent>
                    {cameras.map((cam) => (
                      <SelectItem key={cam.id} value={cam.id}>
                        {cam.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Camera Viewfinder */}
              <div className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF8EB] p-2 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900/90">
                <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        cameraActive
                          ? "size-2 animate-pulse rounded-full bg-[#2AB673]"
                          : cameraBusy
                            ? "size-2 animate-bounce rounded-full bg-[#7CC4FA]"
                            : "size-2 rounded-full bg-[#FDE68A]"
                      }
                    />
                    <span className="text-[10px] font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                      {cameraActive
                        ? "Kamera Aktif"
                        : cameraBusy
                          ? "Menyiapkan..."
                          : "Kamera Siap"}
                    </span>
                  </div>
                  <span className="rounded-full border border-[#2C2623] bg-[#FFE4E6] px-2 py-0.5 font-mono text-[10px] font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-rose-950/60 dark:text-rose-200">
                    <QrCode className="mr-1 inline size-2.5" />
                    QR · CODE128
                  </span>
                </div>

                <div className="relative overflow-hidden rounded-xl border-2 border-[#2C2623] bg-[#F5EFE6] dark:border-stone-600 dark:bg-stone-950">
                  <div
                    id={OPNAME_QR_READER_ID}
                    className="min-h-[160px] w-full overflow-hidden"
                  />
                  {!cameraActive && !cameraBusy && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                      <Camera className="size-6 text-[#2C2623]/60 dark:text-stone-400" />
                      <p className="text-xs font-bold text-[#2C2623]/80 dark:text-stone-300">
                        Aktifkan kamera atau unggah foto barcode
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!cameraActive ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={startCamera}
                    disabled={cameraBusy}
                    className="flex-1 rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#229c61]"
                  >
                    {cameraBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Camera className="size-3.5" />
                    )}
                    Mulai Kamera
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void stopCamera()}
                    className="flex-1 rounded-xl border-2 border-[#2C2623] bg-[#FB7185] font-extrabold text-white shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#F43F5E]"
                  >
                    <CameraOff className="size-3.5" />
                    Hentikan
                  </Button>
                )}

                <Label
                  htmlFor="opname-file-upload"
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#2C2623] bg-[#EDE9FE] px-3 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#DDD6FE] dark:border-stone-500 dark:bg-violet-950/70 dark:text-violet-100"
                >
                  <Upload className="size-3.5" />
                  Foto
                </Label>
                <input
                  id="opname-file-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleScanImageFile}
                  disabled={cameraBusy}
                />
              </div>
            </CardContent>
          </Card>

          {/* Search & Tabbed Item List */}
          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE]/70 pb-3.5 dark:border-stone-600 dark:bg-sky-950/35">
              <CardTitle className="flex items-center justify-between gap-2 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                <span>Pilih Barang Opname</span>
                {isSearchingServer && (
                  <Loader2 className="size-4 animate-spin text-[#0284C7]" />
                )}
              </CardTitle>
              <div className="relative pt-1">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, kode, varian, atau alias lama…"
                  className="rounded-xl border-2 border-[#2C2623] bg-white pl-9 text-sm font-semibold dark:border-stone-500 dark:bg-stone-900"
                />
              </div>
            </CardHeader>

            <CardContent className="space-y-3 pt-3.5">
              <Tabs
                value={listTab}
                onValueChange={(v) => setListTab(v as "pending" | "processed")}
              >
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border-2 border-[#2C2623] bg-[#F5EFE6] p-1 dark:border-stone-500 dark:bg-stone-800">
                  <TabsTrigger
                    value="pending"
                    className="rounded-xl py-1.5 text-xs font-extrabold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FEF3C7] data-[state=active]:text-[#2C2623]"
                  >
                    Daftar Barang ({pendingList.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="processed"
                    className="rounded-xl py-1.5 text-xs font-extrabold data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#D1FAE5] data-[state=active]:text-[#2C2623]"
                  >
                    Sudah Diproses ({processedList.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {activeList.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-[#2C2623]/30 p-5 text-center text-xs font-semibold text-[#6B5E57] dark:border-stone-600 dark:text-stone-400">
                  {searchQuery.trim()
                    ? `Tidak ada barang di tab ini untuk "${searchQuery.trim()}". ${
                        listTab === "pending" && processedList.length > 0
                          ? `(${processedList.length} hasil ada di tab "Sudah Diproses")`
                          : listTab === "processed" && pendingList.length > 0
                            ? `(${pendingList.length} hasil ada di tab "Daftar Barang")`
                            : ""
                      }`
                    : listTab === "pending"
                      ? "Semua barang pada filter ruangan ini sudah diperiksa!"
                      : "Belum ada barang yang selesai diopname pada sesi ini."}
                </div>
              ) : (
                <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                  {activeList.map((entry) => {
                    const isSelected = activeTopId === entry.item.id;
                    const statusMeta = OPNAME_STATUS_META[entry.status];
                    const firstMatchedSubId =
                      entry.matchedSubItems[0]?.id ?? null;

                    return (
                      <button
                        key={entry.item.id}
                        type="button"
                        onClick={() =>
                          handleOpenFromList(entry, firstMatchedSubId)
                        }
                        className={`w-full rounded-2xl border-2 p-3 text-left transition-all ${
                          isSelected
                            ? "border-[#2C2623] bg-[#FEF3C7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-400 dark:bg-amber-950/50"
                            : "border-[#2C2623]/75 bg-white hover:border-[#2C2623] hover:bg-[#FFF9EC] dark:border-stone-600 dark:bg-stone-900/80 dark:hover:bg-stone-800/80"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                              {entry.item.name}
                            </p>
                            <p className="text-muted-foreground font-mono text-[11px] font-semibold">
                              {entry.item.item_code} · {entry.item.room_code}
                              {entry.item.rack_location
                                ? ` · ${entry.item.rack_location}`
                                : ""}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full border border-[#2C2623]/40 bg-[#F5EFE6] px-2 py-0.5 font-mono text-[11px] font-extrabold text-[#2C2623] dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200">
                            {entry.item.stock_qty} {entry.item.unit_label}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {entry.isParent && (
                            <Badge
                              variant="outline"
                              className="rounded-full border-[1.5px] border-[#2C2623] bg-[#EDE9FE] px-2 py-0 text-[10px] font-extrabold text-[#4C1D95] dark:border-stone-500 dark:bg-violet-950/70 dark:text-violet-200"
                            >
                              <Layers className="mr-1 size-2.5" />
                              Parent · {entry.subItemCount} Varian
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`rounded-full border-[1.5px] border-[#2C2623] px-2 py-0 text-[10px] font-extrabold dark:border-stone-500 ${statusMeta.pillClass}`}
                          >
                            {statusMeta.label}
                          </Badge>
                          {entry.hasLocalDraft && (
                            <Badge
                              variant="outline"
                              className="rounded-full border-[1.5px] border-[#2C2623] bg-[#FFE4E6] px-2 py-0 text-[10px] font-extrabold text-[#9F1239] dark:border-rose-500 dark:bg-rose-950/70 dark:text-rose-200"
                            >
                              Draft lokal
                            </Badge>
                          )}
                        </div>

                        {entry.matchedSubItems.length > 0 && (
                          <p className="mt-1.5 text-[11px] font-semibold text-[#4C1D95] dark:text-violet-300">
                            Cocok varian:{" "}
                            {entry.matchedSubItems
                              .slice(0, 3)
                              .map((s) => s.name)
                              .join(", ")}
                            {entry.matchedSubItems.length > 3
                              ? ` +${entry.matchedSubItems.length - 3} lainnya`
                              : ""}
                          </p>
                        )}

                        {entry.matchedAliases.length > 0 && (
                          <p className="mt-1 font-mono text-[10px] font-bold text-[#9A3412] dark:text-amber-300">
                            Alias: {entry.matchedAliases[0].alias_code}
                            {entry.matchedAliases[0].legacy_name
                              ? ` (${entry.matchedAliases[0].legacy_name})`
                              : ""}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANE: Active Inspection Workspace */}
        <div className="min-w-0 space-y-4 lg:col-span-7 xl:col-span-8">
          {!workspace ? (
            <Card className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] p-6 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <KawaiiEmptyState
                mascot="clipboard"
                title="Siap Melakukan Stock Opname!"
                description="Scan stiker barcode / QR Code pada barang atau pilih salah satu barang dari daftar di sebelah kiri untuk mulai menghitung stok fisik."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <Button
                      type="button"
                      onClick={focusScannerInput}
                      className="rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#6EE7B7]"
                    >
                      <ScanLine className="size-4" />
                      Fokus Kotak Scan USB
                    </Button>
                    {!cameraActive && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={startCamera}
                        disabled={cameraBusy}
                        className="rounded-xl border-2 border-[#2C2623] bg-[#E0F2FE] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#BAE6FD]"
                      >
                        <Camera className="size-4" />
                        Buka Kamera
                      </Button>
                    )}
                  </div>
                }
                className="w-full border-0 bg-transparent shadow-none"
              />
            </Card>
          ) : workspace.mode === "PARENT" ? (
            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-gradient-to-r from-[#EDE9FE]/85 via-[#FFFDF7] to-[#FEF3C7]/75 pb-4 dark:border-stone-600 dark:from-violet-950/45 dark:via-card dark:to-amber-950/35">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="rounded-full border-2 border-[#2C2623] bg-[#DDD6FE] text-xs font-extrabold text-[#4C1D95] dark:border-stone-500 dark:bg-violet-950/70 dark:text-violet-100"
                      >
                        <Layers className="mr-1 size-3" />
                        Parent Item · {workspace.subItems.length} Sub-Item
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full border-2 border-[#2C2623] bg-white font-mono text-xs font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                      >
                        {workspace.parentItem.item_code}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] text-xs font-bold text-[#2C2623] dark:border-stone-500 dark:bg-sky-950/60 dark:text-sky-100"
                      >
                        {ASSET_TYPE_LABELS[workspace.parentItem.asset_type]}
                      </Badge>
                    </div>

                    <CardTitle className="text-xl font-black break-words text-[#2C2623] dark:text-stone-100">
                      {workspace.parentItem.name}
                    </CardTitle>
                    <CardDescription className="font-medium break-words text-[#2C2623]/75 dark:text-stone-300">
                      {workspace.parentItem.category} ·{" "}
                      {workspace.parentItem.room_code} (
                      {getLabel(workspace.parentItem.room_code)})
                      {workspace.parentItem.rack_location
                        ? ` · ${workspace.parentItem.rack_location}`
                        : ""}
                    </CardDescription>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="rounded-xl border-2 border-[#2C2623] bg-white font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <Link href={`/inventory/${workspace.parentItem.id}`}>
                      Detail
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-5">
                {workspace.resolvedAlias && (
                  <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100">
                    <Sparkles className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Barcode Lama / Gabungan Terdeteksi (
                      {ALIAS_REASON_LABELS[workspace.resolvedAlias.aliasReason]})
                    </AlertTitle>
                    <AlertDescription className="text-xs font-medium">
                      Kode lama{" "}
                      <span className="font-mono font-bold">
                        {workspace.resolvedAlias.aliasCode}
                      </span>
                      {workspace.resolvedAlias.legacyName
                        ? ` ("${workspace.resolvedAlias.legacyName}")`
                        : ""}{" "}
                      berhasil dialihkan ke Parent Item{" "}
                      <strong>{workspace.parentItem.name}</strong>.
                    </AlertDescription>
                  </Alert>
                )}

                {workspace.aliasesForTarget.length > 0 && !workspace.resolvedAlias && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#2C2623]/30 bg-[#FFF8EB] px-3 py-2 text-[11px] dark:border-stone-700 dark:bg-stone-900/50">
                    <span className="font-bold text-[#6B5E57] dark:text-stone-300">
                      Alias barcode terdaftar:
                    </span>
                    {workspace.aliasesForTarget.slice(0, 6).map((a) => (
                      <span
                        key={a.id}
                        className="rounded-full border border-[#2C2623]/40 bg-white px-2 py-0.5 font-mono text-[10px] font-bold dark:border-stone-600 dark:bg-stone-900"
                      >
                        {a.alias_code}
                        {a.legacy_name ? ` (${a.legacy_name})` : ""}
                      </span>
                    ))}
                    {workspace.aliasesForTarget.length > 6 && (
                      <span className="text-muted-foreground font-semibold">
                        +{workspace.aliasesForTarget.length - 6} lainnya
                      </span>
                    )}
                  </div>
                )}

                {/* Live Summary Strip */}
                {parentLiveMetrics && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border-2 border-[#2C2623] bg-[#E0F2FE]/60 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-sky-950/35">
                      <p className="text-[11px] font-extrabold tracking-wide text-[#5A4D46] uppercase dark:text-stone-300">
                        Total Stok Sistem
                      </p>
                      <p className="mt-1 font-mono text-2xl font-black text-[#2C2623] dark:text-white">
                        {parentLiveMetrics.totalSystemStock}{" "}
                        <span className="text-sm font-bold">
                          {workspace.parentItem.unit_label}
                        </span>
                      </p>
                      <p className="text-[11px] font-medium text-[#6B5E57] dark:text-stone-400">
                        Akumulasi {parentLiveMetrics.totalSubCount} sub-item
                      </p>
                    </div>

                    <div className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7]/75 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-amber-950/35">
                      <p className="text-[11px] font-extrabold tracking-wide text-[#5A4D46] uppercase dark:text-stone-300">
                        Total Stok Aktual
                      </p>
                      <p className="mt-1 font-mono text-2xl font-black text-[#2C2623] dark:text-white">
                        {parentLiveMetrics.filledCount > 0
                          ? parentLiveMetrics.totalActualStock
                          : "—"}{" "}
                        {parentLiveMetrics.filledCount > 0 && (
                          <span className="text-sm font-bold">
                            {workspace.parentItem.unit_label}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] font-semibold text-[#78350F] dark:text-amber-200">
                        {parentLiveMetrics.filledCount}/
                        {parentLiveMetrics.totalSubCount} sub-item terisi
                      </p>
                    </div>

                    <div className="rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5]/60 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-emerald-950/35">
                      <p className="text-[11px] font-extrabold tracking-wide text-[#5A4D46] uppercase dark:text-stone-300">
                        Total Selisih
                      </p>
                      {(() => {
                        const diffDisplay = formatDiffText(
                          parentLiveMetrics.totalDiff,
                        );
                        return (
                          <p
                            className={`mt-1 font-mono text-2xl font-black ${diffDisplay.className}`}
                          >
                            {diffDisplay.text}
                          </p>
                        );
                      })()}
                      <p className="text-[11px] font-medium text-[#6B5E57] dark:text-stone-400">
                        {parentLiveMetrics.allFilled
                          ? "Semua varian terhitung"
                          : "Menunggu semua varian diisi"}
                      </p>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={(e) => void handleSubmitOpname(e)}
                  className="space-y-4"
                >
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                      Daftar Sub-Item ({workspace.subItems.length} Varian)
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fillParentMatchingSystem}
                        disabled={isSubmitting || isSavingDraft}
                        className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#D1FAE5] text-xs font-extrabold text-[#14532D] hover:bg-[#A7F3D0]"
                      >
                        <CheckCircle2 className="size-3.5" />
                        Samakan dengan Sistem
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearParentInputs}
                        disabled={isSubmitting || isSavingDraft}
                        className="h-8 rounded-xl border-2 border-[#2C2623] bg-white text-xs font-bold text-[#2C2623] hover:bg-[#FFE4E6] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                      >
                        <Eraser className="size-3.5" />
                        Kosongkan Input
                      </Button>
                    </div>
                  </div>

                  {workspace.subItems.length === 0 ? (
                    <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF1F2] dark:border-rose-500 dark:bg-rose-950/40">
                      <AlertTriangle className="size-4" />
                      <AlertDescription className="text-xs font-semibold">
                        Parent Item ini belum memiliki Sub-Item aktif. Tambahkan Sub-Item dari halaman Inventaris terlebih dahulu.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="max-h-[480px] overflow-y-auto rounded-2xl border-2 border-[#2C2623] bg-white dark:border-stone-600 dark:bg-stone-950">
                      {/* Desktop & Tablet Table */}
                      <div className="hidden md:block">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-[#FEF3C7] dark:bg-stone-900">
                            <TableRow className="border-b-2 border-[#2C2623] dark:border-stone-600">
                              <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                                Sub-Item
                              </TableHead>
                              <TableHead className="w-28 text-right font-extrabold text-[#2C2623] dark:text-stone-100">
                                Stok Sistem
                              </TableHead>
                              <TableHead className="w-36 font-extrabold text-[#2C2623] dark:text-stone-100">
                                Stok Aktual
                              </TableHead>
                              <TableHead className="w-28 text-right font-extrabold text-[#2C2623] dark:text-stone-100">
                                Selisih
                              </TableHead>
                              <TableHead className="w-44 font-extrabold text-[#2C2623] dark:text-stone-100">
                                Kondisi
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {workspace.subItems.map((sub) => {
                              const entry = workspace.entries[sub.id];
                              const actualStr = entry?.actualStock ?? "";
                              const parsedActual = parseNonNegIntInput(actualStr);
                              const diff =
                                parsedActual !== null
                                  ? parsedActual - sub.stock_qty
                                  : null;
                              const diffFmt = formatDiffText(diff);
                              const isHighlighted =
                                workspace.highlightedSubItemId === sub.id;

                              return (
                                <TableRow
                                  key={sub.id}
                                  ref={isHighlighted ? highlightedRowRef : undefined}
                                  className={
                                    isHighlighted
                                      ? "bg-[#FEF3C7]/85 ring-2 ring-inset ring-[#F59E0B] dark:bg-amber-950/45"
                                      : undefined
                                  }
                                >
                                  <TableCell className="whitespace-normal">
                                    <div className="space-y-0.5">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-bold text-[#2C2623] dark:text-stone-100">
                                          {sub.name}
                                        </span>
                                        {isHighlighted && (
                                          <Badge
                                            variant="outline"
                                            className="rounded-full border border-[#2C2623] bg-[#FDE68A] px-1.5 py-0 text-[10px] font-extrabold text-[#2C2623]"
                                          >
                                            Barcode discan
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-muted-foreground font-mono text-[11px]">
                                        {sub.item_code}
                                      </p>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs font-bold">
                                    {sub.stock_qty} {sub.unit_label}
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      aria-label={`Stok aktual ${sub.name}`}
                                      placeholder="Isi angka…"
                                      value={actualStr}
                                      onChange={(e) =>
                                        updateParentEntry(sub.id, {
                                          actualStock: sanitizeDigitInput(
                                            e.target.value,
                                          ),
                                        })
                                      }
                                      disabled={isSubmitting}
                                      className={`h-9 rounded-xl border-2 bg-white text-right font-mono font-bold dark:bg-stone-900 ${
                                        actualStr.trim() === ""
                                          ? "border-amber-400 dark:border-amber-500"
                                          : "border-[#2C2623] dark:border-stone-500"
                                      }`}
                                    />
                                  </TableCell>
                                  <TableCell
                                    className={`text-right font-mono text-xs font-extrabold ${diffFmt.className}`}
                                  >
                                    {diffFmt.text}
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={entry?.condition ?? sub.condition}
                                      onValueChange={(v) =>
                                        updateParentEntry(sub.id, {
                                          condition: v as ItemCondition,
                                        })
                                      }
                                      disabled={
                                        isSubmitting ||
                                        (sub.condition === "DIHAPUSBUKU" &&
                                          !canApproveWriteoff)
                                      }
                                    >
                                      <SelectTrigger className="h-9 w-full rounded-xl border-2 border-[#2C2623] bg-white text-xs font-semibold dark:border-stone-500 dark:bg-stone-900">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(
                                          Object.keys(
                                            CONDITION_LABELS,
                                          ) as ItemCondition[]
                                        )
                                          .filter(
                                            (k) =>
                                              k !== "DIHAPUSBUKU" ||
                                              canApproveWriteoff ||
                                              sub.condition === "DIHAPUSBUKU",
                                          )
                                          .map((key) => (
                                            <SelectItem
                                              key={key}
                                              value={key}
                                              disabled={
                                                key === "DIHAPUSBUKU" &&
                                                !canApproveWriteoff
                                              }
                                            >
                                              {CONDITION_LABELS[key]}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile Cards */}
                      <div className="divide-y-2 divide-dashed divide-[#2C2623]/15 md:hidden dark:divide-stone-700">
                        {workspace.subItems.map((sub) => {
                          const entry = workspace.entries[sub.id];
                          const actualStr = entry?.actualStock ?? "";
                          const parsedActual = parseNonNegIntInput(actualStr);
                          const diff =
                            parsedActual !== null
                              ? parsedActual - sub.stock_qty
                              : null;
                          const diffFmt = formatDiffText(diff);
                          const isHighlighted =
                            workspace.highlightedSubItemId === sub.id;

                          return (
                            <div
                              key={sub.id}
                              ref={isHighlighted ? highlightedCardRef : undefined}
                              className={`space-y-2.5 p-3.5 ${
                                isHighlighted
                                  ? "bg-[#FEF3C7]/85 dark:bg-amber-950/45"
                                  : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                                      {sub.name}
                                    </p>
                                    {isHighlighted && (
                                      <Badge
                                        variant="outline"
                                        className="rounded-full border border-[#2C2623] bg-[#FDE68A] px-1.5 py-0 text-[10px] font-extrabold text-[#2C2623]"
                                      >
                                        Barcode discan
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-muted-foreground font-mono text-[11px]">
                                    {sub.item_code} · Sistem:{" "}
                                    <strong>
                                      {sub.stock_qty} {sub.unit_label}
                                    </strong>
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 font-mono text-xs font-extrabold ${diffFmt.className}`}
                                >
                                  {diffFmt.text}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[11px] font-bold">
                                    Stok Aktual ({sub.unit_label})
                                  </Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="Isi angka…"
                                    value={actualStr}
                                    onChange={(e) =>
                                      updateParentEntry(sub.id, {
                                        actualStock: sanitizeDigitInput(
                                          e.target.value,
                                        ),
                                      })
                                    }
                                    disabled={isSubmitting}
                                    className={`h-9 rounded-xl border-2 bg-white text-right font-mono font-bold dark:bg-stone-900 ${
                                      actualStr.trim() === ""
                                        ? "border-amber-400 dark:border-amber-500"
                                        : "border-[#2C2623] dark:border-stone-500"
                                    }`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px] font-bold">
                                    Kondisi
                                  </Label>
                                  <Select
                                    value={entry?.condition ?? sub.condition}
                                    onValueChange={(v) =>
                                      updateParentEntry(sub.id, {
                                        condition: v as ItemCondition,
                                      })
                                    }
                                    disabled={
                                      isSubmitting ||
                                      (sub.condition === "DIHAPUSBUKU" &&
                                        !canApproveWriteoff)
                                    }
                                  >
                                    <SelectTrigger className="h-9 w-full rounded-xl border-2 border-[#2C2623] bg-white text-xs font-semibold dark:border-stone-500 dark:bg-stone-900">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(
                                        Object.keys(
                                          CONDITION_LABELS,
                                        ) as ItemCondition[]
                                      )
                                        .filter(
                                          (k) =>
                                            k !== "DIHAPUSBUKU" ||
                                            canApproveWriteoff ||
                                            sub.condition === "DIHAPUSBUKU",
                                        )
                                        .map((key) => (
                                          <SelectItem key={key} value={key}>
                                            {CONDITION_LABELS[key]}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="parent-opname-notes" className="font-bold">
                      Catatan Opname Parent Item (Opsional)
                    </Label>
                    <Textarea
                      id="parent-opname-notes"
                      rows={2}
                      value={workspace.parentNotes}
                      onChange={(e) => updateParentNotes(e.target.value)}
                      placeholder="Catatan kondisi varian, lokasi rak, atau temuan selisih…"
                      disabled={isSubmitting}
                      className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                    />
                  </div>

                  {parentLiveMetrics && !parentLiveMetrics.allFilled && (
                    <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] py-2.5 text-[#2C2623] dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100">
                      <AlertTriangle className="size-4" />
                      <AlertDescription className="text-xs font-semibold">
                        Lengkapi stok aktual untuk{" "}
                        <strong>
                          {parentLiveMetrics.missingSubItems.length} Sub-Item
                        </strong>{" "}
                        yang masih kosong sebelum menekan &ldquo;Simpan Hasil Opname&rdquo; (atau simpan sebagai Draft sementara).
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleSaveDraft()}
                      disabled={
                        isSavingDraft ||
                        isSubmitting ||
                        workspace.subItems.length === 0
                      }
                      className="rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#FDE68A]"
                    >
                      {isSavingDraft ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Simpan Draft
                    </Button>

                    <Button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        isSavingDraft ||
                        !parentLiveMetrics?.allFilled
                      }
                      className="flex-1 rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#229c61] disabled:opacity-55 sm:flex-none sm:px-6"
                    >
                      {isSubmitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ClipboardCheck className="size-4" />
                      )}
                      Simpan Hasil Opname
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReturnToScanner}
                      disabled={isSubmitting}
                      className="rounded-xl border-2 border-[#2C2623] bg-white font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#E0F2FE] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                    >
                      <ScanLine className="size-4" />
                      Lanjut Scan Berikutnya
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            /* SIMPLE ITEM MODE — NEVER renders a sub-item list */
            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-gradient-to-r from-[#D1FAE5]/80 via-[#FFFDF7] to-[#E0F2FE]/75 pb-4 dark:border-stone-600 dark:from-emerald-950/45 dark:via-card dark:to-sky-950/35">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="rounded-full border-2 border-[#2C2623] bg-[#A7F3D0] text-xs font-extrabold text-[#14532D] dark:border-stone-500 dark:bg-emerald-950/70 dark:text-emerald-100"
                      >
                        <Boxes className="mr-1 size-3" />
                        Simple Item
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full border-2 border-[#2C2623] bg-white font-mono text-xs font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                      >
                        {workspace.item.item_code}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="rounded-full border-2 border-[#2C2623] bg-[#FFE4E6] text-xs font-bold text-[#2C2623] dark:border-stone-500 dark:bg-rose-950/60 dark:text-rose-100"
                      >
                        {ASSET_TYPE_LABELS[workspace.item.asset_type]}
                      </Badge>
                    </div>

                    <CardTitle className="text-xl font-black break-words text-[#2C2623] dark:text-stone-100">
                      {workspace.item.name}
                    </CardTitle>
                    <CardDescription className="font-medium break-words text-[#2C2623]/75 dark:text-stone-300">
                      {workspace.item.category} · {workspace.item.room_code} (
                      {getLabel(workspace.item.room_code)})
                      {workspace.item.rack_location
                        ? ` · ${workspace.item.rack_location}`
                        : ""}
                    </CardDescription>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="rounded-xl border-2 border-[#2C2623] bg-white font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <Link href={`/inventory/${workspace.item.id}`}>
                      Detail
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-5">
                {workspace.resolvedAlias && (
                  <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100">
                    <Sparkles className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Barcode Lama / Gabungan Terdeteksi (
                      {ALIAS_REASON_LABELS[workspace.resolvedAlias.aliasReason]})
                    </AlertTitle>
                    <AlertDescription className="text-xs font-medium">
                      Kode{" "}
                      <span className="font-mono font-bold">
                        {workspace.resolvedAlias.aliasCode}
                      </span>
                      {workspace.resolvedAlias.legacyName
                        ? ` ("${workspace.resolvedAlias.legacyName}")`
                        : ""}{" "}
                      otomatis dialihkan ke{" "}
                      <strong>{workspace.item.name}</strong> (
                      <span className="font-mono">{workspace.item.item_code}</span>
                      ).
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-stone-900/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConditionBadge condition={workspace.item.condition} />
                    <HygieneBadge
                      status={workspace.item.hygiene_status}
                      assetType={workspace.item.asset_type}
                      nextDue={workspace.item.next_sanitization_due}
                      todayWib={todayWib}
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-bold text-[#6B5E57] uppercase dark:text-stone-400">
                      Stok Sistem Saat Ini
                    </p>
                    <p className="font-mono text-lg font-black text-[#2C2623] dark:text-white">
                      {workspace.item.stock_qty} {workspace.item.unit_label}
                    </p>
                  </div>
                </div>

                {opnameByItemId.get(workspace.item.id)?.checked_at && (
                  <p className="text-muted-foreground text-xs font-medium">
                    Terakhir diperiksa pada sesi ini:{" "}
                    {formatDateWIB(
                      opnameByItemId.get(workspace.item.id)!.checked_at,
                      true,
                    )}
                  </p>
                )}

                <form
                  onSubmit={(e) => void handleSubmitOpname(e)}
                  className="space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label
                          htmlFor="simple-opname-stock"
                          className="font-bold"
                        >
                          Stok Aktual ({workspace.item.unit_label})
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateSimpleWorkspace({
                              actualStock: String(workspace.item.stock_qty),
                            })
                          }
                          className="h-7 rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] px-2.5 text-[11px] font-extrabold text-[#14532D] hover:bg-[#A7F3D0]"
                        >
                          Samakan ({workspace.item.stock_qty})
                        </Button>
                      </div>
                      <Input
                        id="simple-opname-stock"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Masukkan jumlah stok fisik…"
                        value={workspace.actualStock}
                        onChange={(e) =>
                          updateSimpleWorkspace({
                            actualStock: sanitizeDigitInput(e.target.value),
                          })
                        }
                        disabled={isSubmitting}
                        className={`rounded-xl border-2 bg-white font-mono text-base font-extrabold dark:bg-stone-900 ${
                          workspace.actualStock.trim() === ""
                            ? "border-amber-400 dark:border-amber-500"
                            : "border-[#2C2623] dark:border-stone-500"
                        }`}
                      />
                    </div>

                    <div className="flex flex-col justify-end rounded-2xl border-2 border-[#2C2623] bg-[#F5EFE6] px-4 py-3 dark:border-stone-600 dark:bg-stone-900/70">
                      <p className="text-[11px] font-extrabold tracking-wide text-[#5A4D46] uppercase dark:text-stone-300">
                        Selisih (Aktual - Sistem)
                      </p>
                      {(() => {
                        const diff =
                          simpleParsedStock !== null
                            ? simpleParsedStock - workspace.item.stock_qty
                            : null;
                        const diffFmt = formatDiffText(diff);
                        return (
                          <p
                            className={`font-mono text-2xl font-black ${diffFmt.className}`}
                          >
                            {diffFmt.text}
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  {workspace.item.total_parts > 1 && (
                    <div className="space-y-2 rounded-2xl border-2 border-[#2C2623] bg-[#FFF8EB] p-3.5 dark:border-stone-600 dark:bg-stone-900/50">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label
                          htmlFor="simple-opname-parts"
                          className="font-bold"
                        >
                          Kelengkapan Part ({workspace.item.unit_label}, maks{" "}
                          {workspace.item.total_parts})
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateSimpleWorkspace({
                              actualParts: workspace.item.total_parts,
                            })
                          }
                          className="h-7 rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] px-2.5 text-[11px] font-extrabold text-[#14532D] hover:bg-[#A7F3D0]"
                        >
                          Lengkap ({workspace.item.total_parts})
                        </Button>
                      </div>
                      <Input
                        id="simple-opname-parts"
                        type="number"
                        min={0}
                        max={workspace.item.total_parts}
                        value={workspace.actualParts}
                        onChange={(e) =>
                          updateSimpleWorkspace({
                            actualParts: Math.max(
                              0,
                              Math.min(
                                workspace.item.total_parts,
                                Math.trunc(Number(e.target.value) || 0),
                              ),
                            ),
                          })
                        }
                        disabled={isSubmitting}
                        className="rounded-xl border-2 border-[#2C2623] bg-white font-mono font-bold dark:border-stone-500 dark:bg-stone-900"
                      />
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-bold">Kondisi Barang</Label>
                      <Select
                        value={workspace.condition}
                        onValueChange={(v) =>
                          updateSimpleWorkspace({
                            condition: v as ItemCondition,
                          })
                        }
                        disabled={
                          isSubmitting ||
                          (workspace.item.condition === "DIHAPUSBUKU" &&
                            !canApproveWriteoff)
                        }
                      >
                        <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(CONDITION_LABELS) as ItemCondition[])
                            .filter(
                              (k) =>
                                k !== "DIHAPUSBUKU" ||
                                canApproveWriteoff ||
                                workspace.item.condition === "DIHAPUSBUKU",
                            )
                            .map((key) => (
                              <SelectItem
                                key={key}
                                value={key}
                                disabled={
                                  key === "DIHAPUSBUKU" && !canApproveWriteoff
                                }
                              >
                                {CONDITION_LABELS[key]}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-bold">Status Sanitasi</Label>
                      <Select
                        value={workspace.hygieneStatus}
                        onValueChange={(v) =>
                          updateSimpleWorkspace({
                            hygieneStatus: v as HygieneStatus,
                          })
                        }
                        disabled={isSubmitting}
                      >
                        <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(HYGIENE_LABELS) as HygieneStatus[]).map(
                            (key) => (
                              <SelectItem key={key} value={key}>
                                {HYGIENE_LABELS[key]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="simple-opname-notes" className="font-bold">
                      Catatan Stock Opname (Opsional)
                    </Label>
                    <Textarea
                      id="simple-opname-notes"
                      rows={2}
                      value={workspace.notes}
                      onChange={(e) =>
                        updateSimpleWorkspace({ notes: e.target.value })
                      }
                      placeholder="Catatan lokasi aktual, kondisi fisik, atau keterangan selisih…"
                      disabled={isSubmitting}
                      className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                    />
                  </div>

                  {simpleParsedStock === null && (
                    <Alert className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] py-2.5 text-[#2C2623] dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100">
                      <AlertTriangle className="size-4" />
                      <AlertDescription className="text-xs font-semibold">
                        Isi angka stok aktual (minimal 0) untuk mengaktifkan tombol &ldquo;Simpan Hasil Opname&rdquo;.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleSaveDraft()}
                      disabled={isSavingDraft || isSubmitting}
                      className="rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#FDE68A]"
                    >
                      {isSavingDraft ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Simpan Draft
                    </Button>

                    <Button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        isSavingDraft ||
                        simpleParsedStock === null
                      }
                      className="flex-1 rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#229c61] disabled:opacity-55 sm:flex-none sm:px-6"
                    >
                      {isSubmitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ClipboardCheck className="size-4" />
                      )}
                      Simpan Hasil Opname
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReturnToScanner}
                      disabled={isSubmitting}
                      className="rounded-xl border-2 border-[#2C2623] bg-white font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#E0F2FE] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                    >
                      <RotateCcw className="size-4" />
                      Kembali ke Scanner
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
