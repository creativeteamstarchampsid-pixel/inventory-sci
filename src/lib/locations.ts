import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_LOCATION_RECORDS,
  buildLocationsDirectory,
  type LocationsDirectory,
} from "@/lib/location-directory";
import { createClient } from "@/lib/supabase/server";
import type { Database, LocationMaster } from "@/types/database";

export {
  DEFAULT_LOCATION_RECORDS,
  buildLocationsDirectory,
  type LocationsDirectory,
};

/**
 * Fetches `locations_master` with an explicit Supabase client (safe for
 * route handlers, cron jobs, and Server Actions that already created a client).
 */
export async function fetchLocationsDirectoryWithClient(
  supabase: SupabaseClient<Database>,
): Promise<LocationsDirectory> {
  try {
    const { data, error } = await supabase
      .from("locations_master")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (error || !data || data.length === 0) {
      return buildLocationsDirectory(DEFAULT_LOCATION_RECORDS);
    }

    return buildLocationsDirectory(data as LocationMaster[]);
  } catch {
    return buildLocationsDirectory(DEFAULT_LOCATION_RECORDS);
  }
}

/**
 * Per-request cached directory loader for Server Components & pages.
 */
export const getLocationsDirectory = cache(
  async (): Promise<LocationsDirectory> => {
    const supabase = await createClient();
    return fetchLocationsDirectoryWithClient(supabase);
  },
);

export type ValidateLocationOptions = {
  allowDigital?: boolean;
  requireArchiveGroup?: boolean;
  allowExistingCode?: string | null;
};

/**
 * Validates a location/cabinet code against `locations_master`, checking
 * existence, active status, digital restriction, and archive-cabinet grouping.
 */
export async function validateLocationCode(
  supabase: SupabaseClient<Database>,
  rawCode: unknown,
  opts: ValidateLocationOptions = {},
): Promise<{ ok: true; location: LocationMaster } | { ok: false; error: string }> {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!code) {
    return {
      ok: false,
      error: opts.requireArchiveGroup
        ? "Kode lemari arsip wajib dipilih."
        : "Kode lokasi ruangan wajib dipilih.",
    };
  }

  const allowExistingUpper =
    typeof opts.allowExistingCode === "string"
      ? opts.allowExistingCode.trim().toUpperCase()
      : null;

  let location: LocationMaster | null = null;
  const { data, error } = await supabase
    .from("locations_master")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    const fallback = DEFAULT_LOCATION_RECORDS.find((r) => r.code === code) ?? null;
    if (!fallback) {
      return {
        ok: false,
        error: "Gagal memverifikasi kode lokasi di master ruangan.",
      };
    }
    location = fallback;
  } else {
    location = (data as LocationMaster | null) ?? null;
  }

  if (!location) {
    return {
      ok: false,
      error: opts.requireArchiveGroup
        ? `Lemari arsip "${code}" tidak terdaftar di master lokasi.`
        : `Kode lokasi ruangan "${code}" tidak terdaftar di master lokasi.`,
    };
  }

  const matchesExisting = Boolean(allowExistingUpper && code === allowExistingUpper);

  if (!location.is_active && !matchesExisting) {
    return {
      ok: false,
      error: `Lokasi ${location.code} (${location.name}) sedang nonaktif.`,
    };
  }

  if (
    opts.allowDigital === false &&
    location.location_group === "DIGITAL" &&
    !matchesExisting
  ) {
    return {
      ok: false,
      error: "Lokasi Digital Vault (DIG) tidak digunakan untuk barang fisik.",
    };
  }

  if (
    opts.requireArchiveGroup &&
    location.location_group !== "ARCHIVE" &&
    !matchesExisting
  ) {
    return {
      ok: false,
      error: `Lokasi ${location.code} (${location.name}) bukan termasuk grup Lemari Arsip.`,
    };
  }

  return { ok: true, location };
}
