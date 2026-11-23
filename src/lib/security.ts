import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared server-side security utilities for StarOps:
 * - Safe Postgres/Supabase error sanitization (never leaks SQL, schema, or stacks)
 * - PostgREST filter sanitization (anti filter/SQL injection)
 * - Strict relative redirect validation (anti open redirect)
 * - Text & storage-path sanitization (anti path traversal & control-char injection)
 * - Strict UUID v1–v5 and YYYY-MM period validators
 * - CSV/XLSX formula-injection neutralization
 * - Constant-time secret comparison via `crypto.timingSafeEqual`
 */

const UUID_V1_TO_V5_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PERIOD_YM_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const SAFE_STORAGE_PATH_REGEX = /^[a-zA-Z0-9._/\- ]+$/;

const PG_ERROR_MESSAGES: Record<string, string> = {
  "23505": "Data duplikat sudah terdaftar di sistem.",
  "23503": "Data masih terhubung dengan catatan lain dan tidak dapat diproses.",
  "42501": "Akses ditolak. Anda tidak memiliki izin untuk tindakan ini.",
  "22P02": "Format data tidak valid.",
  "23514": "Nilai data berada di luar batas aturan sistem.",
  "23502": "Data wajib belum lengkap.",
  PGRST116: "Data yang diminta tidak ditemukan.",
};

type ErrorLike = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
  details?: unknown;
  hint?: unknown;
};

/**
 * Maps Postgres / Supabase errors to safe Indonesian user messages and logs
 * technical details server-side ONLY. Never leaks raw SQL, table/column names,
 * PostgREST internals, or stack traces to the client.
 */
export function sanitizeSafeError(
  err: unknown,
  fallback: string,
  context?: string,
): string {
  const errObj =
    err && typeof err === "object" ? (err as ErrorLike) : null;
  const code = typeof errObj?.code === "string" ? errObj.code.trim() : "";
  const rawMessage =
    typeof errObj?.message === "string"
      ? errObj.message
      : err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "";

  // Log diagnostic details server-side only (never returned to client).
  if (err) {
    console.error(
      `[security:error]${context ? ` [${context}]` : ""}`,
      JSON.stringify({
        code: code || undefined,
        status: typeof errObj?.status === "number" ? errObj.status : undefined,
        name: typeof errObj?.name === "string" ? errObj.name : undefined,
        message: rawMessage.slice(0, 300) || undefined,
      }),
    );
  }

  if (code && PG_ERROR_MESSAGES[code]) {
    return PG_ERROR_MESSAGES[code];
  }

  // Known safe Supabase Auth error codes / patterns
  const lower = rawMessage.toLowerCase();
  if (
    code === "email_exists" ||
    code === "user_already_exists" ||
    lower.includes("already been registered") ||
    lower.includes("already registered")
  ) {
    return "Email sudah digunakan oleh akun lain.";
  }
  if (code === "weak_password") {
    return "Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan kombinasi huruf dan angka.";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    code === "rate_limit_exceeded"
  ) {
    return "Terlalu banyak permintaan. Silakan tunggu beberapa saat lalu coba lagi.";
  }

  return fallback;
}

/**
 * Strips/neutralizes PostgREST filter syntax characters (`,`, `(`, `)`, `*`,
 * `\`, `"`, `'`, `%`, `;`) and control characters before interpolating user
 * input into any `.or(...)` or `.ilike(...)` query.
 */
export function sanitizePostgrestValue(input: string, maxLength = 100): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[,()*\\"'%;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Strictly allows ONLY single-leading-slash relative paths (`/^\/(?!\/|\\)/`),
 * rejecting protocol-relative URLs (`//evil.com`), backslash tricks (`/\evil.com`),
 * full URLs (`https://evil.com`), control characters, and login/auth redirect loops.
 */
export function sanitizeSafeRedirectPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(trimmed)) return fallback;
  if (!/^\/(?!\/|\\)/.test(trimmed)) return fallback;

  try {
    const parsed = new URL(trimmed, "https://starops.local");
    if (parsed.origin !== "https://starops.local") return fallback;
    if (!/^\/(?!\/|\\)/.test(parsed.pathname)) return fallback;
    if (
      parsed.pathname === "/" ||
      parsed.pathname === "/login" ||
      parsed.pathname.startsWith("/login/") ||
      parsed.pathname === "/auth" ||
      parsed.pathname.startsWith("/auth/")
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

/**
 * Trims, removes ASCII control characters (optionally preserving `\n` and `\t`
 * for multiline notes/descriptions), and caps string length.
 */
export function sanitizeTextInput(
  raw: string | null | undefined,
  maxLength = 500,
  options?: { multiline?: boolean },
): string {
  if (typeof raw !== "string") return "";
  const cleaned = options?.multiline
    ? raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    : raw.replace(/[\u0000-\u001f\u007f]/g, " ");
  return cleaned.trim().slice(0, maxLength);
}

/**
 * Convenience wrapper around `sanitizeTextInput` that returns `null` when empty.
 */
export function sanitizeOptionalText(
  raw: string | null | undefined,
  maxLength = 500,
  options?: { multiline?: boolean },
): string | null {
  const cleaned = sanitizeTextInput(raw, maxLength, options);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Strict UUID v1–v5 validator for entity IDs.
 */
export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V1_TO_V5_REGEX.test(value.trim());
}

/**
 * Validates `YYYY-MM` period codes (e.g., `2026-11`).
 */
export function isValidPeriodYm(value: unknown): value is string {
  return typeof value === "string" && PERIOD_YM_REGEX.test(value.trim());
}

/**
 * Validates `YYYY-MM-DD` calendar date strings.
 */
export function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_REGEX.test(value.trim());
}

/**
 * Validates that a URL uses strictly `http:` or `https:` protocol.
 */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes a Supabase Storage relative object path.
 * Blocks path traversal (`..`), backslashes, leading slashes, null/control chars,
 * protocol schemes (`javascript:`, `http:`), and optionally enforces a prefix.
 */
export function sanitizeStoragePath(
  raw: string | null | undefined,
  allowedPrefix?: string,
): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim();
  if (!cleaned || cleaned.length > 512) return null;
  if (/[\u0000-\u001f\u007f]/.test(cleaned)) return null;
  if (
    cleaned.startsWith("/") ||
    cleaned.includes("\\") ||
    cleaned.includes("..") ||
    cleaned.includes("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(cleaned)
  ) {
    return null;
  }
  if (!SAFE_STORAGE_PATH_REGEX.test(cleaned)) return null;
  if (allowedPrefix && !cleaned.startsWith(allowedPrefix)) return null;
  return cleaned;
}

/**
 * Neutralizes Excel/CSV formula injection (`=`, `+`, `-`, `@`, `\t`, `\r` prefix)
 * by prepending a single quote `'`.
 */
export function sanitizeCsvFormulaCell(value: string): string {
  if (typeof value !== "string" || value.length === 0) return value;
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Constant-time secret comparison using Node `crypto.timingSafeEqual` over
 * fixed-length SHA-256 digests so comparison time does not leak secret length
 * or prefix matches.
 */
export function timingSafeSecretEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) {
    return false;
  }
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB) && a.length === b.length;
}
