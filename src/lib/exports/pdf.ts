import "server-only";

import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { requireAction } from "@/lib/auth";
import { calculateBookValue, formatDateWIB, formatRupiah } from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import {
  getStockAnomalies,
  loadExportDataset,
  type ExportDataset,
} from "./csv";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: 30,
    paddingBottom: 44,
    paddingHorizontal: 30,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  headerBox: {
    borderBottomWidth: 2,
    borderBottomColor: "#1E3A5F",
    paddingBottom: 10,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandBlock: {
    flexDirection: "column",
    maxWidth: "65%",
  },
  brandEyebrow: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#2563EB",
    letterSpacing: 1,
    marginBottom: 3,
  },
  brandTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: "#0F2942",
    marginBottom: 2,
  },
  brandSubtitle: {
    fontSize: 9,
    color: "#475569",
  },
  metaBlock: {
    alignItems: "flex-end",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 4,
    padding: 7,
    minWidth: 165,
  },
  metaLabel: {
    fontSize: 7,
    color: "#64748B",
    textTransform: "uppercase",
  },
  metaValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: "#0F172A",
    marginBottom: 3,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: "#0F2942",
    marginBottom: 6,
    marginTop: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statCard: {
    width: "32%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
    backgroundColor: "#F8FAFC",
  },
  statCardAlert: {
    width: "32%",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
    backgroundColor: "#FEF2F2",
  },
  statLabel: {
    fontSize: 7.5,
    color: "#475569",
    marginBottom: 3,
  },
  statValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: "#0F172A",
    marginBottom: 2,
  },
  statValueAlert: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: "#B91C1C",
    marginBottom: 2,
  },
  statSub: {
    fontSize: 7,
    color: "#64748B",
  },
  table: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1E3A5F",
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 8,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 8,
  },
  colNo: { width: "5%" },
  colCode: { width: "17%", fontFamily: "Courier", fontSize: 7.5 },
  colName: { width: "24%" },
  colType: { width: "17%" },
  colDetail: { width: "26%" },
  colPic: { width: "11%" },
  emptyBox: {
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  emptyText: {
    color: "#166534",
    fontSize: 8.5,
  },
  recSummaryBar: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#EFF6FF",
    borderRadius: 4,
    padding: 8,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  recCol: {
    width: "32%",
  },
  signatureSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
  },
  signatureGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  signatureBox: {
    width: "31%",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 4,
    padding: 8,
    minHeight: 92,
    justifyContent: "space-between",
  },
  signatureRoleTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: "#0F2942",
    textAlign: "center",
  },
  signatureRoleSub: {
    fontSize: 7.5,
    color: "#64748B",
    textAlign: "center",
    marginTop: 1,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#94A3B8",
    paddingTop: 4,
    marginTop: 28,
    textAlign: "center",
  },
  signatureName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#0F172A",
    textAlign: "center",
  },
  signatureStamp: {
    fontSize: 7,
    color: "#047857",
    textAlign: "center",
    marginTop: 2,
  },
  signaturePending: {
    fontSize: 7,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 2,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 30,
    right: 30,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#64748B",
  },
});

function buildMonthlyReportDocument(dataset: ExportDataset) {
  const anomalies = getStockAnomalies(dataset.items, dataset.todayWib);

  const totalPurchase = dataset.items.reduce(
    (sum, item) => sum + (Number(item.purchase_price) || 0),
    0,
  );
  const totalBookValue = dataset.items.reduce(
    (sum, item) =>
      sum +
      calculateBookValue(
        item.purchase_price,
        item.acquisition_date,
        item.useful_life_months,
        item.residual_value,
      ),
    0,
  );

  const activeSubs = dataset.subscriptions.filter((s) => s.is_active);
  const monthlySubCost = activeSubs.reduce((sum, sub) => {
    const cost = Number(sub.cost ?? 0);
    if (sub.billing_cycle === "BULANAN") return sum + cost;
    if (sub.billing_cycle === "TAHUNAN") return sum + cost / 12;
    return sum;
  }, 0);

  const toyCount = dataset.items.filter((i) => i.asset_type === "THERAPY_TOY").length;
  const fixedCount = dataset.items.filter((i) => i.asset_type === "FIXED_ASSET").length;
  const consumableCount = dataset.items.filter((i) => i.asset_type === "CONSUMABLE").length;
  const opnamePct = dataset.reconciliation?.opname_progress_pct ?? 0;

  const actorRoleLabel =
    dataset.actorRole === "SYSTEM"
      ? "Sistem"
      : ROLE_LABELS[dataset.actorRole].title;

  const statCards: Array<{
    label: string;
    value: string;
    sub: string;
    alert?: boolean;
  }> = [
    {
      label: "TOTAL INVENTARIS AKTIF",
      value: `${dataset.items.length} Item`,
      sub: `${toyCount} Mainan · ${fixedCount} Aset · ${consumableCount} Habis Pakai`,
    },
    ...(dataset.canViewValuation
      ? [
          {
            label: "NILAI PEROLEHAN & NILAI BUKU",
            value: formatRupiah(totalBookValue),
            sub: `Harga beli awal: ${formatRupiah(totalPurchase)}`,
          },
        ]
      : []),
    {
      label: "PART KURANG (PART_KURANG)",
      value: `${anomalies.partKurang.length} Item`,
      sub: `${anomalies.lowStock.length} habis pakai stok rendah`,
      alert: anomalies.partKurang.length > 0 || anomalies.lowStock.length > 0,
    },
    {
      label: "MAINAN PERLU SANITASI",
      value: `${anomalies.needsSanitation.length} Item`,
      sub: "Belum steril / jadwal sanitasi terlewati",
      alert: anomalies.needsSanitation.length > 0,
    },
    ...(dataset.canExportFinancial
      ? [
          {
            label: "SUBSCRIPTION VAULT",
            value: `${activeSubs.length} Aktif`,
            sub: dataset.canViewBilling
              ? `Est. ${formatRupiah(Math.round(monthlySubCost))}/bulan (secret termasking)`
              : "Rincian biaya dibatasi sesuai RBAC",
          },
        ]
      : []),
    {
      label: dataset.canExportFinancial ? "ARSIP & LOGISTIK" : "ARSIP BERKAS",
      value: `${dataset.archives.length} Berkas`,
      sub: dataset.canExportFinancial
        ? `${dataset.deliveries.length} log pengiriman · Opname ${opnamePct}%`
        : `Progres Opname Ruangan: ${opnamePct}%`,
    },
  ];

  const anomalyTableRows = anomalies.rows.slice(0, 60);

  const e = React.createElement;

  return e(
    Document,
    {
      title: `Laporan Bulanan StarOps ${dataset.periodLabel}`,
      author: "StarOps — Star Champs Indonesia",
      subject: `Rekonsiliasi & Ringkasan Inventaris ${dataset.periodCode}`,
    },
    e(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      // Official Star Champs Header
      e(
        View,
        { style: styles.headerBox },
        e(
          View,
          { style: styles.brandBlock },
          e(Text, { style: styles.brandEyebrow }, "STAR CHAMPS INDONESIA · STAROPS"),
          e(Text, { style: styles.brandTitle }, "LAPORAN RESMI OPERASIONAL BULANAN"),
          e(
            Text,
            { style: styles.brandSubtitle },
            dataset.canExportFinancial
              ? "Rekapitulasi Inventaris, Kelengkapan Part, Sanitasi Mainan, Vault & Arsip Hibrida"
              : "Rekapitulasi Inventaris, Kelengkapan Part, Sanitasi Mainan & Arsip Berkas",
          ),
        ),
        e(
          View,
          { style: styles.metaBlock },
          e(Text, { style: styles.metaLabel }, "Periode Laporan"),
          e(
            Text,
            { style: styles.metaValue },
            `${dataset.periodLabel} (${dataset.periodCode})`,
          ),
          e(Text, { style: styles.metaLabel }, "Dicetak Pada"),
          e(Text, { style: styles.metaValue }, dataset.generatedAtWib),
          e(Text, { style: styles.metaLabel }, "Petugas"),
          e(
            Text,
            { style: styles.metaValue },
            `${dataset.actorName} (${actorRoleLabel})`,
          ),
        ),
      ),

      // Summary Stats
      e(Text, { style: styles.sectionTitle }, "1. Ringkasan Statistik Operasional"),
      e(
        View,
        { style: styles.statsGrid },
        ...statCards.map((card, idx) =>
          e(
            View,
            {
              key: `stat-${idx}`,
              style: card.alert ? styles.statCardAlert : styles.statCard,
            },
            e(Text, { style: styles.statLabel }, card.label),
            e(
              Text,
              { style: card.alert ? styles.statValueAlert : styles.statValue },
              card.value,
            ),
            e(Text, { style: styles.statSub }, card.sub),
          ),
        ),
      ),

      // Reconciliation status bar
      e(
        View,
        { style: styles.recSummaryBar },
        e(
          View,
          { style: styles.recCol },
          e(Text, { style: styles.metaLabel }, "Progres Stock Opname"),
          e(Text, { style: styles.metaValue }, `${opnamePct}% Selesai`),
        ),
        e(
          View,
          { style: styles.recCol },
          e(Text, { style: styles.metaLabel }, "Status Pengesahan"),
          e(
            Text,
            { style: styles.metaValue },
            dataset.reconciliation?.locked_at ? "Terkunci & Disahkan" : "Dalam Pengkinian",
          ),
        ),
        e(
          View,
          { style: styles.recCol },
          e(Text, { style: styles.metaLabel }, "Total Anomali Terdeteksi"),
          e(Text, { style: styles.metaValue }, `${anomalies.rows.length} Item`),
        ),
      ),

      // Stock Anomaly Table
      e(
        Text,
        { style: styles.sectionTitle },
        "2. Daftar Anomali Stok, Part Kurang & Sanitasi Mainan",
      ),
      anomalyTableRows.length === 0
        ? e(
            View,
            { style: styles.emptyBox },
            e(
              Text,
              { style: styles.emptyText },
              "Seluruh inventaris dalam kondisi baik, stok consumable aman, dan mainan terapi berstatus steril.",
            ),
          )
        : e(
            View,
            { style: styles.table },
            e(
              View,
              { style: styles.tableHeader, fixed: true },
              e(Text, { style: styles.colNo }, "No"),
              e(Text, { style: styles.colCode }, "Kode Item"),
              e(Text, { style: styles.colName }, "Nama Barang & Ruang"),
              e(Text, { style: styles.colType }, "Jenis Anomali"),
              e(Text, { style: styles.colDetail }, "Detail Kondisi / Stok / Sanitasi"),
              e(Text, { style: styles.colPic }, "PIC"),
            ),
            ...anomalyTableRows.map((row, idx) =>
              e(
                View,
                {
                  key: row.item.id,
                  style: idx % 2 === 1 ? styles.tableRowAlt : styles.tableRow,
                  wrap: false,
                },
                e(Text, { style: styles.colNo }, String(idx + 1)),
                e(Text, { style: styles.colCode }, row.item.item_code),
                e(
                  Text,
                  { style: styles.colName },
                  `${row.item.name} (${row.item.room_code})`,
                ),
                e(Text, { style: styles.colType }, row.reasons.join(", ")),
                e(Text, { style: styles.colDetail }, row.detail),
                e(Text, { style: styles.colPic }, row.item.pic_name ?? "-"),
              ),
            ),
          ),

      anomalies.rows.length > 60
        ? e(
            Text,
            { style: { fontSize: 7.5, color: "#64748B", marginBottom: 10 } },
            `* Menampilkan 60 dari ${anomalies.rows.length} item anomali. Unduh file .XLSX untuk daftar lengkap.`,
          )
        : null,

      // 3-Column Official Signature Block
      e(
        View,
        { style: styles.signatureSection, wrap: false },
        e(
          Text,
          { style: styles.sectionTitle },
          "3. Lembar Pengesahan Resmi & Rekonsiliasi Bulanan",
        ),
        e(
          View,
          { style: styles.signatureGrid },
          // Column 1: Admin Ops
          e(
            View,
            { style: styles.signatureBox },
            e(
              View,
              null,
              e(Text, { style: styles.signatureRoleTitle }, "Diverifikasi Oleh"),
              e(Text, { style: styles.signatureRoleSub }, "Admin Operasional"),
            ),
            e(
              View,
              { style: styles.signatureLine },
              e(
                Text,
                { style: styles.signatureName },
                dataset.approverNames.adminName ?? "( .............................. )",
              ),
              dataset.reconciliation?.verified_by_admin_at
                ? e(
                    Text,
                    { style: styles.signatureStamp },
                    `E-Verified: ${formatDateWIB(dataset.reconciliation.verified_by_admin_at, true)}`,
                  )
                : e(Text, { style: styles.signaturePending }, "Menunggu verifikasi"),
            ),
          ),
          // Column 2: Kepala Terapis
          e(
            View,
            { style: styles.signatureBox },
            e(
              View,
              null,
              e(Text, { style: styles.signatureRoleTitle }, "Diperiksa Oleh"),
              e(Text, { style: styles.signatureRoleSub }, "Kepala Terapis"),
            ),
            e(
              View,
              { style: styles.signatureLine },
              e(
                Text,
                { style: styles.signatureName },
                dataset.approverNames.leaderName ?? "( .............................. )",
              ),
              dataset.reconciliation?.approved_by_leader_at
                ? e(
                    Text,
                    { style: styles.signatureStamp },
                    `E-Approved: ${formatDateWIB(dataset.reconciliation.approved_by_leader_at, true)}`,
                  )
                : e(Text, { style: styles.signaturePending }, "Menunggu pemeriksaan"),
            ),
          ),
          // Column 3: Owner / Direktur
          e(
            View,
            { style: styles.signatureBox },
            e(
              View,
              null,
              e(Text, { style: styles.signatureRoleTitle }, "Disetujui & Disahkan Oleh"),
              e(Text, { style: styles.signatureRoleSub }, "Owner / Direktur"),
            ),
            e(
              View,
              { style: styles.signatureLine },
              e(
                Text,
                { style: styles.signatureName },
                dataset.approverNames.ownerName ?? "( .............................. )",
              ),
              dataset.reconciliation?.approved_by_owner_at
                ? e(
                    Text,
                    { style: styles.signatureStamp },
                    `E-Signed: ${formatDateWIB(dataset.reconciliation.approved_by_owner_at, true)}`,
                  )
                : e(Text, { style: styles.signaturePending }, "Menunggu pengesahan Owner"),
            ),
          ),
        ),
      ),

      // Footer
      e(
        View,
        { style: styles.footer, fixed: true },
        e(
          Text,
          null,
          dataset.canExportFinancial
            ? "StarOps · Star Champs Indonesia · Dokumen Audit Internal (Kredensial Vault Termasking)"
            : "StarOps · Star Champs Indonesia · Dokumen Operasional Internal",
        ),
        e(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Halaman ${pageNumber} dari ${totalPages}`,
        }),
      ),
    ),
  );
}

export async function generatePdfBuffer(dataset: ExportDataset): Promise<Buffer> {
  const doc = buildMonthlyReportDocument(dataset);
  return renderToBuffer(doc);
}

export async function exportPdfWithAuth(): Promise<{
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
  const buffer = await generatePdfBuffer(dataset);

  return {
    filename: `starops-laporan-bulanan-${dataset.periodCode}.pdf`,
    contentType: "application/pdf",
    buffer,
  };
}
