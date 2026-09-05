"use client";

import { useTranslations } from "next-intl";

/** Triggers the browser's print dialog for the current page — pairs with the `print:hidden` classes on AuthenticatedShell's chrome and the `@media print` rules in globals.css. Marked `no-print` itself so it doesn't show up in the printed output. */
export function PrintButton({ className = "" }: { className?: string }) {
  const tc = useTranslations("common");
  return (
    <button type="button" onClick={() => window.print()} className={`no-print btn-secondary px-2.5 py-1 text-xs ${className}`}>
      {tc("print")}
    </button>
  );
}
