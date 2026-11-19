"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";

import {
  A4_GRID_SPEC,
  SPINE_LABEL_SPEC,
  THERMAL_SIZES,
  buildQrTargetUrl,
  encodeCode128Vector,
  type LabelTemplateId,
  type PrintableLabelRecord,
  type SpinePaperMode,
  type SymbologyMode,
  type ThermalSizeId,
} from "@/lib/barcode";
import { cn } from "@/lib/utils";

function Code128Svg({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const encoded = React.useMemo(() => encodeCode128Vector(code, 3), [code]);

  if (!encoded.valid) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border border-dashed border-black/40 text-[5.5pt] text-black/60",
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
      className={cn("block bg-white text-black", className)}
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
  className,
}: {
  value: string;
  sizeMm: number;
  className?: string;
}) {
  return (
    <div
      style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
      className={cn("shrink-0 bg-white", className)}
    >
      <QRCodeSVG
        value={value}
        size={128}
        level="M"
        marginSize={1}
        bgColor="#ffffff"
        fgColor="#000000"
        className="block h-full w-full"
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
};

/**
 * Renders a single print-accurate Star Champs sticker following the exact
 * PRD Section 3.2 anatomy:
 * 1. Header: STAR CHAMPS INDONESIA + module subtitle
 * 2. Item Name & Category
 * 3. Vector Code-128 Barcode and/or QR Code
 * 4. Monospace Item Code
 * 5. Room/Cabinet & Rack/Drawer Location
 * 6. Part Counter or Archive Digital Indicator
 */
export function LabelSticker({
  record,
  template,
  thermalSize,
  symbology,
  origin,
  showCutBorder = false,
}: LabelStickerProps) {
  const qrUrl = buildQrTargetUrl(record, origin);

  if (template === "ARCHIVE_SPINE") {
    return (
      <SpineLabelCard
        record={record}
        symbology={symbology}
        qrUrl={qrUrl}
        showCutBorder={showCutBorder}
      />
    );
  }

  const isCompact40 = template === "THERMAL" && thermalSize === "40x30";
  const isA4Grid = template === "A4_GRID";

  const widthMm = isA4Grid
    ? A4_GRID_SPEC.labelWidthMm
    : THERMAL_SIZES[thermalSize].widthMm;
  const heightMm = isA4Grid
    ? A4_GRID_SPEC.labelHeightMm
    : THERMAL_SIZES[thermalSize].heightMm;

  const qrOnlyMm = isCompact40 ? 11.5 : isA4Grid ? 14 : 12.5;
  const qrComboMm = isCompact40 ? 9.5 : isA4Grid ? 12.5 : 10.5;

  return (
    <div
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        padding: isCompact40 ? "1.3mm 1.5mm" : isA4Grid ? "1.8mm 2mm" : "1.5mm 1.8mm",
      }}
      className={cn(
        "box-border flex flex-col justify-between overflow-hidden bg-white text-black select-none",
        showCutBorder
          ? "border-[0.75pt] border-dashed border-slate-500"
          : "border border-black/15 print:border-0",
      )}
    >
      {/* 1. Header */}
      <div className="flex items-baseline justify-between gap-1 border-b border-black pb-[0.5mm]">
        <span
          className={cn(
            "truncate font-bold tracking-tight uppercase",
            isCompact40 ? "text-[4.8pt]" : isA4Grid ? "text-[5.8pt]" : "text-[5.2pt]",
          )}
        >
          STAR CHAMPS INDONESIA
        </span>
        <span
          className={cn(
            "shrink-0 font-semibold uppercase text-black/80",
            isCompact40 ? "text-[4pt]" : "text-[4.6pt]",
          )}
        >
          {record.headerSubtitle}
        </span>
      </div>

      {/* 2. Item Name & Category */}
      <div className="min-w-0 pt-[0.5mm]">
        <div
          className={cn(
            "truncate font-bold leading-[1.15]",
            isCompact40 ? "text-[6pt]" : isA4Grid ? "text-[7.2pt]" : "text-[6.5pt]",
          )}
          title={record.title}
        >
          {record.title}
        </div>
        <div
          className={cn(
            "truncate leading-[1.1] text-black/80",
            isCompact40 ? "text-[4.6pt]" : isA4Grid ? "text-[5.5pt]" : "text-[5pt]",
          )}
        >
          {record.category}
        </div>
      </div>

      {/* 3 & 4. Barcode / QR + Monospace Code */}
      <div className="my-[0.4mm] flex min-h-0 flex-1 items-center justify-center">
        {symbology === "CODE128" && (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <Code128Svg
              code={record.code}
              className={cn(
                "w-full",
                isCompact40 ? "h-[7.8mm]" : isA4Grid ? "h-[9.5mm]" : "h-[8.5mm]",
              )}
            />
            <span
              className={cn(
                "mt-[0.4mm] font-mono font-bold tracking-wider leading-none",
                isCompact40 ? "text-[5.8pt]" : isA4Grid ? "text-[7.2pt]" : "text-[6.5pt]",
              )}
            >
              {record.code}
            </span>
          </div>
        )}

        {symbology === "QR" && (
          <div className="flex w-full items-center gap-[1.8mm]">
            <QrVectorBox value={qrUrl} sizeMm={qrOnlyMm} />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-[0.5mm]">
              <span
                className={cn(
                  "break-all font-mono font-bold leading-tight",
                  isCompact40 ? "text-[5.6pt]" : isA4Grid ? "text-[7pt]" : "text-[6.2pt]",
                )}
              >
                {record.code}
              </span>
              <span
                className={cn(
                  "leading-tight text-black/75",
                  isCompact40 ? "text-[4.2pt]" : "text-[4.8pt]",
                )}
              >
                Scan QR untuk buka detail
              </span>
              {record.statusTag && (
                <span className="w-fit border border-black px-[0.8mm] py-[0.1mm] text-[4.2pt] font-bold uppercase leading-tight">
                  {record.statusTag}
                </span>
              )}
            </div>
          </div>
        )}

        {symbology === "COMBO" && (
          <div className="flex w-full items-center gap-[1.4mm]">
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
              <Code128Svg
                code={record.code}
                className={cn(
                  "w-full",
                  isCompact40 ? "h-[7.2mm]" : isA4Grid ? "h-[9mm]" : "h-[8mm]",
                )}
              />
              <span
                className={cn(
                  "mt-[0.35mm] max-w-full truncate font-mono font-bold tracking-tight leading-none",
                  isCompact40 ? "text-[5.2pt]" : isA4Grid ? "text-[6.6pt]" : "text-[5.8pt]",
                )}
              >
                {record.code}
              </span>
            </div>
            <QrVectorBox value={qrUrl} sizeMm={qrComboMm} />
          </div>
        )}
      </div>

      {/* 5 & 6. Location & Part Counter / Archive Digital Indicator */}
      <div className="border-t border-black/45 pt-[0.45mm]">
        <div
          className={cn(
            "truncate leading-[1.15] text-black/85",
            isCompact40 ? "text-[4.4pt]" : isA4Grid ? "text-[5.3pt]" : "text-[4.8pt]",
          )}
          title={record.locationDisplay}
        >
          {record.locationDisplay}
        </div>
        <div
          className={cn(
            "flex items-center justify-between gap-1 truncate font-semibold leading-[1.15]",
            isCompact40 ? "text-[4.5pt]" : isA4Grid ? "text-[5.4pt]" : "text-[4.9pt]",
          )}
        >
          <span className="truncate">{record.counterOrIndicator}</span>
          {record.statusTag && symbology !== "QR" && (
            <span className="shrink-0 font-bold uppercase">[{record.statusTag}]</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SpineLabelCard({
  record,
  symbology,
  qrUrl,
  showCutBorder,
}: {
  record: PrintableLabelRecord;
  symbology: SymbologyMode;
  qrUrl: string;
  showCutBorder: boolean;
}) {
  return (
    <div
      style={{
        width: `${SPINE_LABEL_SPEC.widthMm}mm`,
        height: `${SPINE_LABEL_SPEC.heightMm}mm`,
        padding: "2mm 2.5mm",
      }}
      className={cn(
        "box-border flex items-stretch gap-[2.5mm] overflow-hidden bg-white text-black select-none",
        showCutBorder
          ? "border-[0.75pt] border-dashed border-slate-500"
          : "border border-black/20 print:border-0",
      )}
    >
      {/* Left Brand + Location Code Pillar */}
      <div className="flex w-[24mm] shrink-0 flex-col justify-between border-r border-black pr-[2mm]">
        <div>
          <div className="text-[5.2pt] font-bold leading-tight tracking-tight uppercase">
            STAR CHAMPS
          </div>
          <div className="text-[4.8pt] font-semibold leading-tight tracking-tight uppercase text-black/75">
            INDONESIA
          </div>
        </div>
        <div className="my-auto flex items-center justify-center rounded-[1mm] bg-black px-[1.5mm] py-[1mm] text-center text-[11pt] font-bold tracking-wide text-white">
          {record.locationCode}
        </div>
        <div className="truncate text-[4.5pt] font-semibold uppercase leading-tight text-black/80">
          {record.headerSubtitle}
        </div>
      </div>

      {/* Middle Anatomy Block */}
      <div className="flex min-w-0 flex-1 flex-col justify-between py-[0.2mm]">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[5.8pt] font-semibold uppercase text-black/75">
              {record.category}
            </span>
            {record.statusTag && (
              <span className="shrink-0 border border-black px-[1.2mm] py-[0.2mm] text-[5pt] font-bold uppercase leading-none">
                {record.statusTag}
              </span>
            )}
          </div>
          <div className="mt-[0.4mm] line-clamp-1 text-[9.5pt] font-bold leading-[1.15]">
            {record.title}
          </div>
        </div>

        <div className="font-mono text-[8.5pt] font-bold tracking-wider leading-none">
          {record.code}
        </div>

        <div className="border-t border-black/40 pt-[0.8mm]">
          <div className="truncate text-[6pt] leading-[1.2] text-black/85">
            {record.locationDisplay}
          </div>
          <div className="truncate text-[6pt] font-semibold leading-[1.2]">
            {record.counterOrIndicator}
          </div>
        </div>
      </div>

      {/* Right Symbology Block */}
      <div className="flex shrink-0 items-center justify-end gap-[2.2mm] border-l border-black/25 pl-[2.2mm]">
        {(symbology === "CODE128" || symbology === "COMBO") && (
          <div
            className="flex flex-col items-center justify-center"
            style={{ width: symbology === "CODE128" ? "46mm" : "36mm" }}
          >
            <Code128Svg code={record.code} className="h-[17mm] w-full" />
            <span className="mt-[0.8mm] font-mono text-[6.5pt] font-bold tracking-wider leading-none">
              {record.code}
            </span>
          </div>
        )}

        {(symbology === "QR" || symbology === "COMBO") && (
          <div className="flex flex-col items-center justify-center">
            <QrVectorBox
              value={qrUrl}
              sizeMm={symbology === "QR" ? 25 : 23}
            />
            {symbology === "QR" && (
              <span className="mt-[0.6mm] text-[5pt] font-medium text-black/75">
                Scan QR
              </span>
            )}
          </div>
        )}
      </div>
    </div>
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
}: PrintableSheetDocumentProps) {
  const visiblePages =
    mode === "preview"
      ? pages.slice(previewPageIndex, previewPageIndex + 1)
      : pages;

  if (visiblePages.length === 0) return null;

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
          const spec = THERMAL_SIZES[thermalSize];
          const record = slots[0];
          if (!record) return null;
          return (
            <div
              key={`thermal-${idx}`}
              style={{
                width: `${spec.widthMm}mm`,
                height: `${spec.heightMm}mm`,
              }}
              className={cn("bg-white", pageBreakClass)}
            >
              <LabelSticker
                record={record}
                template="THERMAL"
                thermalSize={thermalSize}
                symbology={symbology}
                origin={origin}
              />
            </div>
          );
        }

        if (template === "A4_GRID") {
          return (
            <div
              key={`a4-${idx}`}
              style={{
                width: `${A4_GRID_SPEC.pageWidthMm}mm`,
                height: `${A4_GRID_SPEC.pageHeightMm}mm`,
                padding: `${A4_GRID_SPEC.marginTopMm}mm ${A4_GRID_SPEC.marginSideMm}mm`,
              }}
              className={cn("box-border bg-white", pageBreakClass)}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${A4_GRID_SPEC.cols}, ${A4_GRID_SPEC.labelWidthMm}mm)`,
                  gridTemplateRows: `repeat(${A4_GRID_SPEC.rows}, ${A4_GRID_SPEC.labelHeightMm}mm)`,
                  columnGap: `${A4_GRID_SPEC.gapXMm}mm`,
                  rowGap: `${A4_GRID_SPEC.gapYMm}mm`,
                }}
              >
                {slots.map((slot, slotIdx) =>
                  slot ? (
                    <LabelSticker
                      key={`${slot.key}-${slotIdx}`}
                      record={slot}
                      template="A4_GRID"
                      thermalSize={thermalSize}
                      symbology={symbology}
                      origin={origin}
                      showCutBorder
                    />
                  ) : (
                    <div
                      key={`empty-${slotIdx}`}
                      style={{
                        width: `${A4_GRID_SPEC.labelWidthMm}mm`,
                        height: `${A4_GRID_SPEC.labelHeightMm}mm`,
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
                width: `${SPINE_LABEL_SPEC.widthMm}mm`,
                height: `${SPINE_LABEL_SPEC.heightMm}mm`,
              }}
              className={cn("bg-white", pageBreakClass)}
            >
              <LabelSticker
                record={record}
                template="ARCHIVE_SPINE"
                thermalSize={thermalSize}
                symbology={symbology}
                origin={origin}
              />
            </div>
          );
        }

        return (
          <div
            key={`spine-a4-${idx}`}
            style={{
              width: `${SPINE_LABEL_SPEC.a4PageWidthMm}mm`,
              height: `${SPINE_LABEL_SPEC.a4PageHeightMm}mm`,
              padding: `${SPINE_LABEL_SPEC.a4MarginTopMm}mm ${SPINE_LABEL_SPEC.a4MarginSideMm}mm`,
            }}
            className={cn("box-border bg-white", pageBreakClass)}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: `${SPINE_LABEL_SPEC.a4GapYMm}mm`,
              }}
            >
              {slots.map((slot, slotIdx) =>
                slot ? (
                  <LabelSticker
                    key={`${slot.key}-${slotIdx}`}
                    record={slot}
                    template="ARCHIVE_SPINE"
                    thermalSize={thermalSize}
                    symbology={symbology}
                    origin={origin}
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
