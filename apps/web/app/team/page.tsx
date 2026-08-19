"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface Worker {
  id: string;
  name: string;
  role: string | null;
  hourlyCost: string | null;
}

export default function TeamPage() {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const { data: me } = useMe();

  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [form, setForm] = useState({ name: "", role: "", hourlyCost: "" });
  const [submitting, setSubmitting] = useState(false);

  function load() {
    apiFetch<Worker[]>("/workers").then(setWorkers);
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/workers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          role: form.role || undefined,
          hourlyCost: form.hourlyCost ? Number(form.hourlyCost) : undefined,
        }),
      });
      setForm({ name: "", role: "", hourlyCost: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newWorker")}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder={tc("name")}
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder={t("role")}
              className="input"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
            <label className="text-xs text-gray-500">
              {t("hourlyCost")} ({me?.company.currency})
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                value={form.hourlyCost}
                onChange={(e) => setForm((f) => ({ ...f, hourlyCost: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={submitting} className="btn-primary">
              {tc("create")}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          {!workers ? (
            <p className="text-gray-500">{tc("loading")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{tc("name")}</th>
                  <th>{t("role")}</th>
                  <th>{t("hourlyCost")}</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.id} className="border-b border-gray-100">
                    <td className="py-2">{w.name}</td>
                    <td>{w.role ?? "—"}</td>
                    <td>{w.hourlyCost ? `${w.hourlyCost} ${me?.company.currency}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
