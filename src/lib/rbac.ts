/**
 * StarOps RBAC – single source of truth for role-based access on the client,
 * server components and middleware.
 *
 * Mirrors the `public.user_role` enum and the RLS policies in
 * `supabase/schema.sql`. RLS stays the real security boundary; this module
 * decides what the UI shows and which routes the middleware lets through.
 */

export const ROLES = ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<Role, { title: string; subtitle: string }> = {
  OWNER: { title: "Owner", subtitle: "Pemilik / Direktur" },
  SUPER_ADMIN: { title: "Admin Operasional", subtitle: "Pengelola Utama" },
  TEAM_LEADER: { title: "Kepala Terapis", subtitle: "Koordinator Tim" },
  STAFF: { title: "Terapis", subtitle: "Tim Terapis & Staf" },
};

const ALL: readonly Role[] = ROLES;
const MANAGEMENT: readonly Role[] = ["OWNER", "SUPER_ADMIN", "TEAM_LEADER"];
const ADMINS: readonly Role[] = ["OWNER", "SUPER_ADMIN"];

/* -------------------------------------------------------------------------- */
/*                               Route matrix                                 */
/* -------------------------------------------------------------------------- */

/**
 * Route prefix -> roles allowed to open it. Matching is by longest prefix, so
 * nested routes (e.g. /inventory/123) inherit their parent's rule unless a
 * more specific entry exists.
 */
export const ROUTE_PERMISSIONS: Record<string, readonly Role[]> = {
  "/dashboard": ALL,
  // User guide for every role (shows only the signed-in role's guide).
  "/guide": ALL,
  // Everyone sees inventory (STAFF/TEAM_LEADER: read + hygiene + report issues; ADMINS: full CRUD & valuation).
  "/inventory": ALL,
  // Kits: STAFF/TEAM_LEADER can view and check out/return; ADMINS manage them.
  "/kits": ALL,
  // Barcode & label print studio is an admin tool.
  "/barcode-studio": ADMINS,
  // Borrow / return scanning – open to all; Stock Opname tab gated by inventory.validate_opname.
  "/scan": ALL,
  // Subscription Vault: Owner & Admin Operasional only.
  "/vault": ADMINS,
  // Hybrid archive: STAFF reads public SOPs only (enforced by RLS); TEAM_LEADER reads all docs; ADMINS manage.
  "/archives": ALL,
  // Deliveries & logistics: Owner & Admin Operasional only.
  "/deliveries": ADMINS,
  // Internal Request Hub: STAFF create & see own tickets; MANAGEMENT approves per stage.
  "/requests": ALL,
  // Activity stream / audit trail: Owner & Admin Operasional only.
  "/audit-log": ADMINS,
  // Export, Monthly Reconciliation & Backup Center: TEAM_LEADER gets room opname + operational exports; ADMINS get backups; OWNER gets final lock & restore.
  "/backup": MANAGEMENT,
  // 30-day recycle bin (view & restore: ADMINS; permanent purge: OWNER only).
  "/recycle-bin": ADMINS,
  // Personal settings for everyone; user management gated by users.manage / users.manage_admins.
  "/settings": ALL,
};

/** Routes that never require a session. */
export const PUBLIC_ROUTES = [
  "/login",
  "/auth",
  "/forgot-password",
  "/reset-password",
] as const;

/** Routes that require a session but no particular role. */
export const AUTH_ONLY_ROUTES = ["/forbidden"] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => matchesPrefix(pathname, p));
}

/** Returns the roles allowed for a pathname, or `null` when no rule exists. */
export function getRouteRoles(pathname: string): readonly Role[] | null {
  let best: string | null = null;
  for (const prefix of Object.keys(ROUTE_PERMISSIONS)) {
    if (matchesPrefix(pathname, prefix) && (!best || prefix.length > best.length)) {
      best = prefix;
    }
  }
  return best ? ROUTE_PERMISSIONS[best] : null;
}

/**
 * Whether `role` may open `pathname`. Paths without an explicit rule are
 * allowed for any authenticated user (e.g. `/`, `/forbidden`).
 */
export function canAccessRoute(role: Role | null | undefined, pathname: string): boolean {
  const allowed = getRouteRoles(pathname);
  if (!allowed) return true;
  return !!role && allowed.includes(role);
}

/* -------------------------------------------------------------------------- */
/*                              Action matrix                                 */
/* -------------------------------------------------------------------------- */

export const ACTION_PERMISSIONS = {
  // Inventory, office assets & therapy toys
  "inventory.view": ALL,
  "inventory.view_valuation": ADMINS, // harga beli, nilai buku, penyusutan
  "inventory.create": ADMINS,
  "inventory.update": ADMINS,
  "inventory.delete": ADMINS,
  "inventory.report_issue": ALL, // missing parts / damage report
  "inventory.update_hygiene": ALL,
  "inventory.validate_opname": MANAGEMENT, // room & item stock-opname validation
  "inventory.writeoff_request": ADMINS, // submit PENGHAPUSAN_ASET ticket

  // Kits
  "kits.view": ALL,
  "kits.manage": ADMINS,
  "kits.checkout": ALL,

  // Barcode studio
  "barcode.print": ADMINS,

  // Scan borrow / return
  "scan.borrow_return": ALL,

  // Subscription vault (ADMINS only — Owner & Admin Operasional)
  "vault.view_limited": ADMINS,
  "vault.view_billing": ADMINS, // cost, payment method
  "vault.reveal_secret": ADMINS, // decrypt + copy, always audit-logged
  "vault.manage": ADMINS, // create, edit, rotate password, soft-delete

  // Hybrid archive
  "archive.view": ALL,
  "archive.manage": ADMINS,

  // Deliveries & logistics (ADMINS only — Owner & Admin Operasional)
  "delivery.view": ADMINS,
  "delivery.manage": ADMINS,
  "delivery.convert_to_stock": ADMINS,

  // Internal requests & e-approval
  "request.create": ALL,
  "request.view_all": MANAGEMENT,
  "request.approve": MANAGEMENT, // Stage 1 approval (MENUNGGU_TEAM_LEADER)
  "request.approve_admin": ADMINS, // Stage 2 verification (MENUNGGU_ADMIN)
  "request.complete": ADMINS, // DISETUJUI -> SELESAI
  "request.delete": ADMINS, // soft-delete ticket to recycle bin
  "approval.final": ["OWNER"], // final e-approval (MENUNGGU_OWNER)
  "writeoff.approve": ["OWNER"], // approve write-off & set DIHAPUSBUKU

  // Audit trail (ADMINS only)
  "audit.view": ADMINS,

  // Export, monthly reconciliation & backups
  "export.data": MANAGEMENT, // operational exports (TL without valuation/vault/deliveries/audit)
  "export.financial": ADMINS, // valuation, deliveries, vault, audit exports
  "reconciliation.submit": MANAGEMENT, // room opname checklist & Team Leader stage
  "reconciliation.verify_admin": ADMINS, // Admin Ops verification stage (Owner may also sign)
  "reconciliation.approve_final": ["OWNER"], // final lock & sign-off
  "backup.view": ADMINS,
  "backup.download": ADMINS,
  "backup.run_manual": ADMINS, // create manual / pre-update / cut-off backup
  "backup.restore": ["OWNER"], // destructive point-in-time DB restore (OWNER only)

  // Recycle bin
  "recycle.view": ADMINS,
  "recycle.restore": ADMINS,
  "recycle.purge": ["OWNER"], // permanent hard-delete & purge >30 days (OWNER only)

  // Settings & user management
  "settings.profile": ALL,
  "users.manage": ADMINS, // manage TEAM_LEADER & STAFF (and all roles for OWNER)
  "users.manage_admins": ["OWNER"], // manage OWNER & SUPER_ADMIN accounts (OWNER only)
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof ACTION_PERMISSIONS;

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return (ACTION_PERMISSIONS[action] as readonly Role[]).includes(role);
}

export function hasAnyRole(
  role: Role | null | undefined,
  roles: readonly Role[],
): boolean {
  return !!role && roles.includes(role);
}

/**
 * Whether `actorRole` is allowed to manage (create, change role, activate,
 * deactivate, or offboard) a user with `targetRole`.
 * - OWNER may manage all 4 roles.
 * - SUPER_ADMIN (Admin Operasional) may manage TEAM_LEADER and STAFF only.
 */
export function canManageTargetRole(
  actorRole: Role | null | undefined,
  targetRole: Role,
): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "SUPER_ADMIN") {
    return targetRole === "TEAM_LEADER" || targetRole === "STAFF";
  }
  return false;
}

/**
 * Roles that `actorRole` may assign when inviting/creating a user or changing
 * another user's role.
 */
export function getAssignableRoles(actorRole: Role | null | undefined): Role[] {
  if (actorRole === "OWNER") {
    return ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"];
  }
  if (actorRole === "SUPER_ADMIN") {
    return ["TEAM_LEADER", "STAFF"];
  }
  return [];
}

/** Where to send a signed-in user who lands on `/` or is bounced from a route. */
export const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard";
