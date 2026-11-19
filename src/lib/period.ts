/**
 * Month-end reconciliation calendar, always evaluated in WIB (Asia/Jakarta,
 * UTC+7, no DST) regardless of the server's or browser's timezone.
 */

export const APP_TIME_ZONE = "Asia/Jakarta";

/** Day of month from which the "Periode Pengkinian Data Bulanan" starts. */
export const UPDATE_PERIOD_START_DAY = 24;

export type JakartaDateParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

export function getJakartaDateParts(date: Date = new Date()): JakartaDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type MonthlyUpdatePeriod = {
  active: boolean;
  year: number;
  month: number;
  day: number;
  lastDay: number;
  /** Whole days left until the 23:59 WIB cut-off (0 on the last day). */
  daysUntilCutoff: number;
  /** e.g. "202611" – used for BKP-PRE-/BKP-FINAL- backup codes. */
  periodCode: string;
  /** e.g. "November 2026" in Indonesian. */
  periodLabel: string;
};

export function getMonthlyUpdatePeriod(date: Date = new Date()): MonthlyUpdatePeriod {
  const { year, month, day } = getJakartaDateParts(date);
  const lastDay = daysInMonth(year, month);

  const periodLabel = new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(date);

  return {
    active: day >= UPDATE_PERIOD_START_DAY,
    year,
    month,
    day,
    lastDay,
    daysUntilCutoff: Math.max(0, lastDay - day),
    periodCode: `${year}${String(month).padStart(2, "0")}`,
    periodLabel,
  };
}

/** Indonesian greeting based on the current WIB hour. */
export function getJakartaGreeting(date: Date = new Date()): string {
  const { hour } = getJakartaDateParts(date);
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

export function formatJakartaDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
