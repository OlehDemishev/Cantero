"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ZodIssue, ZodTypeAny, z } from "zod";

export type FieldErrors = Partial<Record<string, string>>;
type Translate = (key: string, values?: Record<string, number>) => string;

/** One localized message per issue, by Zod issue code — the schemas' own English messages are for the API. */
function issueMessage(issue: ZodIssue, t: Translate): string {
  switch (issue.code) {
    case "invalid_type":
      if (issue.received === "undefined" || issue.received === "null") return t("required");
      if (issue.expected === "number" || issue.received === "nan") return t("number");
      return t("invalid");
    case "too_small":
      if (issue.type === "string") return Number(issue.minimum) <= 1 ? t("required") : t("tooShort", { min: Number(issue.minimum) });
      if (issue.type === "number") return issue.inclusive ? t("min", { min: Number(issue.minimum) }) : t("greaterThan", { min: Number(issue.minimum) });
      if (issue.type === "array") return t("required");
      return t("invalid");
    case "too_big":
      if (issue.type === "string") return t("tooLong", { max: Number(issue.maximum) });
      if (issue.type === "number") return t("max", { max: Number(issue.maximum) });
      return t("invalid");
    case "invalid_string":
      if (issue.validation === "email") return t("email");
      if (issue.validation === "uuid") return t("required");
      if (issue.validation === "datetime") return t("date");
      return t("invalid");
    case "not_multiple_of":
      return t("wholeNumber");
    default:
      return t("invalid");
  }
}

/** First message per top-level field. */
export function issuesToFieldErrors(issues: ZodIssue[], t: Translate): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!errors[key]) errors[key] = issueMessage(issue, t);
  }
  return errors;
}

/**
 * Client-side validation against a shared Zod schema (the same one the API validates with):
 * `validate(values)` returns the parsed data, or null after setting `errors` — one localized
 * message per field, to pass to <Field error>. After a failed submit, focus moves to the first
 * aria-invalid control inside `formRef`.
 */
export function useFormValidation<S extends ZodTypeAny>(schema: S) {
  const t = useTranslations("validation");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failedAttempts, setFailedAttempts] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (failedAttempts > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [failedAttempts]);

  const validate = useCallback(
    (values: unknown): z.infer<S> | null => {
      const result = schema.safeParse(values);
      if (result.success) {
        setErrors({});
        return result.data;
      }
      setErrors(issuesToFieldErrors(result.error.issues, t));
      setFailedAttempts((n) => n + 1);
      return null;
    },
    [schema, t],
  );

  /** Drop one field's message once the user edits it. */
  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, validate, clearError, reset, formRef };
}

/** "" → undefined, so an empty optional input passes `.optional()` in a schema. */
export function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** "" → undefined, anything else → Number (NaN fails the schema as "enter a number"). */
export function optionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}
