"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, NetworkError, notifyApiError, setApiErrorListener } from "@/lib/api-client";
import { ApiErrorMessages } from "@/components/api-error-messages";

type ToastType = "error" | "success" | "info";
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const AUTO_DISMISS_MS = 6000;

const ToastContext = createContext<{ showToast: (type: ToastType, message: string) => void } | null>(null);

/**
 * Mounted once in the root layout. Wires itself into apiFetch/apiUpload's error path (see
 * lib/api-client.ts's setApiErrorListener) so a failed mutation always tells the user something,
 * even in the ~100+ components that never wrote their own error-handling code — the historical
 * default across most of this app. Components with their own inline error UI can still call
 * useToast().showToast() directly too (e.g. for a success confirmation).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const tl = useTranslations("labels");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId.current;
    // Several loads failing for one reason (offline, say) show that reason once, not once each.
    setToasts((prev) => (prev.some((t) => t.type === type && t.message === message) ? prev : [...prev, { id, type, message }]));
  }, []);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  useEffect(() => {
    setApiErrorListener((message) => showToast("error", message));
    return () => setApiErrorListener(null);
  }, [showToast]);

  // Safety net for an API failure nothing caught — typically an event handler's `await apiFetch()`
  // inside try/finally: the person hears about it once (a failed write was already toasted by
  // apiFetch) and it doesn't surface as an unhandled rejection. Other errors are left alone.
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason: unknown = event.reason;
      const aborted = reason instanceof DOMException && reason.name === "AbortError";
      if (!(reason instanceof ApiError) && !(reason instanceof NetworkError) && !aborted) return;
      event.preventDefault();
      notifyApiError(reason);
    }
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      <ApiErrorMessages />
      {children}
      {/* Both live regions are always in the page, so a toast added to one is announced: errors
          interrupt (alert), confirmations wait their turn (status). */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-99999 flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
        <div role="alert" className="flex flex-col gap-2">
          {toasts.filter((t) => t.type === "error").map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} dismissLabel={tl("dismissNotification")} />
          ))}
        </div>
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {toasts.filter((t) => t.type !== "error").map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} dismissLabel={tl("dismissNotification")} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

const TOAST_BACKGROUND: Record<ToastType, string> = { error: "bg-error-600", success: "bg-success-600", info: "bg-gray-800" };

/** Disappears after AUTO_DISMISS_MS, but not while the pointer is on it or focus is inside it. */
function ToastItem({ toast, onDismiss, dismissLabel }: { toast: Toast; onDismiss: (id: number) => void; dismissLabel: string }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={`pointer-events-auto flex items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-theme-md ${TOAST_BACKGROUND[toast.type]}`}
    >
      <span className="flex-1">{toast.message}</span>
      <button type="button" onClick={() => onDismiss(toast.id)} className="shrink-0 text-white/80 hover:text-white" aria-label={dismissLabel}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
