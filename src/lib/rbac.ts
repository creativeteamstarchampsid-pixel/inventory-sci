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
  // User guide for every role.
  "/guide": ALL,
  // Everyone sees inventory (STAFF: read + report missing parts / damage).
  "/inventory": ALL,
  // Kits: STAFF can view and check out kits; SUPER_ADMIN/OWNER manage them.
  "/kits": ALL,
  // Barcode & label print studio is an admin tool.
  "/barcode-studio": ADMINS,
  // Borrow / return scanning – primary STAFF workflow, open to all.
  "/scan": ALL,
  // STAFF has no access to the Subscription Vault; TEAM_LEADER is view-limited.
  "/vault": MANAGEMENT,
  // Hybrid archive: STAFF can read SOPs / documents (RLS limits the rows).
  "/archives": ALL,
  // Deliveries: managed by SUPER_ADMIN, visible to OWNER and TEAM_LEADER.
  "/deliveries": MANAGEMENT,
  // Internal Request Hub: STAFF create tickets, management approves.
  "/requests": ALL,
  // Activity stream / audit trail: oversight roles only.
  "/audit-log": MANAGEMENT,
  // Export & Backup Center: STAFF has no access to backups.
  "/backup": MANAGEMENT,
  // 30-day recycle bin (soft-delete restore).
  "/recycle-bin": ADMINS,
  // Personal settings for everyone; user management gated by action below.
  "/settings": ALL,
};

/** Routes that never require a session. */
export const PUBLIC_ROUTES = ["/login", "/auth"] as const;

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
  "inventory.create": ADMINS,
  "inventory.update": ADMINS,
  "inventory.delete": ADMINS,
  "inventory.report_issue": ALL, // missing parts / damage report
  "inventory.update_hygiene": ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"],
  "inventory.validate_opname": MANAGEMENT, // room stock-opname validation
  "inventory.writeoff_request": ADMINS,

  // Kits
  "kits.view": ALL,
  "kits.manage": ADMINS,
  "kits.checkout": ALL,

  // Barcode studio
  "barcode.print": ADMINS,

  // Scan borrow / return
  "scan.borrow_return": ALL,

  // Subscription vault
  "vault.view_limited": MANAGEMENT, // service, plan, renewal, slots – no secrets
  "vault.view_billing": ADMINS, // cost, payment method
  "vault.reveal_secret": ADMINS, // decrypt + copy, always audit-logged
  "vault.manage": ["SUPER_ADMIN"],

  // Hybrid archive
  "archive.view": ALL,
  "archive.manage": ADMINS,

  // Deliveries & logistics
  "delivery.view": MANAGEMENT,
  "delivery.manage": ["SUPER_ADMIN"],
  "delivery.convert_to_stock": ["SUPER_ADMIN"],

  // Internal requests & e-approval
  "request.create": ALL,
  "request.view_all": MANAGEMENT,
  "request.approve": MANAGEMENT, // intermediate approval steps
  "approval.final": ["OWNER"], // final e-approval (monthly reports, write-offs)
  "writeoff.approve": ["OWNER"],

  // Audit trail
  "audit.view": MANAGEMENT,

  // Export, monthly reconciliation & backups
  "export.data": MANAGEMENT,
  "reconciliation.submit": ["SUPER_ADMIN", "TEAM_LEADER"],
  "reconciliation.approve_final": ["OWNER"],
  "backup.view": ADMINS,
  "backup.download": ADMINS,
  "backup.run_manual": ["SUPER_ADMIN"],
  "backup.restore": ["SUPER_ADMIN"],

  // Recycle bin
  "recycle.view": ADMINS,
  "recycle.restore": ADMINS,
  "recycle.purge": ["SUPER_ADMIN"],

  // Settings
  "settings.profile": ALL,
  "users.manage": ADMINS,
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

/** Where to send a signed-in user who lands on `/` or is bounced from a route. */
export const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard";
