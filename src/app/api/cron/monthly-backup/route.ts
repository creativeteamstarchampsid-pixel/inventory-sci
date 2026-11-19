import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  captureFullBackupSnapshot,
  computeBackupDiffSummary,
  generateCsvString,
  loadExportDataset,
  persistBackupBundle,
} from "@/lib/exports/csv";
import { generatePdfBuffer } from "@/lib/exports/pdf";
import { generateXlsxBuffer } from "@/lib/exports/xlsx";
import { getMonthlyUpdatePeriod } from "@/lib/period";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BackupType, Json } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedCron(request: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 500,
      error: "CRON_SECRET belum dikonfigurasi pada environment server.",
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Unauthorized cron token." };
  }

  return { ok: true };
}

async function runCronJob(request: NextRequest) {
  const authCheck = isAuthorizedCron(request);
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi." },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const period = getMonthlyUpdatePeriod();
  const modeParam = request.nextUrl.searchParams.get("mode")?.toLowerCase();
  const force = request.nextUrl.searchParams.get("force") === "true";

  const actionsExecuted: string[] = [];
  const createdBackups: string[] = [];

  try {
    // 1. Always run 30-day Recycle Bin purge
    const { data: purgeResult, error: purgeErr } = await admin.rpc(
      "purge_expired_recycle_bin",
      { p_days: 30 },
    );
    if (purgeErr) {
      actionsExecuted.push(`purge_error: ${purgeErr.message}`);
    } else {
      actionsExecuted.push("purge_expired_recycle_bin(30)");
    }

    // 2. Auto-create monthly_reconciliations on Day 24+ (or forced mode)
    const shouldPrepareReconciliation =
      period.active || modeParam === "pre_update" || modeParam === "monthly_cutoff";

    if (shouldPrepareReconciliation) {
      const { error: upsertErr } = await admin
        .from("monthly_reconciliations")
        .upsert(
          { period_ym: period.periodCode },
          { onConflict: "period_ym", ignoreDuplicates: true },
        );
      if (!upsertErr) {
        actionsExecuted.push(`ensure_reconciliation(${period.periodCode})`);
      }
    }

    const createScheduledBackup = async (
      backupType: BackupType,
      baseCode: string,
      notes: string,
    ) => {
      const { data: existing } = await admin
        .from("system_backups")
        .select("id, backup_code")
        .eq("backup_code", baseCode)
        .maybeSingle();

      let finalCode = baseCode;
      if (existing) {
        if (!force) {
          actionsExecuted.push(`skip_existing(${baseCode})`);
          return null;
        }
        const { count } = await admin
          .from("system_backups")
          .select("id", { count: "exact", head: true })
          .eq("period_ym", period.periodCode)
          .eq("backup_type", backupType);
        finalCode = `${baseCode}-V${(count ?? 1) + 1}`;
      }

      const dataset = await loadExportDataset(admin, {
        actorName: "Sistem Cron",
        actorRole: "SYSTEM",
        isServiceRole: true,
        periodCode: period.periodCode,
      });

      const csvContent = generateCsvString(dataset, "all");
      const [xlsxBuffer, pdfBuffer, snapshot] = await Promise.all([
        generateXlsxBuffer(dataset),
        generatePdfBuffer(dataset),
        captureFullBackupSnapshot(admin, {
          backupCode: finalCode,
          backupType,
          periodYm: period.periodCode,
          actorId: null,
          actorName: "Sistem Cron",
          actorRole: "SYSTEM",
          notes,
        }),
      ]);

      const { diffSummary, rowCounts } = await computeBackupDiffSummary(
        admin,
        snapshot,
      );

      const { backup } = await persistBackupBundle(admin, {
        backupCode: finalCode,
        backupType,
        periodYm: period.periodCode,
        actorId: null,
        snapshot,
        diffSummary,
        rowCounts,
        csvContent,
        xlsxBuffer,
        pdfBuffer,
        notes,
      });

      createdBackups.push(backup.backup_code);
      actionsExecuted.push(`created_backup(${backup.backup_code})`);

      const { data: rec } = await admin
        .from("monthly_reconciliations")
        .select("id, locked_at")
        .eq("period_ym", period.periodCode)
        .maybeSingle();

      if (rec && !rec.locked_at) {
        await admin
          .from("monthly_reconciliations")
          .update(
            backupType === "PRE_UPDATE"
              ? { pre_update_backup_id: backup.id }
              : { final_backup_id: backup.id },
          )
          .eq("id", rec.id);
      }

      return backup;
    };

    // 3. Stage 2: Pre-Update Snapshot (Day 24+ if not yet created)
    if (
      modeParam === "pre_update" ||
      (period.day >= 24 && modeParam !== "monthly_cutoff")
    ) {
      await createScheduledBackup(
        "PRE_UPDATE",
        `BKP-PRE-${period.periodCode}`,
        `Pre-Update Snapshot otomatis periode ${period.periodLabel} (H-7 akhir bulan)`,
      );
    }

    // 4. Stage 3: Monthly Cut-Off Snapshot (Last Day of Month or explicit mode)
    if (modeParam === "monthly_cutoff" || period.day === period.lastDay) {
      await createScheduledBackup(
        "MONTHLY_CUTOFF",
        `BKP-FINAL-${period.periodCode}`,
        `Cut-Off Snapshot akhir bulan otomatis periode ${period.periodLabel}`,
      );
    }

    await admin.from("audit_logs").insert({
      actor_id: null,
      actor_name: "Sistem Cron",
      actor_role: null,
      action: "CRON_MONTHLY_BACKUP",
      entity_type: "system_backups",
      entity_code: period.periodCode,
      summary: `Cron bulanan berjalan (${actionsExecuted.join(", ")})`,
      metadata: {
        period_ym: period.periodCode,
        day_wib: period.day,
        last_day_wib: period.lastDay,
        created_backups: createdBackups,
        purge_result: purgeResult ?? null,
      } as unknown as Json,
    });

    return NextResponse.json({
      ok: true,
      periodCode: period.periodCode,
      dayWib: period.day,
      lastDayWib: period.lastDay,
      actionsExecuted,
      createdBackups,
      purgeResult: purgeResult ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Gagal menjalankan cron backup bulanan.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return runCronJob(request);
}

export async function POST(request: NextRequest) {
  return runCronJob(request);
}
