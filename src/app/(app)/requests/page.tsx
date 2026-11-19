import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type { InternalRequest } from "@/types/database";
import type {
  RequestItemSummary,
  RequestProfileSummary,
  RequestSubSummary,
} from "./helpers";
import { RequestsClient } from "./requests-client";

export const metadata: Metadata = {
  title: "Permintaan & E-Approval",
};

export default async function RequestsPage() {
  const user = await requireRouteAccess("/requests");
  const supabase = await createClient();

  const canViewAllRequests = can(user.role, "request.view_all");
  const canViewVaultLimited = can(user.role, "vault.view_limited");

  const [requestsRes, profilesRes, itemsRes, subsRes] = await Promise.all([
    supabase
      .from("internal_requests")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    canViewAllRequests
      ? supabase
          .from("profiles")
          .select("id, full_name, role, job_title")
          .order("full_name", { ascending: true })
      : Promise.resolve({
          data: [
            {
              id: user.id,
              full_name: user.fullName,
              role: user.role,
              job_title: null,
            },
          ] as RequestProfileSummary[],
          error: null,
        }),
    supabase
      .from("items_master")
      .select("id, item_code, name, room_code, condition")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(500),
    canViewVaultLimited
      ? supabase
          .from("subscriptions_vault_directory")
          .select("id, sub_code, service_name")
          .order("service_name", { ascending: true })
      : Promise.resolve({ data: [] as RequestSubSummary[], error: null }),
  ]);

  const requests: InternalRequest[] = requestsRes.data ?? [];
  const profiles: RequestProfileSummary[] = profilesRes.data ?? [];
  const items: RequestItemSummary[] = itemsRes.data ?? [];
  const subscriptions: RequestSubSummary[] = subsRes.data ?? [];
  const schemaError = requestsRes.error ? requestsRes.error.message : null;

  return (
    <RequestsClient
      initialRequests={requests}
      profiles={profiles}
      items={items}
      subscriptions={subscriptions}
      schemaError={schemaError}
    />
  );
}
