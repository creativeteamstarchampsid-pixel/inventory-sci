import type { Metadata } from "next";

import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryLog } from "@/types/database";
import { DeliveriesClient } from "./deliveries-client";
import type { InventoryPickerItem } from "./helpers";

export const metadata: Metadata = {
  title: "Pengiriman & Logistik",
};

export default async function DeliveriesPage() {
  await requireRouteAccess("/deliveries");

  const supabase = await createClient();

  const [deliveriesRes, itemsRes] = await Promise.all([
    supabase
      .from("deliveries_log")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("items_master")
      .select(
        "id, item_code, name, category_prefix, category, asset_type, room_code, condition, unit_label, stock_qty, source_delivery_id",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const deliveries: DeliveryLog[] = deliveriesRes.data ?? [];
  const inventoryItems: InventoryPickerItem[] = itemsRes.data ?? [];
  const schemaError = deliveriesRes.error ? deliveriesRes.error.message : null;

  const proofSignedUrls: Record<string, string> = {};
  const deliveriesWithProof = deliveries.filter((d) =>
    Boolean(d.proof_photo_url),
  );

  if (deliveriesWithProof.length > 0) {
    const paths = deliveriesWithProof
      .map((d) => d.proof_photo_url)
      .filter((p): p is string => Boolean(p));

    if (paths.length > 0) {
      const { data: signedList } = await supabase.storage
        .from("delivery-proofs")
        .createSignedUrls(paths, 3600);

      if (signedList) {
        const urlByPath = new Map<string, string>();
        for (const entry of signedList) {
          if (entry.path && entry.signedUrl) {
            urlByPath.set(entry.path, entry.signedUrl);
          }
        }
        for (const d of deliveriesWithProof) {
          if (d.proof_photo_url) {
            const url = urlByPath.get(d.proof_photo_url);
            if (url) proofSignedUrls[d.id] = url;
          }
        }
      }
    }
  }

  return (
    <DeliveriesClient
      initialDeliveries={deliveries}
      initialProofSignedUrls={proofSignedUrls}
      inventoryItems={inventoryItems}
      schemaError={schemaError}
    />
  );
}
