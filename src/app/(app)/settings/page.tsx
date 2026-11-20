import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type { Json, Profile } from "@/types/database";
import {
  SettingsClient,
  type OffboardVaultWarning,
} from "./settings-client";

export const metadata: Metadata = {
  title: "Pengaturan",
};

function matchesAssignedUser(json: Json, profile: Profile): boolean {
  if (!Array.isArray(json)) return false;
  const emailLower = profile.email?.trim().toLowerCase();
  const nameLower = profile.full_name?.trim().toLowerCase();

  return json.some((entry) => {
    if (typeof entry === "string") {
      const val = entry.trim().toLowerCase();
      return (
        val === profile.id.toLowerCase() ||
        (Boolean(emailLower) && val === emailLower) ||
        (Boolean(nameLower) && val === nameLower)
      );
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const rec = entry as Record<string, Json | undefined>;
      const uid = typeof rec.user_id === "string" ? rec.user_id.trim().toLowerCase() : "";
      const em = typeof rec.email === "string" ? rec.email.trim().toLowerCase() : "";
      const nm =
        typeof rec.name === "string"
          ? rec.name.trim().toLowerCase()
          : typeof rec.full_name === "string"
            ? rec.full_name.trim().toLowerCase()
            : "";
      return (
        uid === profile.id.toLowerCase() ||
        (Boolean(emailLower) && em === emailLower) ||
        (Boolean(nameLower) && nm === nameLower)
      );
    }
    return false;
  });
}

export default async function SettingsPage() {
  const user = await requireRouteAccess("/settings");
  const supabase = await createClient();
  const canManageUsers = can(user.role, "users.manage");

  let ownProfileData: Profile | null = null;
  let users: Profile[] = [];
  let offboardVaultWarnings: OffboardVaultWarning[] = [];
  const serviceRoleConfigured = canManageUsers
    ? Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.SUPABASE_SERVICE_ROLE_KEY,
      )
    : false;

  if (canManageUsers) {
    const [ownProfileRes, usersRes, subsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriptions_vault_directory")
        .select("sub_code, assigned_users_json, is_active")
        .eq("is_active", true),
    ]);

    users = (usersRes.data ?? []) as Profile[];
    ownProfileData =
      ownProfileRes.data ?? users.find((u) => u.id === user.id) ?? null;
    const activeSubs = subsRes.data ?? [];

    offboardVaultWarnings = users
      .filter((u) => Boolean(u.offboarded_at))
      .map((u) => {
        const codes = activeSubs
          .filter((sub) => matchesAssignedUser(sub.assigned_users_json, u))
          .map((sub) => sub.sub_code);
        return {
          userId: u.id,
          subscriptionCodes: codes,
        };
      })
      .filter((w) => w.subscriptionCodes.length > 0);
  } else {
    const ownProfileRes = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    ownProfileData = ownProfileRes.data ?? null;
  }

  const ownProfile: Profile = ownProfileData ?? {
    id: user.id,
    full_name: user.fullName,
    email: user.email,
    role: user.role,
    is_active: user.isActive,
    phone: null,
    job_title: null,
    offboarded_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <SettingsClient
      ownProfile={ownProfile}
      users={users}
      serviceRoleConfigured={serviceRoleConfigured}
      offboardVaultWarnings={offboardVaultWarnings}
    />
  );
}
