import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { can, canAccessRoute, isRole, type Action, type Role } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string;
  role: Role;
  isActive: boolean;
};

type SessionState =
  | { status: "anonymous" }
  | { status: "no-profile"; userId: string }
  | { status: "ok"; user: CurrentUser };

/** Resolves the session + profile once per request (React `cache`). */
const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile || !isRole(profile.role)) {
    return { status: "no-profile", userId: user.id };
  }

  return {
    status: "ok",
    user: {
      id: profile.id,
      email: profile.email ?? user.email ?? null,
      fullName:
        profile.full_name?.trim() ||
        profile.email ||
        user.email?.split("@")[0] ||
        "Pengguna",
      role: profile.role,
      isActive: profile.is_active,
    },
  };
});

/** The signed-in user's profile, or `null` (no session / no usable profile). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const state = await getSessionState();
  return state.status === "ok" ? state.user : null;
}

/**
 * Returns the active signed-in user or redirects: anonymous -> /login,
 * missing profile or deactivated account -> /forbidden.
 */
export async function requireUser(): Promise<CurrentUser> {
  const state = await getSessionState();
  if (state.status === "anonymous") redirect("/login");
  if (state.status === "no-profile") redirect("/forbidden?reason=no-profile");
  if (!state.user.isActive) redirect("/forbidden?reason=inactive");
  return state.user;
}

/**
 * Authoritative server-side route guard for pages and server actions:
 * requires an active user with a valid profile allowed on `pathname`.
 */
export async function requireRouteAccess(pathname: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canAccessRoute(user.role, pathname)) {
    redirect(`/forbidden?from=${encodeURIComponent(pathname)}`);
  }
  return user;
}

/** Requires an active user whose role is granted `action`. */
export async function requireAction(action: Action): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, action)) redirect("/forbidden");
  return user;
}
