import { APP_TIME_ZONE } from "@/lib/period";
import type { AssignedVaultUser } from "@/lib/actions/vault";
import type { BillingCycle, Json, PaymentMethod, UserRole } from "@/types/database";

export type VaultSubscriptionItem = {
  id: string;
  sub_code: string;
  service_name: string;
  plan_name: string | null;
  login_email: string;
  billing_cycle: BillingCycle;
  cost: number | null;
  currency: string | null;
  payment_method: PaymentMethod | null;
  payment_account_label: string | null;
  renewal_date: string | null;
  auto_renew: boolean;
  max_slots: number;
  assigned_users: AssignedVaultUser[];
  password_rotated_at: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type VaultProfileOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  offboarded_at: string | null;
  updated_at: string;
};

export type OffboardedUserFlag = {
  userId: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  offboardedAt: string | null;
};

export type RenewalAlertInfo = {
  daysLeft: number | null;
  tier: "overdue" | "h1" | "h3" | "h7" | "normal" | "none";
  label: string;
};

export function parseAssignedUsers(raw: Json): AssignedVaultUser[] {
  if (!Array.isArray(raw)) return [];
  const result: AssignedVaultUser[] = [];

  for (const entry of raw) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      if (trimmed.includes("@")) {
        result.push({ user_id: trimmed, full_name: null, email: trimmed });
      } else {
        result.push({ user_id: trimmed, full_name: null, email: null });
      }
      continue;
    }

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const obj = entry as Record<string, unknown>;
      const uid =
        (typeof obj.user_id === "string" && obj.user_id) ||
        (typeof obj.id === "string" && obj.id) ||
        (typeof obj.profile_id === "string" && obj.profile_id) ||
        (typeof obj.email === "string" && obj.email) ||
        "";
      if (!uid) continue;

      const fullName =
        (typeof obj.full_name === "string" && obj.full_name) ||
        (typeof obj.name === "string" && obj.name) ||
        null;
      const email = typeof obj.email === "string" ? obj.email : null;
      const role = typeof obj.role === "string" ? (obj.role as UserRole) : undefined;

      result.push({
        user_id: uid,
        full_name: fullName,
        email,
        role,
      });
    }
  }

  return result;
}

export function getRenewalAlert(
  renewalDate: string | null,
  isActive: boolean,
): RenewalAlertInfo {
  if (!renewalDate || !isActive) {
    return { daysLeft: null, tier: "none", label: "-" };
  }

  const targetMs = new Date(`${renewalDate}T00:00:00+07:00`).getTime();
  if (Number.isNaN(targetMs)) {
    return { daysLeft: null, tier: "none", label: "-" };
  }

  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
  }).format(new Date());
  const todayMs = new Date(`${todayStr}T00:00:00+07:00`).getTime();
  const daysLeft = Math.round((targetMs - todayMs) / 86_400_000);

  if (daysLeft < 0) {
    return {
      daysLeft,
      tier: "overdue",
      label: `Lewat ${Math.abs(daysLeft)} hari`,
    };
  }
  if (daysLeft === 0) {
    return { daysLeft, tier: "h1", label: "Jatuh Tempo Hari Ini" };
  }
  if (daysLeft === 1) {
    return { daysLeft, tier: "h1", label: "H-1" };
  }
  if (daysLeft <= 3) {
    return { daysLeft, tier: "h3", label: `H-${daysLeft}` };
  }
  if (daysLeft <= 7) {
    return { daysLeft, tier: "h7", label: `H-${daysLeft}` };
  }
  return { daysLeft, tier: "normal", label: `H-${daysLeft}` };
}

/**
 * Cross-references `assigned_users_json` against `profiles` to detect accounts
 * where an assigned user is inactive or offboarded after the last password rotation.
 */
export function findOffboardedUsersForSub(
  assignedUsers: AssignedVaultUser[],
  passwordRotatedAt: string,
  profilesById: Map<string, VaultProfileOption>,
  profilesByEmail: Map<string, VaultProfileOption>,
): OffboardedUserFlag[] {
  const rotatedMs = new Date(passwordRotatedAt).getTime();
  const flagged: OffboardedUserFlag[] = [];
  const seenIds = new Set<string>();

  for (const assigned of assignedUsers) {
    const profile =
      profilesById.get(assigned.user_id) ??
      (assigned.email
        ? profilesByEmail.get(assigned.email.toLowerCase())
        : undefined);

    if (!profile) continue;
    if (seenIds.has(profile.id)) continue;

    const isOffboardedOrInactive =
      !profile.is_active || profile.offboarded_at !== null;
    if (!isOffboardedOrInactive) continue;

    const eventTimestamp = profile.offboarded_at ?? profile.updated_at;
    const eventMs = new Date(eventTimestamp).getTime();

    const needsRotation =
      Number.isNaN(rotatedMs) ||
      Number.isNaN(eventMs) ||
      eventMs > rotatedMs;

    if (needsRotation) {
      seenIds.add(profile.id);
      flagged.push({
        userId: profile.id,
        displayName:
          profile.full_name?.trim() ||
          assigned.full_name ||
          profile.email ||
          "Pengguna Nonaktif",
        email: profile.email ?? assigned.email,
        isActive: profile.is_active,
        offboardedAt: profile.offboarded_at,
      });
    }
  }

  return flagged;
}
