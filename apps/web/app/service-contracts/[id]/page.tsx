"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { goBack } from "@/lib/back-navigation";

interface Worker {
  id: string;
  name: string;
}
interface ServiceVisit {
  id: string;
  scheduledDate: string;
  completedAt: string | null;
  notes: string | null;
  satisfactionRating: number | null;
  technician: Worker | null;
}
interface ServiceContract {
  id: string;
  title: string;
  frequencyMonths: number;
  nextVisitDate: string;
  active: boolean;
  notes: string | null;
  project: { id: string; name: string };
  client: { id: string; name: string };
  visits: ServiceVisit[];
}

export default function ServiceContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("serviceContracts");
  const tc = useTranslations("common");
  const router = useRouter();

  const [contract, setContract] = useState<ServiceContract | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [visitForm, setVisitForm] = useState({ scheduledDate: "", technicianWorkerId: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ServiceContract>(`/service-contracts/${id}`).then(setContract);
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function scheduleVisit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/service-contracts/${id}/visits`, {
        method: "POST",
        body: JSON.stringify({
          scheduledDate: new Date(visitForm.scheduledDate).toISOString(),
          technicianWorkerId: visitForm.technicianWorkerId || undefined,
        }),
      });
      setVisitForm({ scheduledDate: "", technicianWorkerId: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function completeVisit(visitId: string) {
    setBusy(true);
    try {
      await apiFetch(`/service-visits/${visitId}/complete`, { method: "POST", body: JSON.stringify({}) });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!contract) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <button onClick={() => goBack(router, "/service-contracts")} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← {tc("back")}
      </button>
      <h1 className="mt-2 text-2xl font-semibold">{contract.title}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        <Link href={`/projects/${contract.project.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
          {contract.project.name}
        </Link>{" "}
        ·{" "}
        <Link href={`/clients/${contract.client.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
          {contract.client.name}
        </Link>
      </p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("scheduleVisit")}</h2>
          <form onSubmit={scheduleVisit} className="flex flex-col gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              {t("visitDate")}
              <input
                required
                type="date"
                className="input mt-1"
                value={visitForm.scheduledDate}
                onChange={(e) => setVisitForm((f) => ({ ...f, scheduledDate: e.target.value }))}
              />
            </label>
            <select
              className="input"
              value={visitForm.technicianWorkerId}
              onChange={(e) => setVisitForm((f) => ({ ...f, technicianWorkerId: e.target.value }))}
            >
              <option value="">{t("selectTechnician")}</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy} className="btn-primary">
              {t("schedule")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("visits")}</h2>
          {contract.visits.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noVisits")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {contract.visits.map((v) => (
                <li key={v.id} className="card flex items-center justify-between">
                  <div>
                    <span className="font-medium">{formatDate(new Date(v.scheduledDate))}</span>
                    {v.technician && <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{v.technician.name}</span>}
                    {v.satisfactionRating && (
                      <span className="ml-2 text-sm text-amber-500">{"★".repeat(v.satisfactionRating)}</span>
                    )}
                  </div>
                  {v.completedAt ? (
                    <span className="text-xs text-success-700 dark:text-success-500">{t("completed")}</span>
                  ) : (
                    <button onClick={() => completeVisit(v.id)} disabled={busy} className="btn-secondary px-3 py-1 text-xs">
                      {t("markComplete")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
