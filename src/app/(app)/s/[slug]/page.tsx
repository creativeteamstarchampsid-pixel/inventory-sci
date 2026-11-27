import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parseDeliveryPayloadItems } from "@/app/(app)/deliveries/helpers";
import { requireRouteAccess } from "@/lib/auth";
import { calculateBookValue } from "@/lib/constants";
import { getLocationsDirectory } from "@/lib/locations";
import { can, hasAnyRole } from "@/lib/rbac";
import { isSafeHttpUrl, sanitizeStoragePath } from "@/lib/security";
import { normalizeShareSlug, type ShareTargetType } from "@/lib/share-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { recordStorageObjectEgress } from "@/lib/telemetry";
import type {
  ArchiveHybrid,
  BorrowStatus,
  DeliveryLog,
  ItemMaster,
} from "@/types/database";
import {
  SharePreviewClient,
  type ArchiveFilePreviewKind,
} from "./share-preview-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pratinjau Link Pendek",
};

function sanitizeValuation(row: ItemMaster, canViewValuation: boolean): ItemMaster {
  if (canViewValuation) return row;
  return {
    ...row,
    purchase_price: 0,
    residual_value: 0,
    useful_life_months: null,
    acquisition_date: null,
  };
}

function detectArchivePreviewKind(
  fileName: string | null | undefined,
  fileUrl: string | null | undefined,
): ArchiveFilePreviewKind {
  const source = (fileName || fileUrl || "").trim().toLowerCase();
  const clean = source.split("?")[0]?.split("#")[0] ?? "";
  if (clean.endsWith(".pdf")) return "pdf";
  if (
    clean.endsWith(".png") ||
    clean.endsWith(".jpg") ||
    clean.endsWith(".jpeg") ||
    clean.endsWith(".webp")
  ) {
    return "image";
  }
  return "other";
}

function hasServiceRoleConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function checkRestrictedArchiveExistence(input: {
  archiveId?: string;
  docCode?: string;
}): Promise<boolean> {
  if (!hasServiceRoleConfig()) return false;
  try {
    const admin = createAdminClient();
    let query = admin
      .from("archives_hybrid")
      .select("id, is_sop_public_to_staff")
      .is("deleted_at", null);

    if (input.archiveId) {
      query = query.eq("id", input.archiveId);
    } else if (input.docCode) {
      query = query.eq("doc_code", input.docCode);
    } else {
      return false;
    }

    const { data } = await query.maybeSingle();
    return Boolean(data && !data.is_sop_public_to_staff);
  } catch {
    return false;
  }
}

async function checkRestrictedDeliveryExistence(input: {
  slug?: string;
  deliveryCode?: string;
}): Promise<boolean> {
  if (!hasServiceRoleConfig()) return false;
  try {
    const admin = createAdminClient();
    if (input.slug) {
      const { data: delLink } = await admin
        .from("delivery_share_links")
        .select("delivery_id")
        .eq("slug", input.slug)
        .maybeSingle();
      if (delLink?.delivery_id) {
        const { data: delRow } = await admin
          .from("deliveries_log")
          .select("id")
          .eq("id", delLink.delivery_id)
          .is("deleted_at", null)
          .maybeSingle();
        if (delRow) return true;
      }
    }
    if (input.deliveryCode) {
      const { data: delByCode } = await admin
        .from("deliveries_log")
        .select("id")
        .eq("delivery_code", input.deliveryCode)
        .is("deleted_at", null)
        .maybeSingle();
      if (delByCode) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default async function ShortSharePreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireRouteAccess("/s");
  const { slug } = await params;

  let decodedSlug = slug;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    decodedSlug = slug;
  }
  const normalizedInput = decodedSlug.trim().toLowerCase();
  const normalizedClean = normalizeShareSlug(decodedSlug);

  if (!normalizedInput) {
    notFound();
  }

  const supabase = await createClient();

  let shortLink: {
    slug: string;
    target_type: ShareTargetType;
    target_id: string;
    created_by: string | null;
  } | null = null;

  const { data: exactLink } = await supabase
    .from("share_short_links")
    .select("slug, target_type, target_id, created_by")
    .eq("slug", normalizedInput)
    .maybeSingle();

  if (exactLink) {
    shortLink = exactLink;
  } else if (normalizedClean && normalizedClean !== normalizedInput) {
    const { data: altLink } = await supabase
      .from("share_short_links")
      .select("slug, target_type, target_id, created_by")
      .eq("slug", normalizedClean)
      .maybeSingle();
    if (altLink) shortLink = altLink;
  }

  const canViewDeliveries = can(user.role, "delivery.view");

  if (!shortLink && canViewDeliveries) {
    const { data: delLink } = await supabase
      .from("delivery_share_links")
      .select("slug, delivery_id, created_by")
      .eq("slug", normalizedInput)
      .maybeSingle();

    if (delLink) {
      shortLink = {
        slug: delLink.slug,
        target_type: "DELIVERY",
        target_id: delLink.delivery_id,
        created_by: delLink.created_by,
      };
    } else if (normalizedClean && normalizedClean !== normalizedInput) {
      const { data: altDelLink } = await supabase
        .from("delivery_share_links")
        .select("slug, delivery_id, created_by")
        .eq("slug", normalizedClean)
        .maybeSingle();
      if (altDelLink) {
        shortLink = {
          slug: altDelLink.slug,
          target_type: "DELIVERY",
          target_id: altDelLink.delivery_id,
          created_by: altDelLink.created_by,
        };
      }
    }
  }

  let resolvedType: ShareTargetType | null = shortLink?.target_type ?? null;
  let resolvedTargetId: string | null = shortLink?.target_id ?? null;
  let resolvedSlug = shortLink?.slug ?? (normalizedClean || normalizedInput);

  // Seamless fallback by official item_code, doc_code, or delivery_code
  if (!resolvedType || !resolvedTargetId) {
    const upperCode = decodedSlug.trim().toUpperCase();
    const [{ data: codeItem }, { data: codeArchive }, { data: codeDelivery }] =
      await Promise.all([
        supabase
          .from("items_master")
          .select("id, item_code")
          .eq("item_code", upperCode)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("archives_hybrid")
          .select("id, doc_code")
          .eq("doc_code", upperCode)
          .is("deleted_at", null)
          .maybeSingle(),
        canViewDeliveries
          ? supabase
              .from("deliveries_log")
              .select("id, delivery_code")
              .eq("delivery_code", upperCode)
              .is("deleted_at", null)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    if (codeItem) {
      resolvedType = "ITEM";
      resolvedTargetId = codeItem.id;
      resolvedSlug = normalizedClean || codeItem.item_code.toLowerCase();
    } else if (codeArchive) {
      resolvedType = "ARCHIVE";
      resolvedTargetId = codeArchive.id;
      resolvedSlug = normalizedClean || codeArchive.doc_code.toLowerCase();
    } else if (codeDelivery) {
      resolvedType = "DELIVERY";
      resolvedTargetId = codeDelivery.id;
      resolvedSlug = normalizedClean || codeDelivery.delivery_code.toLowerCase();
    } else {
      const { data: aliasMatch } = await supabase
        .from("item_barcode_aliases")
        .select("target_item_id")
        .eq("alias_code", upperCode)
        .maybeSingle();

      let aliasTargetItem: { id: string; item_code: string } | null = null;
      if (aliasMatch?.target_item_id) {
        const { data: targetRow } = await supabase
          .from("items_master")
          .select("id, item_code")
          .eq("id", aliasMatch.target_item_id)
          .is("deleted_at", null)
          .maybeSingle();
        aliasTargetItem = targetRow ?? null;
      }

      if (aliasTargetItem) {
        resolvedType = "ITEM";
        resolvedTargetId = aliasTargetItem.id;
        resolvedSlug = aliasTargetItem.item_code.toLowerCase();
      } else {
        if (!canViewDeliveries) {
          const restrictedDelivery = await checkRestrictedDeliveryExistence({
            slug: normalizedClean || normalizedInput,
            deliveryCode: upperCode,
          });
          if (restrictedDelivery) {
            return (
              <SharePreviewClient
                mode="RESTRICTED_DELIVERY"
                slug={normalizedClean || normalizedInput}
              />
            );
          }
        }
        if (user.role === "STAFF") {
          const restrictedCode = await checkRestrictedArchiveExistence({
            docCode: upperCode,
          });
          if (restrictedCode) {
            return (
              <SharePreviewClient
                mode="RESTRICTED_ARCHIVE"
                slug={normalizedClean || normalizedInput}
              />
            );
          }
        }
        notFound();
      }
    }

    // Check if that target already has a saved custom short slug
    if (resolvedType === "DELIVERY") {
      const { data: linkedDel } = await supabase
        .from("delivery_share_links")
        .select("slug, delivery_id, created_by")
        .eq("delivery_id", resolvedTargetId)
        .maybeSingle();

      if (linkedDel) {
        shortLink = {
          slug: linkedDel.slug,
          target_type: "DELIVERY",
          target_id: linkedDel.delivery_id,
          created_by: linkedDel.created_by,
        };
        resolvedSlug = linkedDel.slug;
      }
    } else {
      const { data: linkedRow } = await supabase
        .from("share_short_links")
        .select("slug, target_type, target_id, created_by")
        .eq("target_type", resolvedType)
        .eq("target_id", resolvedTargetId)
        .maybeSingle();

      if (linkedRow) {
        shortLink = linkedRow;
        resolvedSlug = linkedRow.slug;
      }
    }
  }

  const canCustomize = shortLink
    ? hasAnyRole(user.role, ["OWNER", "SUPER_ADMIN", "TEAM_LEADER"]) ||
      shortLink.created_by === user.id
    : true;

  if (resolvedType === "ITEM") {
    const canViewValuation = can(user.role, "inventory.view_valuation");
    const canValidateOpname = can(user.role, "inventory.validate_opname");

    const { data: item } = await supabase
      .from("items_master")
      .select("*")
      .eq("id", resolvedTargetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!item) {
      notFound();
    }

    const [locationsDir, parentRes, subItemsRes, activeBorrowRes] =
      await Promise.all([
        getLocationsDirectory(),
        item.parent_item_id
          ? supabase
              .from("items_master")
              .select("*")
              .eq("id", item.parent_item_id)
              .is("deleted_at", null)
              .maybeSingle()
          : Promise.resolve({ data: null as ItemMaster | null }),
        supabase
          .from("items_master")
          .select("*")
          .eq("parent_item_id", item.parent_item_id ?? item.id)
          .is("deleted_at", null)
          .order("item_code", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("borrow_transactions")
          .select("id, transaction_code, borrower_id, borrowed_at, status")
          .eq("item_id", item.id)
          .in("status", ["DIPINJAM", "TERLAMBAT"])
          .order("borrowed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    let activeBorrow: {
      transactionCode: string;
      borrowerName: string;
      borrowedAt: string;
      status: BorrowStatus;
    } | null = null;

    if (activeBorrowRes.data) {
      const { data: borrowerProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", activeBorrowRes.data.borrower_id)
        .maybeSingle();

      activeBorrow = {
        transactionCode: activeBorrowRes.data.transaction_code,
        borrowerName:
          borrowerProfile?.full_name?.trim() ||
          borrowerProfile?.email ||
          "Anggota Tim",
        borrowedAt: activeBorrowRes.data.borrowed_at,
        status: activeBorrowRes.data.status,
      };
    }

    let signedPhotoUrl: string | null = null;
    if (item.photo_url) {
      if (isSafeHttpUrl(item.photo_url)) {
        signedPhotoUrl = item.photo_url;
      } else {
        const safePath = sanitizeStoragePath(item.photo_url);
        if (safePath) {
          const { data: signed } = await supabase.storage
            .from("inventory-photos")
            .createSignedUrl(safePath, 3600);
          signedPhotoUrl = signed?.signedUrl ?? null;
        }
      }
    }

    const safeItem = sanitizeValuation(item, canViewValuation);
    const bookValue = canViewValuation
      ? calculateBookValue(
          item.purchase_price,
          item.acquisition_date,
          item.useful_life_months,
          item.residual_value,
        )
      : 0;

    const todayWib = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
    }).format(new Date());

    const safeParent = parentRes.data
      ? sanitizeValuation(parentRes.data, canViewValuation)
      : null;
    const safeSubItems = (subItemsRes.data ?? []).map((child) =>
      sanitizeValuation(child, canViewValuation),
    );

    return (
      <SharePreviewClient
        mode="ITEM"
        slug={resolvedSlug}
        canCustomize={canCustomize}
        item={safeItem}
        roomLabel={locationsDir.getLabel(item.room_code)}
        parentItem={safeParent}
        subItems={safeSubItems}
        childCount={safeSubItems.length}
        canUpdateStock={canValidateOpname}
        activeBorrow={activeBorrow}
        signedPhotoUrl={signedPhotoUrl}
        canViewValuation={canViewValuation}
        bookValue={bookValue}
        todayWib={todayWib}
      />
    );
  }

  if (resolvedType === "DELIVERY") {
    if (!canViewDeliveries) {
      return <SharePreviewClient mode="RESTRICTED_DELIVERY" slug={resolvedSlug} />;
    }

    const { data: delivery } = await supabase
      .from("deliveries_log")
      .select("*")
      .eq("id", resolvedTargetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!delivery) {
      notFound();
    }

    let signedProofUrl: string | null = null;
    if (delivery.proof_photo_url) {
      if (isSafeHttpUrl(delivery.proof_photo_url)) {
        signedProofUrl = delivery.proof_photo_url;
      } else {
        const safePath = sanitizeStoragePath(delivery.proof_photo_url);
        if (safePath) {
          const { data: signed } = await supabase.storage
            .from("delivery-proofs")
            .createSignedUrl(safePath, 3600);
          signedProofUrl = signed?.signedUrl ?? null;
        }
      }
    }

    const payloadItems = parseDeliveryPayloadItems(delivery.items_payload_json);

    return (
      <SharePreviewClient
        mode="DELIVERY"
        slug={resolvedSlug}
        canCustomize={canCustomize}
        delivery={delivery as DeliveryLog}
        payloadItems={payloadItems}
        signedProofUrl={signedProofUrl}
      />
    );
  }

  // ARCHIVE target
  const { data: archive } = await supabase
    .from("archives_hybrid")
    .select("*")
    .eq("id", resolvedTargetId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!archive) {
    if (user.role === "STAFF") {
      const restricted = await checkRestrictedArchiveExistence({
        archiveId: resolvedTargetId,
      });
      if (restricted) {
        return <SharePreviewClient mode="RESTRICTED_ARCHIVE" slug={resolvedSlug} />;
      }
    }
    notFound();
  }

  const locationsDir = await getLocationsDirectory();

  let borrowerName: string | null = null;
  if (
    user.role !== "STAFF" &&
    archive.physical_status === "DIPINJAM" &&
    archive.borrowed_by
  ) {
    const { data: borrower } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", archive.borrowed_by)
      .maybeSingle();
    borrowerName = borrower?.full_name?.trim() || borrower?.email || null;
  }

  let signedPreviewUrl: string | null = null;
  let signedDownloadUrl: string | null = null;
  let previewKind: ArchiveFilePreviewKind = "other";

  if (archive.digital_file_url) {
    previewKind = detectArchivePreviewKind(
      archive.digital_file_name,
      archive.digital_file_url,
    );

    if (isSafeHttpUrl(archive.digital_file_url)) {
      signedPreviewUrl = archive.digital_file_url;
      signedDownloadUrl = archive.digital_file_url;
    } else {
      const safePath = sanitizeStoragePath(archive.digital_file_url);
      if (safePath) {
        const [{ data: viewSigned }, { data: dlSigned }] = await Promise.all([
          supabase.storage.from("archives").createSignedUrl(safePath, 300),
          supabase.storage
            .from("archives")
            .createSignedUrl(safePath, 300, {
              download: archive.digital_file_name || true,
            }),
        ]);
        signedPreviewUrl = viewSigned?.signedUrl ?? null;
        signedDownloadUrl = dlSigned?.signedUrl ?? viewSigned?.signedUrl ?? null;

        if (
          signedPreviewUrl &&
          (previewKind === "pdf" || previewKind === "image")
        ) {
          await recordStorageObjectEgress("archives", safePath, 250_000);
        }
      }
    }
  }

  const rawDriveLink = archive.drive_link?.trim() ?? "";
  const safeDriveLink = isSafeHttpUrl(rawDriveLink) ? rawDriveLink : null;

  return (
    <SharePreviewClient
      mode="ARCHIVE"
      slug={resolvedSlug}
      canCustomize={canCustomize}
      archive={archive as ArchiveHybrid}
      cabinetLabel={locationsDir.getLabel(archive.cabinet_code)}
      borrowerName={borrowerName}
      signedPreviewUrl={signedPreviewUrl}
      signedDownloadUrl={signedDownloadUrl}
      previewKind={previewKind}
      safeDriveLink={safeDriveLink}
    />
  );
}
