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
  A4_GRID_PRESETS,
  A4_GRID_SPEC,
  SPINE_LABEL_SPEC,
  SPINE_SIZES,
  buildActiveCounterLine,
  buildQrPayload,
  computeAdaptiveFontPt,
  computeLinearStickerLayout,
  computeQrStickerLayout,
  computeSpineStickerLayout,
  encodeCode128Vector,
  mmToPt,
  normalizeLabelContentSettings,
  resolveThermalDimensions,
  splitSoftBreakSegments,
  type A4GridPresetId,
  type Code128VectorData,
  type CustomThermalSize,
  type LabelContentSettings,
  type LabelTemplateId,
  type PrintableLabelRecord,
  type SpinePaperMode,
  type SpineSizeId,
  type SymbologyMode,
  type ThermalSizeId,
} from "@/lib/barcode";

type QrVectorData = {
  viewBox: string;
  sizeUnits: number;
  pathD: string;
};

export type GeneratePdfParams = {
  pages: Array<Array<PrintableLabelRecord | null>>;
  template: LabelTemplateId;
  thermalSize: ThermalSizeId;
  spinePaperMode: SpinePaperMode;
  symbology: SymbologyMode;
  origin: string;
  content?: LabelContentSettings;
  customThermalSize?: CustomThermalSize;
  a4Preset?: A4GridPresetId;
  spineSize?: SpineSizeId;
};

/**
 * Custom hyphenation callback for `@react-pdf/renderer` `<Text>` nodes:
 * splits words cleanly at `_`, `-`, `/` (and chunks ultra-long unbroken tokens)
 * WITHOUT inserting stray hyphen characters, matching HTML soft-break wrapping 1:1.
 */
function pdfHyphenationCallback(word: string): string[] {
  return splitSoftBreakSegments(word, 16);
}

/**
 * Extracts pure vector SVG path geometry from `qrcode.react`'s `QRCodeSVG`
 * synchronously on demand in the browser so PDF exports stay 100% vector sharp.
 */
function extractQrVectorMap(
  records: PrintableLabelRecord[],
  origin: string,
  content: LabelContentSettings,
): Map<string, QrVectorData> {
  const qrMap = new Map<string, QrVectorData>();
  const uniquePayloads = Array.from(
    new Set(
      records.map((record) =>
        buildQrPayload(record, origin, content.qrPayloadMode),
      ),
    ),
  );
  if (uniquePayloads.length === 0) return qrMap;

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
          {uniquePayloads.map((payload, idx) => (
            <div key={payload} data-qr-idx={idx}>
              <QRCodeSVG
                value={payload || " "}
                size={256}
                level={content.qrErrorLevel}
                marginSize={content.qrQuietZone}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
          ))}
        </>,
      );
    });

    uniquePayloads.forEach((payload, idx) => {
      const wrapper = container.querySelector(`[data-qr-idx="${idx}"]`);
      const svgEl = wrapper?.querySelector("svg");
      const viewBox = svgEl?.getAttribute("viewBox") ?? "0 0 29 29";
      const vbParts = viewBox.split(/\s+/).map(Number);
      const sizeUnits =
        Number.isFinite(vbParts[2]) && vbParts[2] > 0 ? vbParts[2] : 29;
      const paths = svgEl?.querySelectorAll("path") ?? [];
      const fgPath =
        paths.length > 0 ? (paths[paths.length - 1]?.getAttribute("d") ?? "") : "";
      qrMap.set(payload, { viewBox, sizeUnits, pathD: fgPath });
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
  a4Row: {
    flexDirection: "row",
  },
});

function getPdfBorderStyle(dashedBorder: boolean, showBorderFrame: boolean) {
  if (showBorderFrame) {
    return {
      borderWidth: 0.8,
      borderStyle: "solid" as const,
      borderColor: "#000000",
    };
  }
  if (dashedBorder) {
    return {
      borderWidth: 0.75,
      borderStyle: "dashed" as const,
      borderColor: "#64748b",
    };
  }
  return {
    borderWidth: 0,
    borderStyle: "solid" as const,
    borderColor: "#ffffff",
  };
}

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

function PdfQrCompactLabel({
  record,
  widthMm,
  heightMm,
  qrVec,
  content,
  dashedBorder,
}: {
  record: PrintableLabelRecord;
  widthMm: number;
  heightMm: number;
  qrVec: QrVectorData | undefined;
  content: LabelContentSettings;
  dashedBorder: boolean;
}) {
  const headerBrand = content.showHeader ? content.customHeaderText.trim() : "";
  const headerSub = content.showHeaderSubtitle ? record.headerSubtitle.trim() : "";
  const hasHeader = Boolean(headerBrand || headerSub);
  const hasTitle = content.showTitle && Boolean(record.title.trim());
  const hasCategory = content.showCategory && Boolean(record.category.trim());
  const hasCodeText = content.showCodeText && Boolean(record.code.trim());
  const hasLocation = content.showLocation && Boolean(record.locationDisplay.trim());
  const counterLine = buildActiveCounterLine(record, content);
  const hasCounterLine = Boolean(counterLine);
  const hasStatusTag = content.showStatusTag && Boolean(record.statusTag);
  const scanHintText = content.showScanHint ? content.customScanHint.trim() : "";
  const hasScanHint = Boolean(scanHintText);
  const hasBodyText =
    hasTitle ||
    hasCategory ||
    hasCodeText ||
    hasLocation ||
    hasCounterLine ||
    hasStatusTag ||
    hasScanHint;

  const layout = computeQrStickerLayout({
    widthMm,
    heightMm,
    content,
    hasHeader,
    hasTitle,
    hasCategory,
    hasCodeText,
    hasLocation,
    hasCounterLine,
    hasStatusTag,
    hasScanHint,
    titleText: record.title,
    locationText: record.locationDisplay,
    codeText: record.code,
    counterText: counterLine ?? "",
    scanHintText,
  });

  const titleTypo = hasTitle
    ? computeAdaptiveFontPt(
        record.title,
        layout.textBoxWidthMm,
        layout.titleMaxHeightMm,
        layout.titleBaseFontPt,
        layout.titleMinFontPt,
        1.14,
        true,
        false,
      )
    : null;

  const locationTypo = hasLocation
    ? computeAdaptiveFontPt(
        record.locationDisplay,
        layout.textBoxWidthMm,
        layout.locationMaxHeightMm,
        layout.metaFontPt,
        Math.max(2.8, layout.metaFontPt * 0.7),
        1.12,
        false,
        false,
      )
    : null;

  const codeTypo = hasCodeText
    ? computeAdaptiveFontPt(
        record.code,
        layout.textBoxWidthMm,
        Math.max(2.2, (layout.codeFontPt * 1.4) / (72 / 25.4)),
        layout.codeFontPt,
        Math.max(3.0, layout.codeFontPt * 0.7),
        1.1,
        true,
        true,
      )
    : null;

  const categoryTypo = hasCategory
    ? computeAdaptiveFontPt(
        record.category,
        layout.textBoxWidthMm,
        Math.max(2.0, (layout.categoryFontPt * 2.0) / (72 / 25.4)),
        layout.categoryFontPt,
        Math.max(2.8, layout.categoryFontPt * 0.72),
        1.1,
        false,
        false,
      )
    : null;

  const counterTypo =
    hasCounterLine && counterLine
      ? computeAdaptiveFontPt(
          counterLine,
          layout.textBoxWidthMm,
          Math.max(2.0, (layout.metaFontPt * 2.2) / (72 / 25.4)),
          layout.metaFontPt,
          Math.max(2.8, layout.metaFontPt * 0.7),
          1.12,
          true,
          false,
        )
      : null;

  const scanHintTypo = hasScanHint
    ? computeAdaptiveFontPt(
        scanHintText,
        layout.textBoxWidthMm,
        Math.max(1.8, (layout.hintFontPt * 2.1) / (72 / 25.4)),
        layout.hintFontPt,
        Math.max(2.7, layout.hintFontPt * 0.72),
        1.1,
        false,
        false,
      )
    : null;

  const hasBottomMeta =
    hasLocation || hasCounterLine || hasStatusTag || hasScanHint;
  const hasSideUpperContent =
    (!layout.headerFullWidth && hasHeader) ||
    hasTitle ||
    hasCategory ||
    hasCodeText;

  const renderHeader = (compact: boolean) => {
    if (compact) {
      const compactText = headerBrand || headerSub;
      if (!compactText) return null;
      return (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderBottomWidth: 0.6,
            borderBottomColor: "#000000",
            paddingBottom: mmToPt(0.3),
          }}
        >
          <Text
            hyphenationCallback={pdfHyphenationCallback}
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: Math.max(3.2, layout.headerFontPt * 0.9),
              lineHeight: 1.1,
              flexShrink: 1,
            }}
          >
            {compactText.toUpperCase()}
          </Text>
        </View>
      );
    }

    if (!headerBrand && !headerSub) return null;
    return (
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
        {headerBrand ? (
          <Text
            hyphenationCallback={pdfHyphenationCallback}
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: layout.headerFontPt,
              lineHeight: 1.1,
              flexShrink: 1,
            }}
          >
            {headerBrand.toUpperCase()}
          </Text>
        ) : null}
        {headerSub ? (
          <Text
            hyphenationCallback={pdfHyphenationCallback}
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: layout.headerSubFontPt,
              lineHeight: 1.1,
              color: "#334155",
              marginLeft: headerBrand ? mmToPt(0.8) : 0,
              flexShrink: headerBrand ? 0 : 1,
            }}
          >
            {headerSub.toUpperCase()}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={{
        width: mmToPt(widthMm),
        height: mmToPt(heightMm),
        paddingHorizontal: mmToPt(layout.padXMm),
        paddingVertical: mmToPt(layout.padYMm),
        backgroundColor: "#ffffff",
        justifyContent: "space-between",
        overflow: "hidden",
        ...getPdfBorderStyle(dashedBorder, content.showBorderFrame),
      }}
    >
      {layout.headerFullWidth && hasHeader ? renderHeader(false) : null}

      {layout.orientation === "QR_ONLY" && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            marginTop: layout.headerFullWidth ? mmToPt(0.45) : 0,
          }}
        >
          <PdfQrCode vector={qrVec} sizePt={mmToPt(layout.qrSizeMm)} />
        </View>
      )}

      {layout.orientation === "SIDE_BY_SIDE" && (
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: mmToPt(layout.gapMm),
            marginTop: layout.headerFullWidth ? mmToPt(0.45) : 0,
          }}
        >
          <PdfQrCode vector={qrVec} sizePt={mmToPt(layout.qrSizeMm)} />

          <View
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              justifyContent:
                hasSideUpperContent && hasBottomMeta
                  ? "space-between"
                  : "center",
            }}
          >
            {((!layout.headerFullWidth && hasHeader) || hasTitle || hasCategory) && (
              <View>
                {!layout.headerFullWidth && hasHeader
                  ? renderHeader(true)
                  : null}

                {hasTitle && titleTypo && (
                  <Text
                    hyphenationCallback={pdfHyphenationCallback}
                    style={{
                      fontFamily: "Helvetica-Bold",
                      fontSize: titleTypo.fontSizePt,
                      lineHeight: titleTypo.lineHeight,
                      marginTop:
                        !layout.headerFullWidth && hasHeader ? mmToPt(0.35) : 0,
                    }}
                  >
                    {record.title}
                  </Text>
                )}

                {hasCategory && categoryTypo && (
                  <Text
                    hyphenationCallback={pdfHyphenationCallback}
                    style={{
                      fontSize: categoryTypo.fontSizePt,
                      lineHeight: categoryTypo.lineHeight,
                      color: "#334155",
                      marginTop: mmToPt(0.25),
                    }}
                  >
                    {record.category}
                  </Text>
                )}
              </View>
            )}

            {hasCodeText && codeTypo && (
              <Text
                hyphenationCallback={pdfHyphenationCallback}
                style={{
                  fontFamily: "Courier-Bold",
                  fontSize: codeTypo.fontSizePt,
                  lineHeight: codeTypo.lineHeight,
                  marginVertical: mmToPt(0.25),
                }}
              >
                {record.code}
              </Text>
            )}

            {hasBottomMeta && (
              <View
                style={
                  hasSideUpperContent
                    ? {
                        borderTopWidth: 0.5,
                        borderTopColor: "#64748b",
                        paddingTop: mmToPt(0.35),
                      }
                    : undefined
                }
              >
                {hasLocation && locationTypo && (
                  <Text
                    hyphenationCallback={pdfHyphenationCallback}
                    style={{
                      fontSize: locationTypo.fontSizePt,
                      lineHeight: locationTypo.lineHeight,
                      color: "#1e293b",
                    }}
                  >
                    {record.locationDisplay}
                  </Text>
                )}

                {hasCounterLine && counterLine && counterTypo && (
                  <Text
                    hyphenationCallback={pdfHyphenationCallback}
                    style={{
                      fontFamily: "Helvetica-Bold",
                      fontSize: counterTypo.fontSizePt,
                      lineHeight: counterTypo.lineHeight,
                      marginTop: mmToPt(0.2),
                    }}
                  >
                    {counterLine}
                  </Text>
                )}

                {(hasScanHint || hasStatusTag) && (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: mmToPt(0.2),
                    }}
                  >
                    {hasScanHint && scanHintTypo && (
                      <Text
                        hyphenationCallback={pdfHyphenationCallback}
                        style={{
                          fontSize: scanHintTypo.fontSizePt,
                          lineHeight: scanHintTypo.lineHeight,
                          color: "#475569",
                        }}
                      >
                        {scanHintText}
                      </Text>
                    )}
                    {hasStatusTag && record.statusTag && (
                      <Text
                        style={{
                          fontFamily: "Helvetica-Bold",
                          fontSize: layout.statusFontPt,
                          lineHeight: 1.05,
                          borderWidth: 0.5,
                          borderColor: "#000000",
                          paddingHorizontal: mmToPt(0.5),
                          paddingVertical: mmToPt(0.1),
                        }}
                      >
                        {record.statusTag}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {layout.orientation === "TOP_BOTTOM" && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: hasBodyText ? mmToPt(layout.gapMm) : 0,
            marginTop: layout.headerFullWidth ? mmToPt(0.45) : 0,
          }}
        >
          <PdfQrCode vector={qrVec} sizePt={mmToPt(layout.qrSizeMm)} />

          {hasBodyText && (
            <View
              style={{
                width: mmToPt(layout.textBoxWidthMm),
                alignItems: "center",
              }}
            >
              {hasTitle && titleTypo && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: titleTypo.fontSizePt,
                    lineHeight: titleTypo.lineHeight,
                    textAlign: "center",
                  }}
                >
                  {record.title}
                </Text>
              )}

              {hasCategory && categoryTypo && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontSize: categoryTypo.fontSizePt,
                    lineHeight: categoryTypo.lineHeight,
                    color: "#334155",
                    textAlign: "center",
                    marginTop: mmToPt(0.22),
                  }}
                >
                  {record.category}
                </Text>
              )}

              {hasCodeText && codeTypo && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontFamily: "Courier-Bold",
                    fontSize: codeTypo.fontSizePt,
                    lineHeight: codeTypo.lineHeight,
                    textAlign: "center",
                    marginTop: mmToPt(0.22),
                  }}
                >
                  {record.code}
                </Text>
              )}

              {hasLocation && locationTypo && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontSize: locationTypo.fontSizePt,
                    lineHeight: locationTypo.lineHeight,
                    color: "#1e293b",
                    textAlign: "center",
                    marginTop: mmToPt(0.22),
                  }}
                >
                  {record.locationDisplay}
                </Text>
              )}

              {hasCounterLine && counterLine && counterTypo && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: counterTypo.fontSizePt,
                    lineHeight: counterTypo.lineHeight,
                    textAlign: "center",
                    marginTop: mmToPt(0.2),
                  }}
                >
                  {counterLine}
                </Text>
              )}

              {(hasScanHint || hasStatusTag) && (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: mmToPt(0.8),
                    marginTop: mmToPt(0.22),
                  }}
                >
                  {hasScanHint && scanHintTypo && (
                    <Text
                      hyphenationCallback={pdfHyphenationCallback}
                      style={{
                        fontSize: scanHintTypo.fontSizePt,
                        lineHeight: scanHintTypo.lineHeight,
                        color: "#475569",
                        textAlign: "center",
                      }}
                    >
                      {scanHintText}
                    </Text>
                  )}
                  {hasStatusTag && record.statusTag && (
                    <Text
                      style={{
                        fontFamily: "Helvetica-Bold",
                        fontSize: layout.statusFontPt,
                        lineHeight: 1.05,
                        borderWidth: 0.5,
                        borderColor: "#000000",
                        paddingHorizontal: mmToPt(0.5),
                        paddingVertical: mmToPt(0.1),
                      }}
                    >
                      {record.statusTag}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function PdfLinearCompactLabel({
  record,
  widthMm,
  heightMm,
  symbology,
  codeVec,
  qrVec,
  content,
  dashedBorder,
}: {
  record: PrintableLabelRecord;
  widthMm: number;
  heightMm: number;
  symbology: "CODE128" | "COMBO";
  codeVec: Code128VectorData | undefined;
  qrVec: QrVectorData | undefined;
  content: LabelContentSettings;
  dashedBorder: boolean;
}) {
  const headerBrand = content.showHeader ? content.customHeaderText.trim() : "";
  const headerSub = content.showHeaderSubtitle ? record.headerSubtitle.trim() : "";
  const hasHeader = Boolean(headerBrand || headerSub);
  const hasTitle = content.showTitle && Boolean(record.title.trim());
  const hasCategory = content.showCategory && Boolean(record.category.trim());
  const hasCodeText = content.showCodeText && Boolean(record.code.trim());
  const hasLocation = content.showLocation && Boolean(record.locationDisplay.trim());
  const counterLine = buildActiveCounterLine(record, content);
  const hasCounterLine = Boolean(counterLine);
  const hasStatusTag = content.showStatusTag && Boolean(record.statusTag);

  const layout = computeLinearStickerLayout({
    widthMm,
    heightMm,
    symbology,
    content,
    hasHeader,
    hasTitle,
    hasCategory,
    hasCodeText,
    hasLocation,
    hasCounterLine,
    hasStatusTag,
  });

  const titleTypo = hasTitle
    ? computeAdaptiveFontPt(
        record.title,
        layout.innerWidthMm,
        layout.titleMaxHeightMm,
        layout.titleBaseFontPt,
        layout.titleMinFontPt,
        1.14,
        true,
        false,
      )
    : null;

  const locationTypo = hasLocation
    ? computeAdaptiveFontPt(
        record.locationDisplay,
        layout.innerWidthMm,
        layout.locationMaxHeightMm,
        layout.metaFontPt,
        Math.max(2.8, layout.metaFontPt * 0.72),
        1.12,
        false,
        false,
      )
    : null;

  const codeBoxWidthMm =
    symbology === "COMBO" ? layout.comboBarcodeWidthMm : layout.innerWidthMm;
  const codeTypo = hasCodeText
    ? computeAdaptiveFontPt(
        record.code,
        codeBoxWidthMm,
        Math.max(2.0, (layout.codeFontPt * 1.45) / (72 / 25.4)),
        layout.codeFontPt,
        Math.max(3.0, layout.codeFontPt * 0.72),
        1.05,
        true,
        true,
      )
    : null;

  const hasFooter = hasLocation || hasCounterLine || hasStatusTag;

  return (
    <View
      style={{
        width: mmToPt(widthMm),
        height: mmToPt(heightMm),
        paddingHorizontal: mmToPt(layout.padXMm),
        paddingVertical: mmToPt(layout.padYMm),
        backgroundColor: "#ffffff",
        justifyContent: "space-between",
        overflow: "hidden",
        ...getPdfBorderStyle(dashedBorder, content.showBorderFrame),
      }}
    >
      {/* 1. Header */}
      {hasHeader && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderBottomWidth: 0.6,
            borderBottomColor: "#000000",
            paddingBottom: mmToPt(0.4),
          }}
        >
          {headerBrand ? (
            <Text
              hyphenationCallback={pdfHyphenationCallback}
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: layout.headerFontPt,
                lineHeight: 1.1,
                flexShrink: 1,
              }}
            >
              {headerBrand.toUpperCase()}
            </Text>
          ) : null}
          {headerSub ? (
            <Text
              hyphenationCallback={pdfHyphenationCallback}
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: layout.headerSubFontPt,
                lineHeight: 1.1,
                color: "#334155",
                marginLeft: headerBrand ? mmToPt(0.8) : 0,
                flexShrink: headerBrand ? 0 : 1,
              }}
            >
              {headerSub.toUpperCase()}
            </Text>
          ) : null}
        </View>
      )}

      {/* 2. Title & Category (NEVER truncated!) */}
      {(hasTitle || hasCategory) && (
        <View style={{ paddingTop: mmToPt(0.35) }}>
          {hasTitle && titleTypo && (
            <Text
              hyphenationCallback={pdfHyphenationCallback}
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: titleTypo.fontSizePt,
                lineHeight: titleTypo.lineHeight,
              }}
            >
              {record.title}
            </Text>
          )}
          {hasCategory && (
            <Text
              hyphenationCallback={pdfHyphenationCallback}
              style={{
                fontSize: layout.categoryFontPt,
                lineHeight: 1.12,
                color: "#334155",
              }}
            >
              {record.category}
            </Text>
          )}
        </View>
      )}

      {/* 3 & 4. Barcode / Combo + Code */}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          marginVertical: mmToPt(0.35),
        }}
      >
        {symbology === "CODE128" ? (
          <View style={{ width: "100%", alignItems: "center" }}>
            <PdfCode128
              vector={codeVec}
              widthPt={mmToPt(layout.innerWidthMm)}
              heightPt={mmToPt(layout.barcodeHeightMm)}
            />
            {hasCodeText && codeTypo && (
              <Text
                hyphenationCallback={pdfHyphenationCallback}
                style={{
                  fontFamily: "Courier-Bold",
                  fontSize: codeTypo.fontSizePt,
                  lineHeight: codeTypo.lineHeight,
                  marginTop: mmToPt(0.35),
                  textAlign: "center",
                }}
              >
                {record.code}
              </Text>
            )}
          </View>
        ) : (
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: mmToPt(layout.comboGapMm),
            }}
          >
            <View
              style={{
                width: mmToPt(layout.comboBarcodeWidthMm),
                alignItems: "center",
              }}
            >
              <PdfCode128
                vector={codeVec}
                widthPt={mmToPt(layout.comboBarcodeWidthMm)}
                heightPt={mmToPt(layout.barcodeHeightMm)}
              />
              {hasCodeText && codeTypo && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontFamily: "Courier-Bold",
                    fontSize: codeTypo.fontSizePt,
                    lineHeight: codeTypo.lineHeight,
                    marginTop: mmToPt(0.3),
                    textAlign: "center",
                  }}
                >
                  {record.code}
                </Text>
              )}
            </View>
            <PdfQrCode vector={qrVec} sizePt={mmToPt(layout.comboQrSizeMm)} />
          </View>
        )}
      </View>

      {/* 5 & 6. Footer */}
      {hasFooter && (
        <View
          style={{
            borderTopWidth: 0.5,
            borderTopColor: "#64748b",
            paddingTop: mmToPt(0.35),
          }}
        >
          {hasLocation && locationTypo && (
            <Text
              hyphenationCallback={pdfHyphenationCallback}
              style={{
                fontSize: locationTypo.fontSizePt,
                lineHeight: locationTypo.lineHeight,
                color: "#1e293b",
              }}
            >
              {record.locationDisplay}
            </Text>
          )}
          {(hasCounterLine || hasStatusTag) && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {hasCounterLine && counterLine ? (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: layout.metaFontPt,
                    lineHeight: 1.15,
                  }}
                >
                  {counterLine}
                </Text>
              ) : (
                <View />
              )}
              {hasStatusTag && record.statusTag && (
                <Text
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: layout.statusFontPt,
                  }}
                >
                  [{record.statusTag}]
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function PdfCompactLabel({
  record,
  template,
  thermalSize,
  customThermalSize,
  a4Preset,
  symbology,
  origin,
  content,
  code128Map,
  qrMap,
  dashedBorder,
}: {
  record: PrintableLabelRecord;
  template: "THERMAL" | "A4_GRID";
  thermalSize: ThermalSizeId;
  customThermalSize?: CustomThermalSize;
  a4Preset: A4GridPresetId;
  symbology: SymbologyMode;
  origin: string;
  content: LabelContentSettings;
  code128Map: Map<string, Code128VectorData>;
  qrMap: Map<string, QrVectorData>;
  dashedBorder: boolean;
}) {
  const dims =
    template === "A4_GRID"
      ? (() => {
          const spec = A4_GRID_PRESETS[a4Preset] ?? A4_GRID_SPEC;
          return { widthMm: spec.labelWidthMm, heightMm: spec.labelHeightMm };
        })()
      : resolveThermalDimensions(thermalSize, customThermalSize);

  const qrPayload = buildQrPayload(record, origin, content.qrPayloadMode);
  const qrVec = qrMap.get(qrPayload);

  if (symbology === "QR") {
    return (
      <PdfQrCompactLabel
        record={record}
        widthMm={dims.widthMm}
        heightMm={dims.heightMm}
        qrVec={qrVec}
        content={content}
        dashedBorder={dashedBorder}
      />
    );
  }

  return (
    <PdfLinearCompactLabel
      record={record}
      widthMm={dims.widthMm}
      heightMm={dims.heightMm}
      symbology={symbology}
      codeVec={code128Map.get(record.code)}
      qrVec={qrVec}
      content={content}
      dashedBorder={dashedBorder}
    />
  );
}

function PdfSpineLabel({
  record,
  symbology,
  spineSize,
  origin,
  content,
  code128Map,
  qrMap,
  dashedBorder,
}: {
  record: PrintableLabelRecord;
  symbology: SymbologyMode;
  spineSize: SpineSizeId;
  origin: string;
  content: LabelContentSettings;
  code128Map: Map<string, Code128VectorData>;
  qrMap: Map<string, QrVectorData>;
  dashedBorder: boolean;
}) {
  const headerBrand = content.showHeader ? content.customHeaderText.trim() : "";
  const headerSub = content.showHeaderSubtitle ? record.headerSubtitle.trim() : "";
  const hasBrand = Boolean(headerBrand);
  const hasLeftPillar = hasBrand || Boolean(headerSub) || content.showLocation;
  const hasCategory = content.showCategory && Boolean(record.category.trim());
  const hasTitle = content.showTitle && Boolean(record.title.trim());
  const hasCodeText = content.showCodeText && Boolean(record.code.trim());
  const hasLocation = content.showLocation && Boolean(record.locationDisplay.trim());
  const counterLine = buildActiveCounterLine(record, content);
  const hasCounterLine = Boolean(counterLine);
  const hasStatusTag = content.showStatusTag && Boolean(record.statusTag);
  const scanHintText = content.showScanHint ? content.customScanHint.trim() : "";
  const hasScanHint = Boolean(scanHintText);

  const hasMiddleUpper = hasCategory || hasStatusTag || hasTitle || hasCodeText;
  const hasMiddleFooter = hasLocation || hasCounterLine;
  const hasMiddleText = hasMiddleUpper || hasMiddleFooter;

  const layout = computeSpineStickerLayout({
    spineSize,
    symbology,
    content,
    hasLeftPillar,
    hasCategory,
    hasTitle,
    hasCodeText,
    hasLocation,
    hasCounterLine,
    hasStatusTag,
    hasScanHint,
  });

  const titleTypo = hasTitle
    ? computeAdaptiveFontPt(
        record.title,
        layout.middleWidthMm,
        layout.titleMaxHeightMm,
        layout.titleBaseFontPt,
        layout.titleMinFontPt,
        1.14,
        true,
        false,
      )
    : null;

  const locationTypo = hasLocation
    ? computeAdaptiveFontPt(
        record.locationDisplay,
        layout.middleWidthMm,
        Math.max(3.0, (layout.metaFontPt * 2.2) / (72 / 25.4)),
        layout.metaFontPt,
        Math.max(3.6, layout.metaFontPt * 0.76),
        1.14,
        false,
        false,
      )
    : null;

  const codeTypo = hasCodeText
    ? computeAdaptiveFontPt(
        record.code,
        layout.middleWidthMm,
        Math.max(3.0, (layout.codeFontPt * 1.45) / (72 / 25.4)),
        layout.codeFontPt,
        Math.max(4.5, layout.codeFontPt * 0.72),
        1.08,
        true,
        true,
      )
    : null;

  const codeVec = code128Map.get(record.code);
  const qrVec = qrMap.get(buildQrPayload(record, origin, content.qrPayloadMode));

  return (
    <View
      style={{
        width: mmToPt(layout.spec.widthMm),
        height: mmToPt(layout.spec.heightMm),
        paddingHorizontal: mmToPt(layout.padXMm),
        paddingVertical: mmToPt(layout.padYMm),
        backgroundColor: "#ffffff",
        flexDirection: "row",
        alignItems: "stretch",
        justifyContent: !hasLeftPillar && !hasMiddleText ? "center" : "flex-start",
        gap: mmToPt(layout.gapMm),
        overflow: "hidden",
        ...getPdfBorderStyle(dashedBorder, content.showBorderFrame),
      }}
    >
      {/* Left Brand + Location Code Pillar */}
      {hasLeftPillar && (
        <View
          style={{
            width: mmToPt(layout.leftPillarWidthMm),
            borderRightWidth: 0.75,
            borderRightColor: "#000000",
            paddingRight: mmToPt(Math.max(1.4, layout.gapMm * 0.8)),
            justifyContent: "space-between",
          }}
        >
          {hasBrand ? (
            <Text
              hyphenationCallback={pdfHyphenationCallback}
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: layout.brandFontPt,
                lineHeight: 1.12,
              }}
            >
              {headerBrand.toUpperCase()}
            </Text>
          ) : (
            <View />
          )}

          {content.showLocation && (
            <View
              style={{
                backgroundColor: "#000000",
                borderRadius: 2,
                paddingVertical: mmToPt(0.8),
                paddingHorizontal: mmToPt(1.2),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Helvetica-Bold",
                  fontSize: layout.locationBadgeFontPt,
                  color: "#ffffff",
                }}
              >
                {record.locationCode}
              </Text>
            </View>
          )}

          {headerSub ? (
            <Text
              hyphenationCallback={pdfHyphenationCallback}
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: layout.headerSubFontPt,
                lineHeight: 1.1,
                color: "#334155",
              }}
            >
              {headerSub.toUpperCase()}
            </Text>
          ) : (
            <View />
          )}
        </View>
      )}

      {/* Center Info — NEVER truncated title; omitted when no middle text */}
      {hasMiddleText && (
        <View
          style={{
            flex: 1,
            justifyContent:
              hasMiddleUpper && hasMiddleFooter ? "space-between" : "center",
            overflow: "hidden",
          }}
        >
          {(hasCategory || hasStatusTag || hasTitle) && (
            <View>
              {(hasCategory || hasStatusTag) && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  {hasCategory ? (
                    <Text
                      hyphenationCallback={pdfHyphenationCallback}
                      style={{
                        fontFamily: "Helvetica-Bold",
                        fontSize: layout.categoryFontPt,
                        lineHeight: 1.12,
                        color: "#475569",
                        flexShrink: 1,
                      }}
                    >
                      {record.category.toUpperCase()}
                    </Text>
                  ) : (
                    <View />
                  )}
                  {hasStatusTag && record.statusTag && (
                    <Text
                      style={{
                        fontFamily: "Helvetica-Bold",
                        fontSize: layout.statusFontPt,
                        borderWidth: 0.5,
                        borderColor: "#000000",
                        paddingHorizontal: mmToPt(0.8),
                        paddingVertical: mmToPt(0.15),
                      }}
                    >
                      {record.statusTag}
                    </Text>
                  )}
                </View>
              )}

              {hasTitle && titleTypo && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: titleTypo.fontSizePt,
                    lineHeight: titleTypo.lineHeight,
                    marginTop: mmToPt(0.3),
                  }}
                >
                  {record.title}
                </Text>
              )}
            </View>
          )}

          {hasCodeText && codeTypo && (
            <Text
              hyphenationCallback={pdfHyphenationCallback}
              style={{
                fontFamily: "Courier-Bold",
                fontSize: codeTypo.fontSizePt,
                lineHeight: codeTypo.lineHeight,
              }}
            >
              {record.code}
            </Text>
          )}

          {hasMiddleFooter && (
            <View
              style={
                hasMiddleUpper
                  ? {
                      borderTopWidth: 0.5,
                      borderTopColor: "#64748b",
                      paddingTop: mmToPt(0.55),
                    }
                  : undefined
              }
            >
              {hasLocation && locationTypo && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontSize: locationTypo.fontSizePt,
                    lineHeight: locationTypo.lineHeight,
                    color: "#1e293b",
                  }}
                >
                  {record.locationDisplay}
                </Text>
              )}
              {hasCounterLine && counterLine && (
                <Text
                  hyphenationCallback={pdfHyphenationCallback}
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: layout.metaFontPt,
                    lineHeight: 1.15,
                  }}
                >
                  {counterLine}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Right Symbology Block (centered cleanly when all text toggles are OFF) */}
      <View
        style={{
          flex: hasMiddleText ? undefined : 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: hasMiddleText ? "flex-end" : "center",
          gap: mmToPt(layout.gapMm),
          borderLeftWidth: hasMiddleText ? 0.5 : 0,
          borderLeftColor: "#94a3b8",
          paddingLeft: hasMiddleText ? mmToPt(layout.gapMm) : 0,
        }}
      >
        {(symbology === "CODE128" || symbology === "COMBO") && (
          <View
            style={{
              width: mmToPt(layout.barcodeWidthMm),
              alignItems: "center",
            }}
          >
            <PdfCode128
              vector={codeVec}
              widthPt={mmToPt(layout.barcodeWidthMm)}
              heightPt={mmToPt(layout.barcodeHeightMm)}
            />
            {hasCodeText && (
              <Text
                hyphenationCallback={pdfHyphenationCallback}
                style={{
                  fontFamily: "Courier-Bold",
                  fontSize: Math.max(4.6, layout.metaFontPt * 1.05),
                  marginTop: mmToPt(0.6),
                  textAlign: "center",
                }}
              >
                {record.code}
              </Text>
            )}
          </View>
        )}

        {(symbology === "QR" || symbology === "COMBO") && (
          <View style={{ alignItems: "center" }}>
            <PdfQrCode vector={qrVec} sizePt={mmToPt(layout.qrSizeMm)} />
            {symbology === "QR" && hasScanHint && (
              <Text
                hyphenationCallback={pdfHyphenationCallback}
                style={{
                  fontSize: layout.hintFontPt,
                  color: "#475569",
                  marginTop: mmToPt(0.45),
                  maxWidth: mmToPt(layout.qrSizeMm + 2),
                  textAlign: "center",
                }}
              >
                {scanHintText}
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
  customThermalSize,
  a4Preset = "TJ_121_24",
  spineSize = "150x35",
  spinePaperMode,
  symbology,
  origin,
  resolvedContent,
  code128Map,
  qrMap,
}: GeneratePdfParams & {
  resolvedContent: LabelContentSettings;
  code128Map: Map<string, Code128VectorData>;
  qrMap: Map<string, QrVectorData>;
}) {
  const a4Spec = A4_GRID_PRESETS[a4Preset] ?? A4_GRID_SPEC;
  const spineSpec = SPINE_SIZES[spineSize] ?? SPINE_LABEL_SPEC;
  const thermalDims = resolveThermalDimensions(thermalSize, customThermalSize);

  return (
    <Document
      title="StarOps Barcode & Label Studio"
      author="Star Champs Indonesia"
      creator="StarOps Barcode Studio"
    >
      {pages.map((slots, pageIdx) => {
        if (template === "THERMAL") {
          const record = slots[0];
          if (!record) return null;
          return (
            <Page
              key={`pdf-thermal-${pageIdx}`}
              size={{
                width: mmToPt(thermalDims.widthMm),
                height: mmToPt(thermalDims.heightMm),
              }}
              style={pdfStyles.pageReset}
            >
              <PdfCompactLabel
                record={record}
                template="THERMAL"
                thermalSize={thermalSize}
                customThermalSize={customThermalSize}
                a4Preset={a4Preset}
                symbology={symbology}
                origin={origin}
                content={resolvedContent}
                code128Map={code128Map}
                qrMap={qrMap}
                dashedBorder={false}
              />
            </Page>
          );
        }

        if (template === "A4_GRID") {
          const rows: Array<Array<PrintableLabelRecord | null>> = [];
          for (let r = 0; r < a4Spec.rows; r += 1) {
            rows.push(
              slots.slice(r * a4Spec.cols, (r + 1) * a4Spec.cols),
            );
          }

          return (
            <Page
              key={`pdf-a4-${pageIdx}`}
              size={{
                width: mmToPt(a4Spec.pageWidthMm),
                height: mmToPt(a4Spec.pageHeightMm),
              }}
              style={{
                backgroundColor: "#ffffff",
                color: "#000000",
                fontFamily: "Helvetica",
                paddingTop: mmToPt(a4Spec.marginTopMm),
                paddingBottom: mmToPt(3),
                paddingHorizontal: mmToPt(a4Spec.marginSideMm),
              }}
            >
              {rows.map((rowSlots, rowIdx) => (
                <View
                  key={`pdf-row-${rowIdx}`}
                  style={[
                    pdfStyles.a4Row,
                    {
                      marginBottom:
                        rowIdx < a4Spec.rows - 1 ? mmToPt(a4Spec.gapYMm) : 0,
                    },
                  ]}
                >
                  {rowSlots.map((slot, colIdx) => {
                    const rightGap =
                      colIdx < a4Spec.cols - 1 ? mmToPt(a4Spec.gapXMm) : 0;
                    return slot ? (
                      <View
                        key={`pdf-cell-${rowIdx}-${colIdx}`}
                        style={{ marginRight: rightGap }}
                      >
                        <PdfCompactLabel
                          record={slot}
                          template="A4_GRID"
                          thermalSize={thermalSize}
                          customThermalSize={customThermalSize}
                          a4Preset={a4Preset}
                          symbology={symbology}
                          origin={origin}
                          content={resolvedContent}
                          code128Map={code128Map}
                          qrMap={qrMap}
                          dashedBorder
                        />
                      </View>
                    ) : (
                      <View
                        key={`pdf-empty-${rowIdx}-${colIdx}`}
                        style={{
                          width: mmToPt(a4Spec.labelWidthMm),
                          height: mmToPt(a4Spec.labelHeightMm),
                          marginRight: rightGap,
                        }}
                      />
                    );
                  })}
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
                width: mmToPt(spineSpec.widthMm),
                height: mmToPt(spineSpec.heightMm),
              }}
              style={pdfStyles.pageReset}
            >
              <PdfSpineLabel
                record={record}
                symbology={symbology}
                spineSize={spineSize}
                origin={origin}
                content={resolvedContent}
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
              width: mmToPt(spineSpec.a4PageWidthMm),
              height: mmToPt(spineSpec.a4PageHeightMm),
            }}
            style={{
              backgroundColor: "#ffffff",
              color: "#000000",
              fontFamily: "Helvetica",
              paddingTop: mmToPt(spineSpec.a4MarginTopMm),
              paddingBottom: mmToPt(3),
              paddingHorizontal: mmToPt(spineSpec.a4MarginSideMm),
            }}
          >
            {slots.map((slot, slotIdx) =>
              slot ? (
                <View
                  key={`pdf-spine-slot-${slotIdx}`}
                  style={{
                    marginBottom:
                      slotIdx < slots.length - 1
                        ? mmToPt(spineSpec.a4GapYMm)
                        : 0,
                  }}
                >
                  <PdfSpineLabel
                    record={slot}
                    symbology={symbology}
                    spineSize={spineSize}
                    origin={origin}
                    content={resolvedContent}
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
  const resolvedContent = normalizeLabelContentSettings(params.content);
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
      : extractQrVectorMap(flatRecords, params.origin, resolvedContent);

  const instance = pdf(
    <BarcodeBatchPdfDocument
      {...params}
      resolvedContent={resolvedContent}
      code128Map={code128Map}
      qrMap={qrMap}
    />,
  );

  return instance.toBlob();
}
