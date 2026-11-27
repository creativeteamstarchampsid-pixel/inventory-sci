"use client";

import * as React from "react";
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
  insertSoftBreakOpportunities,
  normalizeLabelContentSettings,
  resolveThermalDimensions,
  type A4GridPresetId,
  type CustomThermalSize,
  type LabelContentSettings,
  type LabelTemplateId,
  type PrintableLabelRecord,
  type QrErrorLevel,
  type SpinePaperMode,
  type SpineSizeId,
  type SymbologyMode,
  type ThermalSizeId,
} from "@/lib/barcode";
import { cn } from "@/lib/utils";

function Code128Svg({
  code,
  heightMm,
  className,
}: {
  code: string;
  heightMm: number;
  className?: string;
}) {
  const encoded = React.useMemo(() => encodeCode128Vector(code, 3), [code]);

  if (!encoded.valid) {
    return (
      <div
        style={{ height: `${heightMm}mm` }}
        className={cn(
          "flex w-full items-center justify-center border border-dashed border-black/40 text-[5pt] text-black/60",
          className,
        )}
      >
        Kode tidak valid
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${encoded.totalModules} 1`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{ height: `${heightMm}mm` }}
      className={cn("block w-full bg-white text-black", className)}
      role="img"
      aria-label={`Barcode Code-128 ${encoded.value}`}
    >
      <path d={encoded.pathD} fill="currentColor" shapeRendering="crispEdges" />
    </svg>
  );
}

function QrVectorBox({
  value,
  sizeMm,
  level,
  marginSize,
  className,
}: {
  value: string;
  sizeMm: number;
  level: QrErrorLevel;
  marginSize: 1 | 2;
  className?: string;
}) {
  return (
    <div
      style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
      className={cn("shrink-0 bg-white", className)}
    >
      <QRCodeSVG
        value={value || " "}
        size={256}
        level={level}
        marginSize={marginSize}
        bgColor="#ffffff"
        fgColor="#000000"
        shapeRendering="crispEdges"
        className="barcode-qr-svg block h-full w-full"
      />
    </div>
  );
}

export type LabelStickerProps = {
  record: PrintableLabelRecord;
  template: LabelTemplateId;
  thermalSize: ThermalSizeId;
  symbology: SymbologyMode;
  origin: string;
  showCutBorder?: boolean;
  content?: LabelContentSettings;
  customThermalSize?: CustomThermalSize;
  a4Preset?: A4GridPresetId;
  spineSize?: SpineSizeId;
};

function getStickerFrameClass(
  showCutBorder: boolean,
  showBorderFrame: boolean,
): string {
  if (showBorderFrame) {
    return "border-[0.8pt] border-solid border-black print:border-[0.8pt] print:border-solid print:border-black";
  }
  if (showCutBorder) {
    return "border-[0.75pt] border-dashed border-slate-500";
  }
  return "border border-black/15 print:border-0";
}

function QrCompactSticker({
  record,
  widthMm,
  heightMm,
  qrPayload,
  content,
  showCutBorder,
}: {
  record: PrintableLabelRecord;
  widthMm: number;
  heightMm: number;
  qrPayload: string;
  content: LabelContentSettings;
  showCutBorder: boolean;
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

  const renderHeaderBar = (compact: boolean) => {
    if (compact) {
      const compactText = headerBrand || headerSub;
      if (!compactText) return null;
      return (
        <div
          style={{ paddingBottom: "0.3mm" }}
          className="flex min-w-0 items-baseline justify-between gap-1 border-b border-black"
        >
          <span
            style={{
              fontSize: `${Math.max(3.2, layout.headerFontPt * 0.9)}pt`,
              lineHeight: 1.1,
            }}
            className="barcode-text-wrap min-w-0 font-bold tracking-tight uppercase"
          >
            {compactText}
          </span>
        </div>
      );
    }

    if (!headerBrand && !headerSub) return null;
    return (
      <div
        style={{ paddingBottom: "0.45mm" }}
        className="flex min-w-0 items-baseline justify-between gap-1 border-b border-black"
      >
        {headerBrand ? (
          <span
            style={{
              fontSize: `${layout.headerFontPt}pt`,
              lineHeight: 1.1,
            }}
            className="barcode-text-wrap min-w-0 font-bold tracking-tight uppercase"
          >
            {headerBrand}
          </span>
        ) : null}
        {headerSub ? (
          <span
            style={{
              fontSize: `${layout.headerSubFontPt}pt`,
              lineHeight: 1.1,
            }}
            className={cn(
              "font-semibold uppercase text-black/80",
              headerBrand ? "shrink-0" : "barcode-text-wrap min-w-0",
            )}
          >
            {headerSub}
          </span>
        ) : null}
      </div>
    );
  };

  const isTopBottom = layout.orientation === "TOP_BOTTOM";

  return (
    <div
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        padding: `${layout.padYMm}mm ${layout.padXMm}mm`,
      }}
      className={cn(
        "barcode-sticker-root box-border flex flex-col justify-between overflow-hidden bg-white text-black select-none",
        getStickerFrameClass(showCutBorder, content.showBorderFrame),
      )}
    >
      {/* Full-width Header (when layout allocates full-width header) */}
      {layout.headerFullWidth && hasHeader ? renderHeaderBar(false) : null}

      {/* Pure QR Only (ALL_OFF or HEADER_ONLY) */}
      {layout.orientation === "QR_ONLY" && (
        <div
          style={{ marginTop: layout.headerFullWidth ? "0.45mm" : 0 }}
          className="flex min-h-0 flex-1 items-center justify-center"
        >
          <QrVectorBox
            value={qrPayload}
            sizeMm={layout.qrSizeMm}
            level={content.qrErrorLevel}
            marginSize={content.qrQuietZone}
          />
        </div>
      )}

      {/* SIDE_BY_SIDE: Full-height left QR + stacked adaptive right text column */}
      {layout.orientation === "SIDE_BY_SIDE" && (
        <div
          style={{
            gap: `${layout.gapMm}mm`,
            marginTop: layout.headerFullWidth ? "0.45mm" : 0,
          }}
          className="flex min-h-0 flex-1 items-center"
        >
          <QrVectorBox
            value={qrPayload}
            sizeMm={layout.qrSizeMm}
            level={content.qrErrorLevel}
            marginSize={content.qrQuietZone}
          />

          <div
            style={{
              width: `${layout.textBoxWidthMm}mm`,
              height: "100%",
            }}
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              hasSideUpperContent && hasBottomMeta
                ? "justify-between"
                : "justify-center",
            )}
          >
            {/* Top group: inline header (if not full-width) + Title + Category */}
            {((!layout.headerFullWidth && hasHeader) || hasTitle || hasCategory) && (
              <div className="min-w-0 space-y-[0.35mm]">
                {!layout.headerFullWidth && hasHeader
                  ? renderHeaderBar(true)
                  : null}

                {hasTitle && titleTypo && (
                  <div
                    style={{
                      fontSize: `${titleTypo.fontSizePt}pt`,
                      lineHeight: titleTypo.lineHeight,
                    }}
                    className="barcode-text-wrap font-bold text-black"
                    title={record.title}
                  >
                    {insertSoftBreakOpportunities(record.title)}
                  </div>
                )}

                {hasCategory && categoryTypo && (
                  <div
                    style={{
                      fontSize: `${categoryTypo.fontSizePt}pt`,
                      lineHeight: categoryTypo.lineHeight,
                    }}
                    className="barcode-text-wrap text-black/80"
                  >
                    {insertSoftBreakOpportunities(record.category)}
                  </div>
                )}
              </div>
            )}

            {/* Middle: Monospace Code */}
            {hasCodeText && codeTypo && (
              <div
                style={{
                  fontSize: `${codeTypo.fontSizePt}pt`,
                  lineHeight: codeTypo.lineHeight,
                }}
                className="barcode-text-wrap my-[0.25mm] font-mono font-bold tracking-tight text-black"
              >
                {insertSoftBreakOpportunities(record.code)}
              </div>
            )}

            {/* Bottom group: Location, Counter/Digital, Status, Scan Hint */}
            {hasBottomMeta && (
              <div
                className={cn(
                  "min-w-0 space-y-[0.25mm]",
                  hasSideUpperContent && "border-t border-black/40 pt-[0.35mm]",
                )}
              >
                {hasLocation && locationTypo && (
                  <div
                    style={{
                      fontSize: `${locationTypo.fontSizePt}pt`,
                      lineHeight: locationTypo.lineHeight,
                    }}
                    className="barcode-text-wrap text-black/85"
                    title={record.locationDisplay}
                  >
                    {insertSoftBreakOpportunities(record.locationDisplay)}
                  </div>
                )}

                {hasCounterLine && counterLine && counterTypo && (
                  <div
                    style={{
                      fontSize: `${counterTypo.fontSizePt}pt`,
                      lineHeight: counterTypo.lineHeight,
                    }}
                    className="barcode-text-wrap font-semibold text-black"
                  >
                    {insertSoftBreakOpportunities(counterLine)}
                  </div>
                )}

                {(hasScanHint || hasStatusTag) && (
                  <div className="flex flex-wrap items-center justify-between gap-[0.5mm]">
                    {hasScanHint && scanHintTypo && (
                      <span
                        style={{
                          fontSize: `${scanHintTypo.fontSizePt}pt`,
                          lineHeight: scanHintTypo.lineHeight,
                        }}
                        className="barcode-text-wrap text-black/75"
                      >
                        {scanHintText}
                      </span>
                    )}
                    {hasStatusTag && record.statusTag && (
                      <span
                        style={{
                          fontSize: `${layout.statusFontPt}pt`,
                          lineHeight: 1.05,
                        }}
                        className="shrink-0 border border-black px-[0.6mm] py-[0.1mm] font-bold uppercase"
                      >
                        {record.statusTag}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOP_BOTTOM: Centered giant QR on top + centered adaptive text stack below */}
      {isTopBottom && (
        <div
          style={{
            gap: hasBodyText ? `${layout.gapMm}mm` : 0,
            marginTop: layout.headerFullWidth ? "0.45mm" : 0,
          }}
          className="flex min-h-0 flex-1 flex-col items-center justify-center"
        >
          <QrVectorBox
            value={qrPayload}
            sizeMm={layout.qrSizeMm}
            level={content.qrErrorLevel}
            marginSize={content.qrQuietZone}
          />

          {hasBodyText && (
            <div
              style={{ width: `${layout.textBoxWidthMm}mm` }}
              className="flex min-w-0 flex-col items-center gap-[0.25mm] text-center"
            >
              {hasTitle && titleTypo && (
                <div
                  style={{
                    fontSize: `${titleTypo.fontSizePt}pt`,
                    lineHeight: titleTypo.lineHeight,
                  }}
                  className="barcode-text-wrap w-full font-bold text-black"
                  title={record.title}
                >
                  {insertSoftBreakOpportunities(record.title)}
                </div>
              )}

              {hasCategory && categoryTypo && (
                <div
                  style={{
                    fontSize: `${categoryTypo.fontSizePt}pt`,
                    lineHeight: categoryTypo.lineHeight,
                  }}
                  className="barcode-text-wrap w-full text-black/80"
                >
                  {insertSoftBreakOpportunities(record.category)}
                </div>
              )}

              {hasCodeText && codeTypo && (
                <div
                  style={{
                    fontSize: `${codeTypo.fontSizePt}pt`,
                    lineHeight: codeTypo.lineHeight,
                  }}
                  className="barcode-text-wrap w-full font-mono font-bold tracking-tight text-black"
                >
                  {insertSoftBreakOpportunities(record.code)}
                </div>
              )}

              {hasLocation && locationTypo && (
                <div
                  style={{
                    fontSize: `${locationTypo.fontSizePt}pt`,
                    lineHeight: locationTypo.lineHeight,
                  }}
                  className="barcode-text-wrap w-full text-black/85"
                  title={record.locationDisplay}
                >
                  {insertSoftBreakOpportunities(record.locationDisplay)}
                </div>
              )}

              {hasCounterLine && counterLine && counterTypo && (
                <div
                  style={{
                    fontSize: `${counterTypo.fontSizePt}pt`,
                    lineHeight: counterTypo.lineHeight,
                  }}
                  className="barcode-text-wrap w-full font-semibold text-black"
                >
                  {insertSoftBreakOpportunities(counterLine)}
                </div>
              )}

              {(hasScanHint || hasStatusTag) && (
                <div className="flex flex-wrap items-center justify-center gap-[0.8mm]">
                  {hasScanHint && scanHintTypo && (
                    <span
                      style={{
                        fontSize: `${scanHintTypo.fontSizePt}pt`,
                        lineHeight: scanHintTypo.lineHeight,
                      }}
                      className="barcode-text-wrap text-black/75"
                    >
                      {scanHintText}
                    </span>
                  )}
                  {hasStatusTag && record.statusTag && (
                    <span
                      style={{
                        fontSize: `${layout.statusFontPt}pt`,
                        lineHeight: 1.05,
                      }}
                      className="shrink-0 border border-black px-[0.6mm] py-[0.1mm] font-bold uppercase"
                    >
                      {record.statusTag}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinearCompactSticker({
  record,
  widthMm,
  heightMm,
  symbology,
  qrPayload,
  content,
  showCutBorder,
}: {
  record: PrintableLabelRecord;
  widthMm: number;
  heightMm: number;
  symbology: "CODE128" | "COMBO";
  qrPayload: string;
  content: LabelContentSettings;
  showCutBorder: boolean;
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
    <div
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        padding: `${layout.padYMm}mm ${layout.padXMm}mm`,
      }}
      className={cn(
        "barcode-sticker-root box-border flex flex-col justify-between overflow-hidden bg-white text-black select-none",
        getStickerFrameClass(showCutBorder, content.showBorderFrame),
      )}
    >
      {/* 1. Header */}
      {hasHeader && (
        <div className="flex min-w-0 items-baseline justify-between gap-1 border-b border-black pb-[0.4mm]">
          {headerBrand ? (
            <span
              style={{ fontSize: `${layout.headerFontPt}pt`, lineHeight: 1.1 }}
              className="barcode-text-wrap min-w-0 font-bold tracking-tight uppercase"
            >
              {headerBrand}
            </span>
          ) : null}
          {headerSub ? (
            <span
              style={{ fontSize: `${layout.headerSubFontPt}pt`, lineHeight: 1.1 }}
              className={cn(
                "font-semibold uppercase text-black/80",
                headerBrand ? "shrink-0" : "barcode-text-wrap min-w-0",
              )}
            >
              {headerSub}
            </span>
          ) : null}
        </div>
      )}

      {/* 2. Title & Category (NEVER truncated!) */}
      {(hasTitle || hasCategory) && (
        <div className="min-w-0 pt-[0.35mm]">
          {hasTitle && titleTypo && (
            <div
              style={{
                fontSize: `${titleTypo.fontSizePt}pt`,
                lineHeight: titleTypo.lineHeight,
              }}
              className="barcode-text-wrap font-bold text-black"
              title={record.title}
            >
              {insertSoftBreakOpportunities(record.title)}
            </div>
          )}
          {hasCategory && (
            <div
              style={{
                fontSize: `${layout.categoryFontPt}pt`,
                lineHeight: 1.12,
              }}
              className="barcode-text-wrap text-black/80"
            >
              {insertSoftBreakOpportunities(record.category)}
            </div>
          )}
        </div>
      )}

      {/* 3 & 4. Barcode / Combo + Monospace Code */}
      <div className="my-[0.35mm] flex min-h-0 flex-1 items-center justify-center">
        {symbology === "CODE128" ? (
          <div className="flex w-full flex-col items-center justify-center">
            <Code128Svg code={record.code} heightMm={layout.barcodeHeightMm} />
            {hasCodeText && codeTypo && (
              <span
                style={{
                  fontSize: `${codeTypo.fontSizePt}pt`,
                  lineHeight: codeTypo.lineHeight,
                }}
                className="barcode-text-wrap mt-[0.35mm] w-full text-center font-mono font-bold tracking-wider"
              >
                {insertSoftBreakOpportunities(record.code)}
              </span>
            )}
          </div>
        ) : (
          <div
            style={{ gap: `${layout.comboGapMm}mm` }}
            className="flex w-full items-center"
          >
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
              <Code128Svg
                code={record.code}
                heightMm={layout.barcodeHeightMm}
              />
              {hasCodeText && codeTypo && (
                <span
                  style={{
                    fontSize: `${codeTypo.fontSizePt}pt`,
                    lineHeight: codeTypo.lineHeight,
                  }}
                  className="barcode-text-wrap mt-[0.3mm] w-full text-center font-mono font-bold tracking-tight"
                >
                  {insertSoftBreakOpportunities(record.code)}
                </span>
              )}
            </div>
            <QrVectorBox
              value={qrPayload}
              sizeMm={layout.comboQrSizeMm}
              level={content.qrErrorLevel}
              marginSize={content.qrQuietZone}
            />
          </div>
        )}
      </div>

      {/* 5 & 6. Location & Optional Counter / Archive Digital Indicator */}
      {hasFooter && (
        <div className="min-w-0 border-t border-black/45 pt-[0.35mm]">
          {hasLocation && locationTypo && (
            <div
              style={{
                fontSize: `${locationTypo.fontSizePt}pt`,
                lineHeight: locationTypo.lineHeight,
              }}
              className="barcode-text-wrap text-black/85"
              title={record.locationDisplay}
            >
              {insertSoftBreakOpportunities(record.locationDisplay)}
            </div>
          )}
          {(hasCounterLine || hasStatusTag) && (
            <div
              style={{ fontSize: `${layout.metaFontPt}pt`, lineHeight: 1.15 }}
              className="flex flex-wrap items-center justify-between gap-1 font-semibold"
            >
              {hasCounterLine && counterLine ? (
                <span className="barcode-text-wrap min-w-0">
                  {insertSoftBreakOpportunities(counterLine)}
                </span>
              ) : (
                <span />
              )}
              {hasStatusTag && record.statusTag && (
                <span
                  style={{ fontSize: `${layout.statusFontPt}pt` }}
                  className="shrink-0 font-bold uppercase"
                >
                  [{record.statusTag}]
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SpineLabelCard({
  record,
  symbology,
  spineSize,
  qrPayload,
  content,
  showCutBorder,
}: {
  record: PrintableLabelRecord;
  symbology: SymbologyMode;
  spineSize: SpineSizeId;
  qrPayload: string;
  content: LabelContentSettings;
  showCutBorder: boolean;
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

  return (
    <div
      style={{
        width: `${layout.spec.widthMm}mm`,
        height: `${layout.spec.heightMm}mm`,
        padding: `${layout.padYMm}mm ${layout.padXMm}mm`,
        gap: `${layout.gapMm}mm`,
      }}
      className={cn(
        "barcode-sticker-root box-border flex items-stretch overflow-hidden bg-white text-black select-none",
        !hasLeftPillar && !hasMiddleText && "justify-center",
        getStickerFrameClass(showCutBorder, content.showBorderFrame),
      )}
    >
      {/* Left Brand + Location Code Pillar */}
      {hasLeftPillar && (
        <div
          style={{
            width: `${layout.leftPillarWidthMm}mm`,
            paddingRight: `${Math.max(1.4, layout.gapMm * 0.8)}mm`,
          }}
          className="flex shrink-0 flex-col justify-between border-r border-black"
        >
          {hasBrand ? (
            <div
              style={{ fontSize: `${layout.brandFontPt}pt`, lineHeight: 1.12 }}
              className="barcode-text-wrap font-bold tracking-tight uppercase"
            >
              {headerBrand}
            </div>
          ) : (
            <div />
          )}

          {content.showLocation && (
            <div
              style={{ fontSize: `${layout.locationBadgeFontPt}pt` }}
              className="my-auto flex items-center justify-center rounded-[1mm] bg-black px-[1.2mm] py-[0.8mm] text-center font-bold tracking-wide text-white leading-none"
            >
              {record.locationCode}
            </div>
          )}

          {headerSub ? (
            <div
              style={{ fontSize: `${layout.headerSubFontPt}pt`, lineHeight: 1.1 }}
              className="barcode-text-wrap font-semibold uppercase text-black/80"
            >
              {headerSub}
            </div>
          ) : (
            <div />
          )}
        </div>
      )}

      {/* Middle Anatomy Block — NEVER truncated title; omitted when no middle text */}
      {hasMiddleText && (
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col py-[0.15mm]",
            hasMiddleUpper && hasMiddleFooter
              ? "justify-between"
              : "justify-center",
          )}
        >
          {(hasCategory || hasStatusTag || hasTitle) && (
            <div className="min-w-0">
              {(hasCategory || hasStatusTag) && (
                <div className="flex items-center justify-between gap-2">
                  {hasCategory ? (
                    <span
                      style={{
                        fontSize: `${layout.categoryFontPt}pt`,
                        lineHeight: 1.12,
                      }}
                      className="barcode-text-wrap min-w-0 font-semibold uppercase text-black/75"
                    >
                      {insertSoftBreakOpportunities(record.category)}
                    </span>
                  ) : (
                    <span />
                  )}
                  {hasStatusTag && record.statusTag && (
                    <span
                      style={{ fontSize: `${layout.statusFontPt}pt` }}
                      className="shrink-0 border border-black px-[1mm] py-[0.15mm] font-bold uppercase leading-none"
                    >
                      {record.statusTag}
                    </span>
                  )}
                </div>
              )}

              {hasTitle && titleTypo && (
                <div
                  style={{
                    fontSize: `${titleTypo.fontSizePt}pt`,
                    lineHeight: titleTypo.lineHeight,
                  }}
                  className="barcode-text-wrap mt-[0.3mm] font-bold text-black"
                  title={record.title}
                >
                  {insertSoftBreakOpportunities(record.title)}
                </div>
              )}
            </div>
          )}

          {hasCodeText && codeTypo && (
            <div
              style={{
                fontSize: `${codeTypo.fontSizePt}pt`,
                lineHeight: codeTypo.lineHeight,
              }}
              className="barcode-text-wrap font-mono font-bold tracking-wider text-black"
            >
              {insertSoftBreakOpportunities(record.code)}
            </div>
          )}

          {hasMiddleFooter && (
            <div
              className={cn(
                "min-w-0",
                hasMiddleUpper && "border-t border-black/40 pt-[0.55mm]",
              )}
            >
              {hasLocation && locationTypo && (
                <div
                  style={{
                    fontSize: `${locationTypo.fontSizePt}pt`,
                    lineHeight: locationTypo.lineHeight,
                  }}
                  className="barcode-text-wrap text-black/85"
                >
                  {insertSoftBreakOpportunities(record.locationDisplay)}
                </div>
              )}
              {hasCounterLine && counterLine && (
                <div
                  style={{ fontSize: `${layout.metaFontPt}pt`, lineHeight: 1.15 }}
                  className="barcode-text-wrap font-semibold text-black"
                >
                  {insertSoftBreakOpportunities(counterLine)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Right Symbology Block (centered cleanly when all text toggles are OFF) */}
      <div
        style={{
          gap: `${layout.gapMm}mm`,
          paddingLeft: hasMiddleText ? `${layout.gapMm}mm` : 0,
        }}
        className={cn(
          "flex items-center",
          hasMiddleText
            ? "shrink-0 justify-end border-l border-black/25"
            : "flex-1 justify-center",
        )}
      >
        {(symbology === "CODE128" || symbology === "COMBO") && (
          <div
            className="flex flex-col items-center justify-center"
            style={{ width: `${layout.barcodeWidthMm}mm` }}
          >
            <Code128Svg code={record.code} heightMm={layout.barcodeHeightMm} />
            {hasCodeText && (
              <span
                style={{
                  fontSize: `${Math.max(4.6, layout.metaFontPt * 1.05)}pt`,
                }}
                className="barcode-text-wrap mt-[0.6mm] w-full text-center font-mono font-bold tracking-wider leading-none"
              >
                {insertSoftBreakOpportunities(record.code)}
              </span>
            )}
          </div>
        )}

        {(symbology === "QR" || symbology === "COMBO") && (
          <div className="flex flex-col items-center justify-center">
            <QrVectorBox
              value={qrPayload}
              sizeMm={layout.qrSizeMm}
              level={content.qrErrorLevel}
              marginSize={content.qrQuietZone}
            />
            {symbology === "QR" && hasScanHint && (
              <span
                style={{
                  fontSize: `${layout.hintFontPt}pt`,
                  maxWidth: `${layout.qrSizeMm + 2}mm`,
                }}
                className="barcode-text-wrap mt-[0.45mm] text-center font-medium leading-tight text-black/75"
              >
                {scanHintText}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders a single print-accurate Star Champs sticker with adaptive non-truncating
 * typography and dynamic sizing across all Thermal, A4 Grid, and Spine templates.
 */
export function LabelSticker({
  record,
  template,
  thermalSize,
  symbology,
  origin,
  showCutBorder = false,
  content,
  customThermalSize,
  a4Preset = "TJ_121_24",
  spineSize = "150x35",
}: LabelStickerProps) {
  const resolvedContent = React.useMemo(
    () => normalizeLabelContentSettings(content),
    [content],
  );
  const qrPayload = buildQrPayload(record, origin, resolvedContent.qrPayloadMode);

  if (template === "ARCHIVE_SPINE") {
    return (
      <SpineLabelCard
        record={record}
        symbology={symbology}
        spineSize={spineSize}
        qrPayload={qrPayload}
        content={resolvedContent}
        showCutBorder={showCutBorder}
      />
    );
  }

  const dims =
    template === "A4_GRID"
      ? (() => {
          const spec = A4_GRID_PRESETS[a4Preset] ?? A4_GRID_SPEC;
          return { widthMm: spec.labelWidthMm, heightMm: spec.labelHeightMm };
        })()
      : resolveThermalDimensions(thermalSize, customThermalSize);

  if (symbology === "QR") {
    return (
      <QrCompactSticker
        record={record}
        widthMm={dims.widthMm}
        heightMm={dims.heightMm}
        qrPayload={qrPayload}
        content={resolvedContent}
        showCutBorder={showCutBorder}
      />
    );
  }

  return (
    <LinearCompactSticker
      record={record}
      widthMm={dims.widthMm}
      heightMm={dims.heightMm}
      symbology={symbology}
      qrPayload={qrPayload}
      content={resolvedContent}
      showCutBorder={showCutBorder}
    />
  );
}

export type PrintableSheetDocumentProps = {
  pages: Array<Array<PrintableLabelRecord | null>>;
  template: LabelTemplateId;
  thermalSize: ThermalSizeId;
  spinePaperMode: SpinePaperMode;
  symbology: SymbologyMode;
  origin: string;
  mode: "preview" | "print";
  previewPageIndex?: number;
  content?: LabelContentSettings;
  customThermalSize?: CustomThermalSize;
  a4Preset?: A4GridPresetId;
  spineSize?: SpineSizeId;
};

/**
 * Renders paginated label pages for either on-screen live preview (single active
 * page) or native `window.print()` output (all pages at exact physical mm size).
 */
export function PrintableSheetDocument({
  pages,
  template,
  thermalSize,
  spinePaperMode,
  symbology,
  origin,
  mode,
  previewPageIndex = 0,
  content,
  customThermalSize,
  a4Preset = "TJ_121_24",
  spineSize = "150x35",
}: PrintableSheetDocumentProps) {
  const resolvedContent = React.useMemo(
    () => normalizeLabelContentSettings(content),
    [content],
  );

  const visiblePages =
    mode === "preview"
      ? pages.slice(previewPageIndex, previewPageIndex + 1)
      : pages;

  if (visiblePages.length === 0) return null;

  const a4Spec = A4_GRID_PRESETS[a4Preset] ?? A4_GRID_SPEC;
  const spineSpec = SPINE_SIZES[spineSize] ?? SPINE_LABEL_SPEC;
  const thermalDims = resolveThermalDimensions(thermalSize, customThermalSize);

  return (
    <>
      {visiblePages.map((slots, idx) => {
        const isLast = idx === visiblePages.length - 1;
        const pageBreakClass =
          mode === "print"
            ? isLast
              ? "barcode-print-page barcode-print-page--last"
              : "barcode-print-page barcode-print-page--break"
            : "shadow-md ring-1 ring-black/10";

        if (template === "THERMAL") {
          const record = slots[0];
          if (!record) return null;
          return (
            <div
              key={`thermal-${idx}`}
              style={{
                width: `${thermalDims.widthMm}mm`,
                height: `${thermalDims.heightMm}mm`,
              }}
              className={cn("bg-white", pageBreakClass)}
            >
              <LabelSticker
                record={record}
                template="THERMAL"
                thermalSize={thermalSize}
                customThermalSize={customThermalSize}
                symbology={symbology}
                origin={origin}
                content={resolvedContent}
              />
            </div>
          );
        }

        if (template === "A4_GRID") {
          return (
            <div
              key={`a4-${idx}`}
              style={{
                width: `${a4Spec.pageWidthMm}mm`,
                height: `${a4Spec.pageHeightMm}mm`,
                padding: `${a4Spec.marginTopMm}mm ${a4Spec.marginSideMm}mm 3mm ${a4Spec.marginSideMm}mm`,
              }}
              className={cn("box-border bg-white", pageBreakClass)}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${a4Spec.cols}, ${a4Spec.labelWidthMm}mm)`,
                  gridTemplateRows: `repeat(${a4Spec.rows}, ${a4Spec.labelHeightMm}mm)`,
                  columnGap: `${a4Spec.gapXMm}mm`,
                  rowGap: `${a4Spec.gapYMm}mm`,
                }}
              >
                {slots.map((slot, slotIdx) =>
                  slot ? (
                    <LabelSticker
                      key={`${slot.key}-${slotIdx}`}
                      record={slot}
                      template="A4_GRID"
                      thermalSize={thermalSize}
                      customThermalSize={customThermalSize}
                      a4Preset={a4Preset}
                      symbology={symbology}
                      origin={origin}
                      content={resolvedContent}
                      showCutBorder
                    />
                  ) : (
                    <div
                      key={`empty-${slotIdx}`}
                      style={{
                        width: `${a4Spec.labelWidthMm}mm`,
                        height: `${a4Spec.labelHeightMm}mm`,
                      }}
                      className={cn(
                        "box-border",
                        mode === "preview"
                          ? "flex items-center justify-center border border-dashed border-slate-200 text-[6pt] text-slate-300"
                          : "border-0",
                      )}
                    >
                      {mode === "preview" ? "Slot Kosong" : null}
                    </div>
                  ),
                )}
              </div>
            </div>
          );
        }

        // ARCHIVE_SPINE
        if (spinePaperMode === "CUSTOM_SINGLE") {
          const record = slots[0];
          if (!record) return null;
          return (
            <div
              key={`spine-single-${idx}`}
              style={{
                width: `${spineSpec.widthMm}mm`,
                height: `${spineSpec.heightMm}mm`,
              }}
              className={cn("bg-white", pageBreakClass)}
            >
              <LabelSticker
                record={record}
                template="ARCHIVE_SPINE"
                thermalSize={thermalSize}
                spineSize={spineSize}
                symbology={symbology}
                origin={origin}
                content={resolvedContent}
              />
            </div>
          );
        }

        return (
          <div
            key={`spine-a4-${idx}`}
            style={{
              width: `${spineSpec.a4PageWidthMm}mm`,
              height: `${spineSpec.a4PageHeightMm}mm`,
              padding: `${spineSpec.a4MarginTopMm}mm ${spineSpec.a4MarginSideMm}mm 3mm ${spineSpec.a4MarginSideMm}mm`,
            }}
            className={cn("box-border bg-white", pageBreakClass)}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: `${spineSpec.a4GapYMm}mm`,
              }}
            >
              {slots.map((slot, slotIdx) =>
                slot ? (
                  <LabelSticker
                    key={`${slot.key}-${slotIdx}`}
                    record={slot}
                    template="ARCHIVE_SPINE"
                    thermalSize={thermalSize}
                    spineSize={spineSize}
                    symbology={symbology}
                    origin={origin}
                    content={resolvedContent}
                    showCutBorder
                  />
                ) : null,
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
