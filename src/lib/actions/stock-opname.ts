"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { validateLocationCode } from "@/lib/locations";
import { getMonthlyUpdatePeriod } from "@/lib/period";
import { can, type Role } from "@/lib/rbac";
import {
  isSafeHttpUrl,
  isValidUuid,
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeStoragePath,
  sanitizeTextInput,
} from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import type {
  BarcodeAliasReason,
  HygieneStatus,
  ItemBarcodeAlias,
  ItemCondition,
  ItemMaster,
  Json,
  OpnameItemStatus,
  StockOpnameItem,
  StockOpnameSession,
} from "@/types/database";
import type { ActionResult } from "./inventory";

export type ResolvedBarcodeAlias = {
  aliasCode: string;
  legacyName: string | null;
  aliasReason: BarcodeAliasReason;
};

export type OpnameSessionPayload = {
  session: StockOpnameSession;
  periodCode: string;
  periodLabel: string;
  roomCode: string | null;
  items: ItemMaster[];
  aliases: ItemBarcodeAlias[];
  opnameItems: StockOpnameItem[];
};

export type OpnameTargetLookupResult =
  | {
      mode: "PARENT";
      parentItem: ItemMaster;
      subItems: ItemMaster[];
      photoSignedUrl: string | null;
      highlightedSubItemId: string | null;
      resolvedAlias: ResolvedBarcodeAlias | null;
      aliasesForTarget: ItemBarcodeAlias[];
      parentOpnameItem: StockOpnameItem | null;
      subOpnameItems: StockOpnameItem[];
    }
  | {
      mode: "SIMPLE";
      item: ItemMaster;
      photoSignedUrl: string | null;
      resolvedAlias: ResolvedBarcodeAlias | null;
      aliasesForTarget: ItemBarcodeAlias[];
      opnameItem: StockOpnameItem | null;
    };

export type OpnameSearchGroupEntry = {
  item: ItemMaster;
  isParent: boolean;
  subItemCount: number;
  subItems: ItemMaster[];
  matchedSubItems: Array<{
    id: string;
    item_code: string;
    name: string;
  }>;
  matchedAliases: Array<{
    alias_code: string;
    legacy_name: string | null;
    alias_reason: BarcodeAliasReason;
    target_item_id: string;
  }>;
};

export type OpnameDraftEntryInput = {
  itemId: string;
  actualStock: number | null;
  actualParts?: number | null;
  condition?: ItemCondition | null;
  hygieneStatus?: HygieneStatus | null;
  notes?: string | null;
  status?: Extract<OpnameItemStatus, "SEDANG_DIPERIKSA" | "MENUNGGU_PENYIMPANAN">;
};

export type SubmitOpnameEntryInput = {
  itemId: string;
  actualStock: number;
  actualParts?: number | null;
  condition?: ItemCondition;
  hygieneStatus?: HygieneStatus;
  notes?: string | null;
};

export type SubmitOpnameResult = {
  rpcResult: Json;
  parentItem: ItemMaster | null;
  subItems: ItemMaster[];
  item: ItemMaster | null;
  opnameItems: StockOpnameItem[];
};

const VALID_CONDITIONS: readonly ItemCondition[] = [
  "BAIK",
  "PART_KURANG",
  "RUSAK_RINGAN",
  "RUSAK_BERAT",
  "DALAM_PERBAIKAN",
  "DIHAPUSBUKU",
];

const VALID_HYGIENE_STATUSES: readonly HygieneStatus[] = [
  "STERIL",
  "PERLU_DICUCI",
  "SEDANG_DISANITASI",
];

type ParsedToken =
  | { mode: "item_id"; value: string; display: string }
  | { mode: "short_slug"; slug: string; code: string; display: string }
  | { mode: "code"; value: string; display: string };

function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return segment.trim();
  }
}

function parseOpnameToken(rawInput: string): ParsedToken | null {
  const trimmed = sanitizeTextInput(rawInput, 500);
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    try {
      const parsed = new URL(trimmed, "https://starops.local");
      const codeParam = parsed.searchParams.get("code")?.trim();
      if (codeParam) {
        return { mode: "code", value: codeParam.toUpperCase(), display: codeParam };
      }

      const invMatch = parsed.pathname.match(
        /\/inventory\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i,
      );
      if (invMatch?.[1]) {
        return { mode: "item_id", value: invMatch[1].toLowerCase(), display: trimmed };
      }

      const shortMatch = parsed.pathname.match(/^\/s\/([^/]+)\/*$/i);
      if (shortMatch?.[1]) {
        const decoded = safeDecodeSegment(shortMatch[1]);
        if (decoded) {
          if (isValidUuid(String(decoded))) {
            return { mode: "item_id", value: decoded.toLowerCase(), display: decoded };
          }
          return {
            mode: "short_slug",
            slug: decoded.toLowerCase(),
            code: decoded.toUpperCase(),
            display: decoded,
          };
        }
      }

      const segments = parsed.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last) {
        const decodedLast = safeDecodeSegment(last);
        if (isValidUuid(String(decodedLast))) {
          return { mode: "item_id", value: decodedLast.toLowerCase(), display: trimmed };
        }
        return { mode: "code", value: decodedLast.toUpperCase(), display: decodedLast };
      }
    } catch {
      // Fallback to raw token handling
    }
  }

  if (isValidUuid(String(trimmed))) {
    return { mode: "item_id", value: trimmed.toLowerCase(), display: trimmed };
  }

  return { mode: "code", value: trimmed.toUpperCase(), display: trimmed };
}

function sanitizeItemForRole(item: ItemMaster, role: Role): ItemMaster {
  if (can(role, "inventory.view_valuation")) return item;
  return {
    ...item,
    purchase_price: 0,
    residual_value: 0,
    useful_life_months: null,
    acquisition_date: null,
  };
}

function sortItemsConsistently(items: ItemMaster[]): ItemMaster[] {
  return [...items].sort((a, b) => {
    const codeCmp = a.item_code.localeCompare(b.item_code, "id", { numeric: true });
    if (codeCmp !== 0) return codeCmp;
    return a.name.localeCompare(b.name, "id");
  });
}

async function resolvePhotoSignedUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  photoUrl: string | null,
): Promise<string | null> {
  if (!photoUrl) return null;
  if (/^https?:\/\//i.test(photoUrl)) {
    return isSafeHttpUrl(photoUrl) ? photoUrl : null;
  }
  const safePath = sanitizeStoragePath(photoUrl);
  if (!safePath) return null;
  const { data } = await supabase.storage
    .from("inventory-photos")
    .createSignedUrl(safePath, 3600);
  return data?.signedUrl ?? null;
}

function revalidateOpnamePaths(itemIds: string[]) {
  revalidatePath("/stock-opname");
  revalidatePath("/inventory");
  for (const id of itemIds) {
    if (isValidUuid(id)) {
      revalidatePath(`/inventory/${id}`);
    }
  }
  revalidatePath("/s", "layout");
  revalidatePath("/rooms");
  revalidatePath("/dashboard");
  revalidatePath("/audit-log");
  revalidatePath("/scan");
}

export async function getOrCreateActiveOpnameSessionAction(
  roomCode?: string | null,
): Promise<ActionResult<OpnameSessionPayload>> {
  const user = await requireAction("inventory.validate_opname");
  const supabase = await createClient();
  const period = getMonthlyUpdatePeriod();

  let targetRoom: string | null = null;
  if (typeof roomCode === "string" && roomCode.trim() && roomCode.trim().toUpperCase() !== "ALL") {
    const roomCheck = await validateLocationCode(supabase, roomCode.trim(), {
      allowDigital: false,
    });
    if (!roomCheck.ok) {
      return { ok: false, error: roomCheck.error };
    }
    targetRoom = roomCheck.location.code;
  }

  let sessionQuery = supabase
    .from("stock_opname_sessions")
    .select("*")
    .eq("period_ym", period.periodCode)
    .in("status", ["IN_PROGRESS", "DRAFT"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (targetRoom) {
    sessionQuery = sessionQuery.eq("room_code", targetRoom);
  } else {
    sessionQuery = sessionQuery.is("room_code", null);
  }

  const { data: existingSession, error: sessionLookupErr } = await sessionQuery.maybeSingle();
  if (sessionLookupErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        sessionLookupErr,
        "Gagal memuat sesi Stock Opname aktif.",
        "stock-opname/lookupSession",
      ),
    };
  }

  let activeSession: StockOpnameSession | null = existingSession ?? null;

  if (!activeSession) {
    const sessionTitle = targetRoom
      ? `Stock Opname ${period.periodLabel} (${targetRoom})`
      : `Stock Opname ${period.periodLabel}`;

    const { data: createdSession, error: createErr } = await supabase
      .from("stock_opname_sessions")
      .insert({
        period_ym: period.periodCode,
        room_code: targetRoom,
        title: sessionTitle,
        status: "IN_PROGRESS",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (createErr || !createdSession) {
      return {
        ok: false,
        error: sanitizeSafeError(
          createErr,
          "Gagal membuat sesi Stock Opname baru.",
          "stock-opname/createSession",
        ),
      };
    }

    activeSession = createdSession;
  } else if (activeSession.status === "DRAFT") {
    const { data: promoted } = await supabase
      .from("stock_opname_sessions")
      .update({ status: "IN_PROGRESS" })
      .eq("id", activeSession.id)
      .select("*")
      .maybeSingle();
    if (promoted) {
      activeSession = promoted;
    }
  }

  const [itemsRes, aliasesRes, opnameItemsRes] = await Promise.all([
    supabase
      .from("items_master")
      .select("*")
      .is("deleted_at", null)
      .order("item_code", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("item_barcode_aliases")
      .select("*")
      .order("alias_code", { ascending: true }),
    supabase
      .from("stock_opname_items")
      .select("*")
      .eq("session_id", activeSession.id),
  ]);

  if (itemsRes.error) {
    return {
      ok: false,
      error: sanitizeSafeError(
        itemsRes.error,
        "Gagal memuat daftar barang inventaris.",
        "stock-opname/loadItems",
      ),
    };
  }

  if (opnameItemsRes.error) {
    return {
      ok: false,
      error: sanitizeSafeError(
        opnameItemsRes.error,
        "Gagal memuat progres Stock Opname.",
        "stock-opname/loadOpnameItems",
      ),
    };
  }

  const allActiveItems = (itemsRes.data ?? []).map((item) =>
    sanitizeItemForRole(item, user.role),
  );

  // When roomCode is scoped, retain matching top-level items AND all their sub-items
  let scopedItems = allActiveItems;
  if (targetRoom) {
    const matchingTopIds = new Set(
      allActiveItems
        .filter((item) => item.parent_item_id === null && item.room_code === targetRoom)
        .map((item) => item.id),
    );
    scopedItems = allActiveItems.filter(
      (item) =>
        matchingTopIds.has(item.id) ||
        (item.parent_item_id !== null && matchingTopIds.has(item.parent_item_id)),
    );
  }

  const activeItemIds = new Set(scopedItems.map((i) => i.id));
  const activeAliases = (aliasesRes.data ?? []).filter((alias) =>
    activeItemIds.has(alias.target_item_id),
  );

  return {
    ok: true,
    data: {
      session: activeSession,
      periodCode: period.periodCode,
      periodLabel: period.periodLabel,
      roomCode: targetRoom,
      items: scopedItems,
      aliases: activeAliases,
      opnameItems: opnameItemsRes.data ?? [],
    },
  };
}

export async function lookupOpnameTargetAction(
  rawInput: string,
  sessionId?: string,
): Promise<ActionResult<OpnameTargetLookupResult>> {
  const user = await requireAction("inventory.validate_opname");
  const parsed = parseOpnameToken(rawInput);
  if (!parsed) {
    return { ok: false, error: "Masukkan atau scan kode barcode/QR terlebih dahulu." };
  }

  if (sessionId && !isValidUuid(sessionId)) {
    return { ok: false, error: "ID sesi Stock Opname tidak valid." };
  }

  const supabase = await createClient();
  let matchedItem: ItemMaster | null = null;
  let resolvedAlias: ResolvedBarcodeAlias | null = null;

  const resolveViaAliasRow = async (alias: ItemBarcodeAlias | null) => {
    if (!alias) return null;
    const { data: targetItem } = await supabase
      .from("items_master")
      .select("*")
      .eq("id", alias.target_item_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!targetItem) return null;
    resolvedAlias = {
      aliasCode: alias.alias_code,
      legacyName: alias.legacy_name,
      aliasReason: alias.alias_reason,
    };
    return targetItem;
  };

  if (parsed.mode === "item_id") {
    const { data: item } = await supabase
      .from("items_master")
      .select("*")
      .eq("id", parsed.value)
      .is("deleted_at", null)
      .maybeSingle();

    if (item) {
      matchedItem = item;
    } else {
      const { data: aliasByLegacyId } = await supabase
        .from("item_barcode_aliases")
        .select("*")
        .eq("legacy_item_id", parsed.value)
        .limit(1)
        .maybeSingle();

      matchedItem = await resolveViaAliasRow(aliasByLegacyId ?? null);

      if (!matchedItem) {
        const { data: deletedLegacy } = await supabase
          .from("items_master")
          .select("item_code")
          .eq("id", parsed.value)
          .maybeSingle();

        if (deletedLegacy?.item_code) {
          const { data: aliasByCode } = await supabase
            .from("item_barcode_aliases")
            .select("*")
            .eq("alias_code", deletedLegacy.item_code.toUpperCase())
            .maybeSingle();
          matchedItem = await resolveViaAliasRow(aliasByCode ?? null);
        }
      }
    }
  } else {
    const codeCandidate = parsed.mode === "short_slug" ? parsed.code : parsed.value;
    const slugCandidate =
      parsed.mode === "short_slug" ? parsed.slug : parsed.value.toLowerCase();

    const { data: directItem } = await supabase
      .from("items_master")
      .select("*")
      .eq("item_code", codeCandidate)
      .is("deleted_at", null)
      .maybeSingle();

    matchedItem = directItem ?? null;

    if (
      !matchedItem &&
      slugCandidate &&
      (parsed.mode === "short_slug" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugCandidate))
    ) {
      const { data: shortLink } = await supabase
        .from("share_short_links")
        .select("target_type, target_id")
        .eq("slug", slugCandidate)
        .eq("target_type", "ITEM")
        .maybeSingle();

      if (shortLink?.target_id) {
        const { data: linkedItem } = await supabase
          .from("items_master")
          .select("*")
          .eq("id", shortLink.target_id)
          .is("deleted_at", null)
          .maybeSingle();

        if (linkedItem) {
          matchedItem = linkedItem;
        } else {
          const { data: aliasByLegacy } = await supabase
            .from("item_barcode_aliases")
            .select("*")
            .eq("legacy_item_id", shortLink.target_id)
            .limit(1)
            .maybeSingle();
          matchedItem = await resolveViaAliasRow(aliasByLegacy ?? null);
        }
      }
    }

    if (!matchedItem) {
      const { data: aliasRow } = await supabase
        .from("item_barcode_aliases")
        .select("*")
        .eq("alias_code", codeCandidate)
        .maybeSingle();

      matchedItem = await resolveViaAliasRow(aliasRow ?? null);
    }
  }

  if (!matchedItem) {
    return {
      ok: false,
      error: `Kode "${parsed.display.slice(0, 80)}" tidak ditemukan pada barang aktif maupun alias barcode lama.`,
    };
  }

  // If scanned item is a Sub-Item, automatically open its Parent Item view with all Sub-Items
  let highlightedSubItemId: string | null = null;
  let parentItem: ItemMaster | null = null;

  if (matchedItem.parent_item_id !== null) {
    highlightedSubItemId = matchedItem.id;
    const { data: fetchedParent } = await supabase
      .from("items_master")
      .select("*")
      .eq("id", matchedItem.parent_item_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!fetchedParent) {
      return {
        ok: false,
        error: `Parent Item untuk "${matchedItem.name}" tidak ditemukan atau sudah dihapus.`,
      };
    }
    parentItem = fetchedParent;
  } else {
    // Check if matchedItem has active children or is marked has_sub_items
    const { data: children } = await supabase
      .from("items_master")
      .select("*")
      .eq("parent_item_id", matchedItem.id)
      .is("deleted_at", null)
      .order("item_code", { ascending: true })
      .order("name", { ascending: true });

    if (matchedItem.has_sub_items || (children && children.length > 0)) {
      const sortedChildren = sortItemsConsistently(children ?? []).map((sub) =>
        sanitizeItemForRole(sub, user.role),
      );
      const sanitizedParent = sanitizeItemForRole(matchedItem, user.role);
      const targetIds = [sanitizedParent.id, ...sortedChildren.map((s) => s.id)];

      const [photoSignedUrl, aliasesRes, opnameRes] = await Promise.all([
        resolvePhotoSignedUrl(supabase, sanitizedParent.photo_url),
        supabase
          .from("item_barcode_aliases")
          .select("*")
          .in("target_item_id", targetIds)
          .order("alias_code", { ascending: true }),
        sessionId
          ? supabase
              .from("stock_opname_items")
              .select("*")
              .eq("session_id", sessionId)
              .in("item_id", targetIds)
          : Promise.resolve({ data: [] as StockOpnameItem[] }),
      ]);

      const opnameRows = opnameRes.data ?? [];
      const parentOpnameItem =
        opnameRows.find((r) => r.item_id === sanitizedParent.id) ?? null;
      const subOpnameItems = opnameRows.filter((r) => r.item_id !== sanitizedParent.id);

      return {
        ok: true,
        data: {
          mode: "PARENT",
          parentItem: sanitizedParent,
          subItems: sortedChildren,
          photoSignedUrl,
          highlightedSubItemId: null,
          resolvedAlias,
          aliasesForTarget: aliasesRes.data ?? [],
          parentOpnameItem,
          subOpnameItems,
        },
      };
    }
  }

  if (parentItem) {
    const { data: children } = await supabase
      .from("items_master")
      .select("*")
      .eq("parent_item_id", parentItem.id)
      .is("deleted_at", null)
      .order("item_code", { ascending: true })
      .order("name", { ascending: true });

    const sortedChildren = sortItemsConsistently(children ?? []).map((sub) =>
      sanitizeItemForRole(sub, user.role),
    );
    const sanitizedParent = sanitizeItemForRole(parentItem, user.role);
    const targetIds = [sanitizedParent.id, ...sortedChildren.map((s) => s.id)];

    const [photoSignedUrl, aliasesRes, opnameRes] = await Promise.all([
      resolvePhotoSignedUrl(supabase, sanitizedParent.photo_url),
      supabase
        .from("item_barcode_aliases")
        .select("*")
        .in("target_item_id", targetIds)
        .order("alias_code", { ascending: true }),
      sessionId
        ? supabase
            .from("stock_opname_items")
            .select("*")
            .eq("session_id", sessionId)
            .in("item_id", targetIds)
        : Promise.resolve({ data: [] as StockOpnameItem[] }),
    ]);

    const opnameRows = opnameRes.data ?? [];
    const parentOpnameItem =
      opnameRows.find((r) => r.item_id === sanitizedParent.id) ?? null;
    const subOpnameItems = opnameRows.filter((r) => r.item_id !== sanitizedParent.id);

    return {
      ok: true,
      data: {
        mode: "PARENT",
        parentItem: sanitizedParent,
        subItems: sortedChildren,
        photoSignedUrl,
        highlightedSubItemId,
        resolvedAlias,
        aliasesForTarget: aliasesRes.data ?? [],
        parentOpnameItem,
        subOpnameItems,
      },
    };
  }

  // Simple Item mode (no sub-items)
  const sanitizedSimple = sanitizeItemForRole(matchedItem, user.role);
  const [photoSignedUrl, aliasesRes, opnameRes] = await Promise.all([
    resolvePhotoSignedUrl(supabase, sanitizedSimple.photo_url),
    supabase
      .from("item_barcode_aliases")
      .select("*")
      .eq("target_item_id", sanitizedSimple.id)
      .order("alias_code", { ascending: true }),
    sessionId
      ? supabase
          .from("stock_opname_items")
          .select("*")
          .eq("session_id", sessionId)
          .eq("item_id", sanitizedSimple.id)
          .maybeSingle()
      : Promise.resolve({ data: null as StockOpnameItem | null }),
  ]);

  return {
    ok: true,
    data: {
      mode: "SIMPLE",
      item: sanitizedSimple,
      photoSignedUrl,
      resolvedAlias,
      aliasesForTarget: aliasesRes.data ?? [],
      opnameItem: opnameRes.data ?? null,
    },
  };
}

export async function searchOpnameItemsAction(
  query: string,
  roomCode?: string | null,
): Promise<ActionResult<OpnameSearchGroupEntry[]>> {
  const user = await requireAction("inventory.validate_opname");
  const cleanQuery = sanitizeTextInput(query, 120).toLowerCase();
  const supabase = await createClient();

  let normalizedRoom: string | null = null;
  if (typeof roomCode === "string" && roomCode.trim() && roomCode.trim().toUpperCase() !== "ALL") {
    const roomCheck = await validateLocationCode(supabase, roomCode.trim(), {
      allowDigital: false,
    });
    if (!roomCheck.ok) {
      return { ok: false, error: roomCheck.error };
    }
    normalizedRoom = roomCheck.location.code;
  }

  const [itemsRes, aliasesRes] = await Promise.all([
    supabase
      .from("items_master")
      .select("*")
      .is("deleted_at", null)
      .order("item_code", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("item_barcode_aliases")
      .select("*")
      .order("alias_code", { ascending: true }),
  ]);

  if (itemsRes.error) {
    return {
      ok: false,
      error: sanitizeSafeError(
        itemsRes.error,
        "Gagal mencari barang inventaris.",
        "stock-opname/search",
      ),
    };
  }

  const allItems = (itemsRes.data ?? []).map((item) =>
    sanitizeItemForRole(item, user.role),
  );
  const topLevelItems = allItems.filter((item) => item.parent_item_id === null);
  const childrenByParent = new Map<string, ItemMaster[]>();
  for (const item of allItems) {
    if (item.parent_item_id) {
      const list = childrenByParent.get(item.parent_item_id) ?? [];
      list.push(item);
      childrenByParent.set(item.parent_item_id, list);
    }
  }

  const aliasesByTarget = new Map<string, ItemBarcodeAlias[]>();
  for (const alias of aliasesRes.data ?? []) {
    const list = aliasesByTarget.get(alias.target_item_id) ?? [];
    list.push(alias);
    aliasesByTarget.set(alias.target_item_id, list);
  }

  const matchesItemText = (item: ItemMaster, q: string) =>
    item.name.toLowerCase().includes(q) ||
    item.item_code.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q) ||
    (item.rack_location?.toLowerCase().includes(q) ?? false);

  const matchesAliasText = (alias: ItemBarcodeAlias, q: string) =>
    alias.alias_code.toLowerCase().includes(q) ||
    (alias.legacy_name?.toLowerCase().includes(q) ?? false);

  const results: OpnameSearchGroupEntry[] = [];

  for (const top of topLevelItems) {
    if (normalizedRoom && top.room_code !== normalizedRoom) {
      continue;
    }

    const subItems = sortItemsConsistently(childrenByParent.get(top.id) ?? []);
    const isParent = top.has_sub_items || subItems.length > 0;

    if (!cleanQuery) {
      results.push({
        item: top,
        isParent,
        subItemCount: subItems.length,
        subItems,
        matchedSubItems: [],
        matchedAliases: [],
      });
      continue;
    }

    const topMatched = matchesItemText(top, cleanQuery);
    const matchedAliases: OpnameSearchGroupEntry["matchedAliases"] = [];

    for (const alias of aliasesByTarget.get(top.id) ?? []) {
      if (matchesAliasText(alias, cleanQuery)) {
        matchedAliases.push({
          alias_code: alias.alias_code,
          legacy_name: alias.legacy_name,
          alias_reason: alias.alias_reason,
          target_item_id: alias.target_item_id,
        });
      }
    }

    const matchedSubItems: OpnameSearchGroupEntry["matchedSubItems"] = [];
    for (const sub of subItems) {
      let subMatched = matchesItemText(sub, cleanQuery);
      for (const alias of aliasesByTarget.get(sub.id) ?? []) {
        if (matchesAliasText(alias, cleanQuery)) {
          subMatched = true;
          matchedAliases.push({
            alias_code: alias.alias_code,
            legacy_name: alias.legacy_name,
            alias_reason: alias.alias_reason,
            target_item_id: alias.target_item_id,
          });
        }
      }
      if (subMatched) {
        matchedSubItems.push({
          id: sub.id,
          item_code: sub.item_code,
          name: sub.name,
        });
      }
    }

    if (topMatched || matchedSubItems.length > 0 || matchedAliases.length > 0) {
      results.push({
        item: top,
        isParent,
        subItemCount: subItems.length,
        subItems,
        matchedSubItems,
        matchedAliases,
      });
    }
  }

  return { ok: true, data: results };
}

export async function saveOpnameDraftAction(input: {
  sessionId: string;
  parentItemId?: string | null;
  entries: OpnameDraftEntryInput[];
  parentNotes?: string | null;
  status?: Extract<OpnameItemStatus, "SEDANG_DIPERIKSA" | "MENUNGGU_PENYIMPANAN">;
}): Promise<ActionResult<{ savedItems: StockOpnameItem[] }>> {
  const user = await requireAction("inventory.validate_opname");
  if (!isValidUuid(input.sessionId)) {
    return { ok: false, error: "ID sesi Stock Opname tidak valid." };
  }
  if (input.parentItemId && !isValidUuid(input.parentItemId)) {
    return { ok: false, error: "ID Parent Item tidak valid." };
  }
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    return { ok: false, error: "Tidak ada data draft yang dikirim." };
  }

  const supabase = await createClient();
  const { data: sessionRow, error: sessionErr } = await supabase
    .from("stock_opname_sessions")
    .select("id")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionErr || !sessionRow) {
    return { ok: false, error: "Sesi Stock Opname tidak ditemukan." };
  }

  const entryIds = Array.from(new Set(input.entries.map((e) => e.itemId)));
  if (entryIds.some((id) => !isValidUuid(id))) {
    return { ok: false, error: "Terdapat ID barang yang tidak valid pada draft." };
  }

  const { data: dbItems, error: itemsErr } = await supabase
    .from("items_master")
    .select("*")
    .in("id", entryIds)
    .is("deleted_at", null);

  if (itemsErr || !dbItems || dbItems.length === 0) {
    return { ok: false, error: "Barang yang akan disimpan draftnya tidak ditemukan." };
  }

  const itemMap = new Map(dbItems.map((i) => [i.id, i]));
  const nowIso = new Date().toISOString();
  const rowsToUpsert: Array<{
    session_id: string;
    item_id: string;
    parent_item_id: string | null;
    status: OpnameItemStatus;
    system_stock: number;
    actual_stock: number | null;
    system_parts: number;
    actual_parts: number | null;
    condition: ItemCondition | null;
    hygiene_status: HygieneStatus | null;
    notes: string | null;
    checked_by: string;
    checked_at: string;
  }> = [];

  for (const entry of input.entries) {
    const dbItem = itemMap.get(entry.itemId);
    if (!dbItem) {
      return { ok: false, error: "Salah satu barang tidak ditemukan atau sudah dihapus." };
    }
    if (input.parentItemId && dbItem.parent_item_id !== input.parentItemId) {
      return {
        ok: false,
        error: `Sub-Item "${dbItem.name}" tidak termasuk dalam Parent Item yang sedang diperiksa.`,
      };
    }

    // Preserve null strictly — never coerce null/empty to 0
    let validatedStock: number | null = null;
    if (entry.actualStock !== null && entry.actualStock !== undefined) {
      if (
        typeof entry.actualStock !== "number" ||
        !Number.isInteger(entry.actualStock) ||
        entry.actualStock < 0
      ) {
        return {
          ok: false,
          error: `Stok aktual untuk "${dbItem.name}" harus berupa angka bulat >= 0.`,
        };
      }
      validatedStock = entry.actualStock;
    }

    let validatedParts: number | null = null;
    if (entry.actualParts !== null && entry.actualParts !== undefined) {
      if (
        typeof entry.actualParts !== "number" ||
        !Number.isInteger(entry.actualParts) ||
        entry.actualParts < 0 ||
        entry.actualParts > dbItem.total_parts
      ) {
        return {
          ok: false,
          error: `Jumlah part untuk "${dbItem.name}" harus antara 0 dan ${dbItem.total_parts}.`,
        };
      }
      validatedParts = entry.actualParts;
    }

    let validatedCondition: ItemCondition | null = null;
    if (entry.condition) {
      if (!VALID_CONDITIONS.includes(entry.condition)) {
        return { ok: false, error: "Kondisi barang pada draft tidak valid." };
      }
      if (
        entry.condition === "DIHAPUSBUKU" &&
        dbItem.condition !== "DIHAPUSBUKU" &&
        !can(user.role, "writeoff.approve")
      ) {
        return {
          ok: false,
          error: "Hanya Owner yang dapat menandai kondisi Dihapusbuku.",
        };
      }
      validatedCondition = entry.condition;
    }

    let validatedHygiene: HygieneStatus | null = null;
    if (entry.hygieneStatus) {
      if (!VALID_HYGIENE_STATUSES.includes(entry.hygieneStatus)) {
        return { ok: false, error: "Status sanitasi pada draft tidak valid." };
      }
      validatedHygiene = entry.hygieneStatus;
    }

    const rowStatus: OpnameItemStatus =
      entry.status ??
      input.status ??
      (validatedStock !== null ? "MENUNGGU_PENYIMPANAN" : "SEDANG_DIPERIKSA");

    rowsToUpsert.push({
      session_id: input.sessionId,
      item_id: dbItem.id,
      parent_item_id: dbItem.parent_item_id,
      status: rowStatus,
      system_stock: dbItem.stock_qty,
      actual_stock: validatedStock,
      system_parts: dbItem.total_parts,
      actual_parts: validatedParts,
      condition: validatedCondition,
      hygiene_status: validatedHygiene,
      notes: sanitizeOptionalText(entry.notes, 1000, { multiline: true }),
      checked_by: user.id,
      checked_at: nowIso,
    });
  }

  if (input.parentItemId) {
    const { data: parentItem } = await supabase
      .from("items_master")
      .select("*")
      .eq("id", input.parentItemId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!parentItem) {
      return { ok: false, error: "Parent Item tidak ditemukan." };
    }

    const allFilled = rowsToUpsert.every((r) => r.actual_stock !== null);
    const anyFilled = rowsToUpsert.some((r) => r.actual_stock !== null);
    const parentActualSum = allFilled
      ? rowsToUpsert.reduce((sum, r) => {
          const itemRef = itemMap.get(r.item_id);
          const effectiveCondition = r.condition ?? itemRef?.condition;
          if (effectiveCondition === "DIHAPUSBUKU") return sum;
          return sum + (r.actual_stock ?? 0);
        }, 0)
      : null;

    const parentStatus: OpnameItemStatus =
      input.status ?? (anyFilled ? "MENUNGGU_PENYIMPANAN" : "SEDANG_DIPERIKSA");

    rowsToUpsert.push({
      session_id: input.sessionId,
      item_id: parentItem.id,
      parent_item_id: null,
      status: parentStatus,
      system_stock: parentItem.stock_qty,
      actual_stock: parentActualSum,
      system_parts: parentItem.total_parts,
      actual_parts: parentItem.current_parts,
      condition: null,
      hygiene_status: null,
      notes: sanitizeOptionalText(input.parentNotes, 1000, { multiline: true }),
      checked_by: user.id,
      checked_at: nowIso,
    });
  }

  const { data: savedRows, error: upsertErr } = await supabase
    .from("stock_opname_items")
    .upsert(rowsToUpsert, { onConflict: "session_id,item_id" })
    .select("*");

  if (upsertErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        upsertErr,
        "Gagal menyimpan draft Stock Opname.",
        "stock-opname/saveDraft",
      ),
    };
  }

  revalidatePath("/stock-opname");
  return {
    ok: true,
    data: { savedItems: savedRows ?? [] },
    message: "Draft Stock Opname tersimpan aman.",
  };
}

export async function submitStockOpnameAction(input: {
  sessionId: string;
  parentItemId?: string | null;
  entries: SubmitOpnameEntryInput[];
  notes?: string | null;
}): Promise<ActionResult<SubmitOpnameResult>> {
  const user = await requireAction("inventory.validate_opname");
  if (!isValidUuid(input.sessionId)) {
    return { ok: false, error: "ID sesi Stock Opname tidak valid." };
  }
  if (input.parentItemId && !isValidUuid(input.parentItemId)) {
    return { ok: false, error: "ID Parent Item tidak valid." };
  }
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    return {
      ok: false,
      error: "Minimal satu item harus diisi sebelum menyimpan hasil Stock Opname.",
    };
  }

  const entryIds = Array.from(new Set(input.entries.map((e) => e.itemId)));
  if (entryIds.length !== input.entries.length || entryIds.some((id) => !isValidUuid(id))) {
    return { ok: false, error: "Daftar ID item opname tidak valid atau terduplikasi." };
  }

  const supabase = await createClient();

  if (input.parentItemId) {
    const { data: activeChildren, error: childErr } = await supabase
      .from("items_master")
      .select("id, name")
      .eq("parent_item_id", input.parentItemId)
      .is("deleted_at", null);

    if (childErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          childErr,
          "Gagal memverifikasi daftar Sub-Item.",
          "stock-opname/verifySubItems",
        ),
      };
    }

    const expectedIds = new Set((activeChildren ?? []).map((c) => c.id));
    if (expectedIds.size === 0) {
      return {
        ok: false,
        error: "Parent Item belum memiliki Sub-Item aktif untuk diopname.",
      };
    }

    const submittedIds = new Set(entryIds);
    const missing = (activeChildren ?? []).filter((c) => !submittedIds.has(c.id));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Semua Sub-Item wajib diisi sebelum menyimpan (${missing.length} Sub-Item belum lengkap, misalnya "${missing[0].name}").`,
      };
    }
  }

  const { data: dbItems, error: dbItemsErr } = await supabase
    .from("items_master")
    .select("*")
    .in("id", entryIds)
    .is("deleted_at", null);

  if (dbItemsErr || !dbItems || dbItems.length !== entryIds.length) {
    return {
      ok: false,
      error: "Sebagian barang tidak ditemukan atau sudah dihapus.",
    };
  }

  const dbItemMap = new Map(dbItems.map((i) => [i.id, i]));
  const rpcEntries: Array<{
    item_id: string;
    actual_stock: number;
    actual_parts?: number;
    condition?: ItemCondition;
    hygiene_status?: HygieneStatus;
    notes?: string;
  }> = [];

  for (const entry of input.entries) {
    const dbItem = dbItemMap.get(entry.itemId);
    if (!dbItem) {
      return { ok: false, error: "Barang tidak ditemukan." };
    }
    if (dbItem.has_sub_items) {
      return {
        ok: false,
        error: `Stok Parent Item "${dbItem.name}" dihitung otomatis dari Sub-Item dan tidak diisi langsung.`,
      };
    }

    if (
      entry.actualStock === null ||
      entry.actualStock === undefined ||
      typeof entry.actualStock !== "number" ||
      !Number.isInteger(entry.actualStock) ||
      entry.actualStock < 0
    ) {
      return {
        ok: false,
        error: `Stok aktual untuk "${dbItem.name}" wajib berupa angka bulat >= 0 (tidak boleh kosong).`,
      };
    }

    const payloadEntry: (typeof rpcEntries)[number] = {
      item_id: dbItem.id,
      actual_stock: entry.actualStock,
    };

    if (entry.actualParts !== null && entry.actualParts !== undefined) {
      if (
        typeof entry.actualParts !== "number" ||
        !Number.isInteger(entry.actualParts) ||
        entry.actualParts < 0 ||
        entry.actualParts > dbItem.total_parts
      ) {
        return {
          ok: false,
          error: `Jumlah part untuk "${dbItem.name}" harus antara 0 dan ${dbItem.total_parts}.`,
        };
      }
      payloadEntry.actual_parts = entry.actualParts;
    }

    if (entry.condition) {
      if (!VALID_CONDITIONS.includes(entry.condition)) {
        return { ok: false, error: `Kondisi barang "${dbItem.name}" tidak valid.` };
      }
      if (
        entry.condition !== dbItem.condition &&
        (entry.condition === "DIHAPUSBUKU" || dbItem.condition === "DIHAPUSBUKU") &&
        !can(user.role, "writeoff.approve")
      ) {
        return {
          ok: false,
          error: "Hanya Owner yang dapat menetapkan atau mengubah status Dihapusbuku.",
        };
      }
      payloadEntry.condition = entry.condition;
    }

    if (entry.hygieneStatus) {
      if (!VALID_HYGIENE_STATUSES.includes(entry.hygieneStatus)) {
        return { ok: false, error: `Status sanitasi "${dbItem.name}" tidak valid.` };
      }
      payloadEntry.hygiene_status = entry.hygieneStatus;
    }

    const cleanEntryNote = sanitizeOptionalText(entry.notes, 1000, { multiline: true });
    if (cleanEntryNote) {
      payloadEntry.notes = cleanEntryNote;
    }

    rpcEntries.push(payloadEntry);
  }

  const cleanBatchNotes = sanitizeOptionalText(input.notes, 1000, { multiline: true });

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "submit_stock_opname_batch",
    {
      p_session_id: input.sessionId,
      p_entries: rpcEntries as unknown as Json,
      p_parent_item_id: input.parentItemId ?? null,
      p_notes: cleanBatchNotes,
    },
  );

  if (rpcErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        rpcErr,
        "Gagal menyimpan hasil Stock Opname ke database.",
        "stock-opname/submitBatch",
      ),
    };
  }

  const idsToFetch = input.parentItemId
    ? [input.parentItemId, ...entryIds]
    : [...entryIds];

  const [updatedItemsRes, updatedOpnameRes] = await Promise.all([
    supabase
      .from("items_master")
      .select("*")
      .in("id", idsToFetch)
      .is("deleted_at", null),
    supabase
      .from("stock_opname_items")
      .select("*")
      .eq("session_id", input.sessionId)
      .in("item_id", idsToFetch),
  ]);

  const sanitizedItems = (updatedItemsRes.data ?? []).map((item) =>
    sanitizeItemForRole(item, user.role),
  );

  const parentItem = input.parentItemId
    ? sanitizedItems.find((i) => i.id === input.parentItemId) ?? null
    : null;
  const subItems = input.parentItemId
    ? sortItemsConsistently(
        sanitizedItems.filter((i) => i.parent_item_id === input.parentItemId),
      )
    : [];
  const simpleItem = !input.parentItemId
    ? sanitizedItems.find((i) => i.id === entryIds[0]) ?? null
    : null;

  revalidateOpnamePaths(idsToFetch);

  return {
    ok: true,
    data: {
      rpcResult: (rpcData ?? null) as Json,
      parentItem,
      subItems,
      item: simpleItem,
      opnameItems: updatedOpnameRes.data ?? [],
    },
    message: input.parentItemId
      ? `Stock Opname ${parentItem?.name ?? "Parent Item"} (${subItems.length} Sub-Item) berhasil disimpan.`
      : `Stock Opname ${simpleItem?.item_code ?? "barang"} berhasil disimpan.`,
  };
}

/**
 * Convenience action for quick QR / Detail / Scan stock updates that works identically
 * for Parent Items (updating all Sub-Items atomically + recalculating Parent total)
 * and Simple Items, while syncing seamlessly with the active monthly Stock Opname session.
 */
export async function quickUpdateItemStockHierarchyAction(input: {
  targetItemId: string;
  entries: SubmitOpnameEntryInput[];
  notes?: string | null;
}): Promise<ActionResult<SubmitOpnameResult>> {
  await requireAction("inventory.validate_opname");
  if (!isValidUuid(input.targetItemId)) {
    return { ok: false, error: "ID barang tidak valid." };
  }
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    return {
      ok: false,
      error: "Minimal satu baris stok wajib diisi sebelum menyimpan.",
    };
  }

  const supabase = await createClient();
  const { data: targetItem, error: targetErr } = await supabase
    .from("items_master")
    .select("id, parent_item_id, has_sub_items")
    .eq("id", input.targetItemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (targetErr || !targetItem) {
    return { ok: false, error: "Barang tidak ditemukan atau sudah dihapus." };
  }

  let effectiveParentId: string | null = null;
  if (targetItem.parent_item_id) {
    effectiveParentId = targetItem.parent_item_id;
  } else if (targetItem.has_sub_items) {
    effectiveParentId = targetItem.id;
  } else {
    const { count } = await supabase
      .from("items_master")
      .select("id", { count: "exact", head: true })
      .eq("parent_item_id", targetItem.id)
      .is("deleted_at", null);
    if ((count ?? 0) > 0) {
      effectiveParentId = targetItem.id;
    }
  }

  const sessionRes = await getOrCreateActiveOpnameSessionAction(null);
  if (!sessionRes.ok) {
    return { ok: false, error: sessionRes.error };
  }

  return submitStockOpnameAction({
    sessionId: sessionRes.data.session.id,
    parentItemId: effectiveParentId,
    entries: input.entries,
    notes: input.notes ?? null,
  });
}
