import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VaultClient } from "./vault-client";
import {
  parseAssignedUsers,
  type VaultProfileOption,
  type VaultSubscriptionItem,
} from "./vault-types";

export const metadata: Metadata = {
  title: "Brankas Akun Digital",
};

export default async function VaultPage() {
  await requireRouteAccess("/vault");
  const supabase = await createClient();

  let subscriptions: VaultSubscriptionItem[] = [];
  let schemaError: string | null = null;

  // OWNER & Admin Operasional (ADMINS): query subscriptions_vault explicitly WITHOUT encrypted columns
  const { data, error } = await supabase
    .from("subscriptions_vault")
    .select(
      "id, sub_code, service_name, plan_name, login_email, billing_cycle, cost, currency, payment_method, payment_account_label, renewal_date, auto_renew, max_slots, assigned_users_json, password_rotated_at, notes, is_active, created_at, updated_at",
    )
    .is("deleted_at", null)
    .order("renewal_date", { ascending: true, nullsFirst: false })
    .order("service_name", { ascending: true });

  if (error) {
    schemaError = error.message;
  } else {
    subscriptions = (data ?? []).map((row) => ({
      id: row.id,
      sub_code: row.sub_code,
      service_name: row.service_name,
      plan_name: row.plan_name,
      login_email: row.login_email,
      billing_cycle: row.billing_cycle,
      cost: Number(row.cost ?? 0),
      currency: row.currency,
      payment_method: row.payment_method,
      payment_account_label: row.payment_account_label,
      renewal_date: row.renewal_date,
      auto_renew: row.auto_renew,
      max_slots: row.max_slots,
      assigned_users: parseAssignedUsers(row.assigned_users_json),
      password_rotated_at: row.password_rotated_at,
      notes: row.notes,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, offboarded_at, updated_at")
    .order("full_name", { ascending: true });

  const profiles: VaultProfileOption[] = (profilesData ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: p.role,
    is_active: p.is_active,
    offboarded_at: p.offboarded_at,
    updated_at: p.updated_at,
  }));

  const rawKey = process.env.VAULT_ENCRYPTION_KEY?.trim() ?? "";
  const vaultKeyConfigured = rawKey.length >= 16;

  return (
    <VaultClient
      subscriptions={subscriptions}
      profiles={profiles}
      vaultKeyConfigured={vaultKeyConfigured}
      schemaError={schemaError}
    />
  );
}
