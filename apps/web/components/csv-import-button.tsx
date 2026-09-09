"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiUpload } from "@/lib/api-client";

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export function CsvImportButton({
  endpoint,
  label,
  onDone,
}: {
  endpoint: string;
  label: string;
  onDone: () => void;
}) {
  const t = useTranslations("import");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await apiUpload<ImportResult>(endpoint, file);
      setResult(res);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-secondary">
        {busy ? t("importing") : label}
      </button>
      {result && (
        <p className="mt-2 max-w-md text-xs text-gray-600 dark:text-gray-300">
          {t("resultSummary", { created: result.created, skipped: result.skipped })}
          {result.errors.length > 0 && (
            <span className="mt-1 block text-error-600">
              {result.errors
                .slice(0, 3)
                .map((e) => `${t("row")} ${e.row}: ${e.message}`)
                .join("; ")}
              {result.errors.length > 3 ? ` +${result.errors.length - 3} ${t("more")}` : ""}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
