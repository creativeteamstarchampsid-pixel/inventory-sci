"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function generateCode128DataUrl(
  value: string,
  options?: { width?: number; height?: number; margin?: number },
): string {
  if (typeof document === "undefined" || !value.trim()) return "";
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    displayValue: false,
    width: options?.width ?? 2,
    height: options?.height ?? 56,
    margin: options?.margin ?? 4,
    background: "#ffffff",
    lineColor: "#0f172a",
  });
  return canvas.toDataURL("image/png");
}

export function DeliveryBarcode({
  value,
  height = 48,
  width = 1.6,
  displayValue = true,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value.trim()) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        displayValue,
        font: "monospace",
        fontSize: 11,
        textMargin: 4,
        height,
        width,
        margin: 4,
        background: "#ffffff",
        lineColor: "#0f172a",
      });
    } catch {
      // Fallback: ignore invalid barcode characters
    }
  }, [value, height, width, displayValue]);

  return (
    <svg
      ref={svgRef}
      aria-label={`Barcode ${value}`}
      className={className}
    />
  );
}
