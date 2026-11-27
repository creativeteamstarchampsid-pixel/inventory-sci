import "server-only";

import { can, type Role } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";

export type TelemetryTableUsage = {
  tableName: string;
  label: string;
  totalBytes: number;
  estimatedRows: number;
};

export type TelemetryBucketUsage = {
  bucketId: string;
  label: string;
  isPublic: boolean;
  fileSizeLimit: number | null;
  usedBytes: number;
  fileCount: number;
};

export type TelemetryDailyPoint = {
  date: string;
  dbSizeBytes: number;
  storageSizeBytes: number;
  dbEgressBytes: number;
  storageEgressBytes: number;
  exportEgressBytes: number;
  totalEgressBytes: number;
  queryCount: number;
};

export type AdminInfrastructureTelemetry = {
  planName: string;
  capturedAt: string;
  database: {
    usedBytes: number;
    quotaBytes: number;
    publicTablesBytes: number;
    systemCatalogBytes: number;
    tables: TelemetryTableUsage[];
  };
  storage: {
    usedBytes: number;
    quotaBytes: number;
    totalFiles: number;
    buckets: TelemetryBucketUsage[];
  };
  egress: {
    quotaBytes: number;
    monthStart: string;
    monthDbBytes: number;
    monthStorageBytes: number;
    monthExportBytes: number;
    monthTotalBytes: number;
    monthQueries: number;
    dailySeries: TelemetryDailyPoint[];
  };
  pgPerformance: {
    cacheHitRatio: number;
    blksHit: number;
    blksRead: number;
    xactCommit: number;
    xactRollback: number;
    tupReturned: number;
    tupFetched: number;
    tupInserted: number;
    tupUpdated: number;
    tupDeleted: number;
    activeBackends: number;
    sessions: number;
    statsReset: string | null;
  };
};

const TABLE_LABELS: Record<string, string> = {
  audit_logs: "Riwayat Aktivitas (Audit)",
  items_master: "Master Barang & Alat",
  borrow_transactions: "Transaksi Pinjam & Kembali",
  internal_requests: "Pengajuan & E-Approval",
  system_backups: "Metadata Cadangan Data",
  archives_hybrid: "Arsip Hibrida & SOP",
  code_sequences: "Urutan Penomoran Kode",
  locations_master: "Master Ruangan & Lemari",
  profiles: "Profil & Akun Tim",
  subscriptions_vault: "Brankas Akun Digital",
  monthly_reconciliations: "Rekonsiliasi Akhir Bulan",
  deliveries_log: "Logistik & Pengiriman",
  item_kits: "Paket Alat (Kit)",
  archive_versions: "Riwayat Versi Arsip",
  system_telemetry_daily: "Telemetri Kapasitas Harian",
};

const BUCKET_LABELS: Record<string, string> = {
  backups: "Cadangan Sistem (backups)",
  archives: "Arsip & Dokumen SOP (archives)",
  "inventory-photos": "Foto Barang & Alat (inventory-photos)",
  "delivery-proofs": "Bukti Pengiriman (delivery-proofs)",
};

function readQuotaMb(envName: string, fallbackMb: number): number {
  const raw = process.env[envName];
  if (!raw) return fallbackMb;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMb;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asRecord(item));
}

function hasServiceRoleConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Loads live PostgreSQL storage capacity, private Supabase Storage bucket usage,
 * and PostgreSQL / data-transfer egress telemetry strictly for OWNER & SUPER_ADMIN.
 */
export async function loadAdminInfrastructureMetrics(
  role: Role,
): Promise<AdminInfrastructureTelemetry | null> {
  if (!can(role, "infrastructure.view")) {
    return null;
  }
  if (!hasServiceRoleConfig()) {
    return null;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_admin_infrastructure_metrics");
    if (error || !data) {
      console.error(
        "[telemetry/loadAdminInfrastructureMetrics] RPC failed:",
        error?.message ?? "No data returned",
      );
      return null;
    }

    const root = asRecord(data);
    const db = asRecord(root.database);
    const storage = asRecord(root.storage);
    const pg = asRecord(root.pg_performance);
    const month = asRecord(root.month_summary);

    const dbQuotaBytes = readQuotaMb("STAROPS_DB_QUOTA_MB", 500) * 1024 * 1024;
    const storageQuotaBytes =
      readQuotaMb("STAROPS_STORAGE_QUOTA_MB", 1024) * 1024 * 1024;
    const egressQuotaBytes =
      readQuotaMb("STAROPS_EGRESS_QUOTA_MB", 5120) * 1024 * 1024;
    const planName = process.env.STAROPS_PLAN_NAME?.trim() || "Supabase Free Plan";

    const tables: TelemetryTableUsage[] = asArray(db.tables).map((row) => {
      const tableName = String(row.table_name ?? "unknown");
      return {
        tableName,
        label: TABLE_LABELS[tableName] ?? tableName,
        totalBytes: toSafeNumber(row.total_bytes),
        estimatedRows: toSafeNumber(row.estimated_rows),
      };
    });

    const buckets: TelemetryBucketUsage[] = asArray(storage.buckets).map((row) => {
      const bucketId = String(row.bucket_id ?? "unknown");
      return {
        bucketId,
        label: BUCKET_LABELS[bucketId] ?? bucketId,
        isPublic: Boolean(row.is_public),
        fileSizeLimit:
          row.file_size_limit === null || row.file_size_limit === undefined
            ? null
            : toSafeNumber(row.file_size_limit),
        usedBytes: toSafeNumber(row.used_bytes),
        fileCount: toSafeNumber(row.file_count),
      };
    });

    const dailySeries: TelemetryDailyPoint[] = asArray(root.daily_series).map((row) => ({
      date: String(row.date ?? ""),
      dbSizeBytes: toSafeNumber(row.db_size_bytes),
      storageSizeBytes: toSafeNumber(row.storage_size_bytes),
      dbEgressBytes: toSafeNumber(row.db_egress_bytes),
      storageEgressBytes: toSafeNumber(row.storage_egress_bytes),
      exportEgressBytes: toSafeNumber(row.export_egress_bytes),
      totalEgressBytes: toSafeNumber(row.total_egress_bytes),
      queryCount: toSafeNumber(row.query_count),
    }));

    return {
      planName,
      capturedAt: String(root.captured_at ?? new Date().toISOString()),
      database: {
        usedBytes: toSafeNumber(db.total_bytes),
        quotaBytes: dbQuotaBytes,
        publicTablesBytes: toSafeNumber(db.public_tables_bytes),
        systemCatalogBytes: toSafeNumber(db.system_catalog_bytes),
        tables,
      },
      storage: {
        usedBytes: toSafeNumber(storage.total_bytes),
        quotaBytes: storageQuotaBytes,
        totalFiles: toSafeNumber(storage.total_files),
        buckets,
      },
      egress: {
        quotaBytes: egressQuotaBytes,
        monthStart: String(month.month_start ?? ""),
        monthDbBytes: toSafeNumber(month.db_egress_bytes),
        monthStorageBytes: toSafeNumber(month.storage_egress_bytes),
        monthExportBytes: toSafeNumber(month.export_egress_bytes),
        monthTotalBytes: toSafeNumber(month.total_egress_bytes),
        monthQueries: toSafeNumber(month.query_count),
        dailySeries,
      },
      pgPerformance: {
        cacheHitRatio: Math.min(100, toSafeNumber(pg.cache_hit_ratio, 100)),
        blksHit: toSafeNumber(pg.blks_hit),
        blksRead: toSafeNumber(pg.blks_read),
        xactCommit: toSafeNumber(pg.xact_commit),
        xactRollback: toSafeNumber(pg.xact_rollback),
        tupReturned: toSafeNumber(pg.tup_returned),
        tupFetched: toSafeNumber(pg.tup_fetched),
        tupInserted: toSafeNumber(pg.tup_inserted),
        tupUpdated: toSafeNumber(pg.tup_updated),
        tupDeleted: toSafeNumber(pg.tup_deleted),
        activeBackends: toSafeNumber(pg.active_backends),
        sessions: toSafeNumber(pg.sessions),
        statsReset: pg.stats_reset ? String(pg.stats_reset) : null,
      },
    };
  } catch (err) {
    console.error("[telemetry/loadAdminInfrastructureMetrics] Unexpected error:", err);
    return null;
  }
}

/**
 * Non-blocking helper to record measured egress bytes from CSV/XLSX/PDF exports,
 * signed bucket downloads, or heavy PostgREST payloads. Never throws.
 */
export async function recordEgressTelemetry(input: {
  dbBytes?: number;
  storageBytes?: number;
  exportBytes?: number;
  queries?: number;
}): Promise<void> {
  if (!hasServiceRoleConfig()) return;

  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("record_egress_telemetry", {
      p_db_bytes: Math.max(0, Math.round(input.dbBytes ?? 0)),
      p_storage_bytes: Math.max(0, Math.round(input.storageBytes ?? 0)),
      p_export_bytes: Math.max(0, Math.round(input.exportBytes ?? 0)),
      p_queries: Math.max(0, Math.round(input.queries ?? 1)),
    });
    if (error) {
      console.error("[telemetry/recordEgressTelemetry] RPC warning:", error.message);
    }
  } catch (err) {
    console.error("[telemetry/recordEgressTelemetry] Unexpected error:", err);
  }
}

/**
 * Looks up an object's actual byte size from Storage (falling back to `fallbackBytes`)
 * and logs a signed-download storage egress event. Never throws.
 */
export async function recordStorageObjectEgress(
  bucketId: "backups" | "archives" | "inventory-photos" | "delivery-proofs",
  storagePath: string,
  fallbackBytes = 165_000,
): Promise<void> {
  if (!hasServiceRoleConfig()) return;

  try {
    let resolvedBytes = fallbackBytes;
    const admin = createAdminClient();
    const lastSlash = storagePath.lastIndexOf("/");
    const folder = lastSlash >= 0 ? storagePath.slice(0, lastSlash) : "";
    const fileName = lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath;

    if (fileName) {
      const { data: items } = await admin.storage.from(bucketId).list(folder, {
        limit: 10,
        search: fileName,
      });
      const match = (items ?? []).find((item) => item.name === fileName);
      const sizeValue = match?.metadata?.size;
      if (typeof sizeValue === "number" && sizeValue > 0) {
        resolvedBytes = sizeValue;
      }
    }

    await recordEgressTelemetry({
      storageBytes: resolvedBytes,
      queries: 1,
    });
  } catch (err) {
    console.error("[telemetry/recordStorageObjectEgress] Unexpected error:", err);
  }
}
