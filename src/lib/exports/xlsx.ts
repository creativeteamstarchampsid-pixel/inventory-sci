import "server-only";

import ExcelJS from "exceljs";

import { requireAction } from "@/lib/auth";
import {
  ARCHIVE_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  BILLING_CYCLE_LABELS,
  CONDITION_LABELS,
  DELIVERY_DIRECTION_LABELS,
  DELIVERY_STATUS_LABELS,
  HYGIENE_LABELS,
  PAYMENT_METHOD_LABELS,
  calculateBookValue,
  formatDateWIB,
  getLocationLabel,
} from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import { sanitizeCsvFormulaCell } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import type { LocationCode } from "@/types/database";
import {
  countAssignedSlots,
  formatAssignedUsers,
  getInventoryHierarchySummary,
  getItemHierarchyLabel,
  getStockAnomalies,
  loadExportDataset,
  type ExportDataset,
} from "./csv";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};

const TITLE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F2942" },
};

const SUBHEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFF6FF" },
};

const ALERT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEE2E2" },
};

const WARN_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEF3C7" },
};

const ZEBRA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF8FAFC" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

function addSafeRow(
  sheet: ExcelJS.Worksheet,
  values: Array<string | number | boolean | null | undefined>,
): ExcelJS.Row {
  const sanitized = values.map((val) =>
    typeof val === "string" ? sanitizeCsvFormulaCell(val) : val,
  );
  return sheet.addRow(sanitized);
}

function styleTitleBanner(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  colCount: number,
) {
  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = sanitizeCsvFormulaCell(title);
  titleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleCell.fill = TITLE_FILL;
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, colCount);
  const subCell = sheet.getCell(2, 1);
  subCell.value = sanitizeCsvFormulaCell(subtitle);
  subCell.font = { size: 10, italic: true, color: { argb: "FF1E3A5F" } };
  subCell.fill = SUBHEADER_FILL;
  subCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(2).height = 20;
}

function styleTableHeaderRow(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = THIN_BORDER;
  });
}

function applyDataRowStyle(
  row: ExcelJS.Row,
  index: number,
  highlight?: "alert" | "warn",
) {
  row.eachCell((cell) => {
    cell.font = { size: 10, color: { argb: "FF0F172A" } };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", wrapText: true };
    if (highlight === "alert") {
      cell.fill = ALERT_FILL;
    } else if (highlight === "warn") {
      cell.fill = WARN_FILL;
    } else if (index % 2 === 1) {
      cell.fill = ZEBRA_FILL;
    }
  });
}

function addEmptyStateRow(sheet: ExcelJS.Worksheet, colCount: number) {
  const row = addSafeRow(
    sheet,
    Array.from({ length: colCount }, (_, idx) =>
      idx === 0 ? "Tidak ada data pada periode ini." : "",
    ),
  );
  row.eachCell((cell) => {
    cell.border = THIN_BORDER;
  });
  if (colCount > 1) {
    sheet.mergeCells(row.number, 1, row.number, colCount);
  }
  const cell = row.getCell(1);
  cell.font = { italic: true, size: 10, color: { argb: "FF64748B" } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 24;
}

function addSummarySheet(workbook: ExcelJS.Workbook, dataset: ExportDataset) {
  const sheet = workbook.addWorksheet("Ringkasan");
  sheet.columns = [
    { width: 36 },
    { width: 28 },
    { width: 22 },
    { width: 32 },
  ];

  styleTitleBanner(
    sheet,
    "STAROPS — RINGKASAN EKSEKUTIF OPERASIONAL",
    `Star Champs Indonesia · Periode ${dataset.periodLabel} (${dataset.periodCode}) · Dicetak ${dataset.generatedAtWib}`,
    4,
  );

  const anomalies = getStockAnomalies(dataset.items, dataset.todayWib);
  const summary = getInventoryHierarchySummary(dataset.items);
  const totalPurchase = summary.totalPurchase;
  const totalBookValue = summary.totalBookValue;

  const activeSubs = dataset.subscriptions.filter((s) => s.is_active);
  const monthlySubCost = activeSubs.reduce((sum, sub) => {
    const cost = Number(sub.cost ?? 0);
    if (sub.billing_cycle === "BULANAN") return sum + cost;
    if (sub.billing_cycle === "TAHUNAN") return sum + cost / 12;
    return sum;
  }, 0);

  sheet.addRow([]);
  const metaHeader = sheet.addRow(["Metrik Operasional", "Nilai", "Keterangan", "Catatan"]);
  styleTableHeaderRow(metaHeader);

  const actorRoleLabel =
    dataset.actorRole === "SYSTEM"
      ? "Sistem"
      : (ROLE_LABELS[dataset.actorRole]?.title ?? dataset.actorRole ?? "Sistem");

  const kpis: Array<[string, string | number, string, string, boolean?]> = [
    ["Periode Laporan", `${dataset.periodLabel} (${dataset.periodCode})`, "Zona Waktu WIB", dataset.generatedAtWib],
    ["Dicetak Oleh", dataset.actorName, `Peran: ${actorRoleLabel}`, "Ekspor terotorisasi RBAC"],
    [
      "Total Item Inventaris Aktif",
      summary.topLevelItems.length,
      `${summary.leafItems.length} unit/varian aktif`,
      `${summary.topLevelItems.filter((i) => i.asset_type === "THERAPY_TOY").length} mainan terapi, ${summary.topLevelItems.filter((i) => i.asset_type === "FIXED_ASSET").length} aset tetap, ${summary.topLevelItems.filter((i) => i.asset_type === "CONSUMABLE").length} habis pakai`,
    ],
    [
      "Total Stok Fisik (Tanpa Duplikasi)",
      summary.totalStockUnits,
      "Akumulasi unit leaf",
      "Menghitung Sub-Item & Simple Item saja (tidak menggandakan Parent + Sub-Item)",
    ],
    ...(dataset.canViewValuation
      ? ([
          ["Total Nilai Perolehan Aset", totalPurchase, "IDR", "Akumulasi harga beli barang aktif", true],
          ["Estimasi Nilai Buku Aset", totalBookValue, "IDR (Garis Lurus)", "Berdasarkan umur ekonomis & nilai residu", true],
        ] as Array<[string, string | number, string, string, boolean?]>)
      : []),
    ["Anomali: Part Kurang", anomalies.partKurang.length, "Item PART_KURANG", "Mainan dengan kepingan belum lengkap"],
    ["Anomali: Stok Minimum (Consumable)", anomalies.lowStock.length, "Item Low-Stock", "Stok < batas minimum pengadaan"],
    ["Anomali: Perlu Sanitasi", anomalies.needsSanitation.length, "Mainan Terapi", "Status belum steril atau melewati jadwal H+7"],
    ...(dataset.canExportFinancial
      ? ([
          ["Langganan Digital Aktif", activeSubs.length, `Total ${dataset.subscriptions.length} akun`, "Kredensial terenkripsi AES-256 (dimasking)"],
          [
            "Estimasi Biaya Langganan / Bulan",
            dataset.canViewBilling ? Math.round(monthlySubCost) : "Terbatas",
            dataset.canViewBilling ? "IDR / bulan" : "Masking RBAC",
            "Tagihan bulanan + tahunan dibagi 12",
            dataset.canViewBilling,
          ],
        ] as Array<[string, string | number, string, string, boolean?]>)
      : []),
    ["Total Berkas Arsip Hybrid", dataset.archives.length, "Semua Lemari Arsip", `${dataset.archives.filter((a) => a.physical_status === "DIPINJAM").length} berkas sedang dipinjam`],
    ...(dataset.canExportFinancial
      ? ([
          ["Total Log Pengiriman", dataset.deliveries.length, "Inbound & Outbound", `${dataset.deliveries.filter((d) => ["DRAFT", "DIKEMAS", "DALAM_PERJALANAN"].includes(d.status)).length} pengiriman masih berjalan`],
        ] as Array<[string, string | number, string, string, boolean?]>)
      : []),
    [
      "Progres Stock Opname Bulanan",
      `${dataset.reconciliation?.opname_progress_pct ?? 0}%`,
      dataset.reconciliation?.locked_at ? "Periode Dikunci Owner" : "Menunggu Penyelesaian",
      dataset.reconciliation?.locked_at
        ? `Disahkan ${formatDateWIB(dataset.reconciliation.locked_at, true)}`
        : "Siklus pengkinian minggu terakhir",
    ],
  ];

  kpis.forEach(([metric, value, unit, note, isCurrency], idx) => {
    const row = addSafeRow(sheet, [metric, value, unit, note]);
    applyDataRowStyle(row, idx);
    if (isCurrency && typeof value === "number") {
      row.getCell(2).numFmt = '"Rp"#,##0';
    }
  });

  sheet.addRow([]);
  const roomHeader = sheet.addRow([
    "Distribusi Lokasi / Ruangan",
    "Jumlah Item",
    "Item Anomali",
    dataset.canViewValuation ? "Nilai Perolehan (IDR)" : "Status Kondisi",
  ]);
  styleTableHeaderRow(roomHeader);

  const byRoom = new Map<LocationCode, { count: number; anomaly: number; value: number }>();
  const anomalyIds = new Set(anomalies.rows.map((r) => r.item.id));
  for (const item of dataset.items) {
    const current = byRoom.get(item.room_code) ?? { count: 0, anomaly: 0, value: 0 };
    if (item.parent_item_id === null) {
      current.count += 1;
    }
    if (anomalyIds.has(item.id)) current.anomaly += 1;
    if (dataset.canViewValuation && summary.isValuationCounted(item)) {
      current.value += Number(item.purchase_price) || 0;
    }
    byRoom.set(item.room_code, current);
  }

  if (byRoom.size === 0) {
    addEmptyStateRow(sheet, 4);
  } else {
    let roomIdx = 0;
    for (const [roomCode, stats] of byRoom.entries()) {
      const roomLabel = getLocationLabel(roomCode, dataset.locationLabels);
      const roomDisplay =
        roomLabel !== roomCode ? `${roomCode} — ${roomLabel}` : roomCode || "-";
      const row = addSafeRow(sheet, [
        roomDisplay,
        stats.count,
        stats.anomaly,
        dataset.canViewValuation
          ? stats.value
          : stats.anomaly > 0
            ? "Perlu Tindak Lanjut"
            : "Aman",
      ]);
      applyDataRowStyle(row, roomIdx, stats.anomaly > 0 ? "warn" : undefined);
      if (dataset.canViewValuation) {
        row.getCell(4).numFmt = '"Rp"#,##0';
      }
      roomIdx += 1;
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

function addInventorySheet(workbook: ExcelJS.Workbook, dataset: ExportDataset) {
  const sheet = workbook.addWorksheet("Inventaris & Part Mainan");
  const showVal = dataset.canViewValuation;
  const summary = getInventoryHierarchySummary(dataset.items);
  const cols = [
    { width: 20 },
    { width: 28 },
    { width: 24 },
    { width: 18 },
    { width: 20 },
    { width: 10 },
    { width: 24 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    ...(showVal ? [{ width: 18 }, { width: 18 }] : []),
    { width: 28 },
  ];
  sheet.columns = cols;

  styleTitleBanner(
    sheet,
    "INVENTARIS, ASET KANTOR & KELENGKAPAN PART MAINAN",
    `Periode ${dataset.periodLabel} · ${summary.topLevelItems.length} item utama (${dataset.items.length} baris · Total stok ${summary.totalStockUnits} unit)`,
    cols.length,
  );

  sheet.addRow([]);
  const header = sheet.addRow([
    "Kode Item",
    "Nama Barang",
    "Hierarki",
    "Tipe Aset",
    "Kategori",
    "Prefix",
    "Ruang",
    "Rak",
    "PIC",
    "Kondisi",
    "Status Sanitasi",
    "Jadwal Sanitasi",
    "Kepingan (Ada/Total)",
    "Stok",
    "Batas Min",
    "Satuan",
    "Tgl Perolehan",
    ...(showVal ? ["Harga Beli (IDR)", "Nilai Buku (IDR)"] : []),
    "Catatan",
  ]);
  styleTableHeaderRow(header);

  if (dataset.items.length === 0) {
    addEmptyStateRow(sheet, cols.length);
  } else {
    dataset.items.forEach((item, idx) => {
      const bookValue = showVal
        ? calculateBookValue(
            item.purchase_price,
            item.acquisition_date,
            item.useful_life_months,
            item.residual_value,
          )
        : 0;
      const isPartKurang =
        !summary.isParent(item) &&
        (item.condition === "PART_KURANG" ||
          (item.total_parts > 1 && item.current_parts < item.total_parts));
      const isLowStock =
        !summary.isParent(item) &&
        item.asset_type === "CONSUMABLE" &&
        item.min_stock_threshold > 0 &&
        item.stock_qty < item.min_stock_threshold;
      const isSanitationDue =
        !summary.isParent(item) &&
        item.asset_type === "THERAPY_TOY" &&
        item.hygiene_status !== "STERIL";

      const roomLabel = getLocationLabel(item.room_code, dataset.locationLabels);
      const roomDisplay =
        roomLabel !== item.room_code
          ? `${item.room_code} — ${roomLabel}`
          : item.room_code;

      const row = addSafeRow(sheet, [
        item.item_code,
        item.name,
        getItemHierarchyLabel(item, summary.parentCodeMap),
        ASSET_TYPE_LABELS[item.asset_type] ?? item.asset_type ?? "-",
        item.category,
        item.category_prefix,
        roomDisplay,
        item.rack_location ?? "-",
        item.pic_name ?? "-",
        CONDITION_LABELS[item.condition] ?? item.condition ?? "-",
        HYGIENE_LABELS[item.hygiene_status] ?? item.hygiene_status ?? "-",
        item.next_sanitization_due ?? "-",
        `${item.current_parts}/${item.total_parts}`,
        item.stock_qty,
        item.min_stock_threshold,
        item.unit_label,
        item.acquisition_date ?? "-",
        ...(showVal ? [item.purchase_price, bookValue] : []),
        item.description ?? "",
      ]);

      const highlight = isPartKurang
        ? "alert"
        : isLowStock || isSanitationDue
          ? "warn"
          : undefined;
      applyDataRowStyle(row, idx, highlight);
      if (showVal) {
        row.getCell(18).numFmt = '"Rp"#,##0';
        row.getCell(19).numFmt = '"Rp"#,##0';
      }
    });
  }

  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

function addSubscriptionsSheet(workbook: ExcelJS.Workbook, dataset: ExportDataset) {
  const sheet = workbook.addWorksheet("Vault Langganan");
  sheet.columns = [
    { width: 18 },
    { width: 24 },
    { width: 18 },
    { width: 28 },
    { width: 26 },
    { width: 14 },
    { width: 18 },
    { width: 10 },
    { width: 18 },
    { width: 22 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 28 },
    { width: 22 },
    { width: 12 },
  ];

  styleTitleBanner(
    sheet,
    "SUBSCRIPTION VAULT — DAFTAR LANGGANAN DIGITAL (KREDENSIAL TERMASKING)",
    "Seluruh kata sandi & PIN pemulihan terenkripsi AES-256 dan tidak diekspor demi keamanan.",
    16,
  );

  sheet.addRow([]);
  const header = sheet.addRow([
    "Kode Sub",
    "Nama Layanan",
    "Paket",
    "Email Login",
    "Kata Sandi & PIN (Masked)",
    "Siklus",
    "Biaya",
    "Mata Uang",
    "Metode Bayar",
    "Label Akun Bayar",
    "Jatuh Tempo",
    "Auto-Renew",
    "Slot (Pakai/Maks)",
    "Pengguna Terdaftar",
    "Rotasi Password",
    "Status",
  ]);
  styleTableHeaderRow(header);

  if (dataset.subscriptions.length === 0) {
    addEmptyStateRow(sheet, 16);
  } else {
    dataset.subscriptions.forEach((sub, idx) => {
      const row = addSafeRow(sheet, [
        sub.sub_code,
        sub.service_name,
        sub.plan_name ?? "-",
        sub.login_email,
        "******** (Terenkripsi AES-256)",
        BILLING_CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle ?? "-",
        dataset.canViewBilling && sub.cost !== null ? sub.cost : "Terbatas",
        dataset.canViewBilling && sub.currency ? sub.currency : "Terbatas",
        dataset.canViewBilling && sub.payment_method
          ? (PAYMENT_METHOD_LABELS[sub.payment_method] ?? sub.payment_method)
          : "Terbatas",
        dataset.canViewBilling && sub.payment_account_label
          ? sub.payment_account_label
          : "Terbatas",
        sub.renewal_date ?? "-",
        sub.auto_renew ? "Ya" : "Tidak",
        `${countAssignedSlots(sub.assigned_users_json)}/${sub.max_slots}`,
        formatAssignedUsers(sub.assigned_users_json),
        formatDateWIB(sub.password_rotated_at, true),
        sub.is_active ? "Aktif" : "Nonaktif",
      ]);

      applyDataRowStyle(row, idx, !sub.is_active ? "warn" : undefined);
      if (dataset.canViewBilling && typeof sub.cost === "number") {
        row.getCell(7).numFmt = '"Rp"#,##0';
      }
    });
  }

  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

function addArchivesSheet(workbook: ExcelJS.Workbook, dataset: ExportDataset) {
  const sheet = workbook.addWorksheet("Arsip Berkas");
  sheet.columns = [
    { width: 18 },
    { width: 32 },
    { width: 18 },
    { width: 16 },
    { width: 22 },
    { width: 10 },
    { width: 14 },
    { width: 20 },
    { width: 10 },
    { width: 16 },
    { width: 28 },
    { width: 28 },
    { width: 22 },
  ];

  styleTitleBanner(
    sheet,
    "ARSIP BERKAS HYBRID (FISIK LEMARI & DIGITAL)",
    `Periode ${dataset.periodLabel} · Total ${dataset.archives.length} dokumen arsip aktif`,
    13,
  );

  sheet.addRow([]);
  const header = sheet.addRow([
    "Kode Dokumen",
    "Judul Berkas",
    "Kategori",
    "Gedung / Cabang",
    "Lemari",
    "Laci",
    "Kode Map",
    "Status Fisik",
    "Versi",
    "SOP Publik Staff",
    "File Digital / Tautan Drive",
    "Catatan",
    "Diperbarui (WIB)",
  ]);
  styleTableHeaderRow(header);

  if (dataset.archives.length === 0) {
    addEmptyStateRow(sheet, 13);
  } else {
    dataset.archives.forEach((doc, idx) => {
      const digitalRef =
        [doc.digital_file_name, doc.drive_link].filter(Boolean).join(" | ") || "-";
      const cabinetLabel = getLocationLabel(
        doc.cabinet_code,
        dataset.locationLabels,
      );
      const cabinetDisplay =
        cabinetLabel !== doc.cabinet_code
          ? `${doc.cabinet_code} — ${cabinetLabel}`
          : doc.cabinet_code;
      const row = addSafeRow(sheet, [
        doc.doc_code,
        doc.title,
        doc.category,
        doc.branch_building,
        cabinetDisplay,
        doc.drawer_no,
        doc.folder_code ?? "-",
        ARCHIVE_STATUS_LABELS[doc.physical_status] ?? doc.physical_status ?? "-",
        `v${doc.version_no}`,
        doc.is_sop_public_to_staff ? "Ya" : "Tidak",
        digitalRef,
        doc.notes ?? "",
        formatDateWIB(doc.updated_at, true),
      ]);
      applyDataRowStyle(
        row,
        idx,
        doc.physical_status === "DIPINJAM" ? "warn" : undefined,
      );
    });
  }

  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

function addDeliveriesSheet(workbook: ExcelJS.Workbook, dataset: ExportDataset) {
  const sheet = workbook.addWorksheet("Log Pengiriman");
  sheet.columns = [
    { width: 20 },
    { width: 12 },
    { width: 18 },
    { width: 16 },
    { width: 20 },
    { width: 16 },
    { width: 22 },
    { width: 22 },
    { width: 16 },
    { width: 10 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 20 },
    { width: 26 },
  ];

  styleTitleBanner(
    sheet,
    "LOG PENGIRIMAN & LOGISTIK (INBOUND / OUTBOUND)",
    `Periode ${dataset.periodLabel} · Total ${dataset.deliveries.length} catatan pengiriman`,
    15,
  );

  sheet.addRow([]);
  const header = sheet.addRow([
    "Kode Pengiriman",
    "Arah",
    "Jenis Paket",
    "Kurir",
    "Nomor Resi",
    "Biaya Ongkir (IDR)",
    "Pengirim",
    "Penerima",
    "PIC",
    "Fragile",
    "Status",
    "Konversi Stok",
    "Tanggal Kirim",
    "Tanggal Terima",
    "Catatan",
  ]);
  styleTableHeaderRow(header);

  if (dataset.deliveries.length === 0) {
    addEmptyStateRow(sheet, 15);
  } else {
    dataset.deliveries.forEach((del, idx) => {
      const row = addSafeRow(sheet, [
        del.delivery_code,
        DELIVERY_DIRECTION_LABELS[del.direction] ?? del.direction ?? "-",
        del.package_type,
        del.courier_name,
        del.tracking_number ?? "-",
        del.shipping_cost,
        del.sender_name,
        del.receiver_name,
        del.pic_name ?? "-",
        del.is_fragile ? "Ya" : "Tidak",
        DELIVERY_STATUS_LABELS[del.status] ?? del.status ?? "-",
        del.converted_to_stock_at
          ? formatDateWIB(del.converted_to_stock_at, true)
          : "Belum",
        formatDateWIB(del.shipped_at, true),
        formatDateWIB(del.received_at, true),
        del.notes ?? "",
      ]);

      applyDataRowStyle(
        row,
        idx,
        del.status === "DIBATALKAN" ? "alert" : undefined,
      );
      row.getCell(6).numFmt = '"Rp"#,##0';
    });
  }

  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

export async function generateXlsxBuffer(dataset: ExportDataset): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StarOps — Star Champs Indonesia";
  workbook.lastModifiedBy = sanitizeCsvFormulaCell(dataset.actorName);
  workbook.created = new Date(dataset.generatedAtIso);
  workbook.modified = new Date(dataset.generatedAtIso);

  addSummarySheet(workbook, dataset);
  addInventorySheet(workbook, dataset);
  if (dataset.canExportFinancial) {
    addSubscriptionsSheet(workbook, dataset);
  }
  addArchivesSheet(workbook, dataset);
  if (dataset.canExportFinancial) {
    addDeliveriesSheet(workbook, dataset);
  }

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(rawBuffer)
    ? rawBuffer
    : Buffer.from(new Uint8Array(rawBuffer as ArrayBuffer));
}

export async function exportXlsxWithAuth(): Promise<{
  filename: string;
  contentType: string;
  buffer: Buffer;
}> {
  const user = await requireAction("export.data");
  const supabase = await createClient();
  const dataset = await loadExportDataset(supabase, {
    actorName: user.fullName,
    actorRole: user.role,
  });
  const buffer = await generateXlsxBuffer(dataset);

  return {
    filename: `starops-laporan-${dataset.periodCode}.xlsx`,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  };
}
