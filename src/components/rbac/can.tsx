"use client";

import type { ReactNode } from "react";

import type { Action, Role } from "@/lib/rbac";
import { useRole } from "./role-provider";

type CanProps = {
  /** Render children only for these roles. */
  roles?: readonly Role[];
  /** Render children only if the role is granted this action. */
  action?: Action;
  /** Rendered when access is denied. */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Declarative UI gate. When both `roles` and `action` are given, both must
 * pass. This only hides UI – RLS and server checks remain the real boundary.
 *
 * @example <Can roles={["OWNER"]}>…</Can>
 * @example <Can action="vault.reveal_secret" fallback={<Masked />}>…</Can>
 */
export function Can({ roles, action, fallback = null, children }: CanProps) {
  const { role, can } = useRole();
  const roleOk = !roles || roles.includes(role);
  const actionOk = !action || can(action);
  return <>{roleOk && actionOk ? children : fallback}</>;
}
