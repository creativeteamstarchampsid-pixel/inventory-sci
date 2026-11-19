import type { Role } from "@/lib/rbac";
import type {
  ItemCondition,
  LocationCode,
  RequestStatus,
  RequestType,
} from "@/types/database";

export type RequestProfileSummary = {
  id: string;
  full_name: string | null;
  role: Role;
  job_title: string | null;
};

export type RequestItemSummary = {
  id: string;
  item_code: string;
  name: string;
  room_code: LocationCode;
  condition: ItemCondition;
};

export type RequestSubSummary = {
  id: string;
  sub_code: string;
  service_name: string;
};

export const REQUEST_STATUS_BADGE_VARIANT: Record<
  RequestStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  MENUNGGU_TEAM_LEADER: "outline",
  MENUNGGU_ADMIN: "secondary",
  MENUNGGU_OWNER: "default",
  DISETUJUI: "default",
  DITOLAK: "destructive",
  SELESAI: "secondary",
};

export function requiresOwnerFinalApproval(request: {
  request_type: RequestType;
  estimated_cost: number | null;
}): boolean {
  if (request.request_type === "PENGHAPUSAN_ASET") return true;
  if (
    request.request_type === "PENGADAAN_BARANG" &&
    typeof request.estimated_cost === "number" &&
    request.estimated_cost > 0
  ) {
    return true;
  }
  return false;
}

export function isActionableByRole(
  status: RequestStatus,
  role: Role,
): boolean {
  if (status === "MENUNGGU_TEAM_LEADER") {
    return role === "TEAM_LEADER" || role === "SUPER_ADMIN" || role === "OWNER";
  }
  if (status === "MENUNGGU_ADMIN") {
    return role === "SUPER_ADMIN" || role === "OWNER";
  }
  if (status === "MENUNGGU_OWNER") {
    return role === "OWNER";
  }
  return false;
}

export function profileDisplayName(
  map: Map<string, RequestProfileSummary>,
  userId: string | null,
): string {
  if (!userId) return "-";
  const found = map.get(userId);
  return found?.full_name?.trim() || "Pengguna";
}
