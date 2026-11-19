import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { lookupScanTargetAction, type ScanLookupResult } from "@/lib/actions/scan";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { ScanClient, type RecentScanFeedRow } from "./scan-client";

export const metadata: Metadata = {
  title: "Scan Pinjam & Kembali",
};

function sanitizeLookupValuation(
  lookup: ScanLookupResult | null,
  canViewValuation: boolean,
): ScanLookupResult | null {
  if (!lookup || canViewValuation) return lookup;
  if (lookup.kind === "item") {
    return {
      ...lookup,
      item: {
        ...lookup.item,
        purchase_price: 0,
        residual_value: 0,
        useful_life_months: null,
        acquisition_date: null,
      },
    };
  }
  return {
    ...lookup,
    bundledItems: lookup.bundledItems.map((it) => ({
      ...it,
      purchase_price: 0,
      residual_value: 0,
      useful_life_months: null,
      acquisition_date: null,
    })),
  };
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const user = await requireRouteAccess("/scan");
  const canViewValuation = can(user.role, "inventory.view_valuation");
  const resolvedParams = await searchParams;
  const initialCode = resolvedParams.code?.trim() ?? "";

  let initialLookup: ScanLookupResult | null = null;
  let initialError: string | null = null;

  if (initialCode) {
    const res = await lookupScanTargetAction(initialCode);
    if (res.ok) {
      initialLookup = sanitizeLookupValuation(res.data, canViewValuation);
    } else {
      initialError = res.error;
    }
  }

  const supabase = await createClient();
  const { data: recentBorrows } = await supabase
    .from("borrow_transactions")
    .select("*")
    .order("borrowed_at", { ascending: false })
    .limit(12);

  const borrows = recentBorrows ?? [];
  const itemIds = Array.from(
    new Set(borrows.map((b) => b.item_id).filter((id): id is string => Boolean(id))),
  );
  const kitIds = Array.from(
    new Set(borrows.map((b) => b.kit_id).filter((id): id is string => Boolean(id))),
  );
  const profileIds = Array.from(
    new Set(
      borrows
        .flatMap((b) => [b.borrower_id, b.returned_by])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [itemsRes, kitsRes, profilesRes] = await Promise.all([
    itemIds.length > 0
      ? supabase.from("items_master").select("id, item_code, name").in("id", itemIds)
      : Promise.resolve({ data: [] }),
    kitIds.length > 0
      ? supabase.from("item_kits").select("id, kit_code, kit_name").in("id", kitIds)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? supabase.from("profiles").select("id, full_name, email").in("id", profileIds)
      : Promise.resolve({ data: [] }),
  ]);

  const itemMap = new Map(
    (itemsRes.data ?? []).map((item) => [item.id, item]),
  );
  const kitMap = new Map(
    (kitsRes.data ?? []).map((kit) => [kit.id, kit]),
  );
  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [
      p.id,
      p.full_name?.trim() || p.email || "Pengguna",
    ]),
  );

  const recentFeed: RecentScanFeedRow[] = borrows.map((row) => {
    const item = row.item_id ? itemMap.get(row.item_id) : undefined;
    const kit = row.kit_id ? kitMap.get(row.kit_id) : undefined;
    return {
      ...row,
      borrower_name: profileMap.get(row.borrower_id) ?? null,
      returned_by_name: row.returned_by ? profileMap.get(row.returned_by) ?? null : null,
      target_kind: kit ? "kit" : "item",
      target_code: item?.item_code ?? kit?.kit_code ?? "-",
      target_name: item?.name ?? kit?.kit_name ?? "Item/Kit Terhapus",
    };
  });

  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <ScanClient
      initialCode={initialCode}
      initialLookup={initialLookup}
      initialError={initialError}
      recentFeed={recentFeed}
      todayWib={todayWib}
    />
  );
}
