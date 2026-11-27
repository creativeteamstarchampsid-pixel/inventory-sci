import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRouteAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type { ItemBarcodeAlias, ItemMaster } from "@/types/database";
import { InventoryClient } from "./inventory-client";

export type InventoryAliasEntry = Pick<
  ItemBarcodeAlias,
  "alias_code" | "target_item_id" | "legacy_name" | "alias_reason"
>;

export const metadata: Metadata = {
  title: "Inventaris & Alat Terapi",
};

const SIGNED_URL_CHUNK_SIZE = 100;

export default async function InventoryPage() {
  const user = await requireRouteAccess("/inventory");
  const canViewValuation = can(user.role, "inventory.view_valuation");
  const canManageItem = can(user.role, "inventory.create") || can(user.role, "inventory.update");
  const supabase = await createClient();

  let rows: ItemMaster[];
  let barcodeAliases: InventoryAliasEntry[] = [];
  let queryError: string | null = null;

  const aliasesPromise = supabase
    .from("item_barcode_aliases")
    .select("alias_code, target_item_id, legacy_name, alias_reason");

  if (canViewValuation || canManageItem) {
    const [{ data: items, error }, aliasesRes] = await Promise.all([
      supabase
        .from("items_master")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      aliasesPromise,
    ]);

    if (error) {
      queryError = error.message;
      rows = [];
    } else {
      rows = (items ?? []).map((item) =>
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
    }

    barcodeAliases =
      !aliasesRes.error && Array.isArray(aliasesRes.data) ? aliasesRes.data : [];
  } else {
    // Non-admin roles (STAFF / TEAM_LEADER) never open the edit modal or view valuation:
    // select only the display/filter columns so valuation & unused fields never leave Postgres.
    const [{ data: items, error }, aliasesRes] = await Promise.all([
      supabase
        .from("items_master")
        .select(
          "id, item_code, parent_item_id, has_sub_items, name, category_prefix, category, asset_type, room_code, rack_location, pic_name, photo_url, total_parts, current_parts, unit_label, stock_qty, min_stock_threshold, condition, hygiene_status, next_sanitization_due, created_at",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      aliasesPromise,
    ]);

    if (error) {
      queryError = error.message;
      rows = [];
    } else {
      rows = (items ?? []).map((item) => ({
        ...item,
        barcode_format: "CODE128",
        description: null,
        acquisition_date: null,
        purchase_price: 0,
        useful_life_months: null,
        residual_value: 0,
        last_sanitized_at: null,
        source_delivery_id: null,
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
        updated_at: item.created_at,
      }));
    }

    barcodeAliases =
      !aliasesRes.error && Array.isArray(aliasesRes.data) ? aliasesRes.data : [];
  }

  if (queryError) {
    return (
      <Alert
        variant="destructive"
        className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#881337] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-rose-950/60 dark:text-rose-100"
      >
        <AlertTriangle className="size-4" />
        <AlertTitle className="font-extrabold">Gagal Memuat Data Inventaris</AlertTitle>
        <AlertDescription>{queryError}</AlertDescription>
      </Alert>
    );
  }

  const storagePaths = Array.from(
    new Set(
      rows
        .map((item) => item.photo_url)
        .filter(
          (url): url is string =>
            typeof url === "string" && url.length > 0 && !/^https?:\/\//i.test(url),
        ),
    ),
  );

  const signedPhotoUrls: Record<string, string> = {};
  if (storagePaths.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < storagePaths.length; i += SIGNED_URL_CHUNK_SIZE) {
      chunks.push(storagePaths.slice(i, i + SIGNED_URL_CHUNK_SIZE));
    }

    const signedResults = await Promise.all(
      chunks.map((chunk) =>
        supabase.storage.from("inventory-photos").createSignedUrls(chunk, 3600),
      ),
    );

    for (const { data: signedData } of signedResults) {
      for (const entry of signedData ?? []) {
        if (entry.path && entry.signedUrl) {
          signedPhotoUrls[entry.path] = entry.signedUrl;
        }
      }
    }
  }

  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <InventoryClient
      items={rows}
      barcodeAliases={barcodeAliases}
      signedPhotoUrls={signedPhotoUrls}
      todayWib={todayWib}
    />
  );
}
