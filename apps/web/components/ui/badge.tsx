import type { HTMLAttributes } from "react";
import type { Tone } from "@/lib/status-tone";

export type { Tone } from "@/lib/status-tone";

/** Background + text classes for each tone, readable in both themes. Also used by the few
 * non-badge elements (a status dot's label, a pill-shaped link) that must look like a badge. */
export const BADGE_TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-gray-100 text-fg-muted dark:bg-gray-700",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  info: "bg-info-50 text-info-fg dark:bg-info-500/15",
  success: "bg-success-50 text-success-fg dark:bg-success-500/15",
  warning: "bg-warning-50 text-warning-fg dark:bg-warning-500/15",
  danger: "bg-error-50 text-danger-fg dark:bg-error-500/15",
};

const SIZE_CLASSES = {
  sm: "px-1.5 py-0.5 text-2xs",
  md: "px-2 py-0.5 text-xs",
} as const;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** "sm" for a badge inside a dense row or next to small text. */
  size?: keyof typeof SIZE_CLASSES;
}

/**
 * A small pill for a status, a count or a flag. The tone carries the meaning (see
 * lib/status-tone.ts for statuses): `<Badge tone={statusTone(invoice.status)}>`.
 */
export function Badge({ tone = "neutral", size = "md", className = "", ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ${SIZE_CLASSES[size]} ${BADGE_TONE_CLASSES[tone]} ${className}`}
    />
  );
}
