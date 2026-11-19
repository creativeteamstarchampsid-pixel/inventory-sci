import { APP_TIME_ZONE, getJakartaDateParts } from "@/lib/period";
import type {
  ArchivePhysicalStatus,
  AssetType,
  BackupType,
  BarcodeFormat,
  BillingCycle,
  BorrowStatus,
  CodeCategoryPrefix,
  DeliveryDirection,
  DeliveryStatus,
  HygieneStatus,
  ItemCondition,
  KitStatus,
  LocationCode,
  PaymentMethod,
  RequestStatus,
  RequestType,
} from "@/types/database";

/* -------------------------------------------------------------------------- */
/*                       Category & Location Constants                        */
/* -------------------------------------------------------------------------- */

export type CategoryPrefixOption = {
  value: CodeCategoryPrefix;
  label: string;
  shortLabel: string;
  description: string;
};

export const CATEGORY_PREFIX_OPTIONS: readonly CategoryPrefixOption[] = [
  {
    value: "SNS",
    label: "SNS — Sensorik",
    shortLabel: "Sensorik",
    description: "Alat & mainan terapi stimulasi sensorik",
  },
  {
    value: "MTR",
    label: "MTR — Motorik",
    shortLabel: "Motorik",
    description: "Alat terapi motorik halus & motorik kasar",
  },
  {
    value: "WCR",
    label: "WCR — Terapi Wicara",
    shortLabel: "Terapi Wicara",
    description: "Media & alat bantu terapi wicara / komunikasi",
  },
  {
    value: "ELK",
    label: "ELK — Elektronik",
    shortLabel: "Elektronik",
    description: "Perangkat elektronik klinik & kantor",
  },
  {
    value: "FRN",
    label: "FRN — Furnitur",
    shortLabel: "Furnitur",
    description: "Meja, kursi, rak & perlengkapan ruang",
  },
  {
    value: "ATK",
    label: "ATK — Alat Tulis Kantor",
    shortLabel: "Alat Tulis Kantor",
    description: "Perlengkapan administrasi & alat tulis",
  },
  {
    value: "HBP",
    label: "HBP — Barang Habis Pakai",
    shortLabel: "Barang Habis Pakai",
    description: "Consumables terapi, sanitasi & operasional",
  },
  {
    value: "DOC",
    label: "DOC — Dokumen & Arsip",
    shortLabel: "Dokumen & Arsip",
    description: "Berkas arsip fisik & dokumen digital",
  },
  {
    value: "SUB",
    label: "SUB — Langganan Digital",
    shortLabel: "Langganan Digital",
    description: "Akun & langganan aplikasi digital (Vault)",
  },
] as const;

export const CATEGORY_PREFIX_LABELS: Record<CodeCategoryPrefix, string> = {
  SNS: "Sensorik",
  MTR: "Motorik",
  WCR: "Terapi Wicara",
  ELK: "Elektronik",
  FRN: "Furnitur",
  ATK: "Alat Tulis Kantor",
  HBP: "Barang Habis Pakai",
  DOC: "Dokumen & Arsip",
  SUB: "Langganan Digital",
};

export const THERAPY_CATEGORIES = [
  "Sensorik",
  "Motorik Halus",
  "Motorik Kasar",
  "Terapi Wicara",
  "Kognitif/Edukasi",
  "Elektronik",
  "Furnitur",
  "Barang Habis Pakai",
] as const;

export type TherapyCategory = (typeof THERAPY_CATEGORIES)[number];

export type LocationGroup = "THERAPY" | "OFFICE" | "ARCHIVE" | "DIGITAL";

export type LocationOption = {
  value: LocationCode;
  label: string;
  shortLabel: string;
  group: LocationGroup;
};

export const LOCATION_OPTIONS: readonly LocationOption[] = [
  { value: "R01", label: "R01 — Ruang Terapi 1", shortLabel: "Ruang Terapi 1", group: "THERAPY" },
  { value: "R02", label: "R02 — Ruang Terapi 2", shortLabel: "Ruang Terapi 2", group: "THERAPY" },
  { value: "R03", label: "R03 — Ruang Terapi 3", shortLabel: "Ruang Terapi 3", group: "THERAPY" },
  { value: "R04", label: "R04 — Ruang Terapi 4", shortLabel: "Ruang Terapi 4", group: "THERAPY" },
  { value: "R05", label: "R05 — Ruang Terapi 5", shortLabel: "Ruang Terapi 5", group: "THERAPY" },
  { value: "R06", label: "R06 — Ruang Terapi 6", shortLabel: "Ruang Terapi 6", group: "THERAPY" },
  { value: "ADM", label: "ADM — Admin", shortLabel: "Admin", group: "OFFICE" },
  { value: "FO", label: "FO — Resepsionis", shortLabel: "Resepsionis", group: "OFFICE" },
  { value: "GDG", label: "GDG — Gudang Utama", shortLabel: "Gudang Utama", group: "OFFICE" },
  { value: "L01", label: "L01 — Lemari Arsip 1", shortLabel: "Lemari Arsip 1", group: "ARCHIVE" },
  { value: "L02", label: "L02 — Lemari Arsip 2", shortLabel: "Lemari Arsip 2", group: "ARCHIVE" },
  { value: "L03", label: "L03 — Lemari Arsip 3", shortLabel: "Lemari Arsip 3", group: "ARCHIVE" },
  { value: "L04", label: "L04 — Lemari Arsip 4", shortLabel: "Lemari Arsip 4", group: "ARCHIVE" },
  { value: "DIG", label: "DIG — Digital Vault", shortLabel: "Digital Vault", group: "DIGITAL" },
] as const;

export const LOCATION_LABELS: Record<LocationCode, string> = {
  R01: "Ruang Terapi 1",
  R02: "Ruang Terapi 2",
  R03: "Ruang Terapi 3",
  R04: "Ruang Terapi 4",
  R05: "Ruang Terapi 5",
  R06: "Ruang Terapi 6",
  ADM: "Admin",
  FO: "Resepsionis",
  GDG: "Gudang Utama",
  L01: "Lemari Arsip 1",
  L02: "Lemari Arsip 2",
  L03: "Lemari Arsip 3",
  L04: "Lemari Arsip 4",
  DIG: "Digital Vault",
};

export const INVENTORY_LOCATION_OPTIONS = LOCATION_OPTIONS.filter(
  (loc) => loc.group !== "DIGITAL",
);

export const ARCHIVE_CABINET_OPTIONS = LOCATION_OPTIONS.filter(
  (loc) => loc.group === "ARCHIVE",
);

export const OPNAME_ROOM_CODES: readonly LocationCode[] = [
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "ADM",
  "GDG",
] as const;

export const ARCHIVE_CATEGORIES = [
  "SOP Terapi",
  "Perizinan & Legal",
  "SDM & Kontrak",
  "Keuangan & Pajak",
  "Asesmen & Rekam Medis",
  "Operasional & Lainnya",
] as const;

/* -------------------------------------------------------------------------- */
/*                            Domain Enum Labels                              */
/* -------------------------------------------------------------------------- */

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  THERAPY_TOY: "Alat / Mainan Terapi",
  FIXED_ASSET: "Aset Tetap Kantor",
  CONSUMABLE: "Barang Habis Pakai",
};

export const BARCODE_FORMAT_LABELS: Record<BarcodeFormat, string> = {
  CODE128: "1D Barcode (Code-128)",
  QR: "QR Code",
  COMBO: "Combo (Code-128 + QR)",
};

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  BAIK: "Baik",
  PART_KURANG: "Part Kurang",
  RUSAK_RINGAN: "Rusak Ringan",
  RUSAK_BERAT: "Rusak Berat",
  DALAM_PERBAIKAN: "Dalam Perbaikan",
  DIHAPUSBUKU: "Dihapusbuku",
};

export const HYGIENE_LABELS: Record<HygieneStatus, string> = {
  STERIL: "Steril",
  PERLU_DICUCI: "Perlu Dicuci",
  SEDANG_DISANITASI: "Sedang Disanitasi",
};

export const KIT_STATUS_LABELS: Record<KitStatus, string> = {
  TERSEDIA: "Tersedia",
  DIPINJAM: "Dipinjam",
  TIDAK_LENGKAP: "Tidak Lengkap",
  NONAKTIF: "Nonaktif",
};

export const BORROW_STATUS_LABELS: Record<BorrowStatus, string> = {
  DIPINJAM: "Dipinjam",
  DIKEMBALIKAN: "Dikembalikan",
  TERLAMBAT: "Terlambat",
  HILANG_PART: "Part Hilang",
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  BULANAN: "Bulanan",
  TAHUNAN: "Tahunan",
  SEKALI_BAYAR: "Sekali Bayar",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  GOPAY: "GoPay",
  KARTU_DEBIT: "Kartu Debit",
  KARTU_KREDIT: "Kartu Kredit",
  TRANSFER_BANK: "Transfer Bank",
  VA: "Virtual Account",
  LAINNYA: "Lainnya",
};

export const ARCHIVE_STATUS_LABELS: Record<ArchivePhysicalStatus, string> = {
  TERSEDIA_DI_LEMARI: "Tersedia di Lemari",
  DIPINJAM: "Dipinjam",
  ARSIP_LAMA: "Arsip Lama",
};

export const DELIVERY_DIRECTION_LABELS: Record<DeliveryDirection, string> = {
  INBOUND: "Masuk (Inbound)",
  OUTBOUND: "Keluar (Outbound)",
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  DRAFT: "Draf",
  DIKEMAS: "Dikemas",
  DALAM_PERJALANAN: "Dalam Perjalanan",
  DITERIMA: "Diterima",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  PENGADAAN_BARANG: "Pengadaan Barang",
  LAPORAN_KERUSAKAN: "Laporan Kerusakan",
  PART_HILANG: "Laporan Part Hilang",
  AKSES_AKUN: "Permintaan Akses Akun",
  PENGHAPUSAN_ASET: "Penghapusan Aset",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  MENUNGGU_TEAM_LEADER: "Menunggu Team Leader",
  MENUNGGU_ADMIN: "Menunggu Verifikasi Admin",
  MENUNGGU_OWNER: "Menunggu Pengesahan Owner",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
  SELESAI: "Selesai",
};

export const BACKUP_TYPE_LABELS: Record<BackupType, string> = {
  PRE_UPDATE: "Pre-Update Snapshot",
  MONTHLY_CUTOFF: "Cut-Off Akhir Bulan",
  MANUAL: "Backup Manual",
};

/* -------------------------------------------------------------------------- */
/*                              Helper Functions                              */
/* -------------------------------------------------------------------------- */

const RUPIAH_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Format a numeric amount in Indonesian Rupiah (IDR), e.g. `Rp 150.000`. */
export function formatRupiah(amount: number | null | undefined): string {
  const numeric = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return RUPIAH_FORMATTER.format(numeric);
}

function parseDateSafe(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Date-only columns from Postgres (`YYYY-MM-DD`) should represent midnight WIB.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00+07:00`
    : trimmed;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a date or timestamp in WIB (`Asia/Jakarta`), e.g. `17 Nov 2026`
 * or `17 Nov 2026, 15.20 WIB` when `withTime` is true.
 */
export function formatDateWIB(
  date: string | Date | null | undefined,
  withTime = false,
): string {
  const parsed = parseDateSafe(date);
  if (!parsed) return "-";
  if (withTime) {
    return `${DATE_TIME_FORMATTER.format(parsed)} WIB`;
  }
  return DATE_ONLY_FORMATTER.format(parsed);
}

/**
 * Compute straight-line depreciated book value in IDR evaluated in WIB.
 * Returns `purchasePrice` when acquisition date or useful life is missing.
 */
export function calculateBookValue(
  purchasePrice: number,
  acquisitionDate: string | Date | null | undefined,
  usefulLifeMonths: number | null | undefined,
  residualValue = 0,
  referenceDate: Date = new Date(),
): number {
  const price =
    typeof purchasePrice === "number" && Number.isFinite(purchasePrice)
      ? Math.max(0, purchasePrice)
      : 0;
  const residual =
    typeof residualValue === "number" && Number.isFinite(residualValue)
      ? Math.min(price, Math.max(0, residualValue))
      : 0;

  if (!acquisitionDate || !usefulLifeMonths || usefulLifeMonths <= 0 || price <= residual) {
    return Math.round(price);
  }

  let acqYear: number;
  let acqMonth: number;
  let acqDay: number;

  if (typeof acquisitionDate === "string") {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(acquisitionDate.trim());
    if (dateOnlyMatch) {
      acqYear = Number(dateOnlyMatch[1]);
      acqMonth = Number(dateOnlyMatch[2]);
      acqDay = Number(dateOnlyMatch[3]);
    } else {
      const parsed = parseDateSafe(acquisitionDate);
      if (!parsed) return Math.round(price);
      const parts = getJakartaDateParts(parsed);
      acqYear = parts.year;
      acqMonth = parts.month;
      acqDay = parts.day;
    }
  } else {
    if (Number.isNaN(acquisitionDate.getTime())) return Math.round(price);
    const parts = getJakartaDateParts(acquisitionDate);
    acqYear = parts.year;
    acqMonth = parts.month;
    acqDay = parts.day;
  }

  const ref = getJakartaDateParts(referenceDate);
  let monthsElapsed = (ref.year - acqYear) * 12 + (ref.month - acqMonth);
  if (ref.day < acqDay) {
    monthsElapsed -= 1;
  }

  const clampedMonths = Math.max(0, Math.min(monthsElapsed, usefulLifeMonths));
  const depreciableAmount = Math.max(0, price - residual);
  const depreciation = (depreciableAmount * clampedMonths) / usefulLifeMonths;

  return Math.round(Math.max(residual, price - depreciation));
}
