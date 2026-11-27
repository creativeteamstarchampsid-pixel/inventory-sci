import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { getLocationsDirectory } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import {
  RoomsClient,
  type LocationUsageCounts,
} from "./rooms-client";

export const metadata: Metadata = {
  title: "Ruangan & Lemari Arsip",
};

export default async function RoomsPage() {
  await requireRouteAccess("/rooms");
  const supabase = await createClient();

  const [locationsDir, schemaCheckRes, itemsRes, kitsRes, archivesRes] =
    await Promise.all([
      getLocationsDirectory(),
      supabase
        .from("locations_master")
        .select("code", { count: "exact", head: true }),
      supabase
        .from("items_master")
        .select("room_code")
        .is("deleted_at", null)
        .is("parent_item_id", null)
        .limit(10000),
      supabase
        .from("item_kits")
        .select("assigned_room")
        .is("deleted_at", null)
        .not("assigned_room", "is", null)
        .limit(5000),
      supabase
        .from("archives_hybrid")
        .select("cabinet_code")
        .is("deleted_at", null)
        .limit(10000),
    ]);

  const usageCounts: LocationUsageCounts = {};
  const ensureUsageBucket = (code: string) => {
    if (!usageCounts[code]) {
      usageCounts[code] = { items: 0, kits: 0, archives: 0 };
    }
    return usageCounts[code];
  };

  for (const loc of locationsDir.records) {
    ensureUsageBucket(loc.code);
  }

  for (const row of itemsRes.data ?? []) {
    if (row.room_code) {
      ensureUsageBucket(row.room_code).items += 1;
    }
  }

  for (const row of kitsRes.data ?? []) {
    if (row.assigned_room) {
      ensureUsageBucket(row.assigned_room).kits += 1;
    }
  }

  for (const row of archivesRes.data ?? []) {
    if (row.cabinet_code) {
      ensureUsageBucket(row.cabinet_code).archives += 1;
    }
  }

  const schemaReady =
    !schemaCheckRes.error && (schemaCheckRes.count ?? 0) > 0;

  return (
    <RoomsClient
      locations={locationsDir.records}
      usageCounts={usageCounts}
      schemaReady={schemaReady}
      schemaError={schemaCheckRes.error?.message ?? null}
    />
  );
}
