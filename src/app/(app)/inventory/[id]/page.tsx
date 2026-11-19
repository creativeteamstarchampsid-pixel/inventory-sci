import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth";
import type { BorrowHistoryEntry } from "@/lib/actions/scan";
import { createClient } from "@/lib/supabase/server";
import { ItemDetailClient } from "./item-detail-client";

export const metadata: Metadata = {
  title: "Detail Item Inventaris",
};

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRouteAccess("/inventory");
  const { id } = await params;

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("items_master")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!item) {
    notFound();
  }

  const [parentRes, childrenRes, allItemsRes, borrowsRes] = await Promise.all([
    item.parent_item_id
      ? supabase
          .from("items_master")
          .select("id, item_code, name")
          .eq("id", item.parent_item_id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("items_master")
      .select("*")
      .eq("parent_item_id", item.id)
      .is("deleted_at", null)
      .order("item_code", { ascending: true }),
    supabase
      .from("items_master")
      .select("*")
      .is("deleted_at", null)
      .order("item_code", { ascending: true }),
    supabase
      .from("borrow_transactions")
      .select("*")
      .eq("item_id", item.id)
      .order("borrowed_at", { ascending: false })
      .limit(20),
  ]);

  const borrows = borrowsRes.data ?? [];
  const profileIds = Array.from(
    new Set(
      borrows
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

  const borrowHistory: BorrowHistoryEntry[] = borrows.map((row) => ({
    ...row,
    borrower_name: nameMap.get(row.borrower_id) ?? null,
    returned_by_name: row.returned_by ? nameMap.get(row.returned_by) ?? null : null,
  }));

  let signedPhotoUrl: string | null = null;
  if (item.photo_url) {
    if (/^https?:\/\//i.test(item.photo_url)) {
      signedPhotoUrl = item.photo_url;
    } else {
      const { data: signed } = await supabase.storage
        .from("inventory-photos")
        .createSignedUrl(item.photo_url, 3600);
      signedPhotoUrl = signed?.signedUrl ?? null;
    }
  }

  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <ItemDetailClient
      item={item}
      parentItem={parentRes.data ?? null}
      childItems={childrenRes.data ?? []}
      allItemsForParentSelect={allItemsRes.data ?? []}
      borrowHistory={borrowHistory}
      signedPhotoUrl={signedPhotoUrl}
      todayWib={todayWib}
    />
  );
}
