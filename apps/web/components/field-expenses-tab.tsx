"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@cantero/shared";
import { apiUpload } from "@/lib/api-client";
import { submitOrQueue, submitOrQueueUpload } from "@/lib/offline-queue";
import { fetchCached } from "@/lib/offline-cache";
import { FieldMessage, type FieldMessageType } from "@/components/field-message";
import { useCrewChoices } from "@/lib/permissions";
import { resetStateInEffect } from "@/lib/effect-reset";

interface Worker {
  id: string;
  name: string;
  userId: string | null;
}
interface ReceiptExtraction {
  amount: number | null;
  incurredAt: string | null;
  vendorGuess: string | null;
}

const NO_WORKERS: Worker[] = [];

export function ExpensesTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const te = useTranslations("expenses");
  const tc = useTranslations("common");
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [form, setForm] = useState({
    workerId: "",
    category: "materials" as ExpenseCategory,
    amount: "",
    description: "",
    incurredAt: new Date().toISOString().slice(0, 10),
  });
  const [receipt, setReceipt] = useState<File | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [error, setError] = useState(false);

  async function scanReceipt() {
    if (!receipt) return;
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await apiUpload<ReceiptExtraction>("/expenses/scan-receipt", receipt);
      if (result.amount === null && result.incurredAt === null && result.vendorGuess === null) {
        setScanMessage(t("scanReceiptNoData"));
        return;
      }
      setForm((f) => ({
        ...f,
        amount: result.amount !== null ? String(result.amount) : f.amount,
        incurredAt: result.incurredAt ? result.incurredAt.slice(0, 10) : f.incurredAt,
        description: !f.description && result.vendorGuess ? result.vendorGuess : f.description,
      }));
      setScanMessage(t("scanReceiptDone"));
    } catch {
      setScanMessage(t("scanReceiptFailed"));
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    fetchCached<Worker[]>("field:workers", "/workers")
      .then(({ data: list }) => {
        setWorkers(list);
      })
      .catch(() => setError(true));
  }, []);

  const { crew, choices, initialId } = useCrewChoices(workers ?? NO_WORKERS, "expenses");
  // Keep the pick on a worker this member may record for (their own record unless they run the crew).
  useEffect(() => {
    if (choices.some((w) => w.id === form.workerId)) return;
    resetStateInEffect(() => setForm((f) => ({ ...f, workerId: initialId })));
  }, [choices, initialId, form.workerId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workerId || !form.amount) return;
    setBusy(true);
    setMessage(null);
    try {
      const { queued, data } = await submitOrQueue<{ id: string }>("expense", "/expenses", "POST", {
        projectId,
        workerId: form.workerId,
        category: form.category,
        amount: Number(form.amount),
        description: form.description || undefined,
        incurredAt: new Date(form.incurredAt).toISOString(),
      });
      if (queued) {
        // The expense record itself doesn't exist on the server yet, so there's nothing to attach
        // a receipt to — queuing a dependent upload against an id that doesn't exist yet isn't supported.
        setMessage({ type: "success", text: receipt ? t("queuedOfflineNoReceipt") : t("queuedOffline") });
      } else {
        let result: { type: FieldMessageType; text: string } = { type: "success", text: te("submitted") };
        if (receipt && data?.id) {
          try {
            const { queued: receiptQueued } = await submitOrQueueUpload("expense-receipt", `/expenses/${data.id}/receipt`, receipt);
            if (receiptQueued) result = { type: "success", text: t("receiptQueuedOffline") };
          } catch {
            // The expense itself is already saved — a failed receipt upload shouldn't look like the
            // whole submission failed, but the user still needs to know the photo didn't make it.
            result = { type: "warning", text: t("receiptUploadFailed") };
          }
        }
        setMessage(result);
      }
      setForm((f) => ({ ...f, amount: "", description: "" }));
      setReceipt(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      setScanMessage(null);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-gray-400 dark:text-gray-500">{t("offline")}</p>;
  if (workers === null) return <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>;
  if (choices.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">{t(crew ? "noWorkers" : "noOwnWorker")}</p>;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{tt("worker")}</span>
        <select className="input" value={form.workerId} disabled={!crew} onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}>
          {choices.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{te("category")}</span>
        <select
          className="input"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {te(c)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">{te("amount")}</span>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            className="input"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">{te("date")}</span>
          <input
            type="date"
            className="input"
            value={form.incurredAt}
            onChange={(e) => setForm((f) => ({ ...f, incurredAt: e.target.value }))}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{te("description")}</span>
        <input
          className="input"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{te("receipt")}</span>
        <input
          ref={receiptInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            setReceipt(e.target.files?.[0] ?? null);
            setScanMessage(null);
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => receiptInputRef.current?.click()}
            className="btn-secondary px-3 py-1 text-xs"
          >
            {tc("chooseFile")}
          </button>
          {receipt && <span className="text-xs text-gray-500 dark:text-gray-400">{receipt.name}</span>}
        </div>
      </label>
      {receipt && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={scanReceipt} disabled={scanning} className="btn-secondary px-3 py-1 text-xs">
            {scanning ? t("scanReceiptScanning") : t("scanReceiptButton")}
          </button>
          {scanMessage && <span className="text-xs text-gray-500 dark:text-gray-400">{scanMessage}</span>}
        </div>
      )}
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {te("submit")}
      </button>
      {message && <FieldMessage type={message.type} text={message.text} />}
    </form>
  );
}
