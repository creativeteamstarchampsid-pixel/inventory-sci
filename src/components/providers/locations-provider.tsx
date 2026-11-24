"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  DEFAULT_LOCATION_RECORDS,
  buildLocationsDirectory,
  type LocationsDirectory,
} from "@/lib/location-directory";
import type { LocationMaster } from "@/types/database";

const DEFAULT_DIRECTORY = buildLocationsDirectory(DEFAULT_LOCATION_RECORDS);

const LocationsContext = createContext<LocationsDirectory>(DEFAULT_DIRECTORY);

/**
 * Provides live `locations_master` records and derived option/label helpers
 * to all client components inside the authenticated `(app)` layout.
 */
export function LocationsProvider({
  initialRecords,
  children,
}: {
  initialRecords: LocationMaster[];
  children: ReactNode;
}) {
  const value = useMemo<LocationsDirectory>(
    () => buildLocationsDirectory(initialRecords),
    [initialRecords],
  );

  return (
    <LocationsContext.Provider value={value}>
      {children}
    </LocationsContext.Provider>
  );
}

/** Returns the live dynamic locations directory, options, and label resolvers. */
export function useLocations(): LocationsDirectory {
  return useContext(LocationsContext);
}
