import {
  LOCATION_LABELS,
  LOCATION_OPTIONS,
  OPNAME_ROOM_CODES,
  getLocationLabel,
  type LocationOption,
} from "@/lib/constants";
import type { LocationCode, LocationMaster } from "@/types/database";

const EPOCH_ISO = "2026-11-24T00:00:00.000Z";
const DEFAULT_OPNAME_SET = new Set<string>(OPNAME_ROOM_CODES);

/**
 * Fallback 14 location records mirroring the initial database seed when
 * `locations_master` cannot be queried or has not yet been populated.
 */
export const DEFAULT_LOCATION_RECORDS: LocationMaster[] = LOCATION_OPTIONS.map(
  (opt, idx) => ({
    code: opt.value,
    name: opt.shortLabel,
    location_group: opt.group,
    description: null,
    pic_name: null,
    include_in_opname: DEFAULT_OPNAME_SET.has(opt.value),
    is_active: true,
    is_system: true,
    sort_order: (idx + 1) * 10,
    created_by: null,
    updated_by: null,
    created_at: EPOCH_ISO,
    updated_at: EPOCH_ISO,
  }),
);

export type LocationsDirectory = {
  records: LocationMaster[];
  allOptions: LocationOption[];
  activeOptions: LocationOption[];
  /** Active non-DIGITAL locations (includes THERAPY, OFFICE, AND ARCHIVE cabinets). */
  inventoryOptions: LocationOption[];
  /** Active ARCHIVE cabinet locations. */
  archiveCabinetOptions: LocationOption[];
  /** Active non-DIGITAL locations marked `include_in_opname`. */
  opnameRoomCodes: LocationCode[];
  /** Map of location code -> human-readable name. */
  labels: Record<string, string>;
  getLabel: (code: string | null | undefined) => string;
  /**
   * Ensures an existing/selected code (e.g. from a record whose room was later
   * deactivated) remains available inside `<Select>` dropdowns when editing.
   */
  getOptionWithCurrent: (
    options: readonly LocationOption[],
    currentCode: string | null | undefined,
  ) => LocationOption[];
};

function toLocationOption(row: LocationMaster): LocationOption {
  return {
    value: row.code,
    label: `${row.code} — ${row.name}`,
    shortLabel: row.name,
    group: row.location_group,
    isActive: row.is_active,
    includeInOpname: row.include_in_opname,
    isSystem: row.is_system,
    picName: row.pic_name,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

/**
 * Pure isomorphic builder converting `locations_master` rows into grouped
 * options, label maps, and opname lists shared by server and client code.
 */
export function buildLocationsDirectory(
  rows: readonly LocationMaster[],
): LocationsDirectory {
  const source = rows.length > 0 ? [...rows] : [...DEFAULT_LOCATION_RECORDS];
  source.sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.code.localeCompare(b.code, "id");
  });

  const labels: Record<string, string> = { ...LOCATION_LABELS };
  for (const row of source) {
    labels[row.code] = row.name;
  }

  const allOptions = source.map(toLocationOption);
  const activeOptions = allOptions.filter((opt) => opt.isActive !== false);
  const inventoryOptions = activeOptions.filter((opt) => opt.group !== "DIGITAL");
  const archiveCabinetOptions = activeOptions.filter(
    (opt) => opt.group === "ARCHIVE",
  );
  const dynamicOpnameCodes = activeOptions
    .filter((opt) => opt.includeInOpname === true && opt.group !== "DIGITAL")
    .map((opt) => opt.value);
  const opnameRoomCodes =
    dynamicOpnameCodes.length > 0 ? dynamicOpnameCodes : [...OPNAME_ROOM_CODES];

  const optionByCode = new Map<string, LocationOption>(
    allOptions.map((opt) => [opt.value, opt]),
  );

  const getLabel = (code: string | null | undefined) =>
    getLocationLabel(code, labels);

  const getOptionWithCurrent = (
    options: readonly LocationOption[],
    currentCode: string | null | undefined,
  ): LocationOption[] => {
    const trimmed = typeof currentCode === "string" ? currentCode.trim() : "";
    if (!trimmed) return [...options];
    if (options.some((opt) => opt.value === trimmed)) {
      return [...options];
    }
    const existing = optionByCode.get(trimmed);
    if (existing) {
      return [
        {
          ...existing,
          label: existing.isActive === false ? `${existing.label} (Nonaktif)` : existing.label,
        },
        ...options,
      ];
    }
    const fallbackName = getLabel(trimmed);
    return [
      {
        value: trimmed,
        label: fallbackName === trimmed ? trimmed : `${trimmed} — ${fallbackName}`,
        shortLabel: fallbackName,
        group: "OFFICE",
        isActive: false,
      },
      ...options,
    ];
  };

  return {
    records: source,
    allOptions,
    activeOptions,
    inventoryOptions,
    archiveCabinetOptions,
    opnameRoomCodes,
    labels,
    getLabel,
    getOptionWithCurrent,
  };
}
