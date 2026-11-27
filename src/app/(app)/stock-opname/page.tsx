import type { Metadata } from "next";

import { KawaiiEmptyState } from "@/components/cartoon/kawaii-decor";
import {
  getOrCreateActiveOpnameSessionAction,
  lookupOpnameTargetAction,
  type OpnameTargetLookupResult,
} from "@/lib/actions/stock-opname";
import { requireRouteAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { StockOpnameClient } from "./stock-opname-client";

export const metadata: Metadata = {
  title: "Stock Opname Terpadu",
};

function sanitizeLookupValuation(
  lookup: OpnameTargetLookupResult | null,
  canViewValuation: boolean,
): OpnameTargetLookupResult | null {
  if (!lookup || canViewValuation) return lookup;
  const zeroOut = <
    T extends {
      purchase_price: number;
      residual_value: number;
      useful_life_months: number | null;
      acquisition_date: string | null;
    },
  >(
    item: T,
  ): T => ({
    ...item,
    purchase_price: 0,
    residual_value: 0,
    useful_life_months: null,
    acquisition_date: null,
  });

  if (lookup.mode === "PARENT") {
    return {
      ...lookup,
      parentItem: zeroOut(lookup.parentItem),
      subItems: lookup.subItems.map(zeroOut),
    };
  }
  return {
    ...lookup,
    item: zeroOut(lookup.item),
  };
}

export default async function StockOpnamePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; room?: string }>;
}) {
  const [user, resolvedParams] = await Promise.all([
    requireRouteAccess("/stock-opname"),
    searchParams,
  ]);

  const initialRoomParam = resolvedParams.room?.trim() || null;
  const initialCode = resolvedParams.code?.trim() ?? "";

  const sessionRes = await getOrCreateActiveOpnameSessionAction(initialRoomParam);
  if (!sessionRes.ok) {
    return (
      <div className="py-10">
        <KawaiiEmptyState
          mascot="clipboard"
          title="Sesi Stock Opname Gagal Dimuat"
          description={sessionRes.error}
        />
      </div>
    );
  }

  let initialLookup: OpnameTargetLookupResult | null = null;
  let initialLookupError: string | null = null;

  if (initialCode) {
    const lookupRes = await lookupOpnameTargetAction(
      initialCode,
      sessionRes.data.session.id,
    );
    if (lookupRes.ok) {
      initialLookup = sanitizeLookupValuation(
        lookupRes.data,
        can(user.role, "inventory.view_valuation"),
      );
    } else {
      initialLookupError = lookupRes.error;
    }
  }

  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <StockOpnameClient
      initialSessionData={sessionRes.data}
      initialCode={initialCode}
      initialLookup={initialLookup}
      initialLookupError={initialLookupError}
      todayWib={todayWib}
    />
  );
}
