/**
 * Client-safe / isomorphic upload security module (zero external dependencies).
 *
 * Implements:
 * - Security Check #19: Strict file size limits, safe storage filename sanitization,
 *   and automatic browser <canvas> image compression (also stripping EXIF/GPS & trailing junk).
 * - Security Check #20: Binary magic-byte verification, executable/script header rejection,
 *   embedded PDF JavaScript/Launch scanner, and UTF-8 JSON backup payload inspection.
 */

export type UploadSecurityKind = "image" | "archive" | "backup-json";

export type UploadScanResult =
  | { ok: true; detectedExt: string; detectedMime: string }
  | { ok: false; error: string };

export type CompressImageOptions = {
  maxDimension?: number;
  quality?: number;
  maxTargetBytes?: number;
};

export type PreparedImageUploadResult =
  | {
      ok: true;
      file: File;
      originalBytes: number;
      compressedBytes: number;
      detectedExt: string;
      detectedMime: string;
    }
  | { ok: false; error: string };

export const UPLOAD_SIZE_LIMITS: Record<UploadSecurityKind, number> = {
  image: 5 * 1024 * 1024, // 5 MB raw (auto-compressed down further)
  archive: 10 * 1024 * 1024, // 10 MB
  "backup-json": 15 * 1024 * 1024, // 15 MB
};

const DANGEROUS_EXTENSIONS = new Set<string>([
  "exe",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "php",
  "phtml",
  "js",
  "mjs",
  "cjs",
  "html",
  "htm",
  "svg",
  "xml",
  "msi",
  "dll",
  "jar",
  "scr",
  "vbs",
  "hta",
  "com",
  "pif",
  "asp",
  "aspx",
  "jsp",
  "docm",
  "xlsm",
]);

const DANGEROUS_MIME_TYPES = new Set<string>([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sh",
  "application/x-csh",
  "application/x-php",
  "text/x-php",
  "application/xml",
  "text/xml",
]);

const MALICIOUS_TEXT_PATTERNS: ReadonlyArray<{
  label: string;
  regex: RegExp;
}> = [
  { label: "<script", regex: /<script\b/i },
  { label: "<svg", regex: /<svg\b/i },
  { label: "<!doctype html", regex: /<!doctype\s+html/i },
  { label: "<html", regex: /<html\b/i },
  { label: "javascript:", regex: /javascript\s*:/i },
  { label: "onerror=", regex: /\bonerror\s*=/i },
  { label: "onload=", regex: /\bonload\s*=/i },
  { label: "<?php", regex: /<\?php\b/i },
];

const PDF_DANGEROUS_MARKER_REGEX =
  /\/(?:JavaScript|JS|Launch)(?![A-Za-z0-9_])/i;

const HEADER_SCAN_BYTES = 4096;
const PDF_WINDOW_BYTES = 64 * 1024; // 64 KB header & 64 KB trailer scan

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Strips path traversal, null bytes, control chars, and dangerous double extensions,
 * returning a safe ASCII slug capped in length for Supabase Storage keys.
 */
export function sanitizeStorageFilename(
  name: string,
  fallbackBase = "file",
): string {
  const safeFallback =
    fallbackBase
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "file";

  if (typeof name !== "string" || !name.trim()) {
    return safeFallback;
  }

  // Strip null bytes & ASCII control characters, then extract basename after / or \
  const strippedControls = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const pathParts = strippedControls.split(/[\\/]+/).filter(Boolean);
  let baseLeaf = pathParts[pathParts.length - 1] ?? "";

  // Remove any remaining dot-dot traversal sequences
  baseLeaf = baseLeaf.replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");

  if (!baseLeaf) {
    return safeFallback;
  }

  const rawSegments = baseLeaf.split(".").filter(Boolean);
  if (rawSegments.length === 0) {
    return safeFallback;
  }

  // Filter out any dangerous extension segments (handles .php.jpg, .exe.pdf, .html.png, etc.)
  const cleanedSegments = rawSegments.filter(
    (seg) => !DANGEROUS_EXTENSIONS.has(seg.toLowerCase()),
  );

  if (cleanedSegments.length === 0) {
    return safeFallback;
  }

  let ext = "";
  let stemParts = cleanedSegments;

  if (cleanedSegments.length >= 2) {
    const candidateExt = cleanedSegments[cleanedSegments.length - 1]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (
      candidateExt.length >= 1 &&
      candidateExt.length <= 8 &&
      !DANGEROUS_EXTENSIONS.has(candidateExt)
    ) {
      ext = candidateExt;
      stemParts = cleanedSegments.slice(0, -1);
    }
  }

  const normalizedStem = stemParts
    .join("-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/_{2,}/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "");

  const finalStem = normalizedStem || safeFallback;
  const maxTotalLength = 80;
  const extSuffix = ext ? `.${ext}` : "";
  const maxStemLength = Math.max(8, maxTotalLength - extSuffix.length);
  const cappedStem =
    finalStem.slice(0, maxStemLength).replace(/[-_]+$/g, "") || safeFallback;

  return `${cappedStem}${extSuffix}`;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    out += String.fromCharCode(...slice);
  }
  return out;
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function hasExecutableSignature(bytes: Uint8Array): string | null {
  // Windows PE / MZ executable
  if (startsWithBytes(bytes, [0x4d, 0x5a])) {
    return "Windows Executable (MZ/PE)";
  }
  // Linux ELF binary
  if (startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46])) {
    return "Linux Executable (ELF)";
  }
  // Mach-O binaries (big-endian FE ED FA CE/CF, little-endian CE/CF FA ED FE, fat CA FE BA BE)
  if (
    startsWithBytes(bytes, [0xfe, 0xed, 0xfa]) ||
    startsWithBytes(bytes, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWithBytes(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWithBytes(bytes, [0xca, 0xfe, 0xba, 0xbe])
  ) {
    return "Mach-O / Binary Executable";
  }
  // Shell / script shebang (#!)
  if (startsWithBytes(bytes, [0x23, 0x21])) {
    return "Script Shebang (#!)";
  }
  return null;
}

function findMaliciousTextMarker(text: string): string | null {
  for (const pattern of MALICIOUS_TEXT_PATTERNS) {
    if (pattern.regex.test(text)) {
      return pattern.label;
    }
  }
  return null;
}

function inspectFilenameSecurity(rawName: string): {
  ok: true;
  lowerExt: string;
} | {
  ok: false;
  error: string;
} {
  if (!rawName || typeof rawName !== "string") {
    return { ok: false, error: "Nama file tidak valid." };
  }

  if (/[\u0000-\u001f\u007f]/.test(rawName)) {
    return {
      ok: false,
      error: "Nama file mengandung karakter kontrol atau null byte yang dilarang.",
    };
  }

  if (rawName.includes("..") || rawName.includes("/") || rawName.includes("\\")) {
    return {
      ok: false,
      error: "Nama file mengandung karakter path traversal yang tidak diizinkan.",
    };
  }

  const trimmed = rawName.trim();
  const segments = trimmed.split(".").filter(Boolean);
  if (segments.length >= 2) {
    // Inspect ALL extension segments (e.g., payload.php.jpg, report.exe.pdf, img.html.png)
    for (let i = 1; i < segments.length; i += 1) {
      const seg = segments[i].toLowerCase();
      if (DANGEROUS_EXTENSIONS.has(seg)) {
        return {
          ok: false,
          error: `Ekstensi berbahaya (.${seg}) terdeteksi pada nama file "${trimmed}" dan diblokir oleh pemindai keamanan.`,
        };
      }
    }
  } else if (trimmed.startsWith(".")) {
    const hiddenExt = trimmed.slice(1).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(hiddenExt)) {
      return {
        ok: false,
        error: `File dengan ekstensi berbahaya (.${hiddenExt}) diblokir oleh pemindai keamanan.`,
      };
    }
  }

  const lowerExt =
    segments.length >= 2 ? segments[segments.length - 1].toLowerCase() : "";
  return { ok: true, lowerExt };
}

function detectImageMagic(
  bytes: Uint8Array,
): { detectedExt: string; detectedMime: string } | null {
  // JPEG: FF D8 FF
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return { detectedExt: "jpg", detectedMime: "image/jpeg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { detectedExt: "png", detectedMime: "image/png" };
  }
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { detectedExt: "webp", detectedMime: "image/webp" };
  }
  return null;
}

/**
 * Scans & validates an uploaded File using strict size limits, dangerous filename/double-ext
 * blocking, real binary magic-byte inspection, executable/XSS header checks, PDF script
 * header/trailer scanning, and UTF-8 JSON validation.
 */
export async function scanAndValidateUploadFile(
  file: File,
  kind: UploadSecurityKind,
): Promise<UploadScanResult> {
  if (!file || typeof file.slice !== "function") {
    return { ok: false, error: "Objek file tidak valid." };
  }

  // 1. Empty file & strict size limit check
  if (file.size <= 0) {
    return {
      ok: false,
      error: "File kosong (0 byte) tidak dapat diunggah.",
    };
  }

  const maxBytes = UPLOAD_SIZE_LIMITS[kind];
  if (file.size > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    const kindLabel =
      kind === "image"
        ? "foto"
        : kind === "archive"
          ? "dokumen arsip"
          : "file backup JSON";
    return {
      ok: false,
      error: `Ukuran ${kindLabel} (${formatBytes(file.size)}) melebihi batas maksimal ${limitMb} MB.`,
    };
  }

  // 2. Filename & double-extension check
  const nameCheck = inspectFilenameSecurity(file.name);
  if (!nameCheck.ok) {
    return nameCheck;
  }

  // Reject explicitly dangerous browser-reported MIME types (e.g. SVG XSS, HTML, JS)
  const declaredMime = (file.type || "").toLowerCase().trim();
  if (declaredMime && DANGEROUS_MIME_TYPES.has(declaredMime)) {
    return {
      ok: false,
      error: `Tipe MIME berbahaya (${declaredMime}) diblokir oleh pemindai keamanan.`,
    };
  }

  // 3. Read actual binary header bytes (first 4096 bytes)
  let headerBytes: Uint8Array;
  try {
    const headerBuf = await file.slice(0, HEADER_SCAN_BYTES).arrayBuffer();
    headerBytes = new Uint8Array(headerBuf);
  } catch {
    return {
      ok: false,
      error: "Gagal membaca header biner file untuk pemindaian keamanan.",
    };
  }

  // Immediately block executables & shell scripts
  const execSig = hasExecutableSignature(headerBytes);
  if (execSig) {
    return {
      ok: false,
      error: `File ditolak: terdeteksi signature eksekusi berbahaya (${execSig}).`,
    };
  }

  // Scan decoded header bytes for embedded HTML/script/XSS payloads
  const headerText = bytesToLatin1(headerBytes);
  const headerMarker = findMaliciousTextMarker(headerText);
  if (headerMarker) {
    return {
      ok: false,
      error: `File ditolak oleh pemindai keamanan karena mengandung pola skrip berbahaya (${headerMarker}).`,
    };
  }

  // 4. Kind-specific deep magic-byte & payload checks
  if (kind === "image") {
    const detected = detectImageMagic(headerBytes);
    if (!detected) {
      return {
        ok: false,
        error:
          "Header gambar tidak valid atau file palsu/dimanipulasi. Hanya gambar asli JPG, PNG, atau WebP yang diizinkan (SVG diblokir).",
      };
    }

    // Also scan trailing 4 KB for appended polyglot HTML/script/PHP payloads
    if (file.size > HEADER_SCAN_BYTES) {
      try {
        const tailBuf = await file
          .slice(Math.max(0, file.size - HEADER_SCAN_BYTES), file.size)
          .arrayBuffer();
        const tailMarker = findMaliciousTextMarker(
          bytesToLatin1(new Uint8Array(tailBuf)),
        );
        if (tailMarker) {
          return {
            ok: false,
            error: `File gambar ditolak karena mengandung sisipan payload mencurigakan (${tailMarker}).`,
          };
        }
      } catch {
        // Proceed if tail slice fails unexpectedly
      }
    }

    return {
      ok: true,
      detectedExt: detected.detectedExt,
      detectedMime: detected.detectedMime,
    };
  }

  if (kind === "archive") {
    // 4a. PDF (%PDF-)
    if (startsWithBytes(headerBytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      try {
        const headWindowBuf = await file
          .slice(0, Math.min(file.size, PDF_WINDOW_BYTES))
          .arrayBuffer();
        const headWindowText = bytesToLatin1(new Uint8Array(headWindowBuf));

        let tailWindowText = "";
        if (file.size > PDF_WINDOW_BYTES) {
          const tailStart = Math.max(0, file.size - PDF_WINDOW_BYTES);
          const tailWindowBuf = await file
            .slice(tailStart, file.size)
            .arrayBuffer();
          tailWindowText = bytesToLatin1(new Uint8Array(tailWindowBuf));
        }

        if (
          PDF_DANGEROUS_MARKER_REGEX.test(headWindowText) ||
          PDF_DANGEROUS_MARKER_REGEX.test(tailWindowText)
        ) {
          return {
            ok: false,
            error:
              "PDF ditolak oleh pemindai keamanan karena mengandung skrip/aksi tertanam berbahaya (/JavaScript, /JS, atau /Launch).",
          };
        }

        const pdfScriptMarker =
          findMaliciousTextMarker(headWindowText) ??
          findMaliciousTextMarker(tailWindowText);
        if (pdfScriptMarker) {
          return {
            ok: false,
            error: `PDF ditolak karena mengandung pola berbahaya (${pdfScriptMarker}).`,
          };
        }
      } catch {
        return {
          ok: false,
          error: "Gagal memindai struktur internal dokumen PDF.",
        };
      }

      return {
        ok: true,
        detectedExt: "pdf",
        detectedMime: "application/pdf",
      };
    }

    // 4b. Image inside archive (JPEG / PNG / WebP)
    const detectedImg = detectImageMagic(headerBytes);
    if (detectedImg) {
      if (file.size > HEADER_SCAN_BYTES) {
        try {
          const tailBuf = await file
            .slice(Math.max(0, file.size - HEADER_SCAN_BYTES), file.size)
            .arrayBuffer();
          const tailMarker = findMaliciousTextMarker(
            bytesToLatin1(new Uint8Array(tailBuf)),
          );
          if (tailMarker) {
            return {
              ok: false,
              error: `Gambar arsip ditolak karena mengandung sisipan payload mencurigakan (${tailMarker}).`,
            };
          }
        } catch {
          // Ignore tail read error
        }
      }
      return {
        ok: true,
        detectedExt: detectedImg.detectedExt,
        detectedMime: detectedImg.detectedMime,
      };
    }

    // 4c. OOXML / ZIP (50 4B 03 04)
    if (startsWithBytes(headerBytes, [0x50, 0x4b, 0x03, 0x04])) {
      if (nameCheck.lowerExt === "docx") {
        return {
          ok: true,
          detectedExt: "docx",
          detectedMime:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
      }
      if (nameCheck.lowerExt === "xlsx") {
        return {
          ok: true,
          detectedExt: "xlsx",
          detectedMime:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
      }
      if (nameCheck.lowerExt === "zip") {
        return {
          ok: true,
          detectedExt: "zip",
          detectedMime: "application/zip",
        };
      }
      return {
        ok: false,
        error:
          "File berformat arsip ZIP hanya diizinkan dengan ekstensi .docx, .xlsx, atau .zip.",
      };
    }

    // 4d. Legacy MS Office OLE2 (D0 CF 11 E0 A1 B1 1A E1)
    if (
      startsWithBytes(headerBytes, [
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
      ])
    ) {
      if (nameCheck.lowerExt === "doc") {
        return {
          ok: true,
          detectedExt: "doc",
          detectedMime: "application/msword",
        };
      }
      if (nameCheck.lowerExt === "xls") {
        return {
          ok: true,
          detectedExt: "xls",
          detectedMime: "application/vnd.ms-excel",
        };
      }
      return {
        ok: false,
        error:
          "Dokumen OLE2 hanya diizinkan dengan ekstensi .doc atau .xls.",
      };
    }

    return {
      ok: false,
      error:
        "Format dokumen arsip tidak didukung atau header biner tidak cocok. Gunakan file asli PDF, DOCX, XLSX, DOC, XLS, ZIP, JPG, PNG, atau WebP.",
    };
  }

  // 4e. Backup JSON verification ("backup-json")
  if (nameCheck.lowerExt !== "json") {
    return {
      ok: false,
      error: "File restore harus berekstensi .json yang valid.",
    };
  }

  let fullBytes: Uint8Array;
  try {
    const fullBuf = await file.arrayBuffer();
    fullBytes = new Uint8Array(fullBuf);
  } catch {
    return {
      ok: false,
      error: "Gagal membaca isi file backup JSON.",
    };
  }

  // Reject binary / null bytes
  for (let i = 0; i < fullBytes.length; i += 1) {
    const b = fullBytes[i];
    if (b === 0x00) {
      return {
        ok: false,
        error:
          "File JSON ditolak karena mengandung null byte / data biner tidak valid.",
      };
    }
  }

  // Decode strict UTF-8
  let decodedText: string;
  try {
    decodedText = new TextDecoder("utf-8", { fatal: true }).decode(fullBytes);
  } catch {
    return {
      ok: false,
      error: "File backup bukan teks UTF-8 yang valid.",
    };
  }

  const trimmedJson = decodedText.replace(/^\uFEFF/, "").trim();
  if (!trimmedJson.startsWith("{")) {
    return {
      ok: false,
      error: "Struktur file backup JSON tidak valid (harus berupa objek JSON `{ ... }`).",
    };
  }

  const jsonMaliciousMarker = findMaliciousTextMarker(trimmedJson);
  if (jsonMaliciousMarker) {
    return {
      ok: false,
      error: `File backup JSON ditolak karena mengandung payload mencurigakan (${jsonMaliciousMarker}).`,
    };
  }

  try {
    const parsed: unknown = JSON.parse(trimmedJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        error: "Isi JSON bukan objek snapshot backup yang valid.",
      };
    }
  } catch {
    return {
      ok: false,
      error: "File backup JSON rusak atau gagal diparsing.",
    };
  }

  return {
    ok: true,
    detectedExt: "json",
    detectedMime: "application/json",
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat gambar ke canvas."));
    img.src = src;
  });
}

function replaceFilenameExtension(
  originalName: string,
  newExt: string,
  fallbackBase = "photo",
): string {
  const sanitized = sanitizeStorageFilename(originalName, fallbackBase);
  const dotIdx = sanitized.lastIndexOf(".");
  const stem = dotIdx > 0 ? sanitized.slice(0, dotIdx) : sanitized;
  return sanitizeStorageFilename(`${stem}.${newExt}`, fallbackBase);
}

/**
 * Compresses & re-encodes an image via browser <canvas>.
 * Re-drawing onto a fresh canvas also strips all EXIF/GPS metadata and steganographic trailing junk.
 * Gracefully falls back to the original validated File if canvas encoding fails.
 */
export async function compressImageFile(
  file: File,
  options?: CompressImageOptions,
): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  const maxDimension = options?.maxDimension ?? 1280;
  const initialQuality = options?.quality ?? 0.82;
  const maxTargetBytes = options?.maxTargetBytes ?? 500 * 1024;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    if (!srcW || !srcH) {
      return file;
    }

    const longestSide = Math.max(srcW, srcH);
    const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer image/webp; fallback to image/jpeg if browser doesn't support WebP encoding
    let targetMime = "image/webp";
    let targetExt = "webp";
    let bestBlob = await canvasToBlob(canvas, targetMime, initialQuality);

    if (!bestBlob || bestBlob.type !== "image/webp") {
      targetMime = "image/jpeg";
      targetExt = "jpg";
      bestBlob = await canvasToBlob(canvas, targetMime, initialQuality);
    }

    if (!bestBlob || bestBlob.size <= 0) {
      return file;
    }

    // Step quality down (0.72 -> 0.60) if still above maxTargetBytes
    const qualitySteps = [0.72, 0.6].filter((q) => q < initialQuality);
    for (const q of qualitySteps) {
      if (bestBlob.size <= maxTargetBytes) break;
      const candidate = await canvasToBlob(canvas, targetMime, q);
      if (candidate && candidate.size > 0 && candidate.size < bestBlob.size) {
        bestBlob = candidate;
      }
    }

    const cleanName = replaceFilenameExtension(file.name, targetExt, "image");
    return new File([bestBlob], cleanName, {
      type: targetMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Convenience pipeline: scans & validates an image first (magic bytes + payload scan),
 * then auto-compresses & strips EXIF metadata via <canvas>.
 */
export async function prepareSecureImageUpload(
  file: File,
  options?: CompressImageOptions,
): Promise<PreparedImageUploadResult> {
  const originalBytes = file?.size ?? 0;
  const scan = await scanAndValidateUploadFile(file, "image");
  if (!scan.ok) {
    return scan;
  }

  const compressed = await compressImageFile(file, options);
  const outMime = compressed.type || scan.detectedMime;
  const outExt =
    outMime === "image/webp"
      ? "webp"
      : outMime === "image/png"
        ? "png"
        : "jpg";

  return {
    ok: true,
    file: compressed,
    originalBytes,
    compressedBytes: compressed.size,
    detectedExt: outExt,
    detectedMime: outMime,
  };
}
