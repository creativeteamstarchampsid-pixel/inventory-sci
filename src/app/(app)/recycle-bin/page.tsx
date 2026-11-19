import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import type { RecycleTable } from "@/lib/actions/recycle-bin";
import { createClient } from "@/lib/supabase/server";
import {
  RecycleBinClient,
  type DeletedRecordRow,
} from "./recycle-bin-client";

export const metadata: Metadata = {
  title: "Recycle Bin",
};

function calcDaysRemaining(deletedAtIso: string, nowMs: number): number {
  const deletedMs = new Date(deletedAtIso).getTime();
  if (Number.isNaN(deletedMs)) return 30;
  const expiresMs = deletedMs + 30 * 86_400_000;
  return Math.max(0, Math.ceil((expiresMs - nowMs) / 86_400_000));
}

export default async function RecycleBinPage() {
  await requireRouteAccess("/recycle-bin");
  const supabase = await createClient();
  const nowMs = Date.now();

  const [itemsRes, kitsRes, subsRes, archivesRes, deliveriesRes, requestsRes] =
    await Promise.all([
      supabase
        .from("items_master")
        .select("id, item_code, name, category, room_code, deleted_at, deleted_by")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("item_kits")
        .select("id, kit_code, kit_name, assigned_room, deleted_at, deleted_by")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("subscriptions_vault")
        .select("id, sub_code, service_name, plan_name, login_email, deleted_at, deleted_by")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("archives_hybrid")
        .select("id, doc_code, title, category, cabinet_code, deleted_at, deleted_by")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("deliveries_log")
        .select(
          "id, delivery_code, direction, courier_name, sender_name, receiver_name, deleted_at, deleted_by",
        )
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("internal_requests")
        .select("id, request_code, request_type, title, status, deleted_at, deleted_by")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
    ]);

  const actorIds = new Set<string>();
  const collectActor = (id: string | null) => {
    if (id) actorIds.add(id);
  };

  for (const row of itemsRes.data ?? []) collectActor(row.deleted_by);
  for (const row of kitsRes.data ?? []) collectActor(row.deleted_by);
  for (const row of subsRes.data ?? []) collectActor(row.deleted_by);
  for (const row of archivesRes.data ?? []) collectActor(row.deleted_by);
  for (const row of deliveriesRes.data ?? []) collectActor(row.deleted_by);
  for (const row of requestsRes.data ?? []) collectActor(row.deleted_by);

  const actorMap = new Map<string, string>();
  if (actorIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(actorIds));
    for (const p of profiles ?? []) {
      actorMap.set(p.id, p.full_name?.trim() || p.email || "Admin");
    }
  }

  const resolveActor = (id: string | null) =>
    id ? actorMap.get(id) ?? "Admin" : "Sistem";

  const recordsByTable: Record<RecycleTable, DeletedRecordRow[]> = {
    items_master: (itemsRes.data ?? [])
      .filter((r): r is typeof r & { deleted_at: string } => Boolean(r.deleted_at))
      .map((r) => ({
        id: r.id,
        table: "items_master",
        code: r.item_code,
        title: r.name,
        subtitle: `${r.category} · Ruang ${r.room_code}`,
        deletedAt: r.deleted_at,
        deletedByName: resolveActor(r.deleted_by),
        daysRemaining: calcDaysRemaining(r.deleted_at, nowMs),
      })),
    item_kits: (kitsRes.data ?? [])
      .filter((r): r is typeof r & { deleted_at: string } => Boolean(r.deleted_at))
      .map((r) => ({
        id: r.id,
        table: "item_kits",
        code: r.kit_code,
        title: r.kit_name,
        subtitle: r.assigned_room ? `Ruang ${r.assigned_room}` : "Tanpa ruang khusus",
        deletedAt: r.deleted_at,
        deletedByName: resolveActor(r.deleted_by),
        daysRemaining: calcDaysRemaining(r.deleted_at, nowMs),
      })),
    subscriptions_vault: (subsRes.data ?? [])
      .filter((r): r is typeof r & { deleted_at: string } => Boolean(r.deleted_at))
      .map((r) => ({
        id: r.id,
        table: "subscriptions_vault",
        code: r.sub_code,
        title: r.service_name,
        subtitle: `${r.plan_name || "Paket standar"} · ${r.login_email}`,
        deletedAt: r.deleted_at,
        deletedByName: resolveActor(r.deleted_by),
        daysRemaining: calcDaysRemaining(r.deleted_at, nowMs),
      })),
    archives_hybrid: (archivesRes.data ?? [])
      .filter((r): r is typeof r & { deleted_at: string } => Boolean(r.deleted_at))
      .map((r) => ({
        id: r.id,
        table: "archives_hybrid",
        code: r.doc_code,
        title: r.title,
        subtitle: `${r.category} · Lemari ${r.cabinet_code}`,
        deletedAt: r.deleted_at,
        deletedByName: resolveActor(r.deleted_by),
        daysRemaining: calcDaysRemaining(r.deleted_at, nowMs),
      })),
    deliveries_log: (deliveriesRes.data ?? [])
      .filter((r): r is typeof r & { deleted_at: string } => Boolean(r.deleted_at))
      .map((r) => ({
        id: r.id,
        table: "deliveries_log",
        code: r.delivery_code,
        title: `${r.direction} · ${r.courier_name}`,
        subtitle: `${r.sender_name} → ${r.receiver_name}`,
        deletedAt: r.deleted_at,
        deletedByName: resolveActor(r.deleted_by),
        daysRemaining: calcDaysRemaining(r.deleted_at, nowMs),
      })),
    internal_requests: (requestsRes.data ?? [])
      .filter((r): r is typeof r & { deleted_at: string } => Boolean(r.deleted_at))
      .map((r) => ({
        id: r.id,
        table: "internal_requests",
        code: r.request_code,
        title: r.title,
        subtitle: `${r.request_type} · ${r.status}`,
        deletedAt: r.deleted_at,
        deletedByName: resolveActor(r.deleted_by),
        daysRemaining: calcDaysRemaining(r.deleted_at, nowMs),
      })),
  };

  return <RecycleBinClient recordsByTable={recordsByTable} />;
}
