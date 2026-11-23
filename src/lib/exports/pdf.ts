import "server-only";

import FontStore from "@react-pdf/font";
import layoutDocument, {
  type DocumentNode,
  type DynamicPageProps,
  type PageNode,
  type RenderProp,
  type SafeDocumentNode,
  type TextInstanceNode,
  type TextNode,
  type ViewNode,
} from "@react-pdf/layout";
import renderPDF from "@react-pdf/render";
import PDFDocument from "pdfkit";

import { requireAction } from "@/lib/auth";
import { calculateBookValue, formatDateWIB, formatRupiah } from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import {
  getStockAnomalies,
  loadExportDataset,
  type ExportDataset,
} from "./csv";

type PdfStyle = Record<string, string | number>;
type PdfContentNode = ViewNode | TextNode;
type PdfChild = PdfContentNode | null | undefined | false;

const fontStore = new FontStore();

const runLayout = layoutDocument as unknown as (
  doc: DocumentNode,
  fonts: FontStore,
) => Promise<SafeDocumentNode>;

const runRender = renderPDF as unknown as (
  ctx: PDFDocument,
  doc: SafeDocumentNode,
) => PDFDocument;

function compactChildren(children: PdfChild[]): PdfContentNode[] {
  return children.filter((child): child is PdfContentNode => Boolean(child));
}

function pdfTextInstance(value: string): TextInstanceNode {
  return {
    type: "TEXT_INSTANCE",
    value,
  };
}

function pdfText(
  value: string,
  style: PdfStyle = {},
  props: Record<string, unknown> = {},
): TextNode {
  return {
    type: "TEXT",
    style,
    props,
    children: [pdfTextInstance(value)],
  };
}

function pdfDynamicText(
  renderFn: (pageProps: DynamicPageProps) => string,
  style: PdfStyle = {},
  props: Record<string, unknown> = {},
): TextNode {
  const render: RenderProp = (pageProps) =>
    [pdfTextInstance(renderFn(pageProps))] as unknown as ReturnType<RenderProp>;

  return {
    type: "TEXT",
    style,
    props: {
      ...props,
      render,
    },
    children: [],
  };
}

function pdfView(
  style: PdfStyle,
  children: PdfChild[],
  props: Record<string, unknown> = {},
): ViewNode {
  return {
    type: "VIEW",
    style,
    props,
    children: compactChildren(children),
  };
}

function pdfPage(
  style: PdfStyle,
  children: PdfChild[],
  props: Record<string, unknown> = {},
): PageNode {
  return {
    type: "PAGE",
    style,
    props: {
      size: "A4",
      wrap: true,
      ...props,
    },
    children: compactChildren(children),
  };
}

const styles: Record<string, PdfStyle> = {
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
};

function safePdfText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value)
    .replace(/\u2014|\u2013/g, "-")
    .replace(/\u00B7/g, "|")
    .replace(/\u2022/g, "-")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    // Strip surrogate pairs (emojis / astral plane), zero-width chars, control chars
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    // Keep WinAnsi-compatible ASCII & Latin-1 printable chars plus \t and \n
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : fallback;
}

function buildMonthlyReportDocument(dataset: ExportDataset): DocumentNode {
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
      : (ROLE_LABELS[dataset.actorRole]?.title ?? dataset.actorRole ?? "Sistem");

  const statCards: Array<{
    label: string;
    value: string;
    sub: string;
    alert?: boolean;
  }> = [
    {
      label: "TOTAL INVENTARIS AKTIF",
      value: `${dataset.items.length} Item`,
      sub: `${toyCount} Mainan | ${fixedCount} Aset | ${consumableCount} Habis Pakai`,
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
        ? `${dataset.deliveries.length} log pengiriman | Opname ${opnamePct}%`
        : `Progres Opname Ruangan: ${opnamePct}%`,
    },
  ];

  const anomalyTableRows = anomalies.rows.slice(0, 60);

  const title = safePdfText(
    `Laporan Bulanan StarOps ${dataset.periodLabel}`,
    "Laporan Bulanan StarOps",
  );
  const subject = safePdfText(
    `Rekonsiliasi & Ringkasan Inventaris ${dataset.periodCode}`,
    "Rekonsiliasi & Ringkasan Inventaris",
  );

  return {
    type: "DOCUMENT",
    style: {},
    props: {
      title,
      author: "StarOps - Star Champs Indonesia",
      subject,
    },
    children: [
      pdfPage(styles.page, [
        // Official Star Champs Header
        pdfView(styles.headerBox, [
          pdfView(styles.brandBlock, [
            pdfText("STAR CHAMPS INDONESIA | STAROPS", styles.brandEyebrow),
            pdfText("LAPORAN RESMI OPERASIONAL BULANAN", styles.brandTitle),
            pdfText(
              dataset.canExportFinancial
                ? "Rekapitulasi Inventaris, Kelengkapan Part, Sanitasi Mainan, Vault & Arsip Hibrida"
                : "Rekapitulasi Inventaris, Kelengkapan Part, Sanitasi Mainan & Arsip Berkas",
              styles.brandSubtitle,
            ),
          ]),
          pdfView(styles.metaBlock, [
            pdfText("Periode Laporan", styles.metaLabel),
            pdfText(
              safePdfText(`${dataset.periodLabel} (${dataset.periodCode})`),
              styles.metaValue,
            ),
            pdfText("Dicetak Pada", styles.metaLabel),
            pdfText(safePdfText(dataset.generatedAtWib), styles.metaValue),
            pdfText("Petugas", styles.metaLabel),
            pdfText(
              safePdfText(`${dataset.actorName} (${actorRoleLabel})`),
              styles.metaValue,
            ),
          ]),
        ]),

        // Summary Stats
        pdfText("1. Ringkasan Statistik Operasional", styles.sectionTitle),
        pdfView(
          styles.statsGrid,
          statCards.map((card) =>
            pdfView(card.alert ? styles.statCardAlert : styles.statCard, [
              pdfText(safePdfText(card.label), styles.statLabel),
              pdfText(
                safePdfText(card.value),
                card.alert ? styles.statValueAlert : styles.statValue,
              ),
              pdfText(safePdfText(card.sub), styles.statSub),
            ]),
          ),
        ),

        // Reconciliation status bar
        pdfView(styles.recSummaryBar, [
          pdfView(styles.recCol, [
            pdfText("Progres Stock Opname", styles.metaLabel),
            pdfText(safePdfText(`${opnamePct}% Selesai`), styles.metaValue),
          ]),
          pdfView(styles.recCol, [
            pdfText("Status Pengesahan", styles.metaLabel),
            pdfText(
              dataset.reconciliation?.locked_at
                ? "Terkunci & Disahkan"
                : "Dalam Pengkinian",
              styles.metaValue,
            ),
          ]),
          pdfView(styles.recCol, [
            pdfText("Total Anomali Terdeteksi", styles.metaLabel),
            pdfText(safePdfText(`${anomalies.rows.length} Item`), styles.metaValue),
          ]),
        ]),

        // Stock Anomaly Table
        pdfText(
          "2. Daftar Anomali Stok, Part Kurang & Sanitasi Mainan",
          styles.sectionTitle,
        ),
        anomalyTableRows.length === 0
          ? pdfView(styles.emptyBox, [
              pdfText(
                "Seluruh inventaris dalam kondisi baik, stok consumable aman, dan mainan terapi berstatus steril.",
                styles.emptyText,
              ),
            ])
          : pdfView(styles.table, [
              pdfView(
                styles.tableHeader,
                [
                  pdfText("No", styles.colNo),
                  pdfText("Kode Item", styles.colCode),
                  pdfText("Nama Barang & Ruang", styles.colName),
                  pdfText("Jenis Anomali", styles.colType),
                  pdfText("Detail Kondisi / Stok / Sanitasi", styles.colDetail),
                  pdfText("PIC", styles.colPic),
                ],
                { fixed: true },
              ),
              ...anomalyTableRows.map((row, idx) =>
                pdfView(
                  idx % 2 === 1 ? styles.tableRowAlt : styles.tableRow,
                  [
                    pdfText(String(idx + 1), styles.colNo),
                    pdfText(safePdfText(row.item.item_code), styles.colCode),
                    pdfText(
                      safePdfText(`${row.item.name} (${row.item.room_code})`),
                      styles.colName,
                    ),
                    pdfText(safePdfText(row.reasons.join(", ")), styles.colType),
                    pdfText(safePdfText(row.detail), styles.colDetail),
                    pdfText(safePdfText(row.item.pic_name, "-"), styles.colPic),
                  ],
                  { wrap: false },
                ),
              ),
            ]),

        anomalies.rows.length > 60
          ? pdfText(
              `* Menampilkan 60 dari ${anomalies.rows.length} item anomali. Unduh file .XLSX untuk daftar lengkap.`,
              { fontSize: 7.5, color: "#64748B", marginBottom: 10 },
            )
          : null,

        // 3-Column Official Signature Block
        pdfView(
          styles.signatureSection,
          [
            pdfText(
              "3. Lembar Pengesahan Resmi & Rekonsiliasi Bulanan",
              styles.sectionTitle,
            ),
            pdfView(styles.signatureGrid, [
              // Column 1: Admin Ops
              pdfView(styles.signatureBox, [
                pdfView({}, [
                  pdfText("Diverifikasi Oleh", styles.signatureRoleTitle),
                  pdfText("Admin Operasional", styles.signatureRoleSub),
                ]),
                pdfView(styles.signatureLine, [
                  pdfText(
                    safePdfText(
                      dataset.approverNames.adminName,
                      "( .............................. )",
                    ),
                    styles.signatureName,
                  ),
                  dataset.reconciliation?.verified_by_admin_at
                    ? pdfText(
                        safePdfText(
                          `E-Verified: ${formatDateWIB(dataset.reconciliation.verified_by_admin_at, true)}`,
                        ),
                        styles.signatureStamp,
                      )
                    : pdfText("Menunggu verifikasi", styles.signaturePending),
                ]),
              ]),
              // Column 2: Kepala Terapis
              pdfView(styles.signatureBox, [
                pdfView({}, [
                  pdfText("Diperiksa Oleh", styles.signatureRoleTitle),
                  pdfText("Kepala Terapis", styles.signatureRoleSub),
                ]),
                pdfView(styles.signatureLine, [
                  pdfText(
                    safePdfText(
                      dataset.approverNames.leaderName,
                      "( .............................. )",
                    ),
                    styles.signatureName,
                  ),
                  dataset.reconciliation?.approved_by_leader_at
                    ? pdfText(
                        safePdfText(
                          `E-Approved: ${formatDateWIB(dataset.reconciliation.approved_by_leader_at, true)}`,
                        ),
                        styles.signatureStamp,
                      )
                    : pdfText("Menunggu pemeriksaan", styles.signaturePending),
                ]),
              ]),
              // Column 3: Owner / Direktur
              pdfView(styles.signatureBox, [
                pdfView({}, [
                  pdfText("Disetujui & Disahkan Oleh", styles.signatureRoleTitle),
                  pdfText("Owner / Direktur", styles.signatureRoleSub),
                ]),
                pdfView(styles.signatureLine, [
                  pdfText(
                    safePdfText(
                      dataset.approverNames.ownerName,
                      "( .............................. )",
                    ),
                    styles.signatureName,
                  ),
                  dataset.reconciliation?.approved_by_owner_at
                    ? pdfText(
                        safePdfText(
                          `E-Signed: ${formatDateWIB(dataset.reconciliation.approved_by_owner_at, true)}`,
                        ),
                        styles.signatureStamp,
                      )
                    : pdfText("Menunggu pengesahan Owner", styles.signaturePending),
                ]),
              ]),
            ]),
          ],
          { wrap: false },
        ),

        // Footer
        pdfView(
          styles.footer,
          [
            pdfText(
              dataset.canExportFinancial
                ? "StarOps | Star Champs Indonesia | Dokumen Audit Internal (Kredensial Vault Termasking)"
                : "StarOps | Star Champs Indonesia | Dokumen Operasional Internal",
            ),
            pdfDynamicText(
              ({ pageNumber, totalPages }) =>
                `Halaman ${pageNumber} dari ${totalPages ?? pageNumber}`,
            ),
          ],
          { fixed: true },
        ),
      ]),
    ],
  };
}

export async function generatePdfBuffer(dataset: ExportDataset): Promise<Buffer> {
  const docNode = buildMonthlyReportDocument(dataset);
  const props = docNode.props ?? {};

  const ctx = new PDFDocument({
    compress: true,
    displayTitle: true,
    autoFirstPage: false,
    info: {
      Title: props.title ?? "Laporan Bulanan StarOps",
      Author: props.author ?? "StarOps - Star Champs Indonesia",
      Subject: props.subject ?? "Rekonsiliasi & Ringkasan Inventaris",
      Creator: "StarOps",
      Producer: "StarOps PDF Generator",
      CreationDate: new Date(),
    },
  });

  const laidOut = await runLayout(docNode, fontStore);
  const stream = runRender(ctx, laidOut);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Uint8Array | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err: Error) => reject(err));
  });
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
