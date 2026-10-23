import type { ReactNode } from "react";
import type { Tone } from "@/lib/status-tone";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-surface-muted text-fg-muted",
  brand: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300",
  info: "border-info-200 bg-info-50 text-info-fg dark:border-info-500/30 dark:bg-info-500/15",
  success: "border-success-200 bg-success-50 text-success-fg dark:border-success-500/30 dark:bg-success-500/15",
  warning: "border-warning-200 bg-warning-50 text-warning-fg dark:border-warning-500/30 dark:bg-warning-500/15",
  danger: "border-error-200 bg-error-50 text-danger-fg dark:border-error-500/30 dark:bg-error-500/15",
};

export interface AlertProps {
  tone?: Tone;
  /** Bold first line above the message. */
  title?: ReactNode;
  /** A button or link at the end of the notice (e.g. "Retry", "Review"). */
  action?: ReactNode;
  /** "sm" for a notice inside a card or a table row. */
  size?: "sm" | "md";
  /** Defaults to "alert" for danger (announced at once) and "status" for the rest. */
  role?: "alert" | "status" | "note";
  className?: string;
  children?: ReactNode;
}

/**
 * A boxed notice: an error that stopped an action, a warning about the record, a success
 * confirmation. For a one-line error under a form use FormError; for "couldn't load" use ErrorState.
 */
export function Alert({ tone = "danger", title, action, size = "md", role, className = "", children }: AlertProps) {
  const sizeClasses = size === "sm" ? "gap-2 px-2.5 py-1.5 text-xs" : "gap-3 px-3 py-2 text-sm";
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={`flex items-start justify-between rounded-lg border ${sizeClasses} ${TONE_CLASSES[tone]} ${className}`}
    >
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
