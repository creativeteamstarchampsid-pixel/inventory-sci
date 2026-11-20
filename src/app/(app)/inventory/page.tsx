import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRouteAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { InventoryClient } from "./inventory-client";

export const metadata: Metadata = {
  title: "Inventaris & Alat Terapi",
};

export default async function InventoryPage() {
  const user = await requireRouteAccess("/inventory");
  const canViewValuation = can(user.role, "inventory.view_valuation");
  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from("items_master")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <Alert
        variant="destructive"
        className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#881337] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-rose-950/60 dark:text-rose-100"
      >
        <AlertTriangle className="size-4" />
        <AlertTitle className="font-extrabold">Gagal Memuat Data Inventaris</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const rows = (items ?? []).map((item) =>
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
  const storagePaths = Array.from(
    new Set(
      rows
        .map((item) => item.photo_url)
        .filter((url): url is string => Boolean(url) && !/^https?:\/\//i.test(url!)),
    ),
  );

  const signedPhotoUrls: Record<string, string> = {};
  if (storagePaths.length > 0) {
    const { data: signedData } = await supabase.storage
      .from("inventory-photos")
      .createSignedUrls(storagePaths, 3600);

    for (const entry of signedData ?? []) {
      if (entry.path && entry.signedUrl) {
        signedPhotoUrls[entry.path] = entry.signedUrl;
      }
    }
  }

  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <InventoryClient
      items={rows}
      signedPhotoUrls={signedPhotoUrls}
      todayWib={todayWib}
    />
  );
}
