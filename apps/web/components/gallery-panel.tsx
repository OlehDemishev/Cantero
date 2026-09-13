"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload } from "@/lib/api-client";

interface GalleryDocument {
  id: string;
  name: string;
  mimeType: string;
}
interface Gallery {
  before: GalleryDocument[];
  after: GalleryDocument[];
}

function Thumbnail({ doc }: { doc: GalleryDocument }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    apiFetch<Blob>(`/documents/${doc.id}/download`).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id]);

  if (!src) return <div className="aspect-square animate-pulse rounded-md bg-gray-100 dark:bg-gray-700" />;
  return <img src={src} alt={doc.name} className="aspect-square rounded-md object-cover" />;
}

function GalleryColumn({
  title,
  docs,
  onUpload,
  busy,
}: {
  title: string;
  docs: GalleryDocument[];
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tc = useTranslations("common");

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {docs.map((doc) => (
          <Thumbnail key={doc.id} doc={doc} />
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="btn-secondary mt-2 px-2 py-1 text-xs"
      >
        {tc("chooseFile")}
      </button>
    </div>
  );
}

export function GalleryPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("gallery");
  const tc = useTranslations("common");
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Gallery>(`/projects/${projectId}/gallery`).then(setGallery);
  }

  useEffect(load, [projectId]);

  async function upload(category: "gallery_before" | "gallery_after", file: File) {
    setBusy(true);
    try {
      await apiUpload(`/documents?projectId=${projectId}&category=${category}`, file);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      {!gallery ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : (
        <div className="card grid grid-cols-1 gap-6 sm:grid-cols-2">
          <GalleryColumn title={t("before")} docs={gallery.before} onUpload={(f) => upload("gallery_before", f)} busy={busy} />
          <GalleryColumn title={t("after")} docs={gallery.after} onUpload={(f) => upload("gallery_after", f)} busy={busy} />
        </div>
      )}
    </div>
  );
}
