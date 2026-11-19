import { NextRequest, NextResponse } from "next/server";

import {
  FINANCIAL_ONLY_SCOPES,
  generateCsvString,
  loadExportDataset,
  type ExportScope,
} from "@/lib/exports/csv";
import { generatePdfBuffer } from "@/lib/exports/pdf";
import { generateXlsxBuffer } from "@/lib/exports/xlsx";
import { can, isRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";

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
      { error: "Akses ditolak: Anda tidak memiliki izin export.data." },
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

  const periodParam = request.nextUrl.searchParams.get("period") ?? undefined;
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

    await supabase.from("audit_logs").insert({
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

    if (format === "csv") {
      const csv = generateCsvString(dataset, scope);
      const filename = `starops-${scope}-${dataset.periodCode}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "xlsx") {
      const buffer = await generateXlsxBuffer(dataset);
      const filename = `starops-laporan-${dataset.periodCode}.xlsx`;
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const pdfBuffer = await generatePdfBuffer(dataset);
    const filename = `starops-laporan-bulanan-${dataset.periodCode}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal memproses ekspor data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
