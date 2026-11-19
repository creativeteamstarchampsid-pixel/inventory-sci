import { AlertTriangle, CheckCircle2, Clock, Sparkles, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  ASSET_TYPE_LABELS,
  CONDITION_LABELS,
  HYGIENE_LABELS,
  KIT_STATUS_LABELS,
} from "@/lib/constants";
import type { AssetType, HygieneStatus, ItemCondition, KitStatus } from "@/types/database";

export function AssetTypeBadge({ assetType }: { assetType: AssetType }) {
  const variant =
    assetType === "THERAPY_TOY"
      ? "default"
      : assetType === "FIXED_ASSET"
        ? "secondary"
        : "outline";

  return <Badge variant={variant}>{ASSET_TYPE_LABELS[assetType]}</Badge>;
}

export function ConditionBadge({ condition }: { condition: ItemCondition }) {
  switch (condition) {
    case "BAIK":
      return (
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "PART_KURANG":
      return (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <AlertTriangle className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "RUSAK_RINGAN":
      return (
        <Badge
          variant="outline"
          className="border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
        >
          <AlertTriangle className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "RUSAK_BERAT":
      return <Badge variant="destructive">{CONDITION_LABELS[condition]}</Badge>;
    case "DALAM_PERBAIKAN":
      return (
        <Badge
          variant="outline"
          className="border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
        >
          <Wrench className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "DIHAPUSBUKU":
      return <Badge variant="secondary">{CONDITION_LABELS[condition]}</Badge>;
  }
}

export function isSanitizationOverdue(
  assetType: AssetType,
  nextSanitizationDue: string | null,
  todayWib: string,
): boolean {
  if (assetType !== "THERAPY_TOY" || !nextSanitizationDue) return false;
  return nextSanitizationDue < todayWib;
}

export function isSanitizationDueToday(
  assetType: AssetType,
  nextSanitizationDue: string | null,
  todayWib: string,
): boolean {
  if (assetType !== "THERAPY_TOY" || !nextSanitizationDue) return false;
  return nextSanitizationDue === todayWib;
}

export function HygieneBadge({
  status,
  assetType,
  nextDue,
  todayWib,
}: {
  status: HygieneStatus;
  assetType: AssetType;
  nextDue?: string | null;
  todayWib?: string;
}) {
  const overdue =
    todayWib !== undefined && isSanitizationOverdue(assetType, nextDue ?? null, todayWib);
  const dueToday =
    todayWib !== undefined && isSanitizationDueToday(assetType, nextDue ?? null, todayWib);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {status === "STERIL" && (
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <Sparkles className="size-3" />
          {HYGIENE_LABELS[status]}
        </Badge>
      )}
      {status === "PERLU_DICUCI" && (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <AlertTriangle className="size-3" />
          {HYGIENE_LABELS[status]}
        </Badge>
      )}
      {status === "SEDANG_DISANITASI" && (
        <Badge
          variant="outline"
          className="border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
        >
          <Clock className="size-3" />
          {HYGIENE_LABELS[status]}
        </Badge>
      )}
      {overdue && (
        <Badge variant="destructive" title={`Jadwal sanitasi: ${nextDue}`}>
          <Clock className="size-3" />
          Terlambat Sanitasi
        </Badge>
      )}
      {!overdue && dueToday && (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          Sanitasi Hari Ini
        </Badge>
      )}
    </div>
  );
}

export function PartProgressIndicator({
  currentParts,
  totalParts,
  unitLabel,
}: {
  currentParts: number;
  totalParts: number;
  unitLabel: string;
}) {
  const isMissing = totalParts > 1 && currentParts < totalParts;
  const pct = totalParts > 0 ? Math.round((currentParts / totalParts) * 100) : 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="font-mono font-medium">
          {currentParts}/{totalParts} {unitLabel}
        </span>
        {isMissing && (
          <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
            PART_KURANG
          </Badge>
        )}
      </div>
      {totalParts > 1 && (
        <div className="bg-muted h-1.5 w-24 overflow-hidden rounded-full">
          <div
            className={
              isMissing
                ? "h-full bg-amber-500 transition-all"
                : "h-full bg-emerald-500 transition-all"
            }
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function KitStatusBadge({ status }: { status: KitStatus }) {
  switch (status) {
    case "TERSEDIA":
      return (
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {KIT_STATUS_LABELS[status]}
        </Badge>
      );
    case "DIPINJAM":
      return (
        <Badge
          variant="outline"
          className="border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
        >
          {KIT_STATUS_LABELS[status]}
        </Badge>
      );
    case "TIDAK_LENGKAP":
      return <Badge variant="destructive">{KIT_STATUS_LABELS[status]}</Badge>;
    case "NONAKTIF":
      return <Badge variant="secondary">{KIT_STATUS_LABELS[status]}</Badge>;
  }
}
