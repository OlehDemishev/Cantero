"use client";

export type FieldMessageType = "success" | "warning" | "error";

const STYLES: Record<FieldMessageType, string> = {
  success: "text-success-700 dark:text-success-500",
  warning: "text-warning-700 dark:text-warning-500",
  error: "text-error-700 dark:text-error-500",
};

/** Shared success/warning/error line for the field-app submit forms — used so a failed submit
 * (as opposed to a queued-offline or successful one) always gets a visibly distinct color instead
 * of silently reusing the success style or, worse, saying nothing at all. */
export function FieldMessage({ type, text }: { type: FieldMessageType; text: string }) {
  return <p className={`text-xs ${STYLES[type]}`}>{text}</p>;
}
