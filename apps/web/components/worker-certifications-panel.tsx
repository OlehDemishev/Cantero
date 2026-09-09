"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Certification {
  id: string;
  name: string;
  expiresAt: string;
}

export function WorkerCertificationsPanel({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const [certifications, setCertifications] = useState<Certification[] | null>(null);
  const [certForm, setCertForm] = useState({ name: "", expiresAt: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Certification[]>(`/workers/${workerId}/certifications`).then(setCertifications);
  }

  useEffect(load, [workerId]);

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
    if (!window.confirm(t("confirmDeleteCertification"))) return;
    await apiFetch(`/workers/${workerId}/certifications/${certificationId}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("certifications")}</h2>
      {certifications === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : certifications.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noCertifications")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {certifications.map((cert) => {
            const expired = new Date(cert.expiresAt) < new Date();
            return (
              <li key={cert.id} className="card flex items-center justify-between text-sm">
                <span>
                  {cert.name}
                  {" — "}
                  <span className={expired ? "text-error-700 dark:text-error-500" : "text-gray-500 dark:text-gray-400"}>
                    {formatDate(new Date(cert.expiresAt))}
                  </span>
                </span>
                <button onClick={() => removeCertification(cert.id)} className="text-gray-400 dark:text-gray-500 hover:text-error-600">
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
