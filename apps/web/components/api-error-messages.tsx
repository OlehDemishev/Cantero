"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { setApiErrorTranslator } from "@/lib/api-client";

/** Hands lib/api-client.ts (plain functions, no hooks) the translated generic error texts — network
 * down, server error, no access, session expired. Mounted in the root layout's ToastProvider and
 * again inside a public page's own language (components/public-locale.tsx); unmounting restores
 * whatever was registered before. */
export function ApiErrorMessages() {
  const t = useTranslations("apiErrors");
  useEffect(() => {
    const previous = setApiErrorTranslator((key) => t(key));
    return () => {
      setApiErrorTranslator(previous);
    };
  }, [t]);
  return null;
}
