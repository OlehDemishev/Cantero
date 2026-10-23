"use client";

import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";

export type ConfirmTone = "danger" | "default";
/** Common confirm-button labels, translated in the "dialog.verbs" namespace. */
export type ConfirmVerb =
  | "delete"
  | "remove"
  | "disconnect"
  | "revoke"
  | "disable"
  | "terminate"
  | "discard"
  | "reset"
  | "void"
  | "reject"
  | "decline"
  | "add"
  | "continue"
  | "request"
  | "cancelItem";

export interface ReasonOptions {
  label: string;
  placeholder?: string;
  /** The confirm button stays disabled until something other than whitespace is entered. */
  required?: boolean;
}

export interface ConfirmDialogProps {
  open: boolean;
  /** Defaults to "Are you sure?" (danger) or "Please confirm". */
  title?: string;
  message?: ReactNode;
  tone?: ConfirmTone;
  /** Overrides `verb`. */
  confirmLabel?: string;
  verb?: ConfirmVerb;
  cancelLabel?: string;
  /** Adds a textarea; its trimmed value is passed to onConfirm. */
  reason?: ReasonOptions;
  /** May return a promise: the dialog shows a busy state until it settles, and if it throws, shows
   * the error and stays open. Closing on success is up to the parent. */
  onConfirm: (reason: string) => unknown;
  onCancel: () => void;
}

const BUTTON_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const DANGER_BUTTON = `inline-flex items-center justify-center gap-2 rounded-lg bg-error-600 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-error-700 disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_FOCUS}`;

export function ConfirmDialog({
  open,
  title,
  message,
  tone = "default",
  confirmLabel,
  verb,
  cancelLabel,
  reason,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTranslations("dialog");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const reasonId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const danger = tone === "danger";
  const missingReason = !!reason?.required && !reasonText.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || missingReason) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reasonText.trim());
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title ?? (danger ? t("dangerTitle") : t("defaultTitle"))}
      description={message}
      dismissible={!busy}
      // Safe choice first for destructive actions; straight to the input when one is asked for.
      initialFocusRef={reason ? reasonRef : danger ? cancelRef : confirmRef}
    >
      <form onSubmit={submit} aria-busy={busy}>
        {reason && (
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium text-fg-muted">
              {reason.label}
            </label>
            <textarea
              id={reasonId}
              ref={reasonRef}
              rows={3}
              className="input"
              placeholder={reason.placeholder}
              required={reason.required}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              disabled={busy}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger-fg">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={`btn-secondary ${BUTTON_FOCUS}`}>
            {cancelLabel ?? t("cancel")}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            disabled={busy || missingReason}
            className={danger ? DANGER_BUTTON : `btn-primary ${BUTTON_FOCUS}`}
          >
            {busy ? t("working") : (confirmLabel ?? (verb ? t(`verbs.${verb}`) : t("confirm")))}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export interface ConfirmOptions {
  title?: string;
  message?: ReactNode;
  tone?: ConfirmTone;
  confirmLabel?: string;
  verb?: ConfirmVerb;
  cancelLabel?: string;
  /** Runs with the dialog in a busy state; a thrown error is shown in the dialog, which stays open. */
  action?: (reason: string) => unknown;
}

export interface ConfirmFn {
  /** Resolves to the entered reason, or null if cancelled. */
  (options: ConfirmOptions & { reason: ReasonOptions }): Promise<string | null>;
  /** Resolves to true if confirmed. */
  (options: ConfirmOptions): Promise<boolean>;
}

interface PendingConfirm {
  id: number;
  options: ConfirmOptions & { reason?: ReasonOptions };
  settle: (confirmed: boolean, reason: string) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Mounted once in the root layout; renders the dialog that useConfirm() asks for. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const current = useRef<PendingConfirm | null>(null);
  const nextId = useRef(0);

  const confirm = useCallback(
    (options: ConfirmOptions & { reason?: ReasonOptions }) =>
      new Promise<boolean | string | null>((resolve) => {
        // A second request replaces the first, which counts as cancelled.
        current.current?.settle(false, "");
        const request: PendingConfirm = {
          id: ++nextId.current,
          options,
          settle: (confirmed, reason) => {
            if (current.current === request) {
              current.current = null;
              setPending(null);
            }
            resolve(options.reason ? (confirmed ? reason : null) : confirmed);
          },
        };
        current.current = request;
        setPending(request);
      }),
    [],
  ) as ConfirmFn;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          key={pending.id}
          open
          title={pending.options.title}
          message={pending.options.message}
          tone={pending.options.tone}
          confirmLabel={pending.options.confirmLabel}
          verb={pending.options.verb}
          cancelLabel={pending.options.cancelLabel}
          reason={pending.options.reason}
          onCancel={() => pending.settle(false, "")}
          onConfirm={async (reason) => {
            await pending.options.action?.(reason);
            pending.settle(true, reason);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Promise-based replacement for window.confirm/prompt:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ message: t("confirmDelete"), tone: "danger", verb: "delete" }))) return;
 *   const reason = await confirm({ title, reason: { label, required: true } }); // string | null
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
