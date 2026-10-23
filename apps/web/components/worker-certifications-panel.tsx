"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Certification {
  id: string;
  name: string;
  expiresAt: string;
}

export function WorkerCertificationsPanel({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const confirm = useConfirm();
  const tc = useTranslations("common");
  const { data: certifications = null, reload: reloadCertifications } = useApi<Certification[]>(`/workers/${workerId}/certifications`);
  const [certForm, setCertForm] = useState({ name: "", expiresAt: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadCertifications();
  }

  async function addCertification(e: React.FormEvent) {
    e.preventDefault();
    if (!certForm.name || !certForm.expiresAt) return;
    setBusy(true);
    try {
      await apiFetch(`/workers/${workerId}/certifications`, {
        method: "POST",
        body: JSON.stringify({ name: certForm.name, expiresAt: new Date(certForm.expiresAt).toISOString() }),
      });
      setCertForm({ name: "", expiresAt: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeCertification(certificationId: string) {
    if (!(await confirm({ message: t("confirmDeleteCertification"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/workers/${workerId}/certifications/${certificationId}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">{t("certifications")}</h2>
      {certifications === null ? (
        <p className="text-sm text-fg-subtle">{tc("loading")}</p>
      ) : certifications.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noCertifications")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {certifications.map((cert) => {
            const expired = new Date(cert.expiresAt) < new Date();
            return (
              <li key={cert.id} className="card flex items-center justify-between text-sm">
                <span>
                  {cert.name}
                  {" — "}
                  <span className={expired ? "text-danger-fg" : "text-fg-subtle"}>
                    {formatDate(new Date(cert.expiresAt))}
                  </span>
                </span>
                <button onClick={() => removeCertification(cert.id)} className="text-fg-subtle hover:text-danger-fg">
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={addCertification} className="mt-3 flex flex-col gap-2">
        <input
          required
          placeholder={t("certificationNamePlaceholder")}
          className="input"
          value={certForm.name}
          onChange={(e) => setCertForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          required
          type="date"
          className="input"
          value={certForm.expiresAt}
          onChange={(e) => setCertForm((f) => ({ ...f, expiresAt: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary self-start">
          {t("addCertification")}
        </button>
      </form>
    </>
  );
}
