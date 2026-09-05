"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { setApiErrorListener } from "@/lib/api-client";

type ToastType = "error" | "success";
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), AUTO_DISMISS_MS);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    setApiErrorListener((message) => showToast("error", message));
    return () => setApiErrorListener(null);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-99999 flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-theme-md ${
              toast.type === "error" ? "bg-error-600" : "bg-success-600"
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} className="shrink-0 text-white/70 hover:text-white" aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
