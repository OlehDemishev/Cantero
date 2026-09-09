"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

const NEW_SUBCONTRACTOR = "__new__";

interface Subcontractor {
  id: string;
  name: string;
  email: string | null;
}
interface Assignment {
  id: string;
  projectId: string;
  startDate: string | null;
  endDate: string | null;
}

export function SubcontractorAssignmentsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("subcontractors");
  const tc = useTranslations("common");

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [assignmentsBySubcontractor, setAssignmentsBySubcontractor] = useState<Record<string, Assignment[]> | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadAssignments(list: Subcontractor[]) {
    Promise.all(
      list.map((s) =>
        apiFetch<Assignment[]>(`/finance/subcontractors/${s.id}/assignments`).then((rows) => [s.id, rows] as const),
      ),
    ).then((pairs) => setAssignmentsBySubcontractor(Object.fromEntries(pairs)));
  }

  function load() {
    apiFetch<Subcontractor[]>("/finance/subcontractors").then((list) => {
      setSubcontractors(list);
      if (list[0]) setSelectedId((id) => id || list[0].id);
      loadAssignments(list);
    });
  }

  useEffect(load, []);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (startDate && endDate && endDate < startDate) {
      setError(t("endBeforeStart"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let subcontractorId = selectedId;
      if (subcontractorId === NEW_SUBCONTRACTOR) {
        const created = await apiFetch<Subcontractor>("/finance/subcontractors", {
          method: "POST",
          body: JSON.stringify({ name: newName, email: newEmail || undefined }),
        });
        subcontractorId = created.id;
      }
      await apiFetch(`/finance/subcontractors/${subcontractorId}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          projectId,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
        }),
      });
      setNewName("");
      setNewEmail("");
      setStartDate("");
      setEndDate("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function unassign(subcontractorId: string, assignmentId: string) {
    if (!window.confirm(t("confirmUnassign"))) return;
    await apiFetch(`/finance/subcontractors/${subcontractorId}/assignments/${assignmentId}`, { method: "DELETE" });
    load();
  }

  const onThisProject = subcontractors
    .map((s) => ({
      subcontractor: s,
      assignment: assignmentsBySubcontractor?.[s.id]?.find((a) => a.projectId === projectId),
    }))
    .filter((row): row is { subcontractor: Subcontractor; assignment: Assignment } => !!row.assignment);

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("assignmentsTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("assignmentsHint")}</p>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!assignmentsBySubcontractor ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : onThisProject.length === 0 ? (
        <p className="mb-4 text-sm text-gray-400">{t("noAssignedSubcontractors")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {onThisProject.map(({ subcontractor, assignment }) => (
            <li
              key={subcontractor.id}
              className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm"
            >
              <span>
                {subcontractor.name}
                {subcontractor.email && <span className="ml-2 text-xs text-gray-400">{subcontractor.email}</span>}
                {assignment.startDate && assignment.endDate && (
                  <span className="ml-2 text-xs text-gray-400">
                    {formatDate(new Date(assignment.startDate))} – {formatDate(new Date(assignment.endDate))}
                  </span>
                )}
              </span>
              <button onClick={() => unassign(subcontractor.id, assignment.id)} className="btn-secondary px-2 py-1 text-xs">
                {t("unassign")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={assign} className="flex flex-wrap items-end gap-2">
        <select className="input w-auto" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {subcontractors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW_SUBCONTRACTOR}>{t("newSubcontractor")}</option>
        </select>
        {selectedId === NEW_SUBCONTRACTOR && (
          <>
            <input
              required
              placeholder={tc("name")}
              className="input w-auto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              type="email"
              placeholder={tc("email")}
              className="input w-auto"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </>
        )}
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {t("startDate")}
          <input type="date" className="input w-auto" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {t("endDate")}
          <input
            type="date"
            min={startDate || undefined}
            className="input w-auto"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-secondary">
          {t("assignToProject")}
        </button>
      </form>
    </div>
  );
}
