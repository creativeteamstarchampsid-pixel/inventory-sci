import "server-only";

import {
  mapArchiveToPrintableRecord,
  mapItemToPrintableRecord,
  type PrintableArchiveRow,
  type PrintableItemRow,
  type PrintableLabelRecord,
} from "@/lib/barcode";
import { getLocationsDirectory } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";

export type BarcodeStudioLoadResult = {
  schemaReady: boolean;
  schemaError?: string;
  items: PrintableLabelRecord[];
  archives: PrintableLabelRecord[];
};

const ITEM_SELECT_COLUMNS = [
  "id",
  "item_code",
  "barcode_format",
  "name",
  "category_prefix",
  "category",
  "asset_type",
  "room_code",
  "rack_location",
  "total_parts",
  "current_parts",
  "unit_label",
  "stock_qty",
  "condition",
].join(", ");

const ARCHIVE_SELECT_COLUMNS = [
  "id",
  "doc_code",
  "title",
  "category",
  "branch_building",
  "cabinet_code",
  "drawer_no",
  "folder_code",
  "physical_status",
  "digital_file_url",
  "drive_link",
  "version_no",
  "is_sop_public_to_staff",
].join(", ");

/**
 * Loads all active (non-deleted) inventory items and hybrid archives for the
 * Barcode & Label Print Studio. Runs under the signed-in admin's RLS context.
 */
export async function loadBarcodeStudioRecords(): Promise<BarcodeStudioLoadResult> {
  const supabase = await createClient();

  const [itemsRes, archivesRes, locationsDir] = await Promise.all([
    supabase
      .from("items_master")
      .select(ITEM_SELECT_COLUMNS)
      .is("deleted_at", null)
      .order("item_code", { ascending: true }),
    supabase
      .from("archives_hybrid")
      .select(ARCHIVE_SELECT_COLUMNS)
      .is("deleted_at", null)
      .order("doc_code", { ascending: true }),
    getLocationsDirectory(),
  ]);

  if (itemsRes.error || archivesRes.error) {
    return {
      schemaReady: false,
      schemaError: itemsRes.error?.message ?? archivesRes.error?.message,
      items: [],
      archives: [],
    };
  }

  const rawItems = (itemsRes.data ?? []) as unknown as PrintableItemRow[];
  const rawArchives = (archivesRes.data ?? []) as unknown as PrintableArchiveRow[];

  return {
    schemaReady: true,
    items: rawItems.map((item) =>
      mapItemToPrintableRecord(item, locationsDir.labels),
    ),
    archives: rawArchives.map((archive) =>
      mapArchiveToPrintableRecord(archive, locationsDir.labels),
    ),
  };
}
