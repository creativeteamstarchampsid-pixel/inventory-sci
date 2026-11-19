import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRouteAccess } from "@/lib/auth";
import type { BorrowHistoryEntry } from "@/lib/actions/scan";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { KitsClient } from "./kits-client";

export const metadata: Metadata = {
  title: "Kit Terapi",
};

export default async function KitsPage() {
  const user = await requireRouteAccess("/kits");
  const canViewValuation = can(user.role, "inventory.view_valuation");
  const supabase = await createClient();

  const [kitsRes, itemsRes, borrowsRes, activeBorrowsRes] = await Promise.all([
    supabase
      .from("item_kits")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("items_master")
      .select("*")
      .is("deleted_at", null)
      .order("item_code", { ascending: true }),
    supabase
      .from("borrow_transactions")
      .select("*")
      .not("kit_id", "is", null)
      .order("borrowed_at", { ascending: false })
      .limit(30),
    supabase
      .from("borrow_transactions")
      .select("*")
      .not("kit_id", "is", null)
      .in("status", ["DIPINJAM", "TERLAMBAT"])
      .order("borrowed_at", { ascending: false }),
  ]);

  if (kitsRes.error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Gagal Memuat Data Kit</AlertTitle>
        <AlertDescription>{kitsRes.error.message}</AlertDescription>
      </Alert>
    );
  }

  const borrows = borrowsRes.data ?? [];
  const activeBorrows = activeBorrowsRes.data ?? [];
  const allBorrowsForProfiles = [...borrows, ...activeBorrows];
  const profileIds = Array.from(
    new Set(
      allBorrowsForProfiles
        .flatMap((row) => [row.borrower_id, row.returned_by])
        .filter((pid): pid is string => Boolean(pid)),
    ),
  );

  const nameMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds);
    for (const profile of profiles ?? []) {
      nameMap.set(profile.id, profile.full_name?.trim() || profile.email || "Pengguna");
    }
  }

  const enrichBorrow = (row: (typeof borrows)[number]): BorrowHistoryEntry => ({
    ...row,
    borrower_name: nameMap.get(row.borrower_id) ?? null,
    returned_by_name: row.returned_by ? nameMap.get(row.returned_by) ?? null : null,
  });

  const enrichedBorrows: BorrowHistoryEntry[] = borrows.map(enrichBorrow);

  const activeBorrowsByKitId: Record<string, BorrowHistoryEntry> = {};
  for (const row of activeBorrows.map(enrichBorrow)) {
    if (row.kit_id && !activeBorrowsByKitId[row.kit_id]) {
      activeBorrowsByKitId[row.kit_id] = row;
    }
  }

  const sanitizedItems = (itemsRes.data ?? []).map((item) =>
    canViewValuation
      ? item
      : {
          ...item,
          purchase_price: 0,
          residual_value: 0,
          useful_life_months: null,
          acquisition_date: null,
        },
  );

  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <KitsClient
      kits={kitsRes.data ?? []}
      items={sanitizedItems}
      activeBorrowsByKitId={activeBorrowsByKitId}
      recentKitBorrows={enrichedBorrows.slice(0, 15)}
      todayWib={todayWib}
    />
  );
}
