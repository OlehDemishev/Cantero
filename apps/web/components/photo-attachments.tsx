"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload } from "@/lib/api-client";

type AttachmentParam = "punchListItemId" | "dailyLogId" | "incidentReportId" | "warrantyClaimId";

interface DocumentSummary {
  id: string;
  name: string;
  mimeType: string;
}

/** Reusable photo strip for the field modules — punch list items, daily logs, incidents, warranty
 * claims — all attach through the same Document model via one of the four id params. Thumbnails
 * are fetched as authenticated blobs and shown via object URLs, since a plain <img src> can't
 * carry the Authorization header the API requires. */
export function PhotoAttachments({ param, entityId }: { param: AttachmentParam; entityId: string }) {
  const t = useTranslations("photos");

  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  function load() {
    apiFetch<DocumentSummary[]>(`/documents?${param}=${entityId}`).then(setDocs);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  useEffect(() => {
    if (!docs) return;
    let cancelled = false;
    Promise.all(
      docs
        .filter((d) => d.mimeType.startsWith("image/"))
        .map(async (d) => {
          const blob = await apiFetch<Blob>(`/documents/${d.id}/download`);
          return [d.id, URL.createObjectURL(blob)] as const;
        }),
    ).then((pairs) => {
      if (cancelled) return;
      const next = Object.fromEntries(pairs);
      setPreviews(next);
      objectUrlsRef.current = Object.values(next);
    });
    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await apiUpload(`/documents?${param}=${entityId}&category=photo`, file);
      load();
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-700">{t("title")}</span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="btn-secondary px-2 py-0.5 text-xs"
        >
          {busy ? t("uploading") : t("addPhoto")}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
      {docs === null ? null : docs.length === 0 ? (
        <p className="text-xs text-gray-400">{t("noPhotos")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {docs.map((d) => (
            <a
              key={d.id}
              href={previews[d.id]}
              target="_blank"
              rel="noreferrer"
              className="block h-16 w-16 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
            >
              {previews[d.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[d.id]} alt={d.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">…</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
