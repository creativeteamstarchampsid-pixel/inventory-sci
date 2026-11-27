"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  Share2,
  Sparkles,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getOrCreateShareLinkAction,
  updateShareLinkSlugAction,
} from "@/lib/actions/share-links";
import {
  buildShortSharePath,
  buildSlugSuggestions,
  normalizeShareSlug,
  validateShareSlug,
  type ShareTargetType,
} from "@/lib/share-links";

export type ShareDialogTarget = {
  type: ShareTargetType;
  id: string;
  code: string;
  title: string;
  locationCode?: string | null;
};

type SharePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ShareDialogTarget | null;
  initialSlug?: string | null;
  initialCanCustomize?: boolean;
  onSlugUpdated?: (newSlug: string) => void;
};

export function SharePreviewDialog({
  open,
  onOpenChange,
  target,
  initialSlug = null,
  initialCanCustomize = true,
  onSlugUpdated,
}: SharePreviewDialogProps) {
  const { runWithFeedback } = useCartoonFeedback();
  const [loadingSlug, setLoadingSlug] = React.useState(false);
  const [isSaving, startSaveTransition] = React.useTransition();
  const [currentSlug, setCurrentSlug] = React.useState<string>("");
  const [slugInput, setSlugInput] = React.useState<string>("");
  const [canCustomize, setCanCustomize] = React.useState<boolean>(initialCanCustomize);
  const [origin, setOrigin] = React.useState<string>("");
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [successText, setSuccessText] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    }
  }, []);

  React.useEffect(() => {
    if (!open || !target) return;

    let cancelled = false;
    setErrorText(null);
    setSuccessText(null);
    setCopied(false);

    if (initialSlug) {
      setCurrentSlug(initialSlug);
      setSlugInput(initialSlug);
      setCanCustomize(initialCanCustomize);
    } else {
      setCurrentSlug("");
      setSlugInput("");
    }

    setLoadingSlug(true);
    void getOrCreateShareLinkAction({
      targetType: target.type,
      targetId: target.id,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setCurrentSlug(res.data.slug);
          setSlugInput((prev) => prev || res.data.slug);
          setCanCustomize(res.data.canCustomize);
        } else {
          setErrorText(res.error);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorText("Gagal menyiapkan link pratinjau pendek.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSlug(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, target, initialSlug, initialCanCustomize]);

  const activePath = currentSlug ? buildShortSharePath(currentSlug) : "";
  const fullShareUrl = activePath
    ? origin
      ? `${origin}${activePath}`
      : activePath
    : "";

  const normalizedDraft = normalizeShareSlug(slugInput);
  const suggestions = React.useMemo(() => {
    if (!target) return [];
    return buildSlugSuggestions(
      target.type,
      target.title,
      target.code,
      target.locationCode,
    );
  }, [target]);

  async function handleCopyLink() {
    if (!fullShareUrl) return;
    setErrorText(null);
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setErrorText("Browser tidak mengizinkan salin otomatis. Silakan salin link secara manual.");
    }
  }

  function getTargetTypeLabel(type: ShareTargetType): string {
    if (type === "ITEM") return "Barang/Alat";
    if (type === "DELIVERY") return "Surat Jalan & Pengiriman";
    return "Surat / Arsip";
  }

  function handleShareWhatsApp() {
    if (!fullShareUrl || !target) return;
    const typeLabel = getTargetTypeLabel(target.type);
    const message = [
      `*StarOps · Pratinjau ${typeLabel}*`,
      `${target.title} (${target.code})`,
      fullShareUrl,
    ].join("\n");
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  async function handleNativeShare() {
    if (!fullShareUrl || !target || !canNativeShare) return;
    setErrorText(null);
    const typeLabel = getTargetTypeLabel(target.type);
    try {
      await navigator.share({
        title: `StarOps · ${target.title} (${target.code})`,
        text: `Pratinjau ${typeLabel}: ${target.title} (${target.code})`,
        url: fullShareUrl,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      await handleCopyLink();
    }
  }

  function handleSaveSlug(event: React.FormEvent) {
    event.preventDefault();
    if (!target || !canCustomize) return;
    setErrorText(null);
    setSuccessText(null);

    const check = validateShareSlug(slugInput);
    if (!check.ok) {
      setErrorText(check.error);
      return;
    }

    startSaveTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Menyimpan Link Pendek...",
          workingMessage: `Mengatur alamat cantik /s/${check.slug} nih~`,
          successTitle: "Link Pendek Tersimpan! 🔗",
          successMessage: (r) =>
            r.ok ? r.message ?? `Link /s/${r.data.slug} siap dibagikan!` : "",
          errorTitle: "Slug Belum Tersedia...",
          isResultError: (r) => (!r.ok ? r.error : null),
        },
        () =>
          updateShareLinkSlugAction({
            targetType: target.type,
            targetId: target.id,
            slug: check.slug,
          }),
      );

      if (!res.ok) {
        setErrorText(res.error);
        return;
      }

      setCurrentSlug(res.data.slug);
      setSlugInput(res.data.slug);
      setSuccessText(res.message ?? "Link pendek berhasil diperbarui!");
      onSlugUpdated?.(res.data.slug);
    });
  }

  const isDirty = Boolean(
    normalizedDraft && currentSlug && normalizedDraft !== currentSlug,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[6px_6px_0px_0px_#2C2623] sm:max-w-lg dark:border-stone-500 dark:bg-stone-900">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#CCFBF1] text-[#115E59] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-teal-950/70 dark:text-teal-200">
              <Share2 className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-black text-[#2C2623] dark:text-stone-100">
                Bagikan Link Pratinjau Pendek
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-[#574E49] dark:text-stone-300">
                Alamat ringkas dan mudah dibaca untuk membuka pratinjau langsung.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            {/* Target Identity Strip */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[#2C2623]/25 bg-white px-3.5 py-2.5 dark:border-stone-600 dark:bg-stone-800/70">
              <Badge
                variant="outline"
                className="rounded-full border-2 border-[#2C2623] bg-[#FEF3C7] font-mono text-[11px] font-black text-[#2C2623] dark:border-stone-400"
              >
                {target.code}
              </Badge>
              <p className="min-w-0 flex-1 truncate text-xs font-extrabold text-[#2C2623] dark:text-stone-100">
                {target.title}
              </p>
            </div>

            {/* Active Short Link Box */}
            <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-gradient-to-br from-[#D1FAE5]/75 via-[#FFFDF7] to-[#E0F2FE]/80 p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:from-emerald-950/40 dark:via-stone-900 dark:to-sky-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#2C2623] dark:text-stone-100">
                  <Link2 className="size-3.5 text-[#115E3B] dark:text-emerald-300" />
                  Link Pratinjau Aktif
                </span>
                {loadingSlug && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#574E49] dark:text-stone-300">
                    <Loader2 className="size-3 animate-spin" />
                    Memuat...
                  </span>
                )}
              </div>

              <div className="rounded-xl border-2 border-[#2C2623] bg-white px-3 py-2 font-mono text-xs font-bold break-all text-[#14532D] select-all dark:border-stone-500 dark:bg-stone-950 dark:text-emerald-300">
                {fullShareUrl || "Menyiapkan alamat link pendek..."}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  size="sm"
                  disabled={!fullShareUrl || loadingSlug}
                  onClick={handleCopyLink}
                  className="rounded-xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#34D399] dark:border-stone-500"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5" />
                      Tersalin!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Salin Link
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!fullShareUrl || loadingSlug}
                  onClick={handleShareWhatsApp}
                  className="rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE68A] dark:border-stone-500 dark:bg-amber-950/60 dark:text-amber-100"
                >
                  <MessageCircle className="size-3.5" />
                  WhatsApp
                </Button>

                {activePath ? (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-2 border-[#2C2623] bg-white font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#E0F2FE] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <Link href={activePath} onClick={() => onOpenChange(false)}>
                      <ExternalLink className="size-3.5" />
                      Buka Pratinjau
                    </Link>
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" disabled>
                    <ExternalLink className="size-3.5" />
                    Buka Pratinjau
                  </Button>
                )}
              </div>

              {canNativeShare && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!fullShareUrl || loadingSlug}
                  onClick={handleNativeShare}
                  className="w-full rounded-xl border-2 border-[#2C2623] bg-[#E0F2FE] font-extrabold text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#BAE6FD] dark:border-stone-500 dark:bg-sky-950/60 dark:text-sky-100"
                >
                  <Share2 className="size-3.5" />
                  Bagikan via Aplikasi Perangkat
                </Button>
              )}
            </div>

            {/* Custom Readable Slug Form */}
            <form
              onSubmit={handleSaveSlug}
              className="space-y-3 rounded-2xl border-2 border-[#2C2623]/25 bg-white p-4 dark:border-stone-600 dark:bg-stone-800/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label
                  htmlFor="custom-share-slug"
                  className="flex items-center gap-1.5 text-xs font-black text-[#2C2623] dark:text-stone-100"
                >
                  <Sparkles className="size-3.5 text-amber-600 dark:text-amber-300" />
                  Ubah Nama Link Pendek (Kustom)
                </Label>
                {!canCustomize && (
                  <span className="text-muted-foreground text-[11px] font-semibold">
                    Hanya pembuat / Pimpinan
                  </span>
                )}
              </div>

              <div className="flex items-stretch overflow-hidden rounded-xl border-2 border-[#2C2623] bg-white focus-within:ring-2 focus-within:ring-[#2AB673] dark:border-stone-500 dark:bg-stone-900">
                <span className="flex shrink-0 items-center border-r-2 border-[#2C2623]/25 bg-[#FAF6ED] px-3 font-mono text-xs font-extrabold text-[#574E49] dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  /s/
                </span>
                <Input
                  id="custom-share-slug"
                  value={slugInput}
                  onChange={(e) => {
                    setSlugInput(e.target.value);
                    setErrorText(null);
                    setSuccessText(null);
                  }}
                  onBlur={() => {
                    if (slugInput.trim()) {
                      setSlugInput(normalizeShareSlug(slugInput));
                    }
                  }}
                  disabled={!canCustomize || isSaving || loadingSlug}
                  placeholder="misal: bubble-tower atau sop-klinik"
                  className="h-9 border-0 bg-transparent font-mono text-xs font-bold shadow-none focus-visible:ring-0"
                />
              </div>

              {normalizedDraft && (
                <p className="text-muted-foreground text-[11px]">
                  Alamat terbaca:{" "}
                  <span className="font-mono font-bold break-all text-[#2C2623] dark:text-stone-200">
                    /s/{normalizedDraft}
                  </span>
                </p>
              )}

              {canCustomize && suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-[#574E49] dark:text-stone-300">
                    Saran cepat yang mudah dibaca:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((suggestion) => {
                      const active = normalizedDraft === suggestion;
                      return (
                        <button
                          key={suggestion}
                          type="button"
                          disabled={isSaving || loadingSlug}
                          onClick={() => {
                            setSlugInput(suggestion);
                            setErrorText(null);
                            setSuccessText(null);
                          }}
                          className={`max-w-full truncate rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold transition-colors ${
                            active
                              ? "border-[#2C2623] bg-[#FEF3C7] text-[#2C2623]"
                              : "border-[#2C2623]/30 bg-[#FAF6ED] text-[#463F3A] hover:bg-[#E0F2FE] dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
                          }`}
                        >
                          /s/{suggestion}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {errorText && (
                <p className="rounded-xl border border-rose-400 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-200">
                  {errorText}
                </p>
              )}

              {successText && (
                <p className="rounded-xl border border-emerald-400 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200">
                  {successText}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canCustomize || !normalizedDraft || isSaving || loadingSlug || !isDirty}
                  className="rounded-xl border-2 border-[#2C2623] bg-[#7CC4FA] font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#57B3F8] dark:border-stone-500"
                >
                  {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                  Simpan Link Pendek
                </Button>
              </div>
            </form>

            {/* Login-Required Security Note */}
            <div className="flex items-start gap-2 rounded-2xl border border-[#2C2623]/25 bg-[#FEF3C7]/60 px-3 py-2 text-[11px] font-semibold text-[#574E49] dark:border-stone-600 dark:bg-amber-950/35 dark:text-amber-200">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
              <span>
                Hanya anggota tim StarOps yang login (sesuai hak akses role) yang dapat membuka
                link pratinjau ini.
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
