"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  getSubcontractorPortalToken,
  subcontractorPortalApiFetch,
  clearSubcontractorPortalToken,
} from "@/lib/subcontractor-portal-api-client";

interface Me {
  name: string;
  companyName: string;
  currency: string;
}
interface Assignment {
  id: string;
  project: { id: string; name: string; address: string | null };
}
interface Cost {
  id: string;
  description: string;
  amount: string;
  incurredDate: string;
  paid: boolean;
  project: { name: string };
}

export default function SubcontractorPortalDashboardPage() {
  const t = useTranslations("subcontractorPortal");
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [costs, setCosts] = useState<Cost[] | null>(null);
  const [form, setForm] = useState({ projectId: "", description: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadCosts() {
    subcontractorPortalApiFetch<Cost[]>("/subcontractor-portal/costs").then(setCosts);
  }

  useEffect(() => {
    if (!getSubcontractorPortalToken()) {
      router.replace("/subcontractor-portal/login");
      return;
    }
    subcontractorPortalApiFetch<Me>("/subcontractor-portal/me").then(setMe);
    subcontractorPortalApiFetch<Assignment[]>("/subcontractor-portal/projects").then((list) => {
      setAssignments(list);
      if (list[0]) setForm((f) => ({ ...f, projectId: f.projectId || list[0].project.id }));
    });
    loadCosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    clearSubcontractorPortalToken();
    router.replace("/subcontractor-portal/login");
  }

  async function submitCost(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await subcontractorPortalApiFetch("/subcontractor-portal/costs", {
        method: "POST",
        body: JSON.stringify({
          projectId: form.projectId,
          description: form.description,
          amount: Number(form.amount),
        }),
      });
      setForm((f) => ({ ...f, description: "", amount: "" }));
      loadCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("verifyError"));
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
        <p className="text-sm text-gray-500">{t("loading")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
              C
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{me.companyName}</p>
              <p className="text-xs text-gray-500">{t("welcome", { name: me.name })}</p>
            </div>
          </div>
          <button onClick={logout} className="btn-secondary px-3 py-1.5 text-xs">
            {t("logout")}
          </button>
        </div>
        {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("projects")}</h2>
          {!assignments || assignments.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noProjects")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assignments.map((a) => (
                <li key={a.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-900">{a.project.name}</span>
                  {a.project.address && <span className="ml-2 text-xs text-gray-400">{a.project.address}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("costs")}</h2>
          {!costs || costs.length === 0 ? (
            <p className="mb-4 text-sm text-gray-400">{t("noCosts")}</p>
          ) : (
            <table className="mb-4 w-full border-collapse text-sm">
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-1.5">{c.description}</td>
                    <td className="text-gray-500">{c.project.name}</td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.paid ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {c.paid ? t("paid") : t("unpaid")}
                      </span>
                    </td>
                    <td className="text-right font-medium">
                      {c.amount} {me.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {assignments && assignments.length > 0 && (
            <form onSubmit={submitCost} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
              <select
                className="input w-auto"
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
              >
                {assignments.map((a) => (
                  <option key={a.project.id} value={a.project.id}>
                    {a.project.name}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder={t("descriptionPlaceholder")}
                className="input w-auto"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <input
                required
                type="number"
                step="0.01"
                placeholder={t("amount")}
                className="input w-28"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <button type="submit" disabled={busy} className="btn-primary">
                {t("submitCost")}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
