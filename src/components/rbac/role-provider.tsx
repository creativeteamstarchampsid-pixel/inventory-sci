"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { can as canDo, hasAnyRole, type Action, type Role } from "@/lib/rbac";

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string;
  role: Role;
};

type RoleContextValue = {
  user: SessionUser;
  role: Role;
  /** Whether the current user may perform an action from ACTION_PERMISSIONS. */
  can: (action: Action) => boolean;
  /** Whether the current user has any of the given roles. */
  hasRole: (...roles: Role[]) => boolean;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  const value = useMemo<RoleContextValue>(
    () => ({
      user,
      role: user.role,
      can: (action) => canDo(user.role, action),
      hasRole: (...roles) => hasAnyRole(user.role, roles),
    }),
    [user],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole() must be used inside <RoleProvider>.");
  }
  return ctx;
}
