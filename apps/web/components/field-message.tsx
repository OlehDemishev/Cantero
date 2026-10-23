"use client";

export type FieldMessageType = "success" | "warning" | "error";

const STYLES: Record<FieldMessageType, string> = {
  success: "text-success-fg",
  warning: "text-warning-fg",
  error: "text-danger-fg",
};

/** Shared success/warning/error line for the field-app submit forms — used so a failed submit
 * (as opposed to a queued-offline or successful one) always gets a visibly distinct color instead
 * of silently reusing the success style or, worse, saying nothing at all. */
export function FieldMessage({ type, text }: { type: FieldMessageType; text: string }) {
  return <p className={`text-xs ${STYLES[type]}`}>{text}</p>;
}
