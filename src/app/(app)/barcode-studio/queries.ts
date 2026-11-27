import "server-only";

import type { BarcodePresetRecord } from "@/lib/actions/barcode-presets";
import {
  mapArchiveToPrintableRecord,
  mapItemToPrintableRecord,
  normalizeBarcodeStudioConfig,
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
  presets: BarcodePresetRecord[];
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
 * Loads all active (non-deleted) inventory items, hybrid archives, saved custom
 * short-link slugs (for shorter QR URLs), and organization label presets for
 * the Barcode & Label Print Studio. Runs under the signed-in admin's RLS context.
 */
export async function loadBarcodeStudioRecords(): Promise<BarcodeStudioLoadResult> {
  const supabase = await createClient();

  const [itemsRes, archivesRes, locationsDir, shortLinksRes, presetsRes] =
    await Promise.all([
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
      supabase
        .from("share_short_links")
        .select("target_type, target_id, slug")
        .in("target_type", ["ITEM", "ARCHIVE"]),
      supabase
        .from("barcode_label_presets")
        .select(
          "id, name, description, is_default, config_json, created_at, updated_at",
        )
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false }),
    ]);

  if (itemsRes.error || archivesRes.error) {
    return {
      schemaReady: false,
      schemaError: itemsRes.error?.message ?? archivesRes.error?.message,
      items: [],
      archives: [],
      presets: [],
    };
  }

  const itemSlugById = new Map<string, string>();
  const archiveSlugById = new Map<string, string>();
  if (!shortLinksRes.error && Array.isArray(shortLinksRes.data)) {
    for (const link of shortLinksRes.data) {
      if (link.target_type === "ITEM") {
        itemSlugById.set(link.target_id, link.slug);
      } else if (link.target_type === "ARCHIVE") {
        archiveSlugById.set(link.target_id, link.slug);
      }
    }
  }

  const presets: BarcodePresetRecord[] =
    !presetsRes.error && Array.isArray(presetsRes.data)
      ? presetsRes.data.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description ?? null,
          is_default: Boolean(row.is_default),
          config: normalizeBarcodeStudioConfig(row.config_json),
          created_at: row.created_at,
          updated_at: row.updated_at,
        }))
      : [];

  const rawItems = (itemsRes.data ?? []) as unknown as PrintableItemRow[];
  const rawArchives = (archivesRes.data ?? []) as unknown as PrintableArchiveRow[];

  return {
    schemaReady: true,
    items: rawItems.map((item) =>
      mapItemToPrintableRecord(
        item,
        locationsDir.labels,
        itemSlugById.get(item.id) ?? null,
      ),
    ),
    archives: rawArchives.map((archive) =>
      mapArchiveToPrintableRecord(
        archive,
        locationsDir.labels,
        archiveSlugById.get(archive.id) ?? null,
      ),
    ),
    presets,
  };
}
