"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RECURRING_INVOICE_FREQUENCIES, type RecurringInvoiceFrequency } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { Field } from "@/components/ui/field";
import type { Client, Project, RecurringLineForm } from "./types";

/** A form for a new recurring invoice: schedule, project and client, and its lines. */
export function RecurringInvoiceForm({
  busy: recurringBusy,
  setBusy: setRecurringBusy,
  setError: setRecurringError,
  onCreated,
}: {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { data: projects = [] } = useApi<Project[]>("/projects");
  const { data: clients = [] } = useApi<Client[]>("/clients");
  const [recurringForm, setRecurringForm] = useState({
    projectId: "",
    clientId: "",
    name: "",
    frequency: "monthly" as RecurringInvoiceFrequency,
    taxPercent: "0",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  });
  const [recurringLines, setRecurringLines] = useState<RecurringLineForm[]>([
    { description: "", quantity: "1", unitPrice: "0" },
  ]);

  function updateRecurringLine(
    index: number,
    field: keyof RecurringLineForm,
    value: string,
  ) {
    setRecurringLines((lines) =>
      lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  function addRecurringLine() {
    setRecurringLines((lines) => [
      ...lines,
      { description: "", quantity: "1", unitPrice: "0" },
    ]);
  }

  function removeRecurringLine(index: number) {
    setRecurringLines((lines) => lines.filter((_, i) => i !== index));
  }

  async function createRecurring(e: React.FormEvent) {
    e.preventDefault();
    setRecurringBusy(true);
    setRecurringError(null);
    try {
      await apiFetch("/recurring-invoices", {
        method: "POST",
        body: JSON.stringify({
          projectId: recurringForm.projectId,
          clientId: recurringForm.clientId,
          name: recurringForm.name,
          frequency: recurringForm.frequency,
          taxPercent: Number(recurringForm.taxPercent),
          startDate: new Date(recurringForm.startDate).toISOString(),
          endDate: recurringForm.endDate
            ? new Date(recurringForm.endDate).toISOString()
            : undefined,
          lines: recurringLines.map((l) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
          })),
        }),
      });
      setRecurringForm((f) => ({
        ...f,
        name: "",
        projectId: "",
        clientId: "",
      }));
      setRecurringLines([{ description: "", quantity: "1", unitPrice: "0" }]);
      onCreated();
    } catch (err) {
      setRecurringError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setRecurringBusy(false);
    }
  }

  return (
    <form
      onSubmit={createRecurring}
      className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input aria-label={tc("name")}
          required
          placeholder={t("recurringNamePlaceholder")}
          className="input"
          value={recurringForm.name}
          onChange={(e) =>
            setRecurringForm((f) => ({ ...f, name: e.target.value }))
          }
        />
        <select aria-label={ta("project")}
          required
          className="input"
          value={recurringForm.projectId}
          onChange={(e) =>
            setRecurringForm((f) => ({ ...f, projectId: e.target.value }))
          }
        >
          <option value="">{t("selectProject")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select aria-label={ta("client")}
          required
          className="input"
          value={recurringForm.clientId}
          onChange={(e) =>
            setRecurringForm((f) => ({ ...f, clientId: e.target.value }))
          }
        >
          <option value="">{t("selectClient")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label={ta("frequency")}
          className="input"
          value={recurringForm.frequency}
          onChange={(e) =>
            setRecurringForm((f) => ({
              ...f,
              frequency: e.target.value as RecurringInvoiceFrequency,
            }))
          }
        >
          {RECURRING_INVOICE_FREQUENCIES.map((freq) => (
            <option key={freq} value={freq}>
              {t(`frequency_${freq}`)}
            </option>
          ))}
        </select>
        <Field label={t("startDate")} size="sm">
          <input
            required
            type="date"
            className="input"
            value={recurringForm.startDate}
            onChange={(e) =>
              setRecurringForm((f) => ({ ...f, startDate: e.target.value }))
            }
          />
        </Field>
        <Field label={t("endDateOptional")} size="sm">
          <input
            type="date"
            className="input"
            value={recurringForm.endDate}
            onChange={(e) =>
              setRecurringForm((f) => ({ ...f, endDate: e.target.value }))
            }
          />
        </Field>
        <Field label={t("taxPercent")} size="sm">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="input"
            value={recurringForm.taxPercent}
            onChange={(e) =>
              setRecurringForm((f) => ({
                ...f,
                taxPercent: e.target.value,
              }))
            }
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {recurringLines.map((line, i) => (
          <div key={i} className="flex items-end gap-2">
            <input
              required
              placeholder={t("lineDescriptionPlaceholder")} aria-label={t("lineDescriptionPlaceholder")}
              className="input flex-1"
              value={line.description}
              onChange={(e) =>
                updateRecurringLine(i, "description", e.target.value)
              }
            />
            <input
              required
              type="number"
              step="0.01"
              placeholder={t("quantity")} aria-label={t("quantity")}
              className="input w-24"
              value={line.quantity}
              onChange={(e) =>
                updateRecurringLine(i, "quantity", e.target.value)
              }
            />
            <input
              required
              type="number"
              step="0.01"
              placeholder={t("unitPrice")} aria-label={t("unitPrice")}
              className="input w-28"
              value={line.unitPrice}
              onChange={(e) =>
                updateRecurringLine(i, "unitPrice", e.target.value)
              }
            />
            {recurringLines.length > 1 && (
              <button
                type="button"
                onClick={() => removeRecurringLine(i)}
                className="btn-secondary shrink-0 px-2 py-1.5 text-xs"
              >
                {tc("delete")}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addRecurringLine}
          className="btn-secondary self-start px-3 py-1 text-xs"
        >
          {t("addLine")}
        </button>
      </div>

      <button
        type="submit"
        disabled={recurringBusy}
        className="btn-primary mt-4"
      >
        {t("createRecurring")}
      </button>
    </form>
  );
}
