import { NextRequest, NextResponse } from "next/server";

import {
  FINANCIAL_ONLY_SCOPES,
  generateCsvString,
  loadExportDataset,
  type ExportScope,
} from "@/lib/exports/csv";
import { can, isRole } from "@/lib/rbac";
import { isValidPeriodYm, sanitizeSafeError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { recordEgressTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_SCOPES = new Set<ExportScope>([
  "all",
  "inventory",
  "subscriptions",
  "archives",
  "deliveries",
  "anomalies",
  "audit",
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ format: string }> },
) {
  const { format: rawFormat } = await context.params;
  const format = rawFormat.toLowerCase();

  if (format !== "csv" && format !== "xlsx" && format !== "pdf") {
    return NextResponse.json(
      { error: "Format ekspor tidak didukung. Gunakan csv, xlsx, atau pdf." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Autentikasi diperlukan untuk mengunduh ekspor." },
      { status: 401 },
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    !profile.is_active ||
    !isRole(profile.role) ||
    !can(profile.role, "export.data")
  ) {
    return NextResponse.json(
      { error: "Akses ditolak: Anda tidak memiliki izin untuk mengekspor data." },
      { status: 403 },
    );
  }

  const canExportFinancial = can(profile.role, "export.financial");
  const rawScope = (request.nextUrl.searchParams.get("scope") ?? "all").toLowerCase();
  const scope: ExportScope = ALLOWED_SCOPES.has(rawScope as ExportScope)
    ? (rawScope as ExportScope)
    : "all";

  if (!canExportFinancial && FINANCIAL_ONLY_SCOPES.has(scope)) {
    return NextResponse.json(
      {
        error:
          "Akses ditolak: Ekspor cakupan ini hanya tersedia untuk Owner dan Admin Operasional.",
      },
      { status: 403 },
    );
  }

  const rawPeriod = request.nextUrl.searchParams.get("period")?.trim();
  if (rawPeriod && !isValidPeriodYm(rawPeriod)) {
    return NextResponse.json(
      { error: "Format periode tidak valid. Gunakan format YYYYMM atau YYYY-MM." },
      { status: 400 },
    );
  }
  const periodParam = rawPeriod || undefined;

  const actorName =
    profile.full_name?.trim() ||
    profile.email ||
    user.email?.split("@")[0] ||
    "Pengguna";

  try {
    const dataset = await loadExportDataset(supabase, {
      actorName,
      actorRole: profile.role,
      includeAudit: canExportFinancial && format === "csv" && scope === "audit",
      periodCode: periodParam,
    });

    try {
      const { error: auditError } = await supabase.from("audit_logs").insert({
        actor_id: profile.id,
        actor_name: actorName,
        actor_role: profile.role,
        action: "EXPORT_DATA",
        entity_type: "system_exports",
        entity_code: `${format.toUpperCase()}-${scope.toUpperCase()}`,
        summary: `Mengunduh ekspor ${format.toUpperCase()} (cakupan: ${scope}) periode ${dataset.periodCode}`,
        metadata: {
          format,
          scope,
          period_ym: dataset.periodCode,
        },
      });
      if (auditError) {
        console.error(
          "[api/exports] Failed to insert audit_logs entry:",
          auditError.message,
        );
      }
    } catch (auditErr) {
      console.error("[api/exports] Unexpected audit_logs error:", auditErr);
    }

    const safePeriod = isValidPeriodYm(dataset.periodCode)
      ? dataset.periodCode.trim()
      : "latest";

    if (format === "csv") {
      const csv = generateCsvString(dataset, scope);
      const byteLength = Buffer.byteLength(csv, "utf8");
      await recordEgressTelemetry({
        exportBytes: byteLength,
        dbBytes: Math.round(byteLength * 0.35),
        queries: 6,
      });
      const filename = `starops-${scope}-${safePeriod}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(byteLength),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (format === "xlsx") {
      const { generateXlsxBuffer } = await import("@/lib/exports/xlsx");
      const buffer = await generateXlsxBuffer(dataset);
      const bytes = new Uint8Array(buffer);
      await recordEgressTelemetry({
        exportBytes: bytes.byteLength,
        dbBytes: Math.round(bytes.byteLength * 0.35),
        queries: 6,
      });
      const filename = `starops-laporan-${safePeriod}.xlsx`;
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (format === "pdf") {
      const { generatePdfBuffer } = await import("@/lib/exports/pdf");
      const pdfBuffer = await generatePdfBuffer(dataset);
      const bytes = new Uint8Array(pdfBuffer);
      await recordEgressTelemetry({
        exportBytes: bytes.byteLength,
        dbBytes: Math.round(bytes.byteLength * 0.35),
        queries: 6,
      });
      const filename = `starops-laporan-bulanan-${safePeriod}.pdf`;
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return NextResponse.json(
      { error: "Format ekspor tidak didukung. Gunakan csv, xlsx, atau pdf." },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: sanitizeSafeError(
          err,
          "Gagal memproses ekspor data.",
          "api/exports",
        ),
      },
      { status: 500 },
    );
  }
}
