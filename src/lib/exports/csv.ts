import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";

import { requireAction } from "@/lib/auth";
import {
  ARCHIVE_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  BILLING_CYCLE_LABELS,
  CONDITION_LABELS,
  DELIVERY_STATUS_LABELS,
  HYGIENE_LABELS,
  calculateBookValue,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import { getMonthlyUpdatePeriod } from "@/lib/period";
import { ROLE_LABELS, can, type Role } from "@/lib/rbac";
import {
  isValidPeriodYm,
  sanitizeCsvFormulaCell,
  sanitizeSafeError,
} from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import type {
  ArchiveHybrid,
  ArchiveVersion,
  AuditLog,
  BackupType,
  BorrowTransaction,
  Database,
  DeliveryLog,
  InternalRequest,
  ItemKit,
  ItemMaster,
  Json,
  MonthlyReconciliation,
  SystemBackup,
} from "@/types/database";

export type ExportScope =
  | "all"
  | "inventory"
  | "subscriptions"
  | "archives"
  | "deliveries"
  | "anomalies"
  | "audit";

export const FINANCIAL_ONLY_SCOPES = new Set<ExportScope>([
  "subscriptions",
  "deliveries",
  "audit",
]);

export type ExportSubscriptionRow = {
  id: string;
  sub_code: string;
  service_name: string;
  plan_name: string | null;
  login_email: string;
  billing_cycle: Database["public"]["Enums"]["billing_cycle"];
  cost: number | null;
  currency: string | null;
  payment_method: Database["public"]["Enums"]["payment_method"] | null;
  payment_account_label: string | null;
  renewal_date: string | null;
  auto_renew: boolean;
  max_slots: number;
  assigned_users_json: Json;
  password_rotated_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SafeSnapshotSubscriptionRow = ExportSubscriptionRow & {
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ExportAnomalyItem = {
  item: ItemMaster;
  reasons: string[];
  tags: Array<"PART_KURANG" | "STOK_RENDAH" | "PERLU_SANITASI" | "RUSAK">;
  detail: string;
};

export type ExportDataset = {
  generatedAtIso: string;
  generatedAtWib: string;
  periodCode: string;
  periodLabel: string;
  todayWib: string;
  actorName: string;
  actorRole: Role | "SYSTEM";
  canExportFinancial: boolean;
  canViewValuation: boolean;
  canViewBilling: boolean;
  items: ItemMaster[];
  subscriptions: ExportSubscriptionRow[];
  archives: ArchiveHybrid[];
  deliveries: DeliveryLog[];
  reconciliation: MonthlyReconciliation | null;
  approverNames: {
    adminName: string | null;
    leaderName: string | null;
    ownerName: string | null;
  };
  auditLogs: AuditLog[];
};

export type BackupSnapshotPayload = {
  version: 1;
  backup_code: string;
  backup_type: BackupType;
  period_ym: string;
  captured_at: string;
  captured_by: {
    id: string | null;
    name: string;
    role: string;
  };
  notes: string | null;
  tables: {
    items_master: ItemMaster[];
    item_kits: ItemKit[];
    borrow_transactions: BorrowTransaction[];
    subscriptions_vault: SafeSnapshotSubscriptionRow[];
    archives_hybrid: ArchiveHybrid[];
    archive_versions: ArchiveVersion[];
    deliveries_log: DeliveryLog[];
    internal_requests: InternalRequest[];
    monthly_reconciliations: MonthlyReconciliation[];
  };
};

export type BackupDiffSummary = {
  previous_backup_id: string | null;
  previous_backup_code: string | null;
  previous_created_at: string | null;
  new_items_count: number;
  removed_items_count: number;
  new_items: Array<{
    id: string;
    item_code: string;
    name: string;
    room_code: string;
  }>;
  removed_items: Array<{
    id: string;
    item_code: string;
    name: string;
  }>;
  part_kurang_count: number;
  part_kurang_delta: number;
  part_kurang_items: Array<{
    id: string;
    item_code: string;
    name: string;
    room_code: string;
    current_parts: number;
    total_parts: number;
  }>;
  low_stock_count: number;
  low_stock_delta: number;
  needs_sanitization_count: number;
  needs_sanitization_delta: number;
  subscription_active_count: number;
  subscription_monthly_cost_current: number;
  subscription_monthly_cost_previous: number;
  subscription_cost_delta: number;
  row_deltas: Record<
    string,
    {
      previous: number;
      current: number;
      delta: number;
    }
  >;
};

export { calculateBookValue, formatDateWIB, formatRupiah };

export function formatAssignedUsers(json: Json): string {
  if (!Array.isArray(json) || json.length === 0) return "-";
  const names = json
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const record = entry as Record<string, Json | undefined>;
        const label =
          record.name ?? record.full_name ?? record.email ?? record.user_id;
        return typeof label === "string" ? label : null;
      }
      return null;
    })
    .filter((v): v is string => Boolean(v && v.trim()));
  return names.length > 0 ? names.join(", ") : `${json.length} akun`;
}

export function countAssignedSlots(json: Json): number {
  return Array.isArray(json) ? json.length : 0;
}

export function getStockAnomalies(
  items: ItemMaster[],
  todayWib: string,
): {
  partKurang: ItemMaster[];
  lowStock: ItemMaster[];
  needsSanitation: ItemMaster[];
  damaged: ItemMaster[];
  rows: ExportAnomalyItem[];
} {
  const partKurang: ItemMaster[] = [];
  const lowStock: ItemMaster[] = [];
  const needsSanitation: ItemMaster[] = [];
  const damaged: ItemMaster[] = [];
  const rows: ExportAnomalyItem[] = [];

  for (const item of items) {
    const reasons: string[] = [];
    const tags: ExportAnomalyItem["tags"] = [];
    const details: string[] = [];

    const isPartKurang =
      item.condition === "PART_KURANG" ||
      (item.total_parts > 1 && item.current_parts < item.total_parts);
    if (isPartKurang) {
      partKurang.push(item);
      tags.push("PART_KURANG");
      reasons.push("Part Kurang");
      details.push(`Kepingan ${item.current_parts}/${item.total_parts}`);
    }

    const isLowStock =
      item.asset_type === "CONSUMABLE" &&
      item.min_stock_threshold > 0 &&
      item.stock_qty <= item.min_stock_threshold;
    if (isLowStock) {
      lowStock.push(item);
      tags.push("STOK_RENDAH");
      reasons.push("Stok Minimum");
      details.push(
        `Stok ${item.stock_qty} ${item.unit_label} (min ${item.min_stock_threshold})`,
      );
    }

    const isSanitationOverdue =
      item.asset_type === "THERAPY_TOY" &&
      (item.hygiene_status !== "STERIL" ||
        (item.next_sanitization_due !== null &&
          item.next_sanitization_due <= todayWib));
    if (isSanitationOverdue) {
      needsSanitation.push(item);
      tags.push("PERLU_SANITASI");
      reasons.push("Perlu Sanitasi");
      const dueNote =
        item.next_sanitization_due && item.next_sanitization_due <= todayWib
          ? `, jadwal ${item.next_sanitization_due}`
          : "";
      const hygieneLabel =
        HYGIENE_LABELS[item.hygiene_status] ?? item.hygiene_status ?? "-";
      details.push(`Sanitasi: ${hygieneLabel}${dueNote}`);
    }

    const isDamaged =
      item.condition === "RUSAK_RINGAN" ||
      item.condition === "RUSAK_BERAT" ||
      item.condition === "DALAM_PERBAIKAN";
    if (isDamaged) {
      damaged.push(item);
      tags.push("RUSAK");
      const conditionLabel =
        CONDITION_LABELS[item.condition] ?? item.condition ?? "-";
      reasons.push(conditionLabel);
      details.push(`Kondisi: ${conditionLabel}`);
    }

    if (reasons.length > 0) {
      rows.push({
        item,
        reasons,
        tags,
        detail: details.join(" | "),
      });
    }
  }

  return { partKurang, lowStock, needsSanitation, damaged, rows };
}

export function scrubVaultAuditEntry(log: AuditLog): AuditLog {
  if (log.entity_type !== "subscriptions_vault") return log;
  const redact = (data: Json | null): Json | null => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    const copy: Record<string, Json | undefined> = { ...data };
    delete copy.password_encrypted;
    delete copy.pin_recovery_encrypted;
    delete copy.cost;
    delete copy.currency;
    delete copy.payment_method;
    delete copy.payment_account_label;
    delete copy.notes;
    return copy;
  };
  return {
    ...log,
    old_data: redact(log.old_data),
    new_data: redact(log.new_data),
  };
}

export async function loadExportDataset(
  supabase: SupabaseClient<Database>,
  options: {
    actorName: string;
    actorRole: Role | "SYSTEM";
    isServiceRole?: boolean;
    includeAudit?: boolean;
    periodCode?: string;
  },
): Promise<ExportDataset> {
  const now = new Date();
  const period = getMonthlyUpdatePeriod(now);
  const periodCode =
    options.periodCode && isValidPeriodYm(options.periodCode)
      ? options.periodCode.trim()
      : period.periodCode;
  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(now);
  const canExportFinancial =
    options.actorRole === "SYSTEM" || can(options.actorRole, "export.financial");
  const canViewValuation =
    options.actorRole === "SYSTEM" ||
    can(options.actorRole, "inventory.view_valuation");
  const canViewBilling =
    options.actorRole === "SYSTEM" || can(options.actorRole, "vault.view_billing");

  const itemsPromise = supabase
    .from("items_master")
    .select("*")
    .is("deleted_at", null)
    .order("item_code", { ascending: true })
    .limit(5000);

  const subscriptionsPromise = !canExportFinancial
    ? Promise.resolve({ data: [] as ExportSubscriptionRow[], error: null })
    : options.isServiceRole
      ? supabase
          .from("subscriptions_vault")
          .select(
            "id, sub_code, service_name, plan_name, login_email, billing_cycle, cost, currency, payment_method, payment_account_label, renewal_date, auto_renew, max_slots, assigned_users_json, password_rotated_at, is_active, created_at, updated_at",
          )
          .is("deleted_at", null)
          .order("sub_code", { ascending: true })
      : supabase
          .from("subscriptions_vault_directory")
          .select("*")
          .order("sub_code", { ascending: true });

  const archivesPromise = supabase
    .from("archives_hybrid")
    .select("*")
    .is("deleted_at", null)
    .order("doc_code", { ascending: true })
    .limit(5000);

  const deliveriesPromise = !canExportFinancial
    ? Promise.resolve({ data: [] as DeliveryLog[], error: null })
    : supabase
        .from("deliveries_log")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5000);

  const reconciliationPromise = supabase
    .from("monthly_reconciliations")
    .select("*")
    .eq("period_ym", periodCode)
    .maybeSingle();

  const auditPromise =
    canExportFinancial && options.includeAudit
      ? supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] as AuditLog[], error: null });

  const [itemsRes, subsRes, archivesRes, deliveriesRes, recRes, auditRes] =
    await Promise.all([
      itemsPromise,
      subscriptionsPromise,
      archivesPromise,
      deliveriesPromise,
      reconciliationPromise,
      auditPromise,
    ]);

  if (itemsRes.error) {
    throw new Error(
      sanitizeSafeError(itemsRes.error, "Gagal memuat data inventaris.", "exports/items"),
    );
  }
  if (subsRes.error) {
    throw new Error(
      sanitizeSafeError(subsRes.error, "Gagal memuat data langganan.", "exports/subscriptions"),
    );
  }
  if (archivesRes.error) {
    throw new Error(
      sanitizeSafeError(archivesRes.error, "Gagal memuat arsip berkas.", "exports/archives"),
    );
  }
  if (deliveriesRes.error) {
    throw new Error(
      sanitizeSafeError(deliveriesRes.error, "Gagal memuat log pengiriman.", "exports/deliveries"),
    );
  }

  const reconciliation = recRes.data ?? null;
  const approverIds = [
    reconciliation?.verified_by_admin,
    reconciliation?.approved_by_leader,
    reconciliation?.approved_by_owner,
  ].filter((id): id is string => Boolean(id));

  const approverNameMap = new Map<string, string>();
  if (approverIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", approverIds);
    for (const p of profiles ?? []) {
      approverNameMap.set(p.id, p.full_name?.trim() || p.email || "Pengguna");
    }
  }

  const rawItems = (itemsRes.data ?? []) as ItemMaster[];
  const items: ItemMaster[] = canViewValuation
    ? rawItems
    : rawItems.map((item) => ({
        ...item,
        purchase_price: 0,
        residual_value: 0,
      }));

  const rawLogs = (auditRes.data ?? []) as AuditLog[];
  const auditLogs = canExportFinancial ? rawLogs : [];

  return {
    generatedAtIso: now.toISOString(),
    generatedAtWib: formatDateWIB(now, true),
    periodCode,
    periodLabel: period.periodLabel,
    todayWib,
    actorName: options.actorName,
    actorRole: options.actorRole,
    canExportFinancial,
    canViewValuation,
    canViewBilling,
    items,
    subscriptions: canExportFinancial
      ? ((subsRes.data ?? []) as ExportSubscriptionRow[])
      : [],
    archives: (archivesRes.data ?? []) as ArchiveHybrid[],
    deliveries: canExportFinancial
      ? ((deliveriesRes.data ?? []) as DeliveryLog[])
      : [],
    reconciliation,
    approverNames: {
      adminName: reconciliation?.verified_by_admin
        ? approverNameMap.get(reconciliation.verified_by_admin) ?? null
        : null,
      leaderName: reconciliation?.approved_by_leader
        ? approverNameMap.get(reconciliation.approved_by_leader) ?? null
        : null,
      ownerName: reconciliation?.approved_by_owner
        ? approverNameMap.get(reconciliation.approved_by_owner) ?? null
        : null,
    },
    auditLogs,
  };
}

function getInventoryCsvFields(canViewValuation: boolean): string[] {
  return [
    "Kode_Item",
    "Nama_Barang",
    "Tipe_Aset",
    "Prefix_Kategori",
    "Kategori",
    "Lokasi_Ruang",
    "Rak_Lokasi",
    "PIC",
    "Kondisi",
    "Status_Sanitasi",
    "Jadwal_Sanitasi_Berikutnya",
    "Kepingan_Saat_Ini",
    "Total_Kepingan",
    "Stok",
    "Batas_Stok_Min",
    "Satuan",
    "Tanggal_Perolehan",
    ...(canViewValuation ? ["Harga_Beli_IDR", "Nilai_Buku_IDR"] : []),
    "Catatan",
  ];
}

const SUBSCRIPTION_CSV_FIELDS = [
  "Kode_Sub",
  "Nama_Layanan",
  "Paket",
  "Email_Login",
  "Kredensial_Vault",
  "Siklus_Tagihan",
  "Biaya",
  "Mata_Uang",
  "Metode_Bayar",
  "Akun_Pembayaran",
  "Jatuh_Tempo",
  "Auto_Renew",
  "Slot_Terpakai",
  "Slot_Maksimal",
  "Pengguna_Terdaftar",
  "Rotasi_Password_Terakhir",
  "Status",
];

const ARCHIVE_CSV_FIELDS = [
  "Kode_Dokumen",
  "Judul",
  "Kategori",
  "Gedung_Cabang",
  "Lemari",
  "Laci",
  "Kode_Map",
  "Status_Fisik",
  "Versi",
  "SOP_Publik_Staff",
  "Nama_File_Digital",
  "Tautan_Drive",
  "Catatan",
  "Diperbarui",
];

function getDeliveryCsvFields(canExportFinancial: boolean): string[] {
  return [
    "Kode_Pengiriman",
    "Arah",
    "Jenis_Paket",
    "Kurir",
    "No_Resi",
    ...(canExportFinancial ? ["Biaya_Ongkir_IDR"] : []),
    "Pengirim",
    "Penerima",
    "PIC",
    "Barang_Pecah_Belah",
    "Status",
    "Konversi_Stok",
    "Tanggal_Kirim",
    "Tanggal_Terima",
    "Catatan",
  ];
}

const ANOMALY_CSV_FIELDS = [
  "No",
  "Kode_Item",
  "Nama_Barang",
  "Ruang",
  "Jenis_Anomali",
  "Detail",
  "PIC",
];

const AUDIT_CSV_FIELDS = [
  "Waktu_WIB",
  "Aktor",
  "Peran",
  "Aksi",
  "Entitas",
  "Kode_Entitas",
  "Ringkasan",
];

function mapInventoryRows(items: ItemMaster[], canViewValuation: boolean) {
  return items.map((item) => {
    const base: Record<string, string | number> = {
      Kode_Item: item.item_code,
      Nama_Barang: item.name,
      Tipe_Aset: ASSET_TYPE_LABELS[item.asset_type] ?? item.asset_type ?? "-",
      Prefix_Kategori: item.category_prefix,
      Kategori: item.category,
      Lokasi_Ruang: item.room_code,
      Rak_Lokasi: item.rack_location ?? "",
      PIC: item.pic_name ?? "",
      Kondisi: CONDITION_LABELS[item.condition] ?? item.condition ?? "-",
      Status_Sanitasi:
        HYGIENE_LABELS[item.hygiene_status] ?? item.hygiene_status ?? "-",
      Jadwal_Sanitasi_Berikutnya: item.next_sanitization_due ?? "",
      Kepingan_Saat_Ini: item.current_parts,
      Total_Kepingan: item.total_parts,
      Stok: item.stock_qty,
      Batas_Stok_Min: item.min_stock_threshold,
      Satuan: item.unit_label,
      Tanggal_Perolehan: item.acquisition_date ?? "",
    };

    if (canViewValuation) {
      base.Harga_Beli_IDR = item.purchase_price;
      base.Nilai_Buku_IDR = calculateBookValue(
        item.purchase_price,
        item.acquisition_date,
        item.useful_life_months,
        item.residual_value,
      );
    }

    base.Catatan = item.description ?? "";
    return base;
  });
}

function mapSubscriptionRows(dataset: ExportDataset) {
  return dataset.subscriptions.map((sub) => ({
    Kode_Sub: sub.sub_code,
    Nama_Layanan: sub.service_name,
    Paket: sub.plan_name ?? "",
    Email_Login: sub.login_email,
    Kredensial_Vault: "******** (Terenkripsi AES-256)",
    Siklus_Tagihan:
      BILLING_CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle ?? "-",
    Biaya: dataset.canViewBilling && sub.cost !== null ? sub.cost : "Terbatas",
    Mata_Uang: dataset.canViewBilling && sub.currency ? sub.currency : "Terbatas",
    Metode_Bayar:
      dataset.canViewBilling && sub.payment_method ? sub.payment_method : "Terbatas",
    Akun_Pembayaran:
      dataset.canViewBilling && sub.payment_account_label
        ? sub.payment_account_label
        : "Terbatas",
    Jatuh_Tempo: sub.renewal_date ?? "",
    Auto_Renew: sub.auto_renew ? "Ya" : "Tidak",
    Slot_Terpakai: countAssignedSlots(sub.assigned_users_json),
    Slot_Maksimal: sub.max_slots,
    Pengguna_Terdaftar: formatAssignedUsers(sub.assigned_users_json),
    Rotasi_Password_Terakhir: formatDateWIB(sub.password_rotated_at, true),
    Status: sub.is_active ? "Aktif" : "Nonaktif",
  }));
}

function mapArchiveRows(archives: ArchiveHybrid[]) {
  return archives.map((doc) => ({
    Kode_Dokumen: doc.doc_code,
    Judul: doc.title,
    Kategori: doc.category,
    Gedung_Cabang: doc.branch_building,
    Lemari: doc.cabinet_code,
    Laci: doc.drawer_no,
    Kode_Map: doc.folder_code ?? "",
    Status_Fisik:
      ARCHIVE_STATUS_LABELS[doc.physical_status] ?? doc.physical_status ?? "-",
    Versi: doc.version_no,
    SOP_Publik_Staff: doc.is_sop_public_to_staff ? "Ya" : "Tidak",
    Nama_File_Digital: doc.digital_file_name ?? "",
    Tautan_Drive: doc.drive_link ?? "",
    Catatan: doc.notes ?? "",
    Diperbarui: formatDateWIB(doc.updated_at, true),
  }));
}

function mapDeliveryRows(deliveries: DeliveryLog[], canExportFinancial: boolean) {
  return deliveries.map((del) => {
    const base: Record<string, string | number> = {
      Kode_Pengiriman: del.delivery_code,
      Arah:
        del.direction === "INBOUND"
          ? "Masuk (Inbound)"
          : del.direction === "OUTBOUND"
            ? "Keluar (Outbound)"
            : String(del.direction ?? "-"),
      Jenis_Paket: del.package_type,
      Kurir: del.courier_name,
      No_Resi: del.tracking_number ?? "",
    };
    if (canExportFinancial) {
      base.Biaya_Ongkir_IDR = del.shipping_cost;
    }
    base.Pengirim = del.sender_name;
    base.Penerima = del.receiver_name;
    base.PIC = del.pic_name ?? "";
    base.Barang_Pecah_Belah = del.is_fragile ? "Ya" : "Tidak";
    base.Status = DELIVERY_STATUS_LABELS[del.status] ?? del.status ?? "-";
    base.Konversi_Stok = del.converted_to_stock_at
      ? formatDateWIB(del.converted_to_stock_at, true)
      : "Belum";
    base.Tanggal_Kirim = formatDateWIB(del.shipped_at, true);
    base.Tanggal_Terima = formatDateWIB(del.received_at, true);
    base.Catatan = del.notes ?? "";
    return base;
  });
}

function mapAnomalyRows(dataset: ExportDataset) {
  const { rows } = getStockAnomalies(dataset.items, dataset.todayWib);
  return rows.map((row, idx) => ({
    No: idx + 1,
    Kode_Item: row.item.item_code,
    Nama_Barang: row.item.name,
    Ruang: row.item.room_code,
    Jenis_Anomali: row.reasons.join(", "),
    Detail: row.detail,
    PIC: row.item.pic_name ?? "-",
  }));
}

function mapAuditRows(logs: AuditLog[]) {
  return logs.map((log) => ({
    Waktu_WIB: formatDateWIB(log.created_at, true),
    Aktor: log.actor_name ?? "Sistem",
    Peran: log.actor_role
      ? (ROLE_LABELS[log.actor_role]?.title ?? log.actor_role)
      : "Sistem",
    Aksi: log.action,
    Entitas: log.entity_type,
    Kode_Entitas: log.entity_code ?? "",
    Ringkasan: log.summary,
  }));
}

function sanitizeCsvRow<T extends Record<string, string | number>>(row: T): T {
  const safe = { ...row };
  for (const key of Object.keys(safe) as Array<keyof T>) {
    const val = safe[key];
    if (typeof val === "string") {
      safe[key] = sanitizeCsvFormulaCell(val) as T[keyof T];
    }
  }
  return safe;
}

function sanitizeCsvRows<T extends Record<string, string | number>>(rows: T[]): T[] {
  return rows.map(sanitizeCsvRow);
}

function unparseCsvWithHeaders<T extends Record<string, string | number>>(
  rows: T[],
  fields: string[],
): string {
  if (rows.length === 0) {
    return Papa.unparse({ fields, data: [] });
  }
  return Papa.unparse(sanitizeCsvRows(rows));
}

export function generateCsvString(
  dataset: ExportDataset,
  scope: ExportScope = "all",
): string {
  const bom = "\uFEFF";

  if (scope === "inventory") {
    return (
      bom +
      unparseCsvWithHeaders(
        mapInventoryRows(dataset.items, dataset.canViewValuation),
        getInventoryCsvFields(dataset.canViewValuation),
      )
    );
  }
  if (scope === "subscriptions") {
    if (!dataset.canExportFinancial) return bom;
    return (
      bom +
      unparseCsvWithHeaders(
        mapSubscriptionRows(dataset),
        SUBSCRIPTION_CSV_FIELDS,
      )
    );
  }
  if (scope === "archives") {
    return (
      bom +
      unparseCsvWithHeaders(
        mapArchiveRows(dataset.archives),
        ARCHIVE_CSV_FIELDS,
      )
    );
  }
  if (scope === "deliveries") {
    if (!dataset.canExportFinancial) return bom;
    return (
      bom +
      unparseCsvWithHeaders(
        mapDeliveryRows(dataset.deliveries, dataset.canExportFinancial),
        getDeliveryCsvFields(dataset.canExportFinancial),
      )
    );
  }
  if (scope === "anomalies") {
    return (
      bom +
      unparseCsvWithHeaders(mapAnomalyRows(dataset), ANOMALY_CSV_FIELDS)
    );
  }
  if (scope === "audit") {
    if (!dataset.canExportFinancial) return bom;
    return (
      bom +
      unparseCsvWithHeaders(mapAuditRows(dataset.auditLogs), AUDIT_CSV_FIELDS)
    );
  }

  const actorRoleLabel =
    dataset.actorRole === "SYSTEM"
      ? "Sistem"
      : (ROLE_LABELS[dataset.actorRole]?.title ?? dataset.actorRole ?? "Sistem");

  const summaryHeader: Record<string, string | number> = {
    Organisasi: "Star Champs Indonesia",
    Aplikasi: "StarOps",
    Periode: `${dataset.periodLabel} (${dataset.periodCode})`,
    Dicetak_Pada_WIB: dataset.generatedAtWib,
    Oleh: `${dataset.actorName} (${actorRoleLabel})`,
    Total_Inventaris: dataset.items.length,
    Total_Arsip: dataset.archives.length,
  };

  if (dataset.canExportFinancial) {
    summaryHeader.Total_Langganan = dataset.subscriptions.length;
    summaryHeader.Total_Pengiriman = dataset.deliveries.length;
  }

  const sections: string[] = [];
  sections.push(Papa.unparse([sanitizeCsvRow(summaryHeader)]));

  const appendSection = (title: string, rows: Record<string, string | number>[]) => {
    sections.push(`\r\n# ${title}`);
    if (rows.length === 0) {
      sections.push("Tidak ada data");
      return;
    }
    sections.push(Papa.unparse(sanitizeCsvRows(rows)));
  };

  appendSection(
    "INVENTARIS & PART MAINAN",
    mapInventoryRows(dataset.items, dataset.canViewValuation),
  );
  appendSection("ANOMALI STOK & SANITASI", mapAnomalyRows(dataset));
  if (dataset.canExportFinancial) {
    appendSection(
      "VAULT LANGGANAN (KREDENSIAL TERMASKING)",
      mapSubscriptionRows(dataset),
    );
  }
  appendSection("ARSIP BERKAS HYBRID", mapArchiveRows(dataset.archives));
  if (dataset.canExportFinancial) {
    appendSection(
      "LOG PENGIRIMAN",
      mapDeliveryRows(dataset.deliveries, dataset.canExportFinancial),
    );
  }

  return bom + sections.join("\r\n");
}

export async function exportCsvWithAuth(scope: ExportScope = "all"): Promise<{
  filename: string;
  contentType: string;
  content: string;
}> {
  const user = await requireAction("export.data");
  if (FINANCIAL_ONLY_SCOPES.has(scope)) {
    await requireAction("export.financial");
  }
  const supabase = await createClient();
  const dataset = await loadExportDataset(supabase, {
    actorName: user.fullName,
    actorRole: user.role,
    includeAudit: scope === "audit" && can(user.role, "export.financial"),
  });
  const content = generateCsvString(dataset, scope);
  return {
    filename: `starops-${scope}-${dataset.periodCode}.csv`,
    contentType: "text/csv; charset=utf-8",
    content,
  };
}

function calcMonthlySubCost(
  subs: Array<{
    is_active: boolean;
    deleted_at?: string | null;
    billing_cycle: Database["public"]["Enums"]["billing_cycle"];
    cost: number | null;
  }>,
): number {
  let total = 0;
  for (const sub of subs) {
    if (!sub.is_active || sub.deleted_at) continue;
    const cost = Number(sub.cost ?? 0);
    if (sub.billing_cycle === "BULANAN") total += cost;
    else if (sub.billing_cycle === "TAHUNAN") total += cost / 12;
  }
  return Math.round(total);
}

export async function captureFullBackupSnapshot(
  supabase: SupabaseClient<Database>,
  params: {
    backupCode: string;
    backupType: BackupType;
    periodYm: string;
    actorId: string | null;
    actorName: string;
    actorRole: string;
    notes?: string | null;
  },
): Promise<BackupSnapshotPayload> {
  const [
    itemsRes,
    kitsRes,
    borrowsRes,
    subsRes,
    archivesRes,
    versionsRes,
    deliveriesRes,
    requestsRes,
    recRes,
  ] = await Promise.all([
    supabase.from("items_master").select("*").order("item_code", { ascending: true }),
    supabase.from("item_kits").select("*").order("kit_code", { ascending: true }),
    supabase
      .from("borrow_transactions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions_vault")
      .select(
        "id, sub_code, service_name, plan_name, login_email, billing_cycle, cost, currency, payment_method, payment_account_label, renewal_date, auto_renew, max_slots, assigned_users_json, password_rotated_at, notes, is_active, created_by, updated_by, deleted_at, deleted_by, created_at, updated_at",
      )
      .order("sub_code", { ascending: true }),
    supabase.from("archives_hybrid").select("*").order("doc_code", { ascending: true }),
    supabase
      .from("archive_versions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("deliveries_log")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("internal_requests")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("monthly_reconciliations")
      .select("*")
      .order("period_ym", { ascending: false }),
  ]);

  if (itemsRes.error) {
    throw new Error(sanitizeSafeError(itemsRes.error, "Gagal mengambil snapshot inventaris.", "backup/items"));
  }
  if (kitsRes.error) {
    throw new Error(sanitizeSafeError(kitsRes.error, "Gagal mengambil snapshot kit.", "backup/kits"));
  }
  if (borrowsRes.error) {
    throw new Error(sanitizeSafeError(borrowsRes.error, "Gagal mengambil snapshot peminjaman.", "backup/borrows"));
  }
  if (subsRes.error) {
    throw new Error(sanitizeSafeError(subsRes.error, "Gagal mengambil snapshot langganan.", "backup/subs"));
  }
  if (archivesRes.error) {
    throw new Error(sanitizeSafeError(archivesRes.error, "Gagal mengambil snapshot arsip.", "backup/archives"));
  }
  if (versionsRes.error) {
    throw new Error(sanitizeSafeError(versionsRes.error, "Gagal mengambil snapshot versi arsip.", "backup/versions"));
  }
  if (deliveriesRes.error) {
    throw new Error(sanitizeSafeError(deliveriesRes.error, "Gagal mengambil snapshot pengiriman.", "backup/deliveries"));
  }
  if (requestsRes.error) {
    throw new Error(sanitizeSafeError(requestsRes.error, "Gagal mengambil snapshot pengajuan.", "backup/requests"));
  }
  if (recRes.error) {
    throw new Error(sanitizeSafeError(recRes.error, "Gagal mengambil snapshot rekonsiliasi.", "backup/rec"));
  }

  return {
    version: 1,
    backup_code: params.backupCode,
    backup_type: params.backupType,
    period_ym: params.periodYm,
    captured_at: new Date().toISOString(),
    captured_by: {
      id: params.actorId,
      name: params.actorName,
      role: params.actorRole,
    },
    notes: params.notes ?? null,
    tables: {
      items_master: (itemsRes.data ?? []) as ItemMaster[],
      item_kits: (kitsRes.data ?? []) as ItemKit[],
      borrow_transactions: (borrowsRes.data ?? []) as BorrowTransaction[],
      subscriptions_vault: (subsRes.data ?? []) as SafeSnapshotSubscriptionRow[],
      archives_hybrid: (archivesRes.data ?? []) as ArchiveHybrid[],
      archive_versions: (versionsRes.data ?? []) as ArchiveVersion[],
      deliveries_log: (deliveriesRes.data ?? []) as DeliveryLog[],
      internal_requests: (requestsRes.data ?? []) as InternalRequest[],
      monthly_reconciliations: (recRes.data ?? []) as MonthlyReconciliation[],
    },
  };
}

export async function computeBackupDiffSummary(
  supabase: SupabaseClient<Database>,
  snapshot: BackupSnapshotPayload,
): Promise<{
  diffSummary: BackupDiffSummary;
  rowCounts: Record<string, number>;
}> {
  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  const activeItems = snapshot.tables.items_master.filter((i) => !i.deleted_at);
  const activeKits = snapshot.tables.item_kits.filter((k) => !k.deleted_at);
  const activeSubs = snapshot.tables.subscriptions_vault.filter((s) => !s.deleted_at);
  const activeArchives = snapshot.tables.archives_hybrid.filter((a) => !a.deleted_at);
  const activeDeliveries = snapshot.tables.deliveries_log.filter((d) => !d.deleted_at);
  const activeRequests = snapshot.tables.internal_requests.filter((r) => !r.deleted_at);

  const rowCounts: Record<string, number> = {
    items_master: activeItems.length,
    item_kits: activeKits.length,
    borrow_transactions: snapshot.tables.borrow_transactions.length,
    subscriptions_vault: activeSubs.length,
    archives_hybrid: activeArchives.length,
    deliveries_log: activeDeliveries.length,
    internal_requests: activeRequests.length,
  };

  const currentAnomalies = getStockAnomalies(activeItems, todayWib);
  const currentSubCost = calcMonthlySubCost(activeSubs);

  const { data: prevBackup } = await supabase
    .from("system_backups")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let prevSnapshot: BackupSnapshotPayload | null = null;
  if (prevBackup?.snapshot_json_url) {
    const { data: blob } = await supabase.storage
      .from("backups")
      .download(prevBackup.snapshot_json_url);
    if (blob) {
      try {
        const text = await blob.text();
        prevSnapshot = JSON.parse(text) as BackupSnapshotPayload;
      } catch {
        prevSnapshot = null;
      }
    }
  }

  const prevActiveItems = prevSnapshot
    ? prevSnapshot.tables.items_master.filter((i) => !i.deleted_at)
    : [];
  const prevItemIds = new Set(prevActiveItems.map((i) => i.id));
  const currentItemIds = new Set(activeItems.map((i) => i.id));

  const newItems = prevSnapshot
    ? activeItems
        .filter((i) => !prevItemIds.has(i.id))
        .map((i) => ({
          id: i.id,
          item_code: i.item_code,
          name: i.name,
          room_code: i.room_code,
        }))
    : activeItems.slice(0, 25).map((i) => ({
        id: i.id,
        item_code: i.item_code,
        name: i.name,
        room_code: i.room_code,
      }));

  const removedItems = prevSnapshot
    ? prevActiveItems
        .filter((i) => !currentItemIds.has(i.id))
        .map((i) => ({
          id: i.id,
          item_code: i.item_code,
          name: i.name,
        }))
    : [];

  const prevDiff =
    prevBackup?.diff_summary_json &&
    typeof prevBackup.diff_summary_json === "object" &&
    !Array.isArray(prevBackup.diff_summary_json)
      ? (prevBackup.diff_summary_json as Record<string, Json | undefined>)
      : null;

  const prevAnomalies = prevSnapshot
    ? getStockAnomalies(prevActiveItems, todayWib)
    : null;

  const prevPartKurangCount = prevAnomalies
    ? prevAnomalies.partKurang.length
    : Number(prevDiff?.part_kurang_count ?? 0);
  const prevLowStockCount = prevAnomalies
    ? prevAnomalies.lowStock.length
    : Number(prevDiff?.low_stock_count ?? 0);
  const prevSanitationCount = prevAnomalies
    ? prevAnomalies.needsSanitation.length
    : Number(prevDiff?.needs_sanitization_count ?? 0);

  const prevSubCost = prevSnapshot
    ? calcMonthlySubCost(
        prevSnapshot.tables.subscriptions_vault.filter((s) => !s.deleted_at),
      )
    : Number(prevDiff?.subscription_monthly_cost_current ?? 0);

  const prevCounts =
    prevBackup?.row_counts_json &&
    typeof prevBackup.row_counts_json === "object" &&
    !Array.isArray(prevBackup.row_counts_json)
      ? (prevBackup.row_counts_json as Record<string, Json | undefined>)
      : {};

  const rowDeltas: BackupDiffSummary["row_deltas"] = {};
  for (const [key, currentVal] of Object.entries(rowCounts)) {
    const prevVal = Number(prevCounts[key] ?? 0);
    rowDeltas[key] = {
      previous: prevVal,
      current: currentVal,
      delta: currentVal - prevVal,
    };
  }

  return {
    rowCounts,
    diffSummary: {
      previous_backup_id: prevBackup?.id ?? null,
      previous_backup_code: prevBackup?.backup_code ?? null,
      previous_created_at: prevBackup?.created_at ?? null,
      new_items_count: prevSnapshot ? newItems.length : activeItems.length,
      removed_items_count: removedItems.length,
      new_items: newItems.slice(0, 50),
      removed_items: removedItems.slice(0, 50),
      part_kurang_count: currentAnomalies.partKurang.length,
      part_kurang_delta: prevBackup
        ? currentAnomalies.partKurang.length - prevPartKurangCount
        : 0,
      part_kurang_items: currentAnomalies.partKurang.slice(0, 50).map((i) => ({
        id: i.id,
        item_code: i.item_code,
        name: i.name,
        room_code: i.room_code,
        current_parts: i.current_parts,
        total_parts: i.total_parts,
      })),
      low_stock_count: currentAnomalies.lowStock.length,
      low_stock_delta: prevBackup
        ? currentAnomalies.lowStock.length - prevLowStockCount
        : 0,
      needs_sanitization_count: currentAnomalies.needsSanitation.length,
      needs_sanitization_delta: prevBackup
        ? currentAnomalies.needsSanitation.length - prevSanitationCount
        : 0,
      subscription_active_count: activeSubs.filter((s) => s.is_active).length,
      subscription_monthly_cost_current: currentSubCost,
      subscription_monthly_cost_previous: prevBackup ? prevSubCost : 0,
      subscription_cost_delta: prevBackup ? currentSubCost - prevSubCost : 0,
      row_deltas: rowDeltas,
    },
  };
}

export async function persistBackupBundle(
  supabase: SupabaseClient<Database>,
  params: {
    backupCode: string;
    backupType: BackupType;
    periodYm: string;
    actorId: string | null;
    snapshot: BackupSnapshotPayload;
    diffSummary: BackupDiffSummary;
    rowCounts: Record<string, number>;
    csvContent: string;
    xlsxBuffer: Buffer;
    pdfBuffer: Buffer;
    notes?: string | null;
  },
): Promise<{ backup: SystemBackup; storageWarnings: string[] }> {
  const basePath = `${params.periodYm}/${params.backupCode}`;
  const jsonPath = `${basePath}/snapshot.json`;
  const xlsxPath = `${basePath}/laporan-${params.backupCode}.xlsx`;
  const csvPath = `${basePath}/data-${params.backupCode}.csv`;
  const pdfPath = `${basePath}/laporan-${params.backupCode}.pdf`;

  const storageWarnings: string[] = [];

  const uploadFile = async (
    path: string,
    data: string | Buffer,
    contentType: string,
  ): Promise<string | null> => {
    const { error } = await supabase.storage.from("backups").upload(path, data, {
      contentType,
      upsert: true,
    });
    if (error) {
      sanitizeSafeError(error, "Gagal mengunggah berkas backup ke storage.", "backup/upload");
      storageWarnings.push(`${path.split("/").pop() ?? "file"} gagal diunggah ke storage`);
      return null;
    }
    return path;
  };

  const [savedJson, savedXlsx, savedCsv, savedPdf] = await Promise.all([
    uploadFile(jsonPath, JSON.stringify(params.snapshot, null, 2), "application/json"),
    uploadFile(
      xlsxPath,
      params.xlsxBuffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    uploadFile(csvPath, params.csvContent, "text/csv; charset=utf-8"),
    uploadFile(pdfPath, params.pdfBuffer, "application/pdf"),
  ]);

  const combinedNotes = [
    params.notes?.trim() || null,
    storageWarnings.length > 0
      ? `Peringatan Storage: ${storageWarnings.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const { data: inserted, error: insertError } = await supabase
    .from("system_backups")
    .insert({
      backup_code: params.backupCode,
      backup_type: params.backupType,
      period_ym: params.periodYm,
      snapshot_json_url: savedJson,
      export_xlsx_url: savedXlsx,
      export_csv_url: savedCsv,
      export_pdf_url: savedPdf,
      diff_summary_json: params.diffSummary as unknown as Json,
      row_counts_json: params.rowCounts as unknown as Json,
      notes: combinedNotes || null,
      created_by: params.actorId,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(
      sanitizeSafeError(
        insertError,
        "Gagal menyimpan metadata backup ke database.",
        "backup/persist",
      ),
    );
  }

  return {
    backup: inserted as SystemBackup,
    storageWarnings,
  };
}
