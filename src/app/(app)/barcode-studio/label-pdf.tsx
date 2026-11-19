"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  Document,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { QRCodeSVG } from "qrcode.react";

import {
  A4_GRID_SPEC,
  SPINE_LABEL_SPEC,
  THERMAL_SIZES,
  buildQrTargetUrl,
  encodeCode128Vector,
  mmToPt,
  type Code128VectorData,
  type LabelTemplateId,
  type PrintableLabelRecord,
  type SpinePaperMode,
  type SymbologyMode,
  type ThermalSizeId,
} from "@/lib/barcode";

type QrVectorData = {
  viewBox: string;
  sizeUnits: number;
  pathD: string;
};

type GeneratePdfParams = {
  pages: Array<Array<PrintableLabelRecord | null>>;
  template: LabelTemplateId;
  thermalSize: ThermalSizeId;
  spinePaperMode: SpinePaperMode;
  symbology: SymbologyMode;
  origin: string;
};

function truncateText(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

/**
 * Extracts pure vector SVG path geometry from `qrcode.react`'s `QRCodeSVG`
 * synchronously on demand in the browser so PDF exports stay 100% vector sharp.
 */
function extractQrVectorMap(
  records: PrintableLabelRecord[],
  origin: string,
): Map<string, QrVectorData> {
  const qrMap = new Map<string, QrVectorData>();
  const uniqueUrls = Array.from(
    new Set(records.map((record) => buildQrTargetUrl(record, origin))),
  );
  if (uniqueUrls.length === 0) return qrMap;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.pointerEvents = "none";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    flushSync(() => {
      root.render(
        <>
          {uniqueUrls.map((url, idx) => (
            <div key={url} data-qr-idx={idx}>
              <QRCodeSVG
                value={url}
                size={128}
                level="M"
                marginSize={1}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
          ))}
        </>,
      );
    });

    uniqueUrls.forEach((url, idx) => {
      const wrapper = container.querySelector(`[data-qr-idx="${idx}"]`);
      const svgEl = wrapper?.querySelector("svg");
      const viewBox = svgEl?.getAttribute("viewBox") ?? "0 0 29 29";
      const vbParts = viewBox.split(/\s+/).map(Number);
      const sizeUnits =
        Number.isFinite(vbParts[2]) && vbParts[2] > 0 ? vbParts[2] : 29;
      const paths = svgEl?.querySelectorAll("path") ?? [];
      const fgPath =
        paths.length > 0 ? (paths[paths.length - 1]?.getAttribute("d") ?? "") : "";
      qrMap.set(url, { viewBox, sizeUnits, pathD: fgPath });
    });
  } finally {
    setTimeout(() => {
      root.unmount();
      container.remove();
    }, 0);
  }

  return qrMap;
}

function buildCode128Map(
  records: PrintableLabelRecord[],
): Map<string, Code128VectorData> {
  const map = new Map<string, Code128VectorData>();
  for (const record of records) {
    if (!map.has(record.code)) {
      map.set(record.code, encodeCode128Vector(record.code, 3));
    }
  }
  return map;
}

const pdfStyles = StyleSheet.create({
  pageReset: {
    backgroundColor: "#ffffff",
    color: "#000000",
    fontFamily: "Helvetica",
  },
  a4GridPage: {
    backgroundColor: "#ffffff",
    color: "#000000",
    fontFamily: "Helvetica",
    paddingTop: mmToPt(A4_GRID_SPEC.marginTopMm),
    paddingBottom: mmToPt(8),
    paddingHorizontal: mmToPt(A4_GRID_SPEC.marginSideMm),
  },
  a4Row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  spineA4Page: {
    backgroundColor: "#ffffff",
    color: "#000000",
    fontFamily: "Helvetica",
    paddingTop: mmToPt(SPINE_LABEL_SPEC.a4MarginTopMm),
    paddingBottom: mmToPt(10),
    paddingHorizontal: mmToPt(SPINE_LABEL_SPEC.a4MarginSideMm),
  },
});

function PdfCode128({
  vector,
  widthPt,
  heightPt,
}: {
  vector: Code128VectorData | undefined;
  widthPt: number;
  heightPt: number;
}) {
  if (!vector?.valid) {
    return (
      <View
        style={{
          width: widthPt,
          height: heightPt,
          borderWidth: 0.5,
          borderStyle: "dashed",
          borderColor: "#64748b",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 5 }}>Invalid Code-128</Text>
      </View>
    );
  }

  return (
    <Svg
      width={widthPt}
      height={heightPt}
      viewBox={`0 0 ${vector.totalModules} 1`}
      preserveAspectRatio="none"
    >
      <Path d={vector.pathD} fill="#000000" />
    </Svg>
  );
}

function PdfQrCode({
  vector,
  sizePt,
}: {
  vector: QrVectorData | undefined;
  sizePt: number;
}) {
  if (!vector?.pathD) {
    return (
      <View
        style={{
          width: sizePt,
          height: sizePt,
          borderWidth: 0.5,
          borderColor: "#000000",
        }}
      />
    );
  }

  return (
    <Svg width={sizePt} height={sizePt} viewBox={vector.viewBox}>
      <Rect
        x={0}
        y={0}
        width={vector.sizeUnits}
        height={vector.sizeUnits}
        fill="#ffffff"
      />
      <Path d={vector.pathD} fill="#000000" />
    </Svg>
  );
}

function PdfCompactLabel({
  record,
  template,
  thermalSize,
  symbology,
  origin,
  code128Map,
  qrMap,
  dashedBorder,
}: {
  record: PrintableLabelRecord;
  template: "THERMAL" | "A4_GRID";
  thermalSize: ThermalSizeId;
  symbology: SymbologyMode;
  origin: string;
  code128Map: Map<string, Code128VectorData>;
  qrMap: Map<string, QrVectorData>;
  dashedBorder: boolean;
}) {
  const isCompact40 = template === "THERMAL" && thermalSize === "40x30";
  const isA4 = template === "A4_GRID";

  const widthMm = isA4
    ? A4_GRID_SPEC.labelWidthMm
    : THERMAL_SIZES[thermalSize].widthMm;
  const heightMm = isA4
    ? A4_GRID_SPEC.labelHeightMm
    : THERMAL_SIZES[thermalSize].heightMm;

  const padX = mmToPt(isCompact40 ? 1.5 : isA4 ? 2 : 1.8);
  const padY = mmToPt(isCompact40 ? 1.3 : isA4 ? 1.8 : 1.5);
  const innerWidthPt = mmToPt(widthMm) - padX * 2;

  const qrSizePt = mmToPt(
    symbology === "QR"
      ? isCompact40
        ? 11.5
        : isA4
          ? 14
          : 12.5
      : isCompact40
        ? 9.5
        : isA4
          ? 12.5
          : 10.5,
  );
  const barcodeHeightPt = mmToPt(
    symbology === "CODE128"
      ? isCompact40
        ? 7.8
        : isA4
          ? 9.5
          : 8.5
      : isCompact40
        ? 7.2
        : isA4
          ? 9
          : 8,
  );
  const comboBarcodeWidthPt = Math.max(
    24,
    innerWidthPt - qrSizePt - mmToPt(1.8),
  );

  const codeVec = code128Map.get(record.code);
  const qrVec = qrMap.get(buildQrTargetUrl(record, origin));

  return (
    <View
      style={{
        width: mmToPt(widthMm),
        height: mmToPt(heightMm),
        paddingHorizontal: padX,
        paddingVertical: padY,
        backgroundColor: "#ffffff",
        justifyContent: "space-between",
        borderWidth: dashedBorder ? 0.75 : 0,
        borderStyle: dashedBorder ? "dashed" : "solid",
        borderColor: dashedBorder ? "#64748b" : "#ffffff",
      }}
    >
      {/* 1. Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottomWidth: 0.6,
          borderBottomColor: "#000000",
          paddingBottom: mmToPt(0.45),
        }}
      >
        <Text
          style={{
            fontFamily: "Helvetica-Bold",
            fontSize: isCompact40 ? 4.7 : isA4 ? 5.8 : 5.2,
          }}
        >
          STAR CHAMPS INDONESIA
        </Text>
        <Text
          style={{
            fontFamily: "Helvetica-Bold",
            fontSize: isCompact40 ? 3.8 : 4.5,
            color: "#334155",
          }}
        >
          {truncateText(record.headerSubtitle, isCompact40 ? 15 : 22)}
        </Text>
      </View>

      {/* 2. Item Name & Category */}
      <View style={{ paddingTop: mmToPt(0.4) }}>
        <Text
          style={{
            fontFamily: "Helvetica-Bold",
            fontSize: isCompact40 ? 5.9 : isA4 ? 7 : 6.4,
          }}
        >
          {truncateText(record.title, isCompact40 ? 25 : isA4 ? 36 : 30)}
        </Text>
        <Text
          style={{
            fontSize: isCompact40 ? 4.5 : isA4 ? 5.3 : 4.9,
            color: "#334155",
          }}
        >
          {truncateText(record.category, isCompact40 ? 28 : 40)}
        </Text>
      </View>

      {/* 3 & 4. Barcode / QR + Monospace Code */}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          marginVertical: mmToPt(0.35),
        }}
      >
        {symbology === "CODE128" && (
          <View style={{ width: "100%", alignItems: "center" }}>
            <PdfCode128
              vector={codeVec}
              widthPt={innerWidthPt}
              heightPt={barcodeHeightPt}
            />
            <Text
              style={{
                fontFamily: "Courier-Bold",
                fontSize: isCompact40 ? 5.8 : isA4 ? 7.2 : 6.5,
                marginTop: mmToPt(0.4),
              }}
            >
              {record.code}
            </Text>
          </View>
        )}

        {symbology === "QR" && (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              gap: mmToPt(1.8),
            }}
          >
            <PdfQrCode vector={qrVec} sizePt={qrSizePt} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Courier-Bold",
                  fontSize: isCompact40 ? 5.5 : isA4 ? 6.8 : 6.1,
                }}
              >
                {record.code}
              </Text>
              <Text
                style={{
                  fontSize: isCompact40 ? 4.1 : 4.8,
                  color: "#475569",
                  marginTop: 1.5,
                }}
              >
                Scan QR untuk buka detail
              </Text>
              {record.statusTag && (
                <Text
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: 4.3,
                    marginTop: 1.5,
                  }}
                >
                  [{record.statusTag}]
                </Text>
              )}
            </View>
          </View>
        )}

        {symbology === "COMBO" && (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: mmToPt(1.4),
            }}
          >
            <View style={{ width: comboBarcodeWidthPt, alignItems: "center" }}>
              <PdfCode128
                vector={codeVec}
                widthPt={comboBarcodeWidthPt}
                heightPt={barcodeHeightPt}
              />
              <Text
                style={{
                  fontFamily: "Courier-Bold",
                  fontSize: isCompact40 ? 5 : isA4 ? 6.4 : 5.6,
                  marginTop: mmToPt(0.35),
                }}
              >
                {truncateText(record.code, 22)}
              </Text>
            </View>
            <PdfQrCode vector={qrVec} sizePt={qrSizePt} />
          </View>
        )}
      </View>

      {/* 5 & 6. Location & Part Counter / Archive Digital Indicator */}
      <View
        style={{
          borderTopWidth: 0.5,
          borderTopColor: "#64748b",
          paddingTop: mmToPt(0.45),
        }}
      >
        <Text
          style={{
            fontSize: isCompact40 ? 4.3 : isA4 ? 5.2 : 4.7,
            color: "#1e293b",
          }}
        >
          {truncateText(
            record.locationDisplay,
            isCompact40 ? 30 : isA4 ? 44 : 36,
          )}
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: isCompact40 ? 4.4 : isA4 ? 5.3 : 4.8,
            }}
          >
            {truncateText(
              record.counterOrIndicator,
              isCompact40 ? 28 : isA4 ? 40 : 34,
            )}
          </Text>
          {record.statusTag && symbology !== "QR" && (
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 4.3 }}>
              [{record.statusTag}]
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function PdfSpineLabel({
  record,
  symbology,
  origin,
  code128Map,
  qrMap,
  dashedBorder,
}: {
  record: PrintableLabelRecord;
  symbology: SymbologyMode;
  origin: string;
  code128Map: Map<string, Code128VectorData>;
  qrMap: Map<string, QrVectorData>;
  dashedBorder: boolean;
}) {
  const codeVec = code128Map.get(record.code);
  const qrVec = qrMap.get(buildQrTargetUrl(record, origin));

  return (
    <View
      style={{
        width: mmToPt(SPINE_LABEL_SPEC.widthMm),
        height: mmToPt(SPINE_LABEL_SPEC.heightMm),
        paddingHorizontal: mmToPt(2.5),
        paddingVertical: mmToPt(2),
        backgroundColor: "#ffffff",
        flexDirection: "row",
        alignItems: "stretch",
        gap: mmToPt(2.5),
        borderWidth: dashedBorder ? 0.75 : 0,
        borderStyle: dashedBorder ? "dashed" : "solid",
        borderColor: dashedBorder ? "#64748b" : "#ffffff",
      }}
    >
      {/* Left Brand + Location Code Pillar */}
      <View
        style={{
          width: mmToPt(24),
          borderRightWidth: 0.75,
          borderRightColor: "#000000",
          paddingRight: mmToPt(2),
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 5.2 }}>
            STAR CHAMPS
          </Text>
          <Text
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: 4.8,
              color: "#475569",
            }}
          >
            INDONESIA
          </Text>
        </View>
        <View
          style={{
            backgroundColor: "#000000",
            borderRadius: 2,
            paddingVertical: mmToPt(1),
            paddingHorizontal: mmToPt(1.5),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: 11,
              color: "#ffffff",
            }}
          >
            {record.locationCode}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: "Helvetica-Bold",
            fontSize: 4.4,
            color: "#334155",
          }}
        >
          {truncateText(record.headerSubtitle, 18)}
        </Text>
      </View>

      {/* Center Info */}
      <View
        style={{
          flex: 1,
          justifyContent: "space-between",
          overflow: "hidden",
        }}
      >
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: 5.6,
                color: "#475569",
              }}
            >
              {truncateText(record.category.toUpperCase(), 28)}
            </Text>
            {record.statusTag && (
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 5 }}>
                [{record.statusTag}]
              </Text>
            )}
          </View>
          <Text
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: 9.2,
              marginTop: 1.5,
            }}
          >
            {truncateText(record.title, 44)}
          </Text>
        </View>

        <Text style={{ fontFamily: "Courier-Bold", fontSize: 8.5 }}>
          {record.code}
        </Text>

        <View
          style={{
            borderTopWidth: 0.5,
            borderTopColor: "#64748b",
            paddingTop: mmToPt(0.8),
          }}
        >
          <Text style={{ fontSize: 5.8, color: "#1e293b" }}>
            {truncateText(record.locationDisplay, 40)}
          </Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 5.8 }}>
            {truncateText(record.counterOrIndicator, 38)}
          </Text>
        </View>
      </View>

      {/* Right Symbology Block */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: mmToPt(2.2),
          borderLeftWidth: 0.5,
          borderLeftColor: "#94a3b8",
          paddingLeft: mmToPt(2.2),
        }}
      >
        {(symbology === "CODE128" || symbology === "COMBO") && (
          <View
            style={{
              width: mmToPt(symbology === "CODE128" ? 46 : 36),
              alignItems: "center",
            }}
          >
            <PdfCode128
              vector={codeVec}
              widthPt={mmToPt(symbology === "CODE128" ? 46 : 36)}
              heightPt={mmToPt(17)}
            />
            <Text
              style={{
                fontFamily: "Courier-Bold",
                fontSize: 6.4,
                marginTop: mmToPt(0.8),
              }}
            >
              {record.code}
            </Text>
          </View>
        )}

        {(symbology === "QR" || symbology === "COMBO") && (
          <View style={{ alignItems: "center" }}>
            <PdfQrCode
              vector={qrVec}
              sizePt={mmToPt(symbology === "QR" ? 25 : 23)}
            />
            {symbology === "QR" && (
              <Text style={{ fontSize: 4.8, color: "#475569", marginTop: 1.5 }}>
                Scan QR
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function BarcodeBatchPdfDocument({
  pages,
  template,
  thermalSize,
  spinePaperMode,
  symbology,
  origin,
  code128Map,
  qrMap,
}: GeneratePdfParams & {
  code128Map: Map<string, Code128VectorData>;
  qrMap: Map<string, QrVectorData>;
}) {
  return (
    <Document
      title="StarOps Barcode & Label Studio"
      author="Star Champs Indonesia"
      creator="StarOps Barcode Studio"
    >
      {pages.map((slots, pageIdx) => {
        if (template === "THERMAL") {
          const spec = THERMAL_SIZES[thermalSize];
          const record = slots[0];
          if (!record) return null;
          return (
            <Page
              key={`pdf-thermal-${pageIdx}`}
              size={{
                width: mmToPt(spec.widthMm),
                height: mmToPt(spec.heightMm),
              }}
              style={pdfStyles.pageReset}
            >
              <PdfCompactLabel
                record={record}
                template="THERMAL"
                thermalSize={thermalSize}
                symbology={symbology}
                origin={origin}
                code128Map={code128Map}
                qrMap={qrMap}
                dashedBorder={false}
              />
            </Page>
          );
        }

        if (template === "A4_GRID") {
          const rows: Array<Array<PrintableLabelRecord | null>> = [];
          for (let r = 0; r < A4_GRID_SPEC.rows; r += 1) {
            rows.push(
              slots.slice(r * A4_GRID_SPEC.cols, (r + 1) * A4_GRID_SPEC.cols),
            );
          }

          return (
            <Page
              key={`pdf-a4-${pageIdx}`}
              size={{
                width: mmToPt(A4_GRID_SPEC.pageWidthMm),
                height: mmToPt(A4_GRID_SPEC.pageHeightMm),
              }}
              style={pdfStyles.a4GridPage}
            >
              {rows.map((rowSlots, rowIdx) => (
                <View
                  key={`pdf-row-${rowIdx}`}
                  style={[
                    pdfStyles.a4Row,
                    {
                      marginBottom:
                        rowIdx < A4_GRID_SPEC.rows - 1
                          ? mmToPt(A4_GRID_SPEC.gapYMm)
                          : 0,
                    },
                  ]}
                >
                  {rowSlots.map((slot, colIdx) =>
                    slot ? (
                      <PdfCompactLabel
                        key={`pdf-cell-${rowIdx}-${colIdx}`}
                        record={slot}
                        template="A4_GRID"
                        thermalSize={thermalSize}
                        symbology={symbology}
                        origin={origin}
                        code128Map={code128Map}
                        qrMap={qrMap}
                        dashedBorder
                      />
                    ) : (
                      <View
                        key={`pdf-empty-${rowIdx}-${colIdx}`}
                        style={{
                          width: mmToPt(A4_GRID_SPEC.labelWidthMm),
                          height: mmToPt(A4_GRID_SPEC.labelHeightMm),
                        }}
                      />
                    ),
                  )}
                </View>
              ))}
            </Page>
          );
        }

        // ARCHIVE_SPINE
        if (spinePaperMode === "CUSTOM_SINGLE") {
          const record = slots[0];
          if (!record) return null;
          return (
            <Page
              key={`pdf-spine-single-${pageIdx}`}
              size={{
                width: mmToPt(SPINE_LABEL_SPEC.widthMm),
                height: mmToPt(SPINE_LABEL_SPEC.heightMm),
              }}
              style={pdfStyles.pageReset}
            >
              <PdfSpineLabel
                record={record}
                symbology={symbology}
                origin={origin}
                code128Map={code128Map}
                qrMap={qrMap}
                dashedBorder={false}
              />
            </Page>
          );
        }

        return (
          <Page
            key={`pdf-spine-a4-${pageIdx}`}
            size={{
              width: mmToPt(SPINE_LABEL_SPEC.a4PageWidthMm),
              height: mmToPt(SPINE_LABEL_SPEC.a4PageHeightMm),
            }}
            style={pdfStyles.spineA4Page}
          >
            {slots.map((slot, slotIdx) =>
              slot ? (
                <View
                  key={`pdf-spine-slot-${slotIdx}`}
                  style={{
                    marginBottom:
                      slotIdx < slots.length - 1
                        ? mmToPt(SPINE_LABEL_SPEC.a4GapYMm)
                        : 0,
                  }}
                >
                  <PdfSpineLabel
                    record={slot}
                    symbology={symbology}
                    origin={origin}
                    code128Map={code128Map}
                    qrMap={qrMap}
                    dashedBorder
                  />
                </View>
              ) : null,
            )}
          </Page>
        );
      })}
    </Document>
  );
}

/**
 * Generates a print-ready vector PDF Blob for the configured label batch using
 * `@react-pdf/renderer`, embedding crisp vector Code-128 and QR SVG paths.
 */
export async function generateBarcodeBatchPdfBlob(
  params: GeneratePdfParams,
): Promise<Blob> {
  const flatRecords = params.pages
    .flat()
    .filter((item): item is PrintableLabelRecord => item !== null);

  const code128Map =
    params.symbology === "QR"
      ? new Map<string, Code128VectorData>()
      : buildCode128Map(flatRecords);

  const qrMap =
    params.symbology === "CODE128"
      ? new Map<string, QrVectorData>()
      : extractQrVectorMap(flatRecords, params.origin);

  const instance = pdf(
    <BarcodeBatchPdfDocument
      {...params}
      code128Map={code128Map}
      qrMap={qrMap}
    />,
  );

  return instance.toBlob();
}
