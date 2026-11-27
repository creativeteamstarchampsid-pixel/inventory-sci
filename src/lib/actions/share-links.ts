"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { can, hasAnyRole } from "@/lib/rbac";
import { isValidUuid, sanitizeSafeError } from "@/lib/security";
import {
  buildShortSharePath,
  normalizeShareSlug,
  suggestReadableSlug,
  validateShareSlug,
  type ShareTargetType,
} from "@/lib/share-links";
import { createClient } from "@/lib/supabase/server";

export type ShareLinkResultData = {
  slug: string;
  canCustomize: boolean;
};

export type ShareActionResult<T = ShareLinkResultData> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

type ResolvedTarget = {
  code: string;
  title: string;
  locationCode: string | null;
};

const VALID_TARGET_TYPES = new Set<ShareTargetType>(["ITEM", "ARCHIVE", "DELIVERY"]);

async function resolveAccessibleTarget(
  role: "OWNER" | "SUPER_ADMIN" | "TEAM_LEADER" | "STAFF",
  targetType: ShareTargetType,
  targetId: string,
): Promise<ResolvedTarget | null> {
  const supabase = await createClient();

  if (targetType === "ITEM") {
    const { data } = await supabase
      .from("items_master")
      .select("id, item_code, name, room_code")
      .eq("id", targetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!data) return null;
    return {
      code: data.item_code,
      title: data.name,
      locationCode: data.room_code,
    };
  }

  if (targetType === "ARCHIVE") {
    const { data } = await supabase
      .from("archives_hybrid")
      .select("id, doc_code, title, cabinet_code")
      .eq("id", targetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!data) return null;
    return {
      code: data.doc_code,
      title: data.title,
      locationCode: data.cabinet_code,
    };
  }

  // DELIVERY (Surat Jalan, BAST & Pengiriman — OWNER & SUPER_ADMIN only)
  if (!can(role, "delivery.view")) {
    return null;
  }

  const { data } = await supabase
    .from("deliveries_log")
    .select("id, delivery_code, package_type, sender_name, receiver_name")
    .eq("id", targetId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  const label = data.package_type?.trim() || `${data.sender_name} ke ${data.receiver_name}`;
  return {
    code: data.delivery_code,
    title: label,
    locationCode: null,
  };
}

function userCanCustomizeRow(
  userId: string,
  role: "OWNER" | "SUPER_ADMIN" | "TEAM_LEADER" | "STAFF",
  createdBy: string | null,
): boolean {
  if (hasAnyRole(role, ["OWNER", "SUPER_ADMIN", "TEAM_LEADER"])) {
    return true;
  }
  return createdBy === userId;
}

async function isSlugTakenByAnotherTarget(
  slug: string,
  targetType: ShareTargetType,
  targetId: string,
): Promise<boolean> {
  const supabase = await createClient();

  const [itemOrArchiveRes, deliveryRes] = await Promise.all([
    supabase
      .from("share_short_links")
      .select("id, target_type, target_id")
      .eq("slug", slug)
      .maybeSingle(),
    supabase
      .from("delivery_share_links")
      .select("id, delivery_id")
      .eq("slug", slug)
      .maybeSingle(),
  ]);

  if (
    itemOrArchiveRes.data &&
    !(
      itemOrArchiveRes.data.target_type === targetType &&
      itemOrArchiveRes.data.target_id === targetId
    )
  ) {
    return true;
  }

  if (
    deliveryRes.data &&
    !(targetType === "DELIVERY" && deliveryRes.data.delivery_id === targetId)
  ) {
    return true;
  }

  return false;
}

/**
 * Returns an existing short link slug for an item, archive/letter, or delivery
 * Surat Jalan/BAST, or automatically creates a readable slug on first share.
 */
export async function getOrCreateShareLinkAction(input: {
  targetType: ShareTargetType;
  targetId: string;
}): Promise<ShareActionResult> {
  const user = await requireUser();

  if (!VALID_TARGET_TYPES.has(input.targetType)) {
    return { ok: false, error: "Tipe target pratinjau tidak valid." };
  }
  if (!isValidUuid(input.targetId)) {
    return { ok: false, error: "ID item, surat, atau arsip tidak valid." };
  }

  const target = await resolveAccessibleTarget(user.role, input.targetType, input.targetId);
  if (!target) {
    return {
      ok: false,
      error: "Data tidak ditemukan, atau Anda tidak memiliki akses untuk membagikannya.",
    };
  }

  const supabase = await createClient();

  if (input.targetType === "DELIVERY") {
    const { data: existingDel, error: existingDelErr } = await supabase
      .from("delivery_share_links")
      .select("id, slug, created_by")
      .eq("delivery_id", input.targetId)
      .maybeSingle();

    if (existingDelErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          existingDelErr,
          "Gagal memeriksa link pratinjau pengiriman tersimpan.",
          "share-links/getExistingDelivery",
        ),
      };
    }

    if (existingDel) {
      return {
        ok: true,
        data: {
          slug: existingDel.slug,
          canCustomize: true,
        },
      };
    }

    const baseSlug = suggestReadableSlug("DELIVERY", target.title, target.code, null);
    const codeSlug = normalizeShareSlug(target.code, 42);
    const candidates = Array.from(
      new Set(
        [
          baseSlug,
          codeSlug,
          ...Array.from({ length: 7 }, (_, i) =>
            normalizeShareSlug(`${baseSlug.slice(0, 52)}-${i + 2}`, 60),
          ),
        ].filter((c) => validateShareSlug(c).ok),
      ),
    );

    for (const candidateSlug of candidates) {
      const taken = await isSlugTakenByAnotherTarget(
        candidateSlug,
        "DELIVERY",
        input.targetId,
      );
      if (taken) continue;

      const { data: inserted, error: insertErr } = await supabase
        .from("delivery_share_links")
        .insert({
          slug: candidateSlug,
          delivery_id: input.targetId,
          created_by: user.id,
          updated_by: user.id,
        })
        .select("slug")
        .single();

      if (!insertErr && inserted) {
        revalidatePath(buildShortSharePath(inserted.slug));
        return {
          ok: true,
          data: { slug: inserted.slug, canCustomize: true },
        };
      }

      if (insertErr?.code === "23505") {
        const { data: raceRow } = await supabase
          .from("delivery_share_links")
          .select("slug")
          .eq("delivery_id", input.targetId)
          .maybeSingle();
        if (raceRow) {
          return {
            ok: true,
            data: { slug: raceRow.slug, canCustomize: true },
          };
        }
        continue;
      }

      return {
        ok: false,
        error: sanitizeSafeError(
          insertErr,
          "Gagal membuat link pendek Surat Jalan / Pengiriman.",
          "share-links/createDeliveryDefault",
        ),
      };
    }

    return {
      ok: false,
      error: "Semua nama link pendek otomatis sudah terpakai. Silakan isi slug kustom.",
    };
  }

  // ITEM or ARCHIVE
  const { data: existing, error: existingErr } = await supabase
    .from("share_short_links")
    .select("id, slug, created_by")
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .maybeSingle();

  if (existingErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        existingErr,
        "Gagal memeriksa link pratinjau tersimpan.",
        "share-links/getExisting",
      ),
    };
  }

  if (existing) {
    return {
      ok: true,
      data: {
        slug: existing.slug,
        canCustomize: userCanCustomizeRow(user.id, user.role, existing.created_by),
      },
    };
  }

  const baseSlug = suggestReadableSlug(
    input.targetType,
    target.title,
    target.code,
    target.locationCode,
  );
  const locSuffix = normalizeShareSlug(target.locationCode ?? "", 12);
  const codeSuffix = normalizeShareSlug(target.code.split("-").pop() ?? target.code, 12);

  const candidates: string[] = [baseSlug];
  if (locSuffix) {
    candidates.push(normalizeShareSlug(`${baseSlug.slice(0, 44)}-${locSuffix}`, 60));
  }
  if (codeSuffix) {
    candidates.push(normalizeShareSlug(`${baseSlug.slice(0, 44)}-${codeSuffix}`, 60));
  }
  for (let i = 2; i <= 8; i += 1) {
    candidates.push(normalizeShareSlug(`${baseSlug.slice(0, 52)}-${i}`, 60));
  }

  const uniqueCandidates = Array.from(
    new Set(candidates.filter((c) => validateShareSlug(c).ok)),
  );

  for (const candidateSlug of uniqueCandidates) {
    const taken = await isSlugTakenByAnotherTarget(
      candidateSlug,
      input.targetType,
      input.targetId,
    );
    if (taken) continue;

    const { data: inserted, error: insertErr } = await supabase
      .from("share_short_links")
      .insert({
        slug: candidateSlug,
        target_type: input.targetType,
        target_id: input.targetId,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("slug, created_by")
      .single();

    if (!insertErr && inserted) {
      revalidatePath(buildShortSharePath(inserted.slug));
      return {
        ok: true,
        data: {
          slug: inserted.slug,
          canCustomize: true,
        },
      };
    }

    if (insertErr?.code === "23505") {
      const { data: raceRow } = await supabase
        .from("share_short_links")
        .select("slug, created_by")
        .eq("target_type", input.targetType)
        .eq("target_id", input.targetId)
        .maybeSingle();

      if (raceRow) {
        return {
          ok: true,
          data: {
            slug: raceRow.slug,
            canCustomize: userCanCustomizeRow(user.id, user.role, raceRow.created_by),
          },
        };
      }
      continue;
    }

    return {
      ok: false,
      error: sanitizeSafeError(
        insertErr,
        "Gagal membuat link pendek pratinjau.",
        "share-links/createDefault",
      ),
    };
  }

  return {
    ok: false,
    error: "Semua nama link pendek otomatis sudah terpakai. Silakan isi slug kustom.",
  };
}

/**
 * Customizes the readable `/s/<slug>` alias for an Inventory Item, Hybrid Archive,
 * or Delivery (Surat Jalan / BAST).
 */
export async function updateShareLinkSlugAction(input: {
  targetType: ShareTargetType;
  targetId: string;
  slug: string;
}): Promise<ShareActionResult> {
  const user = await requireUser();

  if (!VALID_TARGET_TYPES.has(input.targetType)) {
    return { ok: false, error: "Tipe target pratinjau tidak valid." };
  }
  if (!isValidUuid(input.targetId)) {
    return { ok: false, error: "ID item, surat, atau arsip tidak valid." };
  }

  const slugCheck = validateShareSlug(input.slug);
  if (!slugCheck.ok) {
    return { ok: false, error: slugCheck.error };
  }
  const validatedSlug = slugCheck.slug;

  const target = await resolveAccessibleTarget(user.role, input.targetType, input.targetId);
  if (!target) {
    return {
      ok: false,
      error: "Data tidak ditemukan, atau Anda tidak memiliki akses untuk mengubah link ini.",
    };
  }

  const taken = await isSlugTakenByAnotherTarget(
    validatedSlug,
    input.targetType,
    input.targetId,
  );
  if (taken) {
    return {
      ok: false,
      error: `Link pendek '/s/${validatedSlug}' sudah dipakai data lain. Coba tambahkan kode ruang atau kata pembeda.`,
    };
  }

  const supabase = await createClient();

  if (input.targetType === "DELIVERY") {
    const { data: existingDel, error: existingDelErr } = await supabase
      .from("delivery_share_links")
      .select("id, slug")
      .eq("delivery_id", input.targetId)
      .maybeSingle();

    if (existingDelErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          existingDelErr,
          "Gagal memvalidasi link pendek pengiriman.",
          "share-links/checkUpdateDelivery",
        ),
      };
    }

    if (existingDel) {
      if (existingDel.slug === validatedSlug) {
        return {
          ok: true,
          data: { slug: validatedSlug, canCustomize: true },
          message: "Link pendek berhasil dipertahankan!",
        };
      }

      const { data: updated, error: updateErr } = await supabase
        .from("delivery_share_links")
        .update({ slug: validatedSlug, updated_by: user.id })
        .eq("id", existingDel.id)
        .select("slug")
        .single();

      if (updateErr || !updated) {
        if (updateErr?.code === "23505") {
          return {
            ok: false,
            error: `Link pendek '/s/${validatedSlug}' sudah dipakai data lain.`,
          };
        }
        return {
          ok: false,
          error: sanitizeSafeError(
            updateErr,
            "Gagal memperbarui link pendek pengiriman.",
            "share-links/updateDelivery",
          ),
        };
      }

      revalidatePath(buildShortSharePath(existingDel.slug));
      revalidatePath(buildShortSharePath(updated.slug));
      return {
        ok: true,
        data: { slug: updated.slug, canCustomize: true },
        message: `Link pendek '/s/${updated.slug}' berhasil disimpan!`,
      };
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("delivery_share_links")
      .insert({
        slug: validatedSlug,
        delivery_id: input.targetId,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("slug")
      .single();

    if (insertErr || !inserted) {
      return {
        ok: false,
        error: sanitizeSafeError(
          insertErr,
          "Gagal menyimpan link pendek pengiriman.",
          "share-links/insertDeliveryCustom",
        ),
      };
    }

    revalidatePath(buildShortSharePath(inserted.slug));
    return {
      ok: true,
      data: { slug: inserted.slug, canCustomize: true },
      message: `Link pendek '/s/${inserted.slug}' berhasil disimpan!`,
    };
  }

  // ITEM or ARCHIVE
  const { data: existing, error: existingErr } = await supabase
    .from("share_short_links")
    .select("id, slug, created_by")
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .maybeSingle();

  if (existingErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        existingErr,
        "Gagal memvalidasi ketersediaan link pendek.",
        "share-links/checkUpdate",
      ),
    };
  }

  if (existing && !userCanCustomizeRow(user.id, user.role, existing.created_by)) {
    return {
      ok: false,
      error:
        "Hanya pembuat link, Kepala Terapis, Admin Operasional, atau Owner yang dapat mengubah slug ini.",
    };
  }

  if (existing) {
    if (existing.slug === validatedSlug) {
      return {
        ok: true,
        data: { slug: validatedSlug, canCustomize: true },
        message: "Link pendek berhasil dipertahankan!",
      };
    }

    const { data: updated, error: updateErr } = await supabase
      .from("share_short_links")
      .update({
        slug: validatedSlug,
        updated_by: user.id,
      })
      .eq("id", existing.id)
      .select("slug")
      .single();

    if (updateErr || !updated) {
      if (updateErr?.code === "23505") {
        return {
          ok: false,
          error: `Link pendek '/s/${validatedSlug}' sudah dipakai data lain. Coba tambahkan kode ruang atau kata pembeda.`,
        };
      }
      return {
        ok: false,
        error: sanitizeSafeError(
          updateErr,
          "Gagal memperbarui nama link pendek.",
          "share-links/update",
        ),
      };
    }

    revalidatePath(buildShortSharePath(existing.slug));
    revalidatePath(buildShortSharePath(updated.slug));
    return {
      ok: true,
      data: { slug: updated.slug, canCustomize: true },
      message: `Link pendek '/s/${updated.slug}' berhasil disimpan!`,
    };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("share_short_links")
    .insert({
      slug: validatedSlug,
      target_type: input.targetType,
      target_id: input.targetId,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("slug")
    .single();

  if (insertErr || !inserted) {
    if (insertErr?.code === "23505") {
      return {
        ok: false,
        error: `Link pendek '/s/${validatedSlug}' sudah dipakai data lain. Coba tambahkan kode ruang atau kata pembeda.`,
      };
    }
    return {
      ok: false,
      error: sanitizeSafeError(
        insertErr,
        "Gagal menyimpan nama link pendek.",
        "share-links/insertCustom",
      ),
    };
  }

  revalidatePath(buildShortSharePath(inserted.slug));
  return {
    ok: true,
    data: { slug: inserted.slug, canCustomize: true },
    message: `Link pendek '/s/${inserted.slug}' berhasil disimpan!`,
  };
}
