import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InventoryClient } from "./inventory-client";

export const metadata: Metadata = {
  title: "Inventaris & Alat Terapi",
};

export default async function InventoryPage() {
  await requireRouteAccess("/inventory");
  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from("items_master")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Gagal Memuat Data Inventaris</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const rows = items ?? [];
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
