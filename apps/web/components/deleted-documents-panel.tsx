"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";

interface DeletedDocument {
  id: string;
  name: string;
  deletedAt: string;
  project: { id: string; name: string } | null;
  uploadedBy: { name: string } | null;
}

/** Deleting a document only sets `deletedAt` (see documents.service.ts) — the file and row stay
 * around — but until now nothing in the UI ever told the person who deleted it that undoing it
 * was possible. This is that undo surface: a company-wide trash list, owner/admin only (matches
 * who can delete a document in the first place). */
const DELETED_DOCUMENTS_PAGE_SIZE = 100;

export function DeletedDocumentsPanel() {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const [documents, setDocuments] = useState<DeletedDocument[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);

  function load() {
    apiFetch<DeletedDocument[]>("/documents/deleted").then((page) => {
      setDocuments(page);
      setHasMore(page.length === DELETED_DOCUMENTS_PAGE_SIZE);
    });
  }

  useEffect(load, []);

  async function loadMore() {
    if (!documents || documents.length === 0) return;
    setLoadMoreBusy(true);
    try {
      const page = await apiFetch<DeletedDocument[]>(
        `/documents/deleted?cursor=${documents[documents.length - 1].id}`,
      );
      setDocuments([...documents, ...page]);
      setHasMore(page.length === DELETED_DOCUMENTS_PAGE_SIZE);
    } finally {
      setLoadMoreBusy(false);
    }
  }

  async function restore(id: string) {
    setRestoringId(id);
    try {
      await apiFetch(`/documents/${id}/restore`, { method: "PATCH" });
      load();
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {t("deletedDocuments")}
      </h2>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        {t("deletedDocumentsHint")}
      </p>
      {!documents ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {tc("loading")}
        </p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {t("noDeletedDocuments")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-2 text-sm last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-800 dark:text-gray-100">
                  {d.name}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {d.project ? `${d.project.name} · ` : ""}
                  {d.uploadedBy
                    ? `${t("uploadedBy", { name: d.uploadedBy.name })} · `
                    : ""}
                  {t("deletedAt", { date: formatDateTime(d.deletedAt) })}
                </p>
              </div>
              <button
                onClick={() => restore(d.id)}
                disabled={restoringId === d.id}
                className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
              >
                {t("restore")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadMoreBusy}
          className="btn-secondary mt-3 px-2.5 py-1.5 text-xs"
        >
          {tc("loadMore")}
        </button>
      )}
    </div>
  );
}
