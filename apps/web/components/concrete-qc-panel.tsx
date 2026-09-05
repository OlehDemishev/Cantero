"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface SlumpTest {
  id: string;
  testedAt: string;
  slumpValue: string;
  withinSpec: boolean;
  testedByName: string;
}
interface CylinderBreak {
  id: string;
  cylinderLabel: string;
  breakAgeDays: number;
  breakDate: string;
  breakStrength: string | null;
  result: "pass" | "fail" | null;
  testedByName: string | null;
}
interface ConcretePour {
  id: string;
  location: string;
  pourDate: string;
  mixDesign: string | null;
  volume: string | null;
  specifiedStrength: string | null;
  specifiedSlump: string | null;
  supplierName: string | null;
  slumpTests: SlumpTest[];
  cylinderBreaks: CylinderBreak[];
}

export function ConcreteQcPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("concreteQc");
  const tc = useTranslations("common");

  const [pours, setPours] = useState<ConcretePour[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ location: "", pourDate: "", mixDesign: "", volume: "", specifiedStrength: "", specifiedSlump: "", supplierName: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [slumpForm, setSlumpForm] = useState({ slumpValue: "", withinSpec: true, testedByName: "" });
  const [cylForm, setCylForm] = useState({ cylinderLabel: "", breakAgeDays: "28", breakDate: "" });
  const [resultDraft, setResultDraft] = useState<Record<string, { breakStrength: string; testedByName: string }>>({});
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ConcretePour[]>(`/projects/${projectId}/concrete-pours`).then(setPours);
  }
  useEffect(load, [projectId]);

  async function createPour(e: React.FormEvent) {
    e.preventDefault();
    if (!form.location.trim() || !form.pourDate) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/concrete-pours`, {
        method: "POST",
        body: JSON.stringify({
          location: form.location.trim(),
          pourDate: new Date(form.pourDate).toISOString(),
          mixDesign: form.mixDesign || undefined,
          volume: form.volume ? Number(form.volume) : undefined,
          specifiedStrength: form.specifiedStrength ? Number(form.specifiedStrength) : undefined,
          specifiedSlump: form.specifiedSlump ? Number(form.specifiedSlump) : undefined,
          supplierName: form.supplierName || undefined,
        }),
      });
      setForm({ location: "", pourDate: "", mixDesign: "", volume: "", specifiedStrength: "", specifiedSlump: "", supplierName: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addSlumpTest(pourId: string) {
    if (!slumpForm.slumpValue || !slumpForm.testedByName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/concrete-pours/${pourId}/slump-tests`, {
        method: "POST",
        body: JSON.stringify({ slumpValue: Number(slumpForm.slumpValue), withinSpec: slumpForm.withinSpec, testedByName: slumpForm.testedByName.trim() }),
      });
      setSlumpForm({ slumpValue: "", withinSpec: true, testedByName: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addCylinderBreak(pourId: string) {
    if (!cylForm.cylinderLabel.trim() || !cylForm.breakDate) return;
    setBusy(true);
    try {
      await apiFetch(`/concrete-pours/${pourId}/cylinder-breaks`, {
        method: "POST",
        body: JSON.stringify({
          cylinderLabel: cylForm.cylinderLabel.trim(),
          breakAgeDays: Number(cylForm.breakAgeDays),
          breakDate: new Date(cylForm.breakDate).toISOString(),
        }),
      });
      setCylForm({ cylinderLabel: "", breakAgeDays: "28", breakDate: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function recordResult(breakId: string) {
    const draft = resultDraft[breakId];
    if (!draft?.breakStrength || !draft?.testedByName.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/cylinder-breaks/${breakId}/result`, {
        method: "POST",
        body: JSON.stringify({ breakStrength: Number(draft.breakStrength), testedByName: draft.testedByName.trim() }),
      });
      setResultDraft((d) => ({ ...d, [breakId]: { breakStrength: "", testedByName: "" } }));
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("logPour")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {adding && (
        <form onSubmit={createPour} className="card mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              required
              placeholder={t("locationPlaceholder")}
              className="input flex-1"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              {t("pourDate")}
              <input required type="date" className="input" value={form.pourDate} onChange={(e) => setForm((f) => ({ ...f, pourDate: e.target.value }))} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              placeholder={t("mixDesignPlaceholder")}
              className="input flex-1"
              value={form.mixDesign}
              onChange={(e) => setForm((f) => ({ ...f, mixDesign: e.target.value }))}
            />
            <input
              type="number"
              step="0.01"
              placeholder={t("volumePlaceholder")}
              className="input w-32"
              value={form.volume}
              onChange={(e) => setForm((f) => ({ ...f, volume: e.target.value }))}
            />
            <input
              placeholder={t("supplierPlaceholder")}
              className="input flex-1"
              value={form.supplierName}
              onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              step="0.01"
              placeholder={t("specifiedStrengthPlaceholder")}
              className="input w-40"
              value={form.specifiedStrength}
              onChange={(e) => setForm((f) => ({ ...f, specifiedStrength: e.target.value }))}
            />
            <input
              type="number"
              step="0.01"
              placeholder={t("specifiedSlumpPlaceholder")}
              className="input w-40"
              value={form.specifiedSlump}
              onChange={(e) => setForm((f) => ({ ...f, specifiedSlump: e.target.value }))}
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

      {!pours ? (
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      ) : pours.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noPours")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pours.map((pour) => {
            const expanded = expandedId === pour.id;
            const anyFail = pour.cylinderBreaks.some((b) => b.result === "fail");
            return (
              <li key={pour.id} className="card">
                <button onClick={() => setExpandedId(expanded ? null : pour.id)} className="flex w-full items-center justify-between text-left">
                  <span className="text-sm font-medium text-gray-900">
                    {pour.location} — {formatDate(new Date(pour.pourDate))}
                    {pour.mixDesign && <span className="ml-1.5 text-xs text-gray-400">({pour.mixDesign})</span>}
                  </span>
                  {anyFail && <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700">{t("hasFailure")}</span>}
                </button>
                <p className="mt-1 text-xs text-gray-400">
                  {pour.specifiedStrength && `${t("specifiedStrength")}: ${pour.specifiedStrength}`}
                  {pour.specifiedSlump && ` · ${t("specifiedSlump")}: ${pour.specifiedSlump}`}
                  {pour.supplierName && ` · ${pour.supplierName}`}
                </p>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-4 border-t border-gray-100 pt-3">
                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("slumpTests")}</h3>
                      {pour.slumpTests.length > 0 && (
                        <ul className="mb-2 flex flex-col gap-1 text-xs">
                          {pour.slumpTests.map((st) => (
                            <li key={st.id}>
                              <span className={st.withinSpec ? "text-success-700" : "font-medium text-error-700"}>
                                {st.slumpValue} — {st.withinSpec ? t("withinSpec") : t("outOfSpec")}
                              </span>{" "}
                              ({st.testedByName}, {formatDate(new Date(st.testedAt))})
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={t("slumpValuePlaceholder")}
                          className="input w-32"
                          value={slumpForm.slumpValue}
                          onChange={(e) => setSlumpForm((f) => ({ ...f, slumpValue: e.target.value }))}
                        />
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                          <input type="checkbox" checked={slumpForm.withinSpec} onChange={(e) => setSlumpForm((f) => ({ ...f, withinSpec: e.target.checked }))} />
                          {t("withinSpec")}
                        </label>
                        <input
                          placeholder={t("testedByPlaceholder")}
                          className="input w-32"
                          value={slumpForm.testedByName}
                          onChange={(e) => setSlumpForm((f) => ({ ...f, testedByName: e.target.value }))}
                        />
                        <button onClick={() => addSlumpTest(pour.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                          {t("logSlumpTest")}
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("cylinderBreaks")}</h3>
                      {pour.cylinderBreaks.length > 0 && (
                        <ul className="mb-2 flex flex-col gap-1.5 text-xs">
                          {pour.cylinderBreaks.map((cb) => (
                            <li key={cb.id}>
                              <div className="flex items-center justify-between">
                                <span>
                                  {cb.cylinderLabel} — {cb.breakAgeDays}{t("daysAbbr")} — {formatDate(new Date(cb.breakDate))}
                                  {cb.breakStrength !== null && ` — ${cb.breakStrength}`}
                                </span>
                                {cb.result ? (
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cb.result === "pass" ? "bg-success-50 text-success-700" : "bg-error-50 text-error-700"}`}>
                                    {t(`result_${cb.result}`)}
                                  </span>
                                ) : cb.breakStrength === null ? (
                                  <span className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder={t("breakStrengthPlaceholder")}
                                      className="input w-28 py-0.5 text-xs"
                                      value={resultDraft[cb.id]?.breakStrength ?? ""}
                                      onChange={(e) => setResultDraft((d) => ({ ...d, [cb.id]: { breakStrength: e.target.value, testedByName: d[cb.id]?.testedByName ?? "" } }))}
                                    />
                                    <input
                                      placeholder={t("testedByPlaceholder")}
                                      className="input w-24 py-0.5 text-xs"
                                      value={resultDraft[cb.id]?.testedByName ?? ""}
                                      onChange={(e) => setResultDraft((d) => ({ ...d, [cb.id]: { breakStrength: d[cb.id]?.breakStrength ?? "", testedByName: e.target.value } }))}
                                    />
                                    <button onClick={() => recordResult(cb.id)} disabled={busy} className="btn-primary px-2 py-0.5 text-xs">
                                      {tc("save")}
                                    </button>
                                  </span>
                                ) : (
                                  <span className="text-gray-400">{t("noSpecToCompare")}</span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <input
                          placeholder={t("cylinderLabelPlaceholder")}
                          className="input w-32"
                          value={cylForm.cylinderLabel}
                          onChange={(e) => setCylForm((f) => ({ ...f, cylinderLabel: e.target.value }))}
                        />
                        <input
                          type="number"
                          placeholder={t("breakAgeDaysPlaceholder")}
                          className="input w-24"
                          value={cylForm.breakAgeDays}
                          onChange={(e) => setCylForm((f) => ({ ...f, breakAgeDays: e.target.value }))}
                        />
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                          {t("breakDate")}
                          <input type="date" className="input" value={cylForm.breakDate} onChange={(e) => setCylForm((f) => ({ ...f, breakDate: e.target.value }))} />
                        </label>
                        <button onClick={() => addCylinderBreak(pour.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                          {t("scheduleBreak")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
