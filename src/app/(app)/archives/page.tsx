import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ArchivesClient,
  type ArchiveListItem,
  type ArchiveProfileOption,
} from "./archives-client";

export const metadata: Metadata = {
  title: "Arsip Hybrid",
};

export default async function ArchivesPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  await requireRouteAccess("/archives");
  const resolvedSearchParams = await searchParams;
  const rawCode = resolvedSearchParams?.code;
  const initialCode =
    typeof rawCode === "string"
      ? rawCode.trim()
      : Array.isArray(rawCode) && typeof rawCode[0] === "string"
        ? rawCode[0].trim()
        : "";

  const supabase = await createClient();

  const [archivesRes, profilesRes] = await Promise.all([
    supabase
      .from("archives_hybrid")
      .select("*")
      .is("deleted_at", null)
      .order("cabinet_code", { ascending: true })
      .order("drawer_no", { ascending: true })
      .order("updated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .order("full_name", { ascending: true }),
  ]);

  const profiles: ArchiveProfileOption[] = (profilesRes.data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    is_active: p.is_active,
  }));

  const profileNameMap = new Map<string, string>();
  for (const p of profiles) {
    if (p.full_name) profileNameMap.set(p.id, p.full_name);
  }

  const archives: ArchiveListItem[] = (archivesRes.data ?? []).map((row) => ({
    ...row,
    borrower_name: row.borrowed_by
      ? profileNameMap.get(row.borrowed_by) ?? null
      : null,
  }));

  return (
    <ArchivesClient
      archives={archives}
      profiles={profiles}
      initialCode={initialCode}
      schemaError={archivesRes.error?.message ?? null}
    />
  );
}
