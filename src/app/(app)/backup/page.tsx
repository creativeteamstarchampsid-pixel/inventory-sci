import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { getLocationsDirectory } from "@/lib/locations";
import { getMonthlyUpdatePeriod } from "@/lib/period";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type { LocationCode, SystemBackup } from "@/types/database";
import { BackupClient, type RoomSummaryStat } from "./backup-client";

export const metadata: Metadata = {
  title: "Ekspor & Backup",
};

export default async function BackupPage() {
  const user = await requireRouteAccess("/backup");
  const period = getMonthlyUpdatePeriod();
  const supabase = await createClient();

  const [recRes, itemsRes, backupsRes, locationsDir] = await Promise.all([
    supabase
      .from("monthly_reconciliations")
      .select("*")
      .eq("period_ym", period.periodCode)
      .maybeSingle(),
    supabase
      .from("items_master")
      .select(
        "room_code, condition, asset_type, hygiene_status, stock_qty, min_stock_threshold, total_parts, current_parts",
      )
      .is("deleted_at", null),
    can(user.role, "backup.view")
      ? supabase
          .from("system_backups")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as SystemBackup[], error: null }),
    getLocationsDirectory(),
  ]);

  const reconciliation = recRes.data ?? null;

  const approverIds = [
    reconciliation?.verified_by_admin,
    reconciliation?.approved_by_leader,
    reconciliation?.approved_by_owner,
  ].filter((id): id is string => Boolean(id));

  const approverMap = new Map<string, string>();
  if (approverIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", approverIds);
    for (const p of profiles ?? []) {
      approverMap.set(p.id, p.full_name?.trim() || p.email || "Pengguna");
    }
  }

  const opnameRoomCodes: LocationCode[] = [...locationsDir.opnameRoomCodes];
  const roomBucket = new Map<LocationCode, { total: number; anomaly: number }>();
  for (const room of opnameRoomCodes) {
    roomBucket.set(room, { total: 0, anomaly: 0 });
  }

  for (const item of itemsRes.data ?? []) {
    let bucket = roomBucket.get(item.room_code);
    if (!bucket) {
      opnameRoomCodes.push(item.room_code);
      bucket = { total: 0, anomaly: 0 };
      roomBucket.set(item.room_code, bucket);
    }
    bucket.total += 1;
    const isAnomaly =
      item.condition === "PART_KURANG" ||
      item.condition === "RUSAK_RINGAN" ||
      item.condition === "RUSAK_BERAT" ||
      (item.total_parts > 1 && item.current_parts < item.total_parts) ||
      (item.asset_type === "THERAPY_TOY" && item.hygiene_status !== "STERIL") ||
      (item.asset_type === "CONSUMABLE" &&
        item.min_stock_threshold > 0 &&
        item.stock_qty <= item.min_stock_threshold);
    if (isAnomaly) bucket.anomaly += 1;
  }

  const roomStats: RoomSummaryStat[] = opnameRoomCodes.map((roomCode) => {
    const stat = roomBucket.get(roomCode) ?? { total: 0, anomaly: 0 };
    return {
      roomCode,
      totalItems: stat.total,
      anomalyCount: stat.anomaly,
    };
  });

  return (
    <BackupClient
      period={period}
      reconciliation={reconciliation}
      approverNames={{
        adminName: reconciliation?.verified_by_admin
          ? approverMap.get(reconciliation.verified_by_admin) ?? null
          : null,
        leaderName: reconciliation?.approved_by_leader
          ? approverMap.get(reconciliation.approved_by_leader) ?? null
          : null,
        ownerName: reconciliation?.approved_by_owner
          ? approverMap.get(reconciliation.approved_by_owner) ?? null
          : null,
      }}
      roomStats={roomStats}
      backups={(backupsRes.data ?? []) as SystemBackup[]}
    />
  );
}
