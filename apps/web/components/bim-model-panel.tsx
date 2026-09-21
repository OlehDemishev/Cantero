"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { AutodeskViewer } from "@/components/autodesk-viewer";

interface BrowserEntry {
  kind: "folder" | "file";
  id: string;
  name: string;
  urn?: string;
  versionNumber?: number;
}
interface Crumb {
  id: string | null;
  name: string;
}

const EDIT_ROLES = new Set(["owner", "admin", "estimator", "foreman"]);

/** The project's BIM model from Autodesk Construction Cloud, shown in Autodesk's viewer. Choosing
 * one walks the linked ACC project's Docs folders; the company-level connection lives in Settings →
 * Integrations, like the punch-list sync. */
export function BimModelPanel({
  projectId,
  role,
  initial,
}: {
  projectId: string;
  role: string | undefined;
  initial: { autodeskProjectId: string | null; autodeskModelUrn: string | null; autodeskModelName: string | null };
}) {
  const t = useTranslations("bim");
  const locale = useLocale();
  const canEdit = role !== undefined && EDIT_ROLES.has(role);

  const [accProjectId, setAccProjectId] = useState(initial.autodeskProjectId);
  const [model, setModel] = useState(initial.autodeskModelUrn ? { urn: initial.autodeskModelUrn, name: initial.autodeskModelName ?? "" } : null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(entry: BrowserEntry) {
    if (!entry.urn) return;
    const name = entry.versionNumber ? `${entry.name} (v${entry.versionNumber})` : entry.name;
    setError(null);
    try {
      await apiFetch(`/projects/${projectId}/autodesk/model`, { method: "PUT", body: JSON.stringify({ urn: entry.urn, name }) });
      setModel({ urn: entry.urn, name });
      setPicking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    }
  }

  async function remove() {
    if (!confirm(t("confirmRemove"))) return;
    setError(null);
    try {
      await apiFetch(`/projects/${projectId}/autodesk/model`, { method: "DELETE" });
      setModel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    }
  }

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{model ? model.name : t("hint")}</p>
        </div>
        {canEdit && !picking && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setPicking(true)}>
              {model ? t("change") : t("choose")}
            </button>
            {model && (
              <button className="btn-secondary" onClick={remove}>
                {t("remove")}
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="mb-2 text-xs text-error-600">{error}</p>}

      {picking && (
        <ModelPicker
          projectId={projectId}
          accProjectId={accProjectId}
          onLinked={(id) => {
            setAccProjectId(id.autodeskProjectId);
            if (!id.autodeskModelUrn) setModel(null);
          }}
          onChoose={choose}
          onCancel={() => setPicking(false)}
        />
      )}

      {!picking && model && <AutodeskViewer projectId={projectId} urn={model.urn} language={locale} />}
      {!picking && !model && !canEdit && <p className="text-xs text-gray-500 dark:text-gray-400">{t("noModel")}</p>}
    </section>
  );
}

function ModelPicker({
  projectId,
  accProjectId,
  onLinked,
  onChoose,
  onCancel,
}: {
  projectId: string;
  accProjectId: string | null;
  onLinked: (linked: { autodeskProjectId: string; autodeskModelUrn: string | null }) => void;
  onChoose: (entry: BrowserEntry) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("bim");
  const [linking, setLinking] = useState(!accProjectId);
  const [draftId, setDraftId] = useState(accProjectId ?? "");
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: t("projectRoot") }]);
  const [entries, setEntries] = useState<BrowserEntry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folderId = path[path.length - 1].id;

  useEffect(() => {
    if (linking) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    apiFetch<{ entries: BrowserEntry[]; truncated: boolean }>(`/projects/${projectId}/autodesk/models${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries);
        setTruncated(res.truncated);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("browseFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, folderId, linking, t]);

  async function link() {
    setError(null);
    try {
      const linked = await apiFetch<{ autodeskProjectId: string; autodeskModelUrn: string | null }>(`/projects/${projectId}/autodesk/project`, {
        method: "PUT",
        body: JSON.stringify({ autodeskProjectId: draftId.trim() }),
      });
      onLinked(linked);
      setPath([{ id: null, name: t("projectRoot") }]);
      setLinking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    }
  }

  if (linking) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("linkHint")}</p>
        {error && <p className="text-xs text-error-600">{error}</p>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[18rem] flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("accProjectId")}</span>
            <input className="input font-mono" placeholder="1a2b3c4d-…" value={draftId} onChange={(e) => setDraftId(e.target.value)} />
          </label>
          <button className="btn-primary" disabled={draftId.trim().length === 0} onClick={link}>
            {t("link")}
          </button>
          <button className="btn-secondary" onClick={accProjectId ? () => setLinking(false) : onCancel}>
            {t("cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label={t("folderPath")} className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
          {path.map((crumb, i) => (
            <span key={crumb.id ?? "root"} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-400">/</span>}
              {i < path.length - 1 ? (
                <button className="text-brand-700 hover:underline dark:text-brand-400" onClick={() => setPath(path.slice(0, i + 1))}>
                  {crumb.name}
                </button>
              ) : (
                <span className="font-medium text-gray-700 dark:text-gray-200">{crumb.name}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="flex gap-2">
          <button className="text-xs text-gray-500 hover:underline dark:text-gray-400" onClick={() => setLinking(true)}>
            {t("changeAccProject")}
          </button>
          <button className="btn-secondary" onClick={onCancel}>
            {t("cancel")}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-error-600">{error}</p>}
      {!error && entries === null && <p className="text-xs text-gray-500 dark:text-gray-400">{t("loadingFolder")}</p>}
      {entries && entries.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t("emptyFolder")}</p>}
      {entries && entries.length > 0 && (
        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => (entry.kind === "folder" ? setPath([...path, { id: entry.id, name: entry.name }]) : onChoose(entry))}
              >
                <span aria-hidden className="w-4 text-center text-gray-400">
                  {entry.kind === "folder" ? "▸" : "◇"}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100">{entry.name}</span>
                {entry.kind === "file" && (
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {entry.versionNumber ? `v${entry.versionNumber} · ` : ""}
                    {t("show")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {truncated && <p className="text-xs text-gray-500 dark:text-gray-400">{t("truncated")}</p>}
    </div>
  );
}
