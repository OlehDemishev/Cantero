"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SignatureRequestStatus } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";

interface DocumentOption {
  id: string;
  name: string;
}
interface Signer {
  id: string;
  order: number;
  name: string;
  email: string;
  signedAt: string | null;
}
interface SignatureRequest {
  id: string;
  title: string;
  status: SignatureRequestStatus;
  document: { id: string; name: string };
  signers: Signer[];
}
interface DraftSigner {
  name: string;
  email: string;
}

const STATUS_STYLES: Record<SignatureRequestStatus, string> = {
  draft: "bg-gray-100 dark:bg-gray-700 text-fg-subtle",
  sent: "bg-warning-50 dark:bg-warning-500/15 text-warning-fg",
  completed: "bg-success-50 dark:bg-success-500/15 text-success-fg",
  voided: "bg-error-50 dark:bg-error-500/15 text-danger-fg",
};

export function SignatureRequestsPanel({ documents }: { documents: DocumentOption[] }) {
  const t = useTranslations("signatureRequests");
  const tc = useTranslations("common");

  const { data: requests = null, reload: reloadRequests } = useApi<SignatureRequest[]>("/signature-requests");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [signers, setSigners] = useState<DraftSigner[]>([{ name: "", email: "" }]);
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadRequests();
  }

  function addSignerRow() {
    setSigners((s) => [...s, { name: "", email: "" }]);
  }

  function removeSignerRow(index: number) {
    setSigners((s) => s.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validSigners = signers.filter((s) => s.name.trim() && s.email.trim());
    if (!documentId || validSigners.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/signature-requests", {
        method: "POST",
        body: JSON.stringify({ documentId, title, signers: validSigners }),
      });
      setTitle("");
      setDocumentId("");
      setSigners([{ name: "", email: "" }]);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function send(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/signature-requests/${id}/send`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function voidRequest(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/signature-requests/${id}/void`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newRequest")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("requestTitle")}</span>
            <input required className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("document")}</span>
            <select required className="input" value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">{t("selectDocument")}</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg-muted">{t("signersInOrder")}</span>
            {signers.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-xs text-fg-subtle">{i + 1}.</span>
                <input
                  required
                  className="input flex-1"
                  placeholder={t("signerName")}
                  value={s.name}
                  onChange={(e) => setSigners((arr) => arr.map((row, j) => (j === i ? { ...row, name: e.target.value } : row)))}
                />
                <input
                  required
                  type="email"
                  className="input flex-1"
                  placeholder={t("signerEmail")}
                  value={s.email}
                  onChange={(e) => setSigners((arr) => arr.map((row, j) => (j === i ? { ...row, email: e.target.value } : row)))}
                />
                {signers.length > 1 && (
                  <button type="button" onClick={() => removeSignerRow(i)} className="text-xs text-fg-subtle hover:text-error-700">
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addSignerRow} className="btn-secondary w-fit px-2 py-1 text-xs">
              + {t("addSigner")}
            </button>
          </div>
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

      {requests === null ? (
        <p className="text-sm text-fg-subtle">{tc("loading")}</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noRequests")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">{r.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>{t(r.status)}</span>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">{r.document.name}</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-fg-subtle">
                {r.signers
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <span>{s.order}.</span>
                      <span>{s.name}</span>
                      {s.signedAt ? (
                        <span className="text-success-fg">{t("signedOn", { date: formatDate(new Date(s.signedAt)) })}</span>
                      ) : (
                        <span className="text-fg-subtle">{t("notSigned")}</span>
                      )}
                    </li>
                  ))}
              </ul>
              {r.status === "draft" && (
                <button onClick={() => send(r.id)} disabled={busy} className="btn-primary mt-3 px-3 py-1 text-xs">
                  {t("sendForSignature")}
                </button>
              )}
              {(r.status === "draft" || r.status === "sent") && (
                <button onClick={() => voidRequest(r.id)} disabled={busy} className="btn-secondary ml-2 mt-3 px-3 py-1 text-xs">
                  {t("voidRequest")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
