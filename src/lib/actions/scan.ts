"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
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
  BorrowTransaction,
  HygieneStatus,
  ItemCondition,
  ItemKit,
  ItemMaster,
  LocationCode,
} from "@/types/database";
import type { ActionResult } from "./inventory";

export type BorrowHistoryEntry = BorrowTransaction & {
  borrower_name: string | null;
  returned_by_name: string | null;
};

export type ScanLookupResult =
  | {
      kind: "item";
      item: ItemMaster;
      photoSignedUrl: string | null;
      activeBorrow: BorrowHistoryEntry | null;
      recentBorrows: BorrowHistoryEntry[];
      canReturnActiveBorrow: boolean;
    }
  | {
      kind: "kit";
      kit: ItemKit;
      bundledItems: ItemMaster[];
      activeBorrow: BorrowHistoryEntry | null;
      recentBorrows: BorrowHistoryEntry[];
      canReturnActiveBorrow: boolean;
    };

const VALID_LOCATIONS: readonly LocationCode[] = [
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "ADM",
  "FO",
  "GDG",
  "L01",
  "L02",
  "L03",
  "L04",
  "DIG",
];

const VALID_HYGIENE_STATUSES: readonly HygieneStatus[] = [
  "STERIL",
  "PERLU_DICUCI",
  "SEDANG_DISANITASI",
];

const VALID_CONDITIONS: readonly ItemCondition[] = [
  "BAIK",
  "PART_KURANG",
  "RUSAK_RINGAN",
  "RUSAK_BERAT",
  "DALAM_PERBAIKAN",
  "DIHAPUSBUKU",
];

function getWibDateString(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
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

type ParsedScanToken =
  | { mode: "item_id"; value: string; display: string }
  | { mode: "code"; value: string; display: string };

function parseScannedToken(rawInput: string): ParsedScanToken | null {
  const trimmed = sanitizeTextInput(rawInput, 500);
  if (!trimmed) return null;

  // Handle full URLs or relative URLs e.g. https://.../inventory/<uuid> or /inventory/<uuid>
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

      const segments = parsed.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last) {
        if (isValidUuid(String(last))) {
          return { mode: "item_id", value: last.toLowerCase(), display: trimmed };
        }
        return { mode: "code", value: last.toUpperCase(), display: last };
      }
    } catch {
      // Fallback to raw token handling below
    }
  }

  if (isValidUuid(String(trimmed))) {
    return { mode: "item_id", value: trimmed.toLowerCase(), display: trimmed };
  }

  return { mode: "code", value: trimmed.toUpperCase(), display: trimmed };
}

async function enrichBorrowsWithNames(
  rows: BorrowTransaction[],
): Promise<BorrowHistoryEntry[]> {
  if (rows.length === 0) return [];
  const profileIds = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.borrower_id, row.returned_by])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const nameMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const supabase = await createClient();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds);

    for (const profile of profiles ?? []) {
      nameMap.set(
        profile.id,
        profile.full_name?.trim() || profile.email || "Pengguna",
      );
    }
  }

  return rows.map((row) => ({
    ...row,
    borrower_name: nameMap.get(row.borrower_id) ?? null,
    returned_by_name: row.returned_by ? nameMap.get(row.returned_by) ?? null : null,
  }));
}

function revalidateScanPaths(itemId?: string) {
  revalidatePath("/scan");
  revalidatePath("/inventory");
  if (itemId) revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/kits");
  revalidatePath("/dashboard");
  revalidatePath("/audit-log");
}

export async function lookupScanTargetAction(
  rawCode: string,
): Promise<ActionResult<ScanLookupResult>> {
  const user = await requireAction("scan.borrow_return");
  const parsed = parseScannedToken(rawCode);
  if (!parsed) {
    return { ok: false, error: "Masukkan atau scan kode barcode/QR terlebih dahulu." };
  }

  const supabase = await createClient();
  let matchedItem: ItemMaster | null = null;
  let matchedKit: ItemKit | null = null;

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
      const { data: kit } = await supabase
        .from("item_kits")
        .select("*")
        .eq("id", parsed.value)
        .is("deleted_at", null)
        .maybeSingle();
      matchedKit = kit ?? null;
    }
  } else {
    if (parsed.value.startsWith("KIT-")) {
      const { data: kit } = await supabase
        .from("item_kits")
        .select("*")
        .eq("kit_code", parsed.value)
        .is("deleted_at", null)
        .maybeSingle();
      matchedKit = kit ?? null;
    }

    if (!matchedKit) {
      const { data: item } = await supabase
        .from("items_master")
        .select("*")
        .eq("item_code", parsed.value)
        .is("deleted_at", null)
        .maybeSingle();
      matchedItem = item ?? null;
    }

    if (!matchedItem && !matchedKit) {
      const { data: kit } = await supabase
        .from("item_kits")
        .select("*")
        .eq("kit_code", parsed.value)
        .is("deleted_at", null)
        .maybeSingle();
      matchedKit = kit ?? null;
    }
  }

  if (matchedItem) {
    const { data: borrows } = await supabase
      .from("borrow_transactions")
      .select("*")
      .eq("item_id", matchedItem.id)
      .order("borrowed_at", { ascending: false })
      .limit(8);

    const enriched = await enrichBorrowsWithNames(borrows ?? []);
    const activeBorrow =
      enriched.find((row) => row.status === "DIPINJAM" || row.status === "TERLAMBAT") ??
      null;

    let photoSignedUrl: string | null = null;
    if (matchedItem.photo_url) {
      if (/^https?:\/\//i.test(matchedItem.photo_url)) {
        photoSignedUrl = isSafeHttpUrl(matchedItem.photo_url)
          ? matchedItem.photo_url
          : null;
      } else {
        const safePath = sanitizeStoragePath(matchedItem.photo_url);
        if (safePath) {
          const { data: signed } = await supabase.storage
            .from("inventory-photos")
            .createSignedUrl(safePath, 3600);
          photoSignedUrl = signed?.signedUrl ?? null;
        }
      }
    }

    const canReturnActiveBorrow = true;

    return {
      ok: true,
      data: {
        kind: "item",
        item: sanitizeItemForRole(matchedItem, user.role),
        photoSignedUrl,
        activeBorrow,
        recentBorrows: enriched,
        canReturnActiveBorrow,
      },
    };
  }

  if (matchedKit) {
    const [bundledRes, borrowsRes] = await Promise.all([
      matchedKit.bundled_item_ids.length > 0
        ? supabase
            .from("items_master")
            .select("*")
            .in("id", matchedKit.bundled_item_ids)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] as ItemMaster[] }),
      supabase
        .from("borrow_transactions")
        .select("*")
        .eq("kit_id", matchedKit.id)
        .order("borrowed_at", { ascending: false })
        .limit(8),
    ]);

    const enriched = await enrichBorrowsWithNames(borrowsRes.data ?? []);
    const activeBorrow =
      enriched.find((row) => row.status === "DIPINJAM" || row.status === "TERLAMBAT") ??
      null;

    const canReturnActiveBorrow =
      !activeBorrow ||
      activeBorrow.borrower_id === user.id ||
      user.role !== "STAFF";

    return {
      ok: true,
      data: {
        kind: "kit",
        kit: matchedKit,
        bundledItems: (bundledRes.data ?? []).map((item) =>
          sanitizeItemForRole(item, user.role),
        ),
        activeBorrow,
        recentBorrows: enriched,
        canReturnActiveBorrow,
      },
    };
  }

  return {
    ok: false,
    error: `Kode "${parsed.display.slice(0, 80)}" tidak ditemukan pada inventaris maupun kit aktif.`,
  };
}

export async function borrowItemViaScanAction(input: {
  itemId: string;
  roomCode?: LocationCode | null;
  dueAt?: string | null;
  notes?: string | null;
}): Promise<ActionResult<{ transaction: BorrowTransaction; item: ItemMaster }>> {
  const user = await requireAction("scan.borrow_return");
  if (!isValidUuid(input.itemId)) {
    return { ok: false, error: "ID item tidak valid." };
  }

  if (input.roomCode && !VALID_LOCATIONS.includes(input.roomCode)) {
    return { ok: false, error: "Kode ruangan tujuan tidak valid." };
  }

  const dueAtClean = sanitizeOptionalText(input.dueAt, 40);
  if (dueAtClean && Number.isNaN(Date.parse(dueAtClean))) {
    return { ok: false, error: "Format batas waktu pengembalian tidak valid." };
  }

  const supabase = await createClient();
  const { data: item, error: itemErr } = await supabase
    .from("items_master")
    .select("*")
    .eq("id", input.itemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (itemErr || !item) {
    return { ok: false, error: "Item inventaris tidak ditemukan." };
  }

  if (item.condition === "DIHAPUSBUKU") {
    return {
      ok: false,
      error: `Item ${item.item_code} berstatus Dihapusbuku dan tidak dapat dipinjam.`,
    };
  }

  const { data: existingActive } = await supabase
    .from("borrow_transactions")
    .select("id, borrower_id")
    .eq("item_id", item.id)
    .in("status", ["DIPINJAM", "TERLAMBAT"])
    .limit(1)
    .maybeSingle();

  if (existingActive && item.asset_type !== "CONSUMABLE") {
    return {
      ok: false,
      error: `Item ${item.item_code} saat ini masih berstatus dipinjam. Lakukan pengembalian terlebih dahulu.`,
    };
  }

  const { data: transaction, error: trxErr } = await supabase
    .from("borrow_transactions")
    .insert({
      item_id: item.id,
      kit_id: null,
      borrower_id: user.id,
      room_code: input.roomCode ?? item.room_code,
      parts_before: item.current_parts,
      status: "DIPINJAM",
      borrowed_at: new Date().toISOString(),
      due_at: dueAtClean,
      notes: sanitizeOptionalText(input.notes, 1000, { multiline: true }),
    })
    .select("*")
    .single();

  if (trxErr || !transaction) {
    return {
      ok: false,
      error: sanitizeSafeError(
        trxErr,
        "Gagal mencatat transaksi peminjaman.",
        "scan/borrowItem",
      ),
    };
  }

  revalidateScanPaths(item.id);
  return {
    ok: true,
    data: { transaction, item: sanitizeItemForRole(item, user.role) },
    message: `Peminjaman ${item.item_code} berhasil dicatat (${transaction.transaction_code}).`,
  };
}

export async function returnItemViaScanAction(input: {
  itemId: string;
  transactionId?: string | null;
  partsAfter: number;
  hygieneStatus: HygieneStatus;
  conditionOverride?: ItemCondition;
  notes?: string | null;
}): Promise<ActionResult<{ transaction: BorrowTransaction | null; item: ItemMaster }>> {
  const user = await requireAction("scan.borrow_return");
  if (!isValidUuid(input.itemId)) {
    return { ok: false, error: "ID item tidak valid." };
  }
  if (input.transactionId && !isValidUuid(input.transactionId)) {
    return { ok: false, error: "ID transaksi peminjaman tidak valid." };
  }
  if (!VALID_HYGIENE_STATUSES.includes(input.hygieneStatus)) {
    return { ok: false, error: "Status sanitasi tidak valid." };
  }

  const supabase = await createClient();
  const { data: item, error: itemErr } = await supabase
    .from("items_master")
    .select("*")
    .eq("id", input.itemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (itemErr || !item) {
    return { ok: false, error: "Item inventaris tidak ditemukan." };
  }

  const partsAfter = Math.trunc(Number(input.partsAfter));
  if (!Number.isFinite(partsAfter) || partsAfter < 0 || partsAfter > item.total_parts) {
    return {
      ok: false,
      error: `Jumlah kepingan kembali harus antara 0 dan ${item.total_parts}.`,
    };
  }

  const activeQuery = input.transactionId
    ? supabase
        .from("borrow_transactions")
        .select("*")
        .eq("id", input.transactionId)
        .eq("item_id", item.id)
        .in("status", ["DIPINJAM", "TERLAMBAT"])
        .maybeSingle()
    : supabase
        .from("borrow_transactions")
        .select("*")
        .eq("item_id", item.id)
        .in("status", ["DIPINJAM", "TERLAMBAT"])
        .order("borrowed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const { data: activeBorrow } = await activeQuery;

  const isMissingParts = item.total_parts > 1 && partsAfter < item.total_parts;

  let nextCondition = item.condition;
  if (input.conditionOverride && VALID_CONDITIONS.includes(input.conditionOverride)) {
    if (
      input.conditionOverride !== item.condition &&
      (input.conditionOverride === "DIHAPUSBUKU" || item.condition === "DIHAPUSBUKU") &&
      !can(user.role, "writeoff.approve")
    ) {
      return {
        ok: false,
        error: "Hanya Owner yang dapat mengubah status item Dihapusbuku.",
      };
    }
    nextCondition = input.conditionOverride;
  }

  if (isMissingParts && nextCondition === "BAIK") {
    nextCondition = "PART_KURANG";
  } else if (
    !isMissingParts &&
    partsAfter === item.total_parts &&
    nextCondition === "PART_KURANG"
  ) {
    nextCondition = "BAIK";
  }

  const itemUpdatePayload: {
    current_parts: number;
    condition: ItemCondition;
    hygiene_status: HygieneStatus;
    last_sanitized_at?: string;
    next_sanitization_due?: string;
    updated_by: string;
  } = {
    current_parts: partsAfter,
    condition: nextCondition,
    hygiene_status: input.hygieneStatus,
    updated_by: user.id,
  };

  if (input.hygieneStatus === "STERIL") {
    itemUpdatePayload.last_sanitized_at = new Date().toISOString();
    itemUpdatePayload.next_sanitization_due = getWibDateString(7);
  }

  const { data: updatedItem, error: updateItemErr } = await supabase
    .from("items_master")
    .update(itemUpdatePayload)
    .eq("id", item.id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (updateItemErr || !updatedItem) {
    return {
      ok: false,
      error: sanitizeSafeError(
        updateItemErr,
        "Gagal memperbarui kondisi dan kebersihan item.",
        "scan/returnItemUpdate",
      ),
    };
  }

  let updatedBorrow: BorrowTransaction | null = null;
  if (activeBorrow) {
    const returnNote = sanitizeOptionalText(input.notes, 1000, { multiline: true });
    const mergedNotes = returnNote
      ? activeBorrow.notes
        ? `${activeBorrow.notes} | Kembali: ${returnNote}`
        : returnNote
      : activeBorrow.notes;

    const { data: trxData, error: trxErr } = await supabase
      .from("borrow_transactions")
      .update({
        parts_after: partsAfter,
        returned_at: new Date().toISOString(),
        returned_by: user.id,
        status: isMissingParts ? "HILANG_PART" : "DIKEMBALIKAN",
        notes: mergedNotes,
      })
      .eq("id", activeBorrow.id)
      .in("status", ["DIPINJAM", "TERLAMBAT"])
      .select("*")
      .single();

    if (trxErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          trxErr,
          "Gagal memperbarui status transaksi pengembalian.",
          "scan/returnTrxUpdate",
        ),
      };
    }
    updatedBorrow = trxData;
  }

  revalidateScanPaths(item.id);
  return {
    ok: true,
    data: {
      transaction: updatedBorrow,
      item: sanitizeItemForRole(updatedItem, user.role),
    },
    message: isMissingParts
      ? `Pengembalian ${updatedItem.item_code} dicatat dengan status PART KURANG (${partsAfter}/${updatedItem.total_parts}).`
      : `Pengembalian ${updatedItem.item_code} berhasil dicatat.`,
  };
}

export async function quickStockOpnameAction(input: {
  itemId: string;
  currentParts: number;
  stockQty: number;
  hygieneStatus: HygieneStatus;
  condition: ItemCondition;
  notes?: string | null;
}): Promise<ActionResult<ItemMaster>> {
  const user = await requireAction("inventory.validate_opname");
  if (!isValidUuid(input.itemId)) {
    return { ok: false, error: "ID item tidak valid." };
  }
  if (!VALID_HYGIENE_STATUSES.includes(input.hygieneStatus)) {
    return { ok: false, error: "Status sanitasi tidak valid." };
  }
  if (!VALID_CONDITIONS.includes(input.condition)) {
    return { ok: false, error: "Kondisi barang tidak valid." };
  }
  if (input.condition === "DIHAPUSBUKU" && !can(user.role, "writeoff.approve")) {
    return {
      ok: false,
      error: "Hanya Owner yang dapat menandai kondisi Dihapusbuku.",
    };
  }

  const supabase = await createClient();
  const { data: item, error: itemErr } = await supabase
    .from("items_master")
    .select("*")
    .eq("id", input.itemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (itemErr || !item) {
    return { ok: false, error: "Item inventaris tidak ditemukan." };
  }

  if (
    item.condition === "DIHAPUSBUKU" &&
    input.condition !== "DIHAPUSBUKU" &&
    !can(user.role, "writeoff.approve")
  ) {
    return {
      ok: false,
      error: "Hanya Owner yang dapat mengubah status item Dihapusbuku.",
    };
  }

  const safeParts = Math.trunc(Number(input.currentParts));
  if (!Number.isFinite(safeParts) || safeParts < 0 || safeParts > item.total_parts) {
    return {
      ok: false,
      error: `Jumlah part harus antara 0 dan ${item.total_parts}.`,
    };
  }

  const safeStock = Math.trunc(Number(input.stockQty));
  if (!Number.isFinite(safeStock) || safeStock < 0) {
    return { ok: false, error: "Stok fisik tidak boleh bernilai negatif." };
  }

  let nextCondition = input.condition;
  if (item.total_parts > 1 && safeParts < item.total_parts && nextCondition === "BAIK") {
    nextCondition = "PART_KURANG";
  } else if (
    safeParts === item.total_parts &&
    nextCondition === "PART_KURANG" &&
    item.condition === "PART_KURANG"
  ) {
    nextCondition = "BAIK";
  }

  const canEditMasterStock = can(user.role, "inventory.update");
  const stockChanged = safeStock !== item.stock_qty;

  const updatePayload: {
    current_parts: number;
    stock_qty?: number;
    hygiene_status: HygieneStatus;
    condition: ItemCondition;
    last_sanitized_at?: string;
    next_sanitization_due?: string;
    updated_by: string;
  } = {
    current_parts: safeParts,
    hygiene_status: input.hygieneStatus,
    condition: nextCondition,
    updated_by: user.id,
  };

  if (canEditMasterStock) {
    updatePayload.stock_qty = safeStock;
  }

  if (input.hygieneStatus === "STERIL") {
    updatePayload.last_sanitized_at = new Date().toISOString();
    updatePayload.next_sanitization_due = getWibDateString(7);
  }

  const { data: updatedItem, error: updateErr } = await supabase
    .from("items_master")
    .update(updatePayload)
    .eq("id", item.id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (updateErr || !updatedItem) {
    return {
      ok: false,
      error: sanitizeSafeError(
        updateErr,
        "Gagal menyimpan hasil Stock Opname.",
        "scan/stockOpname",
      ),
    };
  }

  const noteText = sanitizeOptionalText(input.notes, 1000, { multiline: true });
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    actor_name: user.fullName,
    actor_role: user.role,
    action: "STOCK_OPNAME",
    entity_type: "items_master",
    entity_id: updatedItem.id,
    entity_code: updatedItem.item_code,
    summary: `Stock Opname ${updatedItem.item_code}: Part ${safeParts}/${updatedItem.total_parts}, Stok fisik ${safeStock} ${updatedItem.unit_label}, Kondisi ${nextCondition}${noteText ? ` (${noteText})` : ""}`,
    metadata: {
      previous_parts: item.current_parts,
      verified_parts: safeParts,
      previous_stock: item.stock_qty,
      verified_stock: safeStock,
      hygiene_status: input.hygieneStatus,
      condition: nextCondition,
      notes: noteText,
    },
  });

  revalidateScanPaths(updatedItem.id);
  return {
    ok: true,
    data: sanitizeItemForRole(updatedItem, user.role),
    message:
      stockChanged && !canEditMasterStock
        ? `Stock Opname ${updatedItem.item_code} tercatat. Selisih stok fisik (${safeStock} vs ${item.stock_qty}) dicatat untuk peninjauan Admin.`
        : `Stock Opname ${updatedItem.item_code} berhasil diverifikasi.`,
  };
}
