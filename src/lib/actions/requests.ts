"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import type { InternalRequest, RequestType } from "@/types/database";

export type CreateRequestInput = {
  request_type: RequestType;
  title: string;
  description: string;
  related_item_id?: string | null;
  related_sub_id?: string | null;
  estimated_cost?: number | null;
};

export type UpdateRequestInput = {
  title: string;
  description: string;
  related_item_id?: string | null;
  related_sub_id?: string | null;
  estimated_cost?: number | null;
};

export type RequestActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_REQUEST_TYPES = new Set<RequestType>([
  "PENGADAAN_BARANG",
  "LAPORAN_KERUSAKAN",
  "PART_HILANG",
  "AKSES_AKUN",
  "PENGHAPUSAN_ASET",
]);

function normalizeUuidOrNull(val: string | null | undefined): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function validateEstimatedCost(
  cost: number | null | undefined,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (cost === null || cost === undefined || Number.isNaN(cost)) {
    return { ok: true, value: null };
  }
  const num = Number(cost);
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false, error: "Estimasi biaya tidak boleh negatif." };
  }
  return { ok: true, value: num };
}

function ticketRequiresOwnerApproval(request: {
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

function revalidateRequestPaths() {
  revalidatePath("/requests");
  revalidatePath("/dashboard");
}

export async function createRequestAction(
  input: CreateRequestInput,
): Promise<RequestActionResult<{ request: InternalRequest }>> {
  const user = await requireAction("request.create");

  if (!VALID_REQUEST_TYPES.has(input.request_type)) {
    return { ok: false, error: "Jenis tiket pengajuan tidak valid." };
  }

  if (
    input.request_type === "PENGHAPUSAN_ASET" &&
    !can(user.role, "inventory.writeoff_request")
  ) {
    return {
      ok: false,
      error:
        "Hanya Owner atau Admin Operasional yang dapat mengajukan tiket Penghapusan Aset.",
    };
  }

  const title = input.title?.trim() ?? "";
  if (title.length < 3) {
    return { ok: false, error: "Judul pengajuan minimal 3 karakter." };
  }

  const description = input.description?.trim() ?? "";
  if (description.length < 5) {
    return { ok: false, error: "Deskripsi / alasan pengajuan minimal 5 karakter." };
  }

  const costCheck = validateEstimatedCost(input.estimated_cost);
  if (!costCheck.ok) return costCheck;

  const relatedItemId = normalizeUuidOrNull(input.related_item_id);
  if (input.related_item_id && !relatedItemId) {
    return { ok: false, error: "ID item terkait tidak valid." };
  }

  const allowSubLink = can(user.role, "vault.view_limited");
  const relatedSubId = allowSubLink
    ? normalizeUuidOrNull(input.related_sub_id)
    : null;
  if (allowSubLink && input.related_sub_id && !relatedSubId) {
    return { ok: false, error: "ID akun langganan terkait tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("internal_requests")
      .insert({
        request_type: input.request_type,
        title,
        description,
        related_item_id: relatedItemId,
        related_sub_id: relatedSubId,
        estimated_cost: costCheck.value,
        status: "MENUNGGU_TEAM_LEADER",
        requested_by: user.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Gagal membuat tiket pengajuan.",
      };
    }

    revalidateRequestPaths();
    return { ok: true, data: { request: data } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function updateRequestAction(
  requestId: string,
  input: UpdateRequestInput,
): Promise<RequestActionResult<{ request: InternalRequest }>> {
  const user = await requireAction("request.create");

  if (!UUID_RE.test(requestId)) {
    return { ok: false, error: "ID tiket tidak valid." };
  }

  const title = input.title?.trim() ?? "";
  if (title.length < 3) {
    return { ok: false, error: "Judul pengajuan minimal 3 karakter." };
  }

  const description = input.description?.trim() ?? "";
  if (description.length < 5) {
    return { ok: false, error: "Deskripsi pengajuan minimal 5 karakter." };
  }

  const costCheck = validateEstimatedCost(input.estimated_cost);
  if (!costCheck.ok) return costCheck;

  const relatedItemId = normalizeUuidOrNull(input.related_item_id);
  if (input.related_item_id && !relatedItemId) {
    return { ok: false, error: "ID item terkait tidak valid." };
  }

  const allowSubLink = can(user.role, "vault.view_limited");
  const relatedSubId = allowSubLink
    ? normalizeUuidOrNull(input.related_sub_id)
    : undefined;

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("internal_requests")
      .select("*")
      .eq("id", requestId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "Tiket pengajuan tidak ditemukan." };
    }

    if (existing.status !== "MENUNGGU_TEAM_LEADER") {
      return {
        ok: false,
        error:
          "Tiket hanya dapat diubah selama masih berstatus Menunggu Team Leader.",
      };
    }

    const isAdmin = can(user.role, "request.approve_admin");
    if (existing.requested_by !== user.id && !isAdmin) {
      return {
        ok: false,
        error: "Anda tidak memiliki izin untuk mengubah tiket ini.",
      };
    }

    const updatePatch: Partial<InternalRequest> = {
      title,
      description,
      related_item_id: relatedItemId,
      estimated_cost: costCheck.value,
    };
    if (relatedSubId !== undefined) {
      updatePatch.related_sub_id = relatedSubId;
    }

    const { data, error } = await supabase
      .from("internal_requests")
      .update(updatePatch)
      .eq("id", requestId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Gagal memperbarui tiket pengajuan.",
      };
    }

    revalidateRequestPaths();
    return { ok: true, data: { request: data } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function approveRequestAction(
  requestId: string,
  options?: { escalateToOwner?: boolean; finalizeImmediately?: boolean },
): Promise<RequestActionResult<{ request: InternalRequest }>> {
  const user = await requireAction("request.approve");

  if (!UUID_RE.test(requestId)) {
    return { ok: false, error: "ID tiket tidak valid." };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let existing: InternalRequest | null = null;

  try {
    supabase = await createClient();
    const { data, error } = await supabase
      .from("internal_requests")
      .select("*")
      .eq("id", requestId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, error: "Tiket pengajuan tidak ditemukan." };
    }
    existing = data;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }

  // Enforce Owner-only final/write-off actions outside try/catch so NEXT_REDIRECT is preserved
  if (existing.status === "MENUNGGU_OWNER") {
    await requireAction("approval.final");
    if (existing.request_type === "PENGHAPUSAN_ASET") {
      await requireAction("writeoff.approve");
    }
  }

  try {
    const nowIso = new Date().toISOString();

    if (existing.status === "MENUNGGU_TEAM_LEADER") {
      const { data, error } = await supabase
        .from("internal_requests")
        .update({
          status: "MENUNGGU_ADMIN",
          team_leader_approved_by: user.id,
          team_leader_approved_at: nowIso,
        })
        .eq("id", requestId)
        .eq("status", "MENUNGGU_TEAM_LEADER")
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error || !data) {
        return {
          ok: false,
          error: error?.message || "Gagal menyetujui tahap Team Leader.",
        };
      }

      revalidateRequestPaths();
      return { ok: true, data: { request: data } };
    }

    if (existing.status === "MENUNGGU_ADMIN") {
      if (!can(user.role, "request.approve_admin")) {
        return {
          ok: false,
          error:
            "Verifikasi tahap Admin hanya dapat dilakukan oleh Owner atau Admin Operasional.",
        };
      }

      // When OWNER approves at MENUNGGU_ADMIN, finalize straight to DISETUJUI with owner_approved_by
      // (matches DB trigger `guard_internal_requests_transition` — avoids double approval).
      const isOwnerFinal = can(user.role, "approval.final");
      const mustEscalateToOwner =
        !isOwnerFinal &&
        (ticketRequiresOwnerApproval(existing) || Boolean(options?.escalateToOwner));
      const nextStatus = mustEscalateToOwner ? "MENUNGGU_OWNER" : "DISETUJUI";

      const updatePatch: {
        status: "MENUNGGU_OWNER" | "DISETUJUI";
        admin_verified_by: string;
        admin_verified_at: string;
        owner_approved_by?: string;
        owner_approved_at?: string;
      } = {
        status: nextStatus,
        admin_verified_by: user.id,
        admin_verified_at: nowIso,
      };

      if (isOwnerFinal) {
        updatePatch.owner_approved_by = user.id;
        updatePatch.owner_approved_at = nowIso;
      }

      const { data, error } = await supabase
        .from("internal_requests")
        .update(updatePatch)
        .eq("id", requestId)
        .eq("status", "MENUNGGU_ADMIN")
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error || !data) {
        return {
          ok: false,
          error: error?.message || "Gagal memverifikasi tiket tahap Admin.",
        };
      }

      revalidateRequestPaths();
      return { ok: true, data: { request: data } };
    }

    if (existing.status === "MENUNGGU_OWNER") {
      const nextStatus = options?.finalizeImmediately ? "SELESAI" : "DISETUJUI";

      const { data, error } = await supabase
        .from("internal_requests")
        .update({
          status: nextStatus,
          owner_approved_by: user.id,
          owner_approved_at: nowIso,
        })
        .eq("id", requestId)
        .eq("status", "MENUNGGU_OWNER")
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error || !data) {
        return {
          ok: false,
          error: error?.message || "Gagal mengesahkan persetujuan akhir Owner.",
        };
      }

      revalidateRequestPaths();
      return { ok: true, data: { request: data } };
    }

    return {
      ok: false,
      error: "Tiket sudah berada pada tahap akhir dan tidak dapat disetujui lagi.",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function rejectRequestAction(
  requestId: string,
  rejectionReason: string,
): Promise<RequestActionResult<{ request: InternalRequest }>> {
  const user = await requireAction("request.approve");

  if (!UUID_RE.test(requestId)) {
    return { ok: false, error: "ID tiket tidak valid." };
  }

  const reason = rejectionReason?.trim() ?? "";
  if (reason.length < 3) {
    return {
      ok: false,
      error: "Alasan penolakan wajib diisi (minimal 3 karakter).",
    };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let existing: InternalRequest | null = null;

  try {
    supabase = await createClient();
    const { data, error } = await supabase
      .from("internal_requests")
      .select("*")
      .eq("id", requestId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, error: "Tiket pengajuan tidak ditemukan." };
    }
    existing = data;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }

  if (existing.status === "MENUNGGU_OWNER") {
    await requireAction("approval.final");
  }

  try {
    if (
      existing.status !== "MENUNGGU_TEAM_LEADER" &&
      existing.status !== "MENUNGGU_ADMIN" &&
      existing.status !== "MENUNGGU_OWNER"
    ) {
      return {
        ok: false,
        error: "Tiket yang sudah diproses akhir tidak dapat ditolak.",
      };
    }

    if (
      existing.status === "MENUNGGU_ADMIN" &&
      !can(user.role, "request.approve_admin")
    ) {
      return {
        ok: false,
        error:
          "Penolakan pada tahap Admin hanya dapat dilakukan oleh Owner atau Admin Operasional.",
      };
    }

    const { data, error } = await supabase
      .from("internal_requests")
      .update({
        status: "DITOLAK",
        rejection_reason: reason,
      })
      .eq("id", requestId)
      .eq("status", existing.status)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Gagal menolak tiket pengajuan.",
      };
    }

    revalidateRequestPaths();
    return { ok: true, data: { request: data } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function completeRequestAction(
  requestId: string,
): Promise<RequestActionResult<{ request: InternalRequest }>> {
  await requireAction("request.complete");

  if (!UUID_RE.test(requestId)) {
    return { ok: false, error: "ID tiket tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("internal_requests")
      .select("*")
      .eq("id", requestId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "Tiket pengajuan tidak ditemukan." };
    }

    if (existing.status !== "DISETUJUI") {
      return {
        ok: false,
        error: "Hanya tiket berstatus Disetujui yang dapat ditandai Selesai.",
      };
    }

    const { data, error } = await supabase
      .from("internal_requests")
      .update({ status: "SELESAI" })
      .eq("id", requestId)
      .eq("status", "DISETUJUI")
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Gagal menyelesaikan tiket pengajuan.",
      };
    }

    revalidateRequestPaths();
    return { ok: true, data: { request: data } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}

export async function softDeleteRequestAction(
  requestId: string,
): Promise<RequestActionResult<{ id: string }>> {
  const user = await requireAction("request.delete");

  if (!UUID_RE.test(requestId)) {
    return { ok: false, error: "ID tiket tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("internal_requests")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq("id", requestId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Tiket tidak ditemukan atau sudah dihapus.",
      };
    }

    revalidateRequestPaths();
    revalidatePath("/recycle-bin");
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
    };
  }
}
