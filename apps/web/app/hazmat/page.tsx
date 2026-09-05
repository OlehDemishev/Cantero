"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

interface SdsSheet {
  id: string;
  version: string | null;
  revisionDate: string | null;
  hazardClassification: string | null;
}
interface HazardousMaterial {
  id: string;
  name: string;
  manufacturer: string | null;
  casNumber: string | null;
  sdsSheets: SdsSheet[];
}
interface StaleEntry {
  id: string;
  name: string;
  manufacturer: string | null;
  latestRevisionDate: string | null;
}

export default function HazmatPage() {
  const t = useTranslations("hazmat");
  const tc = useTranslations("common");

  const [materials, setMaterials] = useState<HazardousMaterial[] | null>(null);
  const [stale, setStale] = useState<StaleEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", manufacturer: "", casNumber: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sdsForm, setSdsForm] = useState({ version: "", revisionDate: "", hazardClassification: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<HazardousMaterial[]>("/hazmat/materials").then(setMaterials);
    apiFetch<StaleEntry[]>("/hazmat/stale-sds-report").then(setStale);
  }
  useEffect(load, []);

  async function createMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/hazmat/materials", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), manufacturer: form.manufacturer || undefined, casNumber: form.casNumber || undefined }),
      });
      setForm({ name: "", manufacturer: "", casNumber: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addSdsVersion(materialId: string) {
    setBusy(true);
    try {
      await apiFetch(`/hazmat/materials/${materialId}/sds`, {
        method: "POST",
        body: JSON.stringify({
          version: sdsForm.version || undefined,
          revisionDate: sdsForm.revisionDate ? new Date(sdsForm.revisionDate).toISOString() : undefined,
          hazardClassification: sdsForm.hazardClassification || undefined,
        }),
      });
      setSdsForm({ version: "", revisionDate: "", hazardClassification: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  const filtered = materials?.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-3 py-1.5 text-sm">
            {t("addMaterial")}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">{t("hint")}</p>

      {stale && stale.length > 0 && (
        <div className="card mt-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning-700">{t("staleSdsTitle")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {stale.map((s) => (
              <li key={s.id} className="text-gray-700">
                {s.name}
                {s.manufacturer && <span className="text-gray-400"> · {s.manufacturer}</span>}
                <span className="ml-1.5 text-xs text-warning-700">
                  {s.latestRevisionDate ? t("lastRevised", { date: new Date(s.latestRevisionDate).toLocaleDateString() }) : t("noSdsOnFile")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <form onSubmit={createMaterial} className="card mt-4 flex max-w-lg flex-col gap-2">
          <input
            required
            placeholder={t("materialNamePlaceholder")}
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              placeholder={t("manufacturerPlaceholder")}
              className="input"
              value={form.manufacturer}
              onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
            />
            <input
              placeholder={t("casNumberPlaceholder")}
              className="input"
              value={form.casNumber}
              onChange={(e) => setForm((f) => ({ ...f, casNumber: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      <input
        placeholder={t("searchPlaceholder")}
        className="input mt-4 max-w-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="mt-4">
        {!filtered ? (
          <p className="text-gray-500">{tc("loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500">{t("noMaterials")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((m) => {
              const expanded = expandedId === m.id;
              const latest = m.sdsSheets[0];
              return (
                <li key={m.id} className="card">
                  <button onClick={() => setExpandedId(expanded ? null : m.id)} className="flex w-full items-center justify-between text-left">
                    <span className="text-sm font-medium text-gray-900">
                      {m.name}
                      {m.manufacturer && <span className="ml-1.5 text-xs text-gray-400">({m.manufacturer})</span>}
                    </span>
                    {latest?.revisionDate && (
                      <span className="text-xs text-gray-400">{t("lastRevised", { date: new Date(latest.revisionDate).toLocaleDateString() })}</span>
                    )}
                  </button>
                  {m.casNumber && <p className="mt-0.5 text-xs text-gray-400">CAS {m.casNumber}</p>}

                  {expanded && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <input
                          placeholder={t("versionPlaceholder")}
                          className="input w-28"
                          value={sdsForm.version}
                          onChange={(e) => setSdsForm((f) => ({ ...f, version: e.target.value }))}
                        />
                        <input
                          type="date"
                          className="input w-auto"
                          value={sdsForm.revisionDate}
                          onChange={(e) => setSdsForm((f) => ({ ...f, revisionDate: e.target.value }))}
                        />
                        <input
                          placeholder={t("hazardClassificationPlaceholder")}
                          className="input flex-1"
                          value={sdsForm.hazardClassification}
                          onChange={(e) => setSdsForm((f) => ({ ...f, hazardClassification: e.target.value }))}
                        />
                        <button onClick={() => addSdsVersion(m.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                          {t("addSdsVersion")}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AuthenticatedShell>
  );
}
