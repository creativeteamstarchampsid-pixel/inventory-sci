export type ShareTargetType = "ITEM" | "ARCHIVE" | "DELIVERY";

export const SHARE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_SHARE_SLUGS = new Set([
  "api",
  "login",
  "auth",
  "admin",
  "dashboard",
  "inventory",
  "archives",
  "deliveries",
  "settings",
]);

/**
 * Normalizes any free-text input or title into a lowercase hyphenated slug
 * containing only ASCII `[a-z0-9-]`, capped at `maxLength` characters without
 * trailing dangling hyphens.
 */
export function normalizeShareSlug(raw: string, maxLength = 60): string {
  const normalized = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).replace(/-+$/g, "");
}

/**
 * Validates and normalizes a user-chosen short link slug.
 */
export function validateShareSlug(
  raw: string,
): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = normalizeShareSlug(raw, 60);

  if (slug.length < 2) {
    return {
      ok: false,
      error: "Slug link pendek minimal 2 karakter huruf atau angka.",
    };
  }
  if (slug.length > 60 || !SHARE_SLUG_REGEX.test(slug)) {
    return {
      ok: false,
      error: "Slug hanya boleh menggunakan huruf kecil, angka, dan tanda hubung (-).",
    };
  }
  if (RESERVED_SHARE_SLUGS.has(slug)) {
    return {
      ok: false,
      error: `Kata "${slug}" dicadangkan oleh sistem. Tambahkan kata pembeda lain.`,
    };
  }

  return { ok: true, slug };
}

function stripTechnicalArchivePrefix(title: string): string {
  const trimmed = title.trim();
  const stripped = trimmed.replace(/^\d{1,5}[A-Za-z]{2,}[IVXivx\d]*[_\-\s]+/, "").trim();
  return stripped.length >= 4 ? stripped : trimmed;
}

function takeReadableSlugWords(text: string, maxWords = 5, maxLen = 42): string {
  const fullSlug = normalizeShareSlug(text, 120);
  if (!fullSlug) return "";

  const words = fullSlug.split("-").filter(Boolean);
  const selected: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (selected.length >= maxWords) break;
    const extraLen = selected.length === 0 ? word.length : word.length + 1;
    if (selected.length > 0 && currentLength + extraLen > maxLen) break;
    selected.push(word);
    currentLength += extraLen;
  }

  const joined = selected.join("-");
  return joined.slice(0, maxLen).replace(/-+$/g, "");
}

/**
 * Generates an intuitive, readable default slug from an item name, archive/letter
 * title, or delivery/Surat Jalan title.
 */
export function suggestReadableSlug(
  targetType: ShareTargetType,
  title: string,
  code: string,
  locationCode?: string | null,
): string {
  if (targetType === "DELIVERY") {
    const cleaned = takeReadableSlugWords(title, 4, 34);
    const seq = /(\d{2,6})$/.exec(code.trim())?.[1];
    if (cleaned.length >= 2) {
      const candidate = seq ? `sj-${cleaned}-${seq}` : `sj-${cleaned}`;
      const normalized = normalizeShareSlug(candidate, 46);
      if (normalized.length >= 2 && !RESERVED_SHARE_SLUGS.has(normalized)) {
        return normalized;
      }
    }
    const codeSlug = normalizeShareSlug(code, 42);
    return codeSlug.length >= 2 ? codeSlug : "surat-jalan";
  }

  const cleanedTitle =
    targetType === "ARCHIVE" ? stripTechnicalArchivePrefix(title) : title.trim();

  const readable = takeReadableSlugWords(cleanedTitle, 5, 42);
  if (readable.length >= 2 && !RESERVED_SHARE_SLUGS.has(readable)) {
    return readable;
  }

  const codeSlug = normalizeShareSlug(code, 42);
  if (codeSlug.length >= 2 && !RESERVED_SHARE_SLUGS.has(codeSlug)) {
    return codeSlug;
  }

  const locPart = normalizeShareSlug(locationCode ?? "", 10);
  return locPart.length >= 2 ? `${targetType === "ITEM" ? "item" : "arsip"}-${locPart}` : "pratinjau";
}

/**
 * Builds up to 3 human-readable one-click suggestion chips for the Share Dialog.
 */
export function buildSlugSuggestions(
  targetType: ShareTargetType,
  title: string,
  code: string,
  locationCode?: string | null,
): string[] {
  const candidates: string[] = [];
  const baseSlug = suggestReadableSlug(targetType, title, code, locationCode);
  const locSlug = normalizeShareSlug(locationCode ?? "", 12);
  const codeSlug = normalizeShareSlug(code, 42);
  const codeSeqMatch = /(\d{2,6})$/.exec(code.trim());
  const shortLocPrefix =
    targetType === "ITEM" ? "item" : targetType === "DELIVERY" ? "sj" : "arsip";

  const pushIfValid = (raw: string) => {
    const check = validateShareSlug(raw);
    if (check.ok && !candidates.includes(check.slug)) {
      candidates.push(check.slug);
    }
  };

  pushIfValid(baseSlug);

  if (targetType === "DELIVERY") {
    pushIfValid(codeSlug);
    if (codeSeqMatch) {
      pushIfValid(`bast-${codeSeqMatch[1]}`);
    } else {
      pushIfValid(`bast-${baseSlug.replace(/^sj-/, "")}`);
    }
    return candidates.slice(0, 3);
  }

  if (locSlug && !baseSlug.endsWith(`-${locSlug}`)) {
    pushIfValid(`${baseSlug.slice(0, Math.max(2, 46 - locSlug.length)).replace(/-+$/g, "")}-${locSlug}`);
  } else if (locSlug && codeSeqMatch) {
    pushIfValid(`${shortLocPrefix}-${locSlug}-${codeSeqMatch[1]}`);
  }

  pushIfValid(codeSlug);

  if (candidates.length < 3 && locSlug && codeSeqMatch) {
    pushIfValid(`${shortLocPrefix}-${locSlug}-${codeSeqMatch[1]}`);
  }

  return candidates.slice(0, 3);
}

/**
 * Formats a short relative URL path for a share slug.
 */
export function buildShortSharePath(slug: string): string {
  const normalized = normalizeShareSlug(slug, 60);
  return `/s/${encodeURIComponent(normalized || slug.trim().toLowerCase())}`;
}
