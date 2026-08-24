"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BulkActionResult, PunchListItemStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { PhotoAttachments } from "@/components/photo-attachments";
import { CommentsThread } from "@/components/comments-thread";
import { useBulkSelection } from "@/components/bulk-select";

interface Worker {
  id: string;
  name: string;
}
interface PunchListItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: PunchListItemStatus;
  dueDate: string | null;
  assignee: Worker | null;
  createdByName: string;
  resolvedByName: string | null;
  verifiedByName: string | null;
}

const STATUS_STYLES: Record<PunchListItemStatus, string> = {
  open: "bg-gray-100 text-gray-600",
  resolved: "bg-warning-50 text-warning-700",
  verified: "bg-success-50 text-success-700",
};

export function PunchListPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("punchList");
  const tc = useTranslations("common");
  const tb = useTranslations("bulk");

  const [items, setItems] = useState<PunchListItem[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", location: "", assigneeWorkerId: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const bulk = useBulkSelection();

  function load() {
    apiFetch<PunchListItem[]>(`/punch-list?projectId=${projectId}`).then(setItems);
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/punch-list", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: form.title,
          description: form.description || undefined,
          location: form.location || undefined,
          assigneeWorkerId: form.assigneeWorkerId || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        }),
      });
      setForm({ title: "", description: "", location: "", assigneeWorkerId: "", dueDate: "" });
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function transition(id: string, action: "resolve" | "verify" | "reopen") {
    await apiFetch(`/punch-list/${id}/${action}`, { method: "POST" });
    load();
  }

  async function bulkTransition(action: "resolve" | "verify") {
    const ids = Array.from(bulk.selected);
    const result = await apiFetch<BulkActionResult>(`/punch-list/bulk/${action}`, { method: "POST", body: JSON.stringify({ ids }) });
    bulk.setResult(result);
    bulk.clearSelection();
    load();
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newItem")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("itemTitle")}</span>
            <input
              required
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("location")}</span>
              <input
                className="input"
                placeholder={t("locationPlaceholder")}
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("assignee")}</span>
              <select
                className="input"
                value={form.assigneeWorkerId}
                onChange={(e) => setForm((f) => ({ ...f, assigneeWorkerId: e.target.value }))}
              >
                <option value="">{tc("none")}</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex w-40 flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("dueDate")}</span>
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("description")}</span>
            <textarea
              rows={2}
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {bulk.result && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span>{tb("resultSummary", { succeeded: bulk.result.succeeded, failed: bulk.result.failed.length })}</span>
          <button onClick={bulk.dismissResult} className="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noItems")}</p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-3 text-xs text-gray-500">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={bulk.selected.size === items.length}
                onChange={() => bulk.toggleAll(items.map((i) => i.id))}
              />
              {tb("selectAll")}
            </label>
            {bulk.selected.size > 0 && (
              <>
                <span>{tb("nSelected", { count: bulk.selected.size })}</span>
                <button onClick={() => bulkTransition("resolve")} className="btn-secondary px-2.5 py-1 text-xs">
                  {t("bulkResolve")}
                </button>
                <button onClick={() => bulkTransition("verify")} className="btn-secondary px-2.5 py-1 text-xs">
                  {t("bulkVerify")}
                </button>
              </>
            )}
          </div>
          <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={bulk.selected.has(item.id)} onChange={() => bulk.toggle(item.id)} />
                  <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{item.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}>
                      {t(item.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    {item.location && <span>{item.location}</span>}
                    {item.assignee && <span>{t("assignedTo", { name: item.assignee.name })}</span>}
                    {item.dueDate && <span>{new Date(item.dueDate).toLocaleDateString()}</span>}
                  </div>
                  {item.description && <p className="mt-1.5 text-xs text-gray-500">{item.description}</p>}
                  {item.status === "verified" && item.verifiedByName && (
                    <p className="mt-1.5 text-xs text-success-700">{t("verifiedBy", { name: item.verifiedByName })}</p>
                  )}
                  {item.status === "resolved" && item.resolvedByName && (
                    <p className="mt-1.5 text-xs text-warning-700">{t("resolvedBy", { name: item.resolvedByName })}</p>
                  )}
                  <div className="mt-2">
                    <PhotoAttachments param="punchListItemId" entityId={item.id} />
                  </div>
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <CommentsThread param="punchListItemId" entityId={item.id} />
                  </div>
                  </div>
                </div>
                <div className="flex flex-none gap-1.5">
                  {item.status === "open" && (
                    <button onClick={() => transition(item.id, "resolve")} className="btn-secondary px-2.5 py-1 text-xs">
                      {t("markResolved")}
                    </button>
                  )}
                  {item.status === "resolved" && (
                    <>
                      <button onClick={() => transition(item.id, "verify")} className="btn-primary px-2.5 py-1 text-xs">
                        {t("verify")}
                      </button>
                      <button onClick={() => transition(item.id, "reopen")} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("reopen")}
                      </button>
                    </>
                  )}
                  {item.status === "verified" && (
                    <button onClick={() => transition(item.id, "reopen")} className="btn-secondary px-2.5 py-1 text-xs">
                      {t("reopen")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
          </ul>
        </>
      )}
    </div>
  );
}
