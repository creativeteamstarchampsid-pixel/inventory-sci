import { AlertTriangle, CheckCircle2, Clock, Sparkles, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  ASSET_TYPE_LABELS,
  CONDITION_LABELS,
  HYGIENE_LABELS,
  KIT_STATUS_LABELS,
} from "@/lib/constants";
import type { AssetType, HygieneStatus, ItemCondition, KitStatus } from "@/types/database";

const KAWAII_PILL_BASE =
  "rounded-full border-[1.5px] border-[#2C2623] font-bold shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:shadow-[1.5px_1.5px_0px_0px_#0c0a09]";

export function AssetTypeBadge({ assetType }: { assetType: AssetType }) {
  const toneClass =
    assetType === "THERAPY_TOY"
      ? "bg-[#D1FAE5] text-[#14532D] dark:bg-emerald-950/70 dark:text-emerald-200"
      : assetType === "FIXED_ASSET"
        ? "bg-[#EDE9FE] text-[#4C1D95] dark:bg-violet-950/70 dark:text-violet-200"
        : "bg-[#FFEDD5] text-[#7C2D12] dark:bg-orange-950/70 dark:text-orange-200";

  return (
    <Badge variant="outline" className={`${KAWAII_PILL_BASE} ${toneClass}`}>
      {ASSET_TYPE_LABELS[assetType]}
    </Badge>
  );
}

export function ConditionBadge({ condition }: { condition: ItemCondition }) {
  switch (condition) {
    case "BAIK":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#D1FAE5] text-[#14532D] dark:bg-emerald-950/70 dark:text-emerald-200`}
        >
          <CheckCircle2 className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "PART_KURANG":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#FEF3C7] text-[#78350F] dark:bg-amber-950/70 dark:text-amber-200`}
        >
          <AlertTriangle className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "RUSAK_RINGAN":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#FFEDD5] text-[#9A3412] dark:bg-orange-950/70 dark:text-orange-200`}
        >
          <AlertTriangle className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "RUSAK_BERAT":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#FECDD3] text-[#881337] dark:bg-rose-950/80 dark:text-rose-200`}
        >
          <AlertTriangle className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "DALAM_PERBAIKAN":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#E0F2FE] text-[#0C4A6E] dark:bg-sky-950/70 dark:text-sky-200`}
        >
          <Wrench className="size-3" />
          {CONDITION_LABELS[condition]}
        </Badge>
      );
    case "DIHAPUSBUKU":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300`}
        >
          {CONDITION_LABELS[condition]}
        </Badge>
      );
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
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "STERIL" && (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#D1FAE5] text-[#14532D] dark:bg-emerald-950/70 dark:text-emerald-200`}
        >
          <Sparkles className="size-3" />
          {HYGIENE_LABELS[status]}
        </Badge>
      )}
      {status === "PERLU_DICUCI" && (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#FEF3C7] text-[#78350F] dark:bg-amber-950/70 dark:text-amber-200`}
        >
          <AlertTriangle className="size-3" />
          {HYGIENE_LABELS[status]}
        </Badge>
      )}
      {status === "SEDANG_DISANITASI" && (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#E0F2FE] text-[#0C4A6E] dark:bg-sky-950/70 dark:text-sky-200`}
        >
          <Clock className="size-3" />
          {HYGIENE_LABELS[status]}
        </Badge>
      )}
      {overdue && (
        <Badge
          variant="outline"
          title={`Jadwal sanitasi: ${nextDue}`}
          className={`${KAWAII_PILL_BASE} bg-[#FECDD3] text-[#881337] dark:bg-rose-950/80 dark:text-rose-200`}
        >
          <Clock className="size-3" />
          Terlambat Sanitasi
        </Badge>
      )}
      {!overdue && dueToday && (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#FFEDD5] text-[#9A3412] dark:bg-orange-950/70 dark:text-orange-200`}
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
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="font-mono font-bold text-[#2C2623] dark:text-stone-100">
          {currentParts}/{totalParts} {unitLabel}
        </span>
        {isMissing && (
          <Badge
            variant="outline"
            className="rounded-full border-[1.5px] border-[#2C2623] bg-[#FECDD3] px-1.5 py-0 text-[10px] font-extrabold text-[#881337] shadow-[1px_1px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-rose-950/80 dark:text-rose-200"
          >
            PART_KURANG
          </Badge>
        )}
      </div>
      {totalParts > 1 && (
        <div className="h-2.5 w-24 overflow-hidden rounded-full border-[1.5px] border-[#2C2623] bg-[#FFFDF7] dark:border-stone-500 dark:bg-stone-900">
          <div
            className={
              isMissing
                ? "h-full rounded-full bg-amber-400 transition-all"
                : "h-full rounded-full bg-[#34D399] transition-all"
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
          className={`${KAWAII_PILL_BASE} bg-[#D1FAE5] text-[#14532D] dark:bg-emerald-950/70 dark:text-emerald-200`}
        >
          {KIT_STATUS_LABELS[status]}
        </Badge>
      );
    case "DIPINJAM":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#E0F2FE] text-[#0C4A6E] dark:bg-sky-950/70 dark:text-sky-200`}
        >
          {KIT_STATUS_LABELS[status]}
        </Badge>
      );
    case "TIDAK_LENGKAP":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-[#FECDD3] text-[#881337] dark:bg-rose-950/80 dark:text-rose-200`}
        >
          {KIT_STATUS_LABELS[status]}
        </Badge>
      );
    case "NONAKTIF":
      return (
        <Badge
          variant="outline"
          className={`${KAWAII_PILL_BASE} bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300`}
        >
          {KIT_STATUS_LABELS[status]}
        </Badge>
      );
  }
}
