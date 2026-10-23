"use client";

import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type ControlProps = {
  id?: string;
  required?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

export interface FieldProps {
  label: ReactNode;
  /** Helper text under the control (format, limits). */
  hint?: ReactNode;
  /** Validation message; marks the control aria-invalid and points aria-describedby at it. */
  error?: ReactNode;
  /** The control's id when you need to know it; otherwise one is generated. */
  id?: string;
  /** "sm" is the compact variant used in inline add-rows and filters: small, muted label. */
  size?: "sm" | "md";
  /** Visually hide the label (it stays the control's accessible name). */
  hideLabel?: boolean;
  className?: string;
  /** One control — input, select, textarea or a component that forwards these props to one. */
  children: ReactNode;
}

/**
 * Label + control + hint + error, wired together: the label's htmlFor and the control's id match,
 * and the control gets aria-invalid and aria-describedby (hint and error) without the caller
 * writing any ids. Shows a "*" after the label when the control is `required`.
 */
export function Field({ label, hint, error, id, size = "md", hideLabel = false, className = "", children }: FieldProps) {
  const generatedId = useId();
  const only = Children.count(children) === 1 && isValidElement<ControlProps>(children) ? (children as ReactElement<ControlProps>) : null;
  const controlId = id ?? only?.props.id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [only?.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = only
    ? cloneElement(only, {
        id: controlId,
        "aria-invalid": error ? true : only.props["aria-invalid"],
        "aria-describedby": describedBy,
      })
    : children;

  const compact = size === "sm";
  return (
    <div className={`flex flex-col ${compact ? "gap-1 text-xs" : "gap-1.5 text-sm"} ${className}`}>
      <label htmlFor={controlId} className={hideLabel ? "sr-only" : compact ? "text-fg-subtle" : "text-fg-muted"}>
        {label}
        {only?.props.required && (
          <span aria-hidden="true" className="text-danger-fg">
            {" *"}
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The error a form shows after a failed submit (the server said no), under the fields or next to
 * the submit button. Renders nothing without a message; announced to screen readers when it appears.
 */
export function FormError({ id, size = "xs", className = "", children }: { id?: string; size?: "xs" | "sm"; className?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={`${size === "sm" ? "text-sm" : "text-xs"} text-danger-fg ${className}`}>
      {children}
    </p>
  );
}
