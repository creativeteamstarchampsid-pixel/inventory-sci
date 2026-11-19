"use client";

import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

import {
  CONDITION_LABELS,
  DELIVERY_DIRECTION_LABELS,
  formatDateWIB,
} from "@/lib/constants";
import type { DeliveryLog } from "@/types/database";
import { generateCode128DataUrl } from "./delivery-barcode";
import { parseDeliveryPayloadItems } from "./helpers";

export type DeliveryDocType = "label" | "surat-jalan" | "bast";

export type BastExtraMeta = {
  handoverPurpose?: string;
  senderRoleLabel?: string;
  receiverRoleLabel?: string;
  witnessName?: string;
};

const styles = StyleSheet.create({
  // Shipping Label (A6)
  labelPage: {
    padding: 14,
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  labelBox: {
    borderWidth: 1.5,
    borderColor: "#0f172a",
    padding: 10,
    flex: 1,
    justifyContent: "space-between",
  },
  labelHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 6,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.4,
  },
  brandSub: {
    fontSize: 7.5,
    color: "#475569",
    marginTop: 1,
  },
  dirBadge: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#0f172a",
  },
  fragileBanner: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#dc2626",
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  fragileText: {
    color: "#b91c1c",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textAlign: "center",
  },
  partySection: {
    marginBottom: 5,
    paddingBottom: 5,
    borderBottomWidth: 0.75,
    borderBottomColor: "#e2e8f0",
  },
  fieldCaption: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
    textTransform: "uppercase",
    marginBottom: 1.5,
  },
  partyName: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
  },
  partyAddress: {
    fontSize: 8,
    color: "#334155",
    marginTop: 1,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
    gap: 8,
  },
  metaCol: {
    flex: 1,
  },
  contentsBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 0.75,
    borderColor: "#cbd5e1",
    padding: 5,
    marginBottom: 6,
  },
  barcodeFooter: {
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
    paddingTop: 6,
    alignItems: "center",
  },
  barcodeImage: {
    width: 190,
    height: 44,
    objectFit: "contain",
  },
  monoCode: {
    fontFamily: "Courier-Bold",
    fontSize: 10,
    marginTop: 3,
    letterSpacing: 0.6,
  },

  // A4 Official Documents (Surat Jalan & BAST)
  a4Page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  docHeader: {
    borderBottomWidth: 2,
    borderBottomColor: "#0f172a",
    paddingBottom: 10,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  docOrgName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  docOrgSub: {
    fontSize: 8.5,
    color: "#475569",
    marginTop: 2,
  },
  docTitleWrap: {
    alignItems: "flex-end",
  },
  docTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.3,
  },
  docCodeText: {
    fontFamily: "Courier-Bold",
    fontSize: 9.5,
    marginTop: 2,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 12,
  },
  infoBox: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: "#cbd5e1",
    padding: 8,
  },
  infoLine: {
    fontSize: 8.5,
    marginBottom: 2.5,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  table: {
    borderWidth: 1,
    borderColor: "#334155",
    marginTop: 6,
    marginBottom: 12,
  },
  tableRowHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 8.5,
  },
  colNo: { width: "6%" },
  colCode: { width: "21%", fontFamily: "Courier" },
  colName: { width: "31%" },
  colQty: { width: "12%", textAlign: "right" },
  colCond: { width: "15%" },
  colNote: { width: "15%" },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.45,
    marginBottom: 10,
  },
  notesBox: {
    borderWidth: 0.75,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    padding: 8,
    marginBottom: 14,
  },
  signatureGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    gap: 14,
  },
  signatureCol: {
    flex: 1,
    alignItems: "center",
    borderWidth: 0.75,
    borderColor: "#e2e8f0",
    padding: 8,
  },
  signatureRole: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  signatureSpace: {
    height: 46,
  },
  signatureNameLine: {
    borderTopWidth: 0.75,
    borderTopColor: "#0f172a",
    paddingTop: 3,
    width: "90%",
    textAlign: "center",
    fontSize: 8.5,
  },
  footerMeta: {
    marginTop: 14,
    fontSize: 7.5,
    color: "#64748b",
    textAlign: "right",
  },
});

function DeliveryLabelPdf({
  delivery,
  barcodeDataUrl,
}: {
  delivery: DeliveryLog;
  barcodeDataUrl: string;
}) {
  const items = parseDeliveryPayloadItems(delivery.items_payload_json);
  const briefItems =
    items.length > 0
      ? items
          .slice(0, 4)
          .map((it) => `${it.name} (${it.qty} ${it.unit_label})`)
          .join(", ") +
        (items.length > 4 ? ` +${items.length - 4} item lainnya` : "")
      : delivery.package_type;

  return (
    <Document title={`Label-${delivery.delivery_code}`}>
      <Page size="A6" style={styles.labelPage}>
        <View style={styles.labelBox}>
          <View>
            <View style={styles.labelHeader}>
              <View>
                <Text style={styles.brandTitle}>STAR CHAMPS INDONESIA</Text>
                <Text style={styles.brandSub}>
                  Pusat Terapi & Edukasi Anak · StarOps Logistik
                </Text>
              </View>
              <Text style={styles.dirBadge}>
                {delivery.direction === "INBOUND" ? "MASUK" : "KELUAR"}
              </Text>
            </View>

            {delivery.is_fragile && (
              <View style={styles.fragileBanner}>
                <Text style={styles.fragileText}>
                  FRAGILE / ALAT TERAPI — TANGANI DENGAN HATI-HATI
                </Text>
              </View>
            )}

            <View style={styles.partySection}>
              <Text style={styles.fieldCaption}>Pengirim</Text>
              <Text style={styles.partyName}>{delivery.sender_name}</Text>
              {delivery.sender_address ? (
                <Text style={styles.partyAddress}>{delivery.sender_address}</Text>
              ) : null}
            </View>

            <View style={styles.partySection}>
              <Text style={styles.fieldCaption}>Penerima</Text>
              <Text style={styles.partyName}>{delivery.receiver_name}</Text>
              {delivery.receiver_address ? (
                <Text style={styles.partyAddress}>{delivery.receiver_address}</Text>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaCol}>
                <Text style={styles.fieldCaption}>Kurir & Resi</Text>
                <Text style={{ fontSize: 8.5 }}>
                  {delivery.courier_name}
                  {delivery.tracking_number ? ` · ${delivery.tracking_number}` : ""}
                </Text>
              </View>
              <View style={styles.metaCol}>
                <Text style={styles.fieldCaption}>PIC / Penanggung Jawab</Text>
                <Text style={{ fontSize: 8.5 }}>{delivery.pic_name || "-"}</Text>
              </View>
            </View>

            <View style={styles.contentsBox}>
              <Text style={styles.fieldCaption}>Ringkasan Isi Paket</Text>
              <Text style={{ fontSize: 8, lineHeight: 1.35 }}>{briefItems}</Text>
            </View>
          </View>

          <View style={styles.barcodeFooter}>
            {barcodeDataUrl ? (
              <PdfImage src={barcodeDataUrl} style={styles.barcodeImage} />
            ) : null}
            <Text style={styles.monoCode}>{delivery.delivery_code}</Text>
            <Text style={{ fontSize: 7, color: "#475569", marginTop: 2 }}>
              {DELIVERY_DIRECTION_LABELS[delivery.direction]} ·{" "}
              {formatDateWIB(delivery.created_at)}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

function SuratJalanPdf({
  delivery,
  barcodeDataUrl,
}: {
  delivery: DeliveryLog;
  barcodeDataUrl: string;
}) {
  const items = parseDeliveryPayloadItems(delivery.items_payload_json);

  return (
    <Document title={`SuratJalan-${delivery.delivery_code}`}>
      <Page size="A4" style={styles.a4Page}>
        <View style={styles.docHeader}>
          <View>
            <Text style={styles.docOrgName}>STAR CHAMPS INDONESIA</Text>
            <Text style={styles.docOrgSub}>
              Pusat Terapi & Edukasi Anak · Operasional & Logistik
            </Text>
          </View>
          <View style={styles.docTitleWrap}>
            <Text style={styles.docTitle}>SURAT JALAN (DELIVERY ORDER)</Text>
            <Text style={styles.docCodeText}>No: SJ / {delivery.delivery_code}</Text>
            <Text style={{ fontSize: 8, color: "#475569", marginTop: 1 }}>
              Tanggal: {formatDateWIB(delivery.shipped_at ?? delivery.created_at, true)}
            </Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.fieldCaption}>Pihak Pengirim</Text>
            <Text style={[styles.infoLine, styles.bold]}>{delivery.sender_name}</Text>
            <Text style={styles.infoLine}>{delivery.sender_address || "-"}</Text>
            <Text style={styles.infoLine}>PIC: {delivery.pic_name || "-"}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.fieldCaption}>Pihak Penerima</Text>
            <Text style={[styles.infoLine, styles.bold]}>{delivery.receiver_name}</Text>
            <Text style={styles.infoLine}>{delivery.receiver_address || "-"}</Text>
            <Text style={styles.infoLine}>
              Kurir: {delivery.courier_name}
              {delivery.tracking_number ? ` (${delivery.tracking_number})` : ""}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ fontSize: 9 }}>
            Jenis Paket: <Text style={styles.bold}>{delivery.package_type}</Text>
            {delivery.is_fragile ? " · [FRAGILE / ALAT TERAPI]" : ""}
          </Text>
          {barcodeDataUrl ? (
            <PdfImage src={barcodeDataUrl} style={{ width: 130, height: 28, objectFit: "contain" }} />
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableRowHeader}>
            <Text style={styles.colNo}>No</Text>
            <Text style={styles.colCode}>Kode Barang</Text>
            <Text style={styles.colName}>Nama Barang</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colCond}>Kondisi</Text>
            <Text style={styles.colNote}>Keterangan</Text>
          </View>
          {items.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={{ width: "100%", color: "#64748b" }}>
                Tidak ada rincian item pada paket ini ({delivery.package_type}).
              </Text>
            </View>
          ) : (
            items.map((item, idx) => (
              <View key={item.id || idx} style={styles.tableRow}>
                <Text style={styles.colNo}>{idx + 1}</Text>
                <Text style={styles.colCode}>{item.item_code || "-"}</Text>
                <Text style={styles.colName}>{item.name}</Text>
                <Text style={styles.colQty}>
                  {item.qty} {item.unit_label}
                </Text>
                <Text style={styles.colCond}>
                  {CONDITION_LABELS[item.condition] ?? item.condition}
                </Text>
                <Text style={styles.colNote}>{item.notes || "-"}</Text>
              </View>
            ))
          )}
        </View>

        {delivery.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.fieldCaption}>Catatan Pengiriman</Text>
            <Text style={{ fontSize: 8.5 }}>{delivery.notes}</Text>
          </View>
        ) : null}

        <View style={styles.signatureGrid}>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureRole}>Pengirim</Text>
            <Text style={{ fontSize: 7.5, color: "#64748b" }}>
              {delivery.sender_name}
            </Text>
            <View style={styles.signatureSpace} />
            <Text style={styles.signatureNameLine}>( .............................. )</Text>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureRole}>Kurir / Pembawa</Text>
            <Text style={{ fontSize: 7.5, color: "#64748b" }}>
              {delivery.courier_name}
            </Text>
            <View style={styles.signatureSpace} />
            <Text style={styles.signatureNameLine}>( .............................. )</Text>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureRole}>Penerima</Text>
            <Text style={{ fontSize: 7.5, color: "#64748b" }}>
              {delivery.receiver_name}
            </Text>
            <View style={styles.signatureSpace} />
            <Text style={styles.signatureNameLine}>( .............................. )</Text>
          </View>
        </View>

        <Text style={styles.footerMeta}>
          Dicetak melalui StarOps · Kode Referensi: {delivery.delivery_code}
        </Text>
      </Page>
    </Document>
  );
}

function BastPdf({
  delivery,
  barcodeDataUrl,
  bastMeta,
}: {
  delivery: DeliveryLog;
  barcodeDataUrl: string;
  bastMeta?: BastExtraMeta;
}) {
  const items = parseDeliveryPayloadItems(delivery.items_payload_json);
  const docDate = formatDateWIB(delivery.received_at ?? delivery.created_at);

  return (
    <Document title={`BAST-${delivery.delivery_code}`}>
      <Page size="A4" style={styles.a4Page}>
        <View style={styles.docHeader}>
          <View>
            <Text style={styles.docOrgName}>STAR CHAMPS INDONESIA</Text>
            <Text style={styles.docOrgSub}>
              Pusat Terapi & Edukasi Anak · Dokumen Serah Terima Resmi
            </Text>
          </View>
          <View style={styles.docTitleWrap}>
            <Text style={styles.docTitle}>BERITA ACARA SERAH TERIMA</Text>
            <Text style={styles.docCodeText}>No: BAST / {delivery.delivery_code}</Text>
            <Text style={{ fontSize: 8, color: "#475569", marginTop: 1 }}>
              Tanggal: {docDate}
            </Text>
          </View>
        </View>

        <Text style={styles.paragraph}>
          Pada hari ini, tanggal <Text style={styles.bold}>{docDate}</Text>, telah
          dilaksanakan serah terima inventaris / aset kantor / kunci / peralatan
          terapi dengan rincian pihak sebagai berikut:
        </Text>

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.fieldCaption}>Pihak Pertama (Yang Menyerahkan)</Text>
            <Text style={[styles.infoLine, styles.bold]}>{delivery.sender_name}</Text>
            <Text style={styles.infoLine}>
              Jabatan / Unit: {bastMeta?.senderRoleLabel || "Perwakilan Star Champs"}
            </Text>
            <Text style={styles.infoLine}>
              Alamat: {delivery.sender_address || "Star Champs Indonesia"}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.fieldCaption}>Pihak Kedua (Yang Menerima)</Text>
            <Text style={[styles.infoLine, styles.bold]}>{delivery.receiver_name}</Text>
            <Text style={styles.infoLine}>
              Jabatan / Pihak: {bastMeta?.receiverRoleLabel || "Staf / Pihak Eksternal"}
            </Text>
            <Text style={styles.infoLine}>
              Alamat: {delivery.receiver_address || "-"}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ fontSize: 9 }}>
            Keperluan:{" "}
            <Text style={styles.bold}>
              {bastMeta?.handoverPurpose || delivery.package_type}
            </Text>
          </Text>
          {barcodeDataUrl ? (
            <PdfImage src={barcodeDataUrl} style={{ width: 130, height: 28, objectFit: "contain" }} />
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableRowHeader}>
            <Text style={styles.colNo}>No</Text>
            <Text style={styles.colCode}>Kode Aset / Item</Text>
            <Text style={styles.colName}>Nama Barang / Aset / Kunci</Text>
            <Text style={styles.colQty}>Jumlah</Text>
            <Text style={styles.colCond}>Kondisi</Text>
            <Text style={styles.colNote}>Keterangan</Text>
          </View>
          {items.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={{ width: "100%", color: "#64748b" }}>
                Tidak ada daftar rincian barang tercatat.
              </Text>
            </View>
          ) : (
            items.map((item, idx) => (
              <View key={item.id || idx} style={styles.tableRow}>
                <Text style={styles.colNo}>{idx + 1}</Text>
                <Text style={styles.colCode}>{item.item_code || "-"}</Text>
                <Text style={styles.colName}>{item.name}</Text>
                <Text style={styles.colQty}>
                  {item.qty} {item.unit_label}
                </Text>
                <Text style={styles.colCond}>
                  {CONDITION_LABELS[item.condition] ?? item.condition}
                </Text>
                <Text style={styles.colNote}>{item.notes || "-"}</Text>
              </View>
            ))
          )}
        </View>

        {delivery.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.fieldCaption}>Catatan Tambahan</Text>
            <Text style={{ fontSize: 8.5 }}>{delivery.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.paragraph}>
          Demikian Berita Acara Serah Terima ini dibuat dengan sebenarnya untuk
          dipergunakan sebagaimana mestinya. Sejak ditandatangani, barang/aset/kunci
          tersebut di atas berada dalam tanggung jawab pemeliharaan dan penggunaan
          Pihak Kedua.
        </Text>

        <View style={styles.signatureGrid}>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureRole}>Pihak Pertama (Yang Menyerahkan)</Text>
            <Text style={{ fontSize: 7.5, color: "#64748b" }}>
              {delivery.sender_name}
            </Text>
            <View style={styles.signatureSpace} />
            <Text style={styles.signatureNameLine}>( {delivery.sender_name} )</Text>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureRole}>Saksi / PIC Operasional</Text>
            <Text style={{ fontSize: 7.5, color: "#64748b" }}>
              {bastMeta?.witnessName || delivery.pic_name || "Admin Operasional"}
            </Text>
            <View style={styles.signatureSpace} />
            <Text style={styles.signatureNameLine}>
              ( {bastMeta?.witnessName || delivery.pic_name || ".................."} )
            </Text>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureRole}>Pihak Kedua (Yang Menerima)</Text>
            <Text style={{ fontSize: 7.5, color: "#64748b" }}>
              {delivery.receiver_name}
            </Text>
            <View style={styles.signatureSpace} />
            <Text style={styles.signatureNameLine}>( {delivery.receiver_name} )</Text>
          </View>
        </View>

        <Text style={styles.footerMeta}>
          StarOps Digital BAST · Ref: {delivery.delivery_code}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadDeliveryPdf(
  docType: DeliveryDocType,
  delivery: DeliveryLog,
  bastMeta?: BastExtraMeta,
): Promise<void> {
  const barcodeDataUrl = generateCode128DataUrl(delivery.delivery_code);

  const docElement =
    docType === "label" ? (
      <DeliveryLabelPdf delivery={delivery} barcodeDataUrl={barcodeDataUrl} />
    ) : docType === "surat-jalan" ? (
      <SuratJalanPdf delivery={delivery} barcodeDataUrl={barcodeDataUrl} />
    ) : (
      <BastPdf
        delivery={delivery}
        barcodeDataUrl={barcodeDataUrl}
        bastMeta={bastMeta}
      />
    );

  const blob = await pdf(docElement).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const prefix =
    docType === "label"
      ? "Label-Pengiriman"
      : docType === "surat-jalan"
        ? "Surat-Jalan"
        : "BAST";
  a.href = url;
  a.download = `${prefix}-${delivery.delivery_code}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
