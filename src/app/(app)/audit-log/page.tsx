import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { isValidUuid, sanitizePostgrestValue } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/types/database";
import { AuditLogClient } from "./audit-log-client";

export const metadata: Metadata = {
  title: "Riwayat Aktivitas",
};

type SearchParamsInput = Promise<{
  action?: string;
  entity?: string;
  actor?: string;
  q?: string;
}>;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  await requireRouteAccess("/audit-log");
  const resolvedParams = await searchParams;

  const action = resolvedParams.action?.trim() || "ALL";
  const entityType = resolvedParams.entity?.trim() || "ALL";
  const actor = resolvedParams.actor?.trim() || "ALL";
  const search = resolvedParams.q?.trim() || "";

  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);

  if (action !== "ALL") {
    query = query.eq("action", action);
  }
  if (entityType !== "ALL") {
    query = query.eq("entity_type", entityType);
  }
  if (actor === "__SYSTEM__") {
    query = query.is("actor_id", null);
  } else if (actor !== "ALL" && isValidUuid(actor)) {
    query = query.eq("actor_id", actor);
  }
  if (search) {
    const safeSearch = sanitizePostgrestValue(search, 100);
    if (safeSearch) {
      const safePattern = `%${safeSearch}%`;
      query = query.or(
        `summary.ilike.${safePattern},entity_code.ilike.${safePattern},actor_name.ilike.${safePattern}`,
      );
    }
  }

  const [logsRes, profilesRes] = await Promise.all([
    query,
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true }),
  ]);

  const logs = (logsRes.data ?? []) as AuditLog[];

  const actors = (profilesRes.data ?? []).map((p) => ({
    id: p.id,
    label: `${p.full_name?.trim() || p.email || "Pengguna"} (${ROLE_LABELS[p.role]?.title ?? p.role})`,
  }));

  return (
    <AuditLogClient
      initialLogs={logs}
      actors={actors}
      initialFilters={{
        action,
        entityType,
        actor,
        search,
      }}
    />
  );
}
