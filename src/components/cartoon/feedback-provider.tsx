"use client";

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import {
  CARTOON_GIF_CONFIG,
  CartoonLoadingCard,
  type CartoonFeedbackMode,
} from "./cartoon-loading-card";
import { cn } from "@/lib/utils";

export type { CartoonFeedbackMode };

export type FeedbackPopupOptions = {
  title?: string;
  message?: string;
  subMessage?: string;
  durationMs?: number;
  dismissible?: boolean;
};

export type RunWithFeedbackOptions<T = unknown> = {
  mode?: "working" | "batch" | "navigating";
  workingTitle?: string;
  workingMessage?: string;
  successTitle?: string;
  successMessage?: string | ((result: T) => string);
  errorTitle?: string;
  errorMessage?: string | ((error: unknown) => string);
  skipSuccess?: boolean;
  isResultError?: (result: T) => string | null | undefined;
};

export interface CartoonFeedbackContextValue {
  showWorking: (options?: FeedbackPopupOptions) => void;
  showNavigating: (options?: FeedbackPopupOptions) => void;
  showBatch: (options?: FeedbackPopupOptions) => void;
  showSuccess: (options?: FeedbackPopupOptions) => void;
  showError: (options?: FeedbackPopupOptions) => void;
  showIdle: (options?: FeedbackPopupOptions) => void;
  hide: () => void;
  runWithFeedback: <T>(
    options: RunWithFeedbackOptions<T>,
    fn: () => Promise<T>
  ) => Promise<T>;
}

const IDLE_TIMEOUT_MS = 120_000; // 2 minutes of inactivity
const ACTIVITY_THROTTLE_MS = 1_000;
const NAV_GRACE_MS = 180;
const NAV_SAFETY_TIMEOUT_MS = 12_000;
const DEFAULT_SUCCESS_DURATION_MS = 2_400;
const DEFAULT_ERROR_DURATION_MS = 5_500;

const NOOP_CONTEXT: CartoonFeedbackContextValue = {
  showWorking: () => {},
  showNavigating: () => {},
  showBatch: () => {},
  showSuccess: () => {},
  showError: () => {},
  showIdle: () => {},
  hide: () => {},
  runWithFeedback: async (_options, fn) => fn(),
};

const CartoonFeedbackContext =
  createContext<CartoonFeedbackContextValue>(NOOP_CONTEXT);

interface ActivePopupState {
  id: number;
  mode: CartoonFeedbackMode;
  title?: string;
  message?: string;
  subMessage?: string;
  messageIndex: number;
  dismissible: boolean;
}

function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"))
  );
}

function extractUnknownErrorText(err: unknown): string | undefined {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message.trim();
  }
  if (typeof err === "string" && err.trim().length > 0) {
    return err.trim();
  }
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    if (typeof rec.error === "string" && rec.error.trim().length > 0) {
      return rec.error.trim();
    }
    if (typeof rec.message === "string" && rec.message.trim().length > 0) {
      return rec.message.trim();
    }
  }
  return undefined;
}

function detectResultError<T>(
  result: T,
  isResultError?: (result: T) => string | null | undefined
): { isError: boolean; errorText?: string } {
  if (isResultError) {
    const custom = isResultError(result);
    if (custom === null) {
      return { isError: false };
    }
    if (typeof custom === "string" && custom.trim().length > 0) {
      return { isError: true, errorText: custom.trim() };
    }
  }

  if (result !== null && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.error === "string" && record.error.trim().length > 0) {
      return { isError: true, errorText: record.error.trim() };
    }
    if (record.ok === false) {
      const fallbackMsg =
        typeof record.message === "string" && record.message.trim().length > 0
          ? record.message.trim()
          : undefined;
      return { isError: true, errorText: fallbackMsg };
    }
  }

  return { isError: false };
}

function extractLinkLabel(anchor: HTMLAnchorElement): string | undefined {
  const ariaLabel = anchor.getAttribute("aria-label")?.trim();
  if (ariaLabel && ariaLabel.length >= 2 && ariaLabel.length <= 42) {
    return ariaLabel;
  }
  const rawText = anchor.textContent?.replace(/\s+/g, " ").trim();
  if (rawText && rawText.length >= 2 && rawText.length <= 42) {
    return rawText;
  }
  return undefined;
}

function NavigationWatcher({
  onRouteChange,
}: {
  onRouteChange: (routeKey: string) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchStr = searchParams?.toString() ?? "";
  const routeKey = searchStr ? `${pathname}?${searchStr}` : pathname;

  useEffect(() => {
    onRouteChange(routeKey);
  }, [routeKey, onRouteChange]);

  return null;
}

export function CartoonFeedbackProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<ActivePopupState | null>(null);

  const popupRef = useRef<ActivePopupState | null>(null);
  const popupIdRef = useRef(0);
  const modeCountersRef = useRef<Record<CartoonFeedbackMode, number>>({
    working: 0,
    navigating: 0,
    batch: 0,
    success: 0,
    idle: 0,
    error: 0,
  });

  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(0);
  const lastRouteKeyRef = useRef<string | null>(null);

  const clearPopupTimers = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (navSafetyTimerRef.current) {
      clearTimeout(navSafetyTimerRef.current);
      navSafetyTimerRef.current = null;
    }
    if (navGraceTimerRef.current) {
      clearTimeout(navGraceTimerRef.current);
      navGraceTimerRef.current = null;
    }
  }, []);

  const scheduleIdleTimerRef = useRef<() => void>(() => {});

  const hide = useCallback(() => {
    clearPopupTimers();
    popupRef.current = null;
    setPopup(null);
    scheduleIdleTimerRef.current();
  }, [clearPopupTimers]);

  const openPopup = useCallback(
    (mode: CartoonFeedbackMode, options?: FeedbackPopupOptions) => {
      clearPopupTimers();

      const nextId = ++popupIdRef.current;
      const msgIdx = modeCountersRef.current[mode]++;

      const defaultDismissible =
        mode === "success" ||
        mode === "error" ||
        mode === "idle" ||
        mode === "navigating";

      const nextState: ActivePopupState = {
        id: nextId,
        mode,
        title: options?.title,
        message: options?.message,
        subMessage: options?.subMessage,
        messageIndex: msgIdx,
        dismissible: options?.dismissible ?? defaultDismissible,
      };

      popupRef.current = nextState;
      setPopup(nextState);

      if (mode === "success") {
        const ms = options?.durationMs ?? DEFAULT_SUCCESS_DURATION_MS;
        if (ms > 0) {
          autoCloseTimerRef.current = setTimeout(() => {
            if (popupRef.current?.id === nextId) {
              hide();
            }
          }, ms);
        }
      } else if (mode === "error") {
        const ms = options?.durationMs ?? DEFAULT_ERROR_DURATION_MS;
        if (ms > 0) {
          autoCloseTimerRef.current = setTimeout(() => {
            if (popupRef.current?.id === nextId) {
              hide();
            }
          }, ms);
        }
      } else if (mode === "navigating") {
        const safetyMs = options?.durationMs ?? NAV_SAFETY_TIMEOUT_MS;
        if (safetyMs > 0) {
          navSafetyTimerRef.current = setTimeout(() => {
            if (popupRef.current?.id === nextId) {
              hide();
            }
          }, safetyMs);
        }
      } else if (options?.durationMs && options.durationMs > 0) {
        autoCloseTimerRef.current = setTimeout(() => {
          if (popupRef.current?.id === nextId) {
            hide();
          }
        }, options.durationMs);
      }
    },
    [clearPopupTimers, hide]
  );

  const showWorking = useCallback(
    (options?: FeedbackPopupOptions) => openPopup("working", options),
    [openPopup]
  );
  const showNavigating = useCallback(
    (options?: FeedbackPopupOptions) => openPopup("navigating", options),
    [openPopup]
  );
  const showBatch = useCallback(
    (options?: FeedbackPopupOptions) => openPopup("batch", options),
    [openPopup]
  );
  const showSuccess = useCallback(
    (options?: FeedbackPopupOptions) => openPopup("success", options),
    [openPopup]
  );
  const showError = useCallback(
    (options?: FeedbackPopupOptions) => openPopup("error", options),
    [openPopup]
  );
  const showIdle = useCallback(
    (options?: FeedbackPopupOptions) => openPopup("idle", options),
    [openPopup]
  );

  // Schedule/reset the 120s automatic idle detector
  const scheduleIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    idleTimerRef.current = setTimeout(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        popupRef.current === null
      ) {
        openPopup("idle");
      }
    }, IDLE_TIMEOUT_MS);
  }, [openPopup]);

  useEffect(() => {
    scheduleIdleTimerRef.current = scheduleIdleTimer;
  }, [scheduleIdleTimer]);

  // Preload all 6 animated GIFs quietly after mount so popups appear instantaneously
  useEffect(() => {
    const timer = setTimeout(() => {
      const urls = Object.values(CARTOON_GIF_CONFIG).map((cfg) => cfg.gif);
      for (const src of urls) {
        const img = new window.Image();
        img.src = src;
      }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      clearPopupTimers();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [clearPopupTimers]);

  // Automatic Idle Detector (120 seconds of inactivity)
  useEffect(() => {
    scheduleIdleTimer();

    const handleActivity = () => {
      // Do not dismiss idle popup on passive mouse movement; user wakes via button/Escape
      if (popupRef.current?.mode === "idle") {
        return;
      }
      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) {
        return;
      }
      lastActivityRef.current = now;
      scheduleIdleTimer();
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        popupRef.current === null
      ) {
        lastActivityRef.current = Date.now();
        scheduleIdleTimer();
      }
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    for (const evt of events) {
      window.addEventListener(evt, handleActivity, {
        passive: true,
        capture: true,
      });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, handleActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [scheduleIdleTimer]);

  // Capturing click listener on <a> elements for automatic menu switching / navigation popup
  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      // Do not interrupt active working/batch operations
      const currentMode = popupRef.current?.mode;
      if (currentMode === "working" || currentMode === "batch") {
        return;
      }

      const targetEl = event.target as Element | null;
      const anchor = targetEl?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      if (anchor.hasAttribute("download")) return;
      if (anchor.hasAttribute("data-no-nav-popup")) return;

      const targetAttr = anchor.getAttribute("target");
      if (targetAttr && targetAttr !== "_self") return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref) return;
      if (!rawHref.startsWith("/")) return;
      if (rawHref.startsWith("//")) return;
      if (rawHref.startsWith("#")) return;
      if (rawHref.startsWith("/api/") || rawHref === "/api") return;

      let destUrl: URL;
      try {
        destUrl = new URL(rawHref, window.location.origin);
      } catch {
        return;
      }

      if (destUrl.origin !== window.location.origin) return;
      if (destUrl.pathname.startsWith("/api/") || destUrl.pathname === "/api") {
        return;
      }

      // Only trigger when actually switching to a different pathname
      if (destUrl.pathname === window.location.pathname) return;

      const linkLabel = extractLinkLabel(anchor);
      openPopup("navigating", {
        subMessage: linkLabel ? `Menuju: ${linkLabel}` : undefined,
      });
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [openPopup]);

  // Auto-hide navigating popup once Next.js route transition settles
  const handleRouteChange = useCallback(
    (routeKey: string) => {
      if (lastRouteKeyRef.current === null) {
        lastRouteKeyRef.current = routeKey;
        return;
      }
      if (lastRouteKeyRef.current === routeKey) {
        return;
      }
      lastRouteKeyRef.current = routeKey;
      scheduleIdleTimer();

      const active = popupRef.current;
      if (active && active.mode === "navigating") {
        const expectedId = active.id;
        if (navGraceTimerRef.current) {
          clearTimeout(navGraceTimerRef.current);
        }
        navGraceTimerRef.current = setTimeout(() => {
          if (
            popupRef.current?.id === expectedId &&
            popupRef.current.mode === "navigating"
          ) {
            hide();
          }
        }, NAV_GRACE_MS);
      }
    },
    [hide, scheduleIdleTimer]
  );

  // Escape key closes dismissible popups (idle, error, success, navigating)
  useEffect(() => {
    if (!popup || !popup.dismissible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [popup, hide]);

  const runWithFeedback = useCallback(
    async <T,>(
      options: RunWithFeedbackOptions<T>,
      fn: () => Promise<T>
    ): Promise<T> => {
      const loadingMode = options.mode ?? "working";
      openPopup(loadingMode, {
        title: options.workingTitle,
        message: options.workingMessage,
      });

      try {
        const result = await fn();
        const detected = detectResultError(result, options.isResultError);

        if (detected.isError) {
          const customErrorMsg =
            typeof options.errorMessage === "function"
              ? options.errorMessage(detected.errorText ?? result)
              : options.errorMessage;

          const resolvedMessage = customErrorMsg ?? detected.errorText;
          const resolvedSubMessage =
            customErrorMsg &&
            detected.errorText &&
            customErrorMsg !== detected.errorText
              ? detected.errorText
              : undefined;

          openPopup("error", {
            title: options.errorTitle,
            message: resolvedMessage,
            subMessage: resolvedSubMessage,
          });
          return result;
        }

        if (options.skipSuccess) {
          hide();
        } else {
          const resolvedSuccessMsg =
            typeof options.successMessage === "function"
              ? options.successMessage(result)
              : options.successMessage;

          openPopup("success", {
            title: options.successTitle,
            message: resolvedSuccessMsg,
          });
        }

        return result;
      } catch (err) {
        if (isNextControlFlowError(err)) {
          hide();
          throw err;
        }

        const extracted = extractUnknownErrorText(err);
        const customErrorMsg =
          typeof options.errorMessage === "function"
            ? options.errorMessage(err)
            : options.errorMessage;

        const resolvedMessage = customErrorMsg ?? extracted;
        const resolvedSubMessage =
          customErrorMsg && extracted && customErrorMsg !== extracted
            ? extracted
            : undefined;

        openPopup("error", {
          title: options.errorTitle,
          message: resolvedMessage,
          subMessage: resolvedSubMessage,
        });
        throw err;
      }
    },
    [openPopup, hide]
  );

  const contextValue = useMemo<CartoonFeedbackContextValue>(
    () => ({
      showWorking,
      showNavigating,
      showBatch,
      showSuccess,
      showError,
      showIdle,
      hide,
      runWithFeedback,
    }),
    [
      showWorking,
      showNavigating,
      showBatch,
      showSuccess,
      showError,
      showIdle,
      hide,
      runWithFeedback,
    ]
  );

  const activeConfig = popup ? CARTOON_GIF_CONFIG[popup.mode] : null;

  return (
    <CartoonFeedbackContext.Provider value={contextValue}>
      <Suspense fallback={null}>
        <NavigationWatcher onRouteChange={handleRouteChange} />
      </Suspense>

      {children}

      {popup && activeConfig ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-live={popup.mode === "error" ? "assertive" : "polite"}
          aria-label={popup.title ?? activeConfig.defaultTitle}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 print:hidden"
        >
          {/* Soft cream/ink backdrop blur */}
          <div
            aria-hidden="true"
            onClick={popup.dismissible ? hide : undefined}
            className={cn(
              "animate-in fade-in-0 fixed inset-0 bg-[#2C2623]/40 backdrop-blur-[3px] duration-200",
              popup.dismissible ? "cursor-pointer" : "cursor-wait"
            )}
          />

          {/* Centered cute 2D Japanese cartoon modal card */}
          <div className="animate-in fade-in-0 zoom-in-95 relative z-10 w-full max-w-md duration-200">
            <CartoonLoadingCard
              mode={popup.mode}
              title={popup.title}
              message={popup.message}
              subMessage={popup.subMessage}
              messageIndex={popup.messageIndex}
              headerRight={
                popup.dismissible ? (
                  <button
                    type="button"
                    onClick={hide}
                    aria-label="Tutup popup"
                    className="inline-flex items-center gap-1 rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-2.5 py-0.5 text-xs font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 hover:bg-white active:translate-x-[1px] active:translate-y-[1px] active:shadow-none dark:border-stone-400 dark:bg-stone-800 dark:text-stone-100"
                  >
                    <X className="size-3.5" strokeWidth={2.75} />
                    <span>Tutup</span>
                  </button>
                ) : undefined
              }
              footer={
                popup.mode === "idle" ? (
                  <button
                    type="button"
                    onClick={hide}
                    className={cn(
                      "w-full cursor-pointer rounded-2xl border-2 border-[#2C2623] px-4 py-2.5 text-sm font-extrabold shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-stone-400",
                      activeConfig.palette.buttonBg
                    )}
                  >
                    Bangunin &amp; Lanjut Kerja! ✨
                  </button>
                ) : popup.mode === "success" ? (
                  <button
                    type="button"
                    onClick={hide}
                    className={cn(
                      "w-full cursor-pointer rounded-2xl border-2 border-[#2C2623] px-4 py-2.5 text-sm font-extrabold shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-stone-400",
                      activeConfig.palette.buttonBg
                    )}
                  >
                    Oke, Mantap! ♪
                  </button>
                ) : popup.mode === "error" ? (
                  <button
                    type="button"
                    onClick={hide}
                    className={cn(
                      "w-full cursor-pointer rounded-2xl border-2 border-[#2C2623] px-4 py-2.5 text-sm font-extrabold shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-stone-400",
                      activeConfig.palette.buttonBg
                    )}
                  >
                    Mengerti, Coba Lagi
                  </button>
                ) : undefined
              }
            />
          </div>
        </div>
      ) : null}
    </CartoonFeedbackContext.Provider>
  );
}

export function useCartoonFeedback(): CartoonFeedbackContextValue {
  return useContext(CartoonFeedbackContext);
}
