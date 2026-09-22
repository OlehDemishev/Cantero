import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@cantero/shared";
import { fetchCached } from "@/lib/offline-cache";
import { apiUpload, NetworkError } from "@/lib/api-client";
import { attachFiles, submitOrQueue } from "@/lib/offline-queue";
import type { LocalPhoto } from "@/lib/photos";
import {
  Card,
  DateStepper,
  Field,
  FieldMessage,
  Loading,
  Muted,
  parseDecimal,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  TextField,
  type FieldMessageType,
} from "./ui";
import { PhotoPicker } from "./photo-picker";

interface ReceiptExtraction {
  amount: number | null;
  incurredAt: string | null;
  vendorGuess: string | null;
}

interface Worker {
  id: string;
  name: string;
  userId: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** An expense with its receipt photo: scanned (when online) to prefill amount, date and vendor, then
 * uploaded after the expense — queued behind it when the expense itself was saved offline. */
export function ExpensesTab({ projectId, meUserId, reloadKey }: { projectId: string; meUserId: string | null; reloadKey: number }) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const te = useTranslations("expenses");
  const tc = useTranslations("common");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [form, setForm] = useState({
    workerId: "",
    category: "materials" as ExpenseCategory,
    amount: "",
    description: "",
    incurredAt: today(),
  });
  const [receipt, setReceipt] = useState<LocalPhoto[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCached<Worker[]>("field:workers", "/workers")
      .then(({ data: list }) => {
        setWorkers(list);
        const mine = list.find((w) => w.userId === meUserId);
        setForm((f) => ({ ...f, workerId: f.workerId || ((mine ?? list[0])?.id ?? "") }));
      })
      .catch(() => setError(true));
  }, [meUserId, reloadKey]);

  async function submit() {
    if (!form.workerId || !form.amount.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const record = await submitOrQueue<{ id: string }>("expense", "/expenses", "POST", {
        projectId,
        workerId: form.workerId,
        category: form.category,
        amount: parseDecimal(form.amount),
        description: form.description || undefined,
        incurredAt: new Date(form.incurredAt).toISOString(),
      });
      const { queued } = record;
      const sent = receipt.length > 0 ? await attachFiles("expense-receipt", record, receipt, (id) => `/expenses/${encodeURIComponent(id)}/receipt`) : { queued: 0, failed: 0 };
      setReceipt([]);
      setMessage(
        sent.failed > 0
          ? { type: "warning", text: t("receiptUploadFailed") }
          : { type: "success", text: queued ? t("queuedOffline") : sent.queued > 0 ? t("receiptQueuedOffline") : te("submitted") },
      );
      setForm((f) => ({ ...f, amount: "", description: "" }));
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  /** Reads amount, date and vendor off the receipt photo; fields already filled in are kept. */
  async function scan() {
    if (!receipt[0]) return;
    setScanning(true);
    setMessage(null);
    try {
      const result = await apiUpload<ReceiptExtraction>("/expenses/scan-receipt", receipt[0]);
      if (result.amount === null && result.incurredAt === null && result.vendorGuess === null) {
        setMessage({ type: "warning", text: t("scanReceiptNoData") });
        return;
      }
      setForm((f) => ({
        ...f,
        amount: result.amount !== null ? String(result.amount) : f.amount,
        incurredAt: result.incurredAt ? result.incurredAt.slice(0, 10) : f.incurredAt,
        description: !f.description && result.vendorGuess ? result.vendorGuess : f.description,
      }));
      setMessage({ type: "success", text: t("scanReceiptDone") });
    } catch (err) {
      setMessage({ type: "warning", text: err instanceof NetworkError ? t("scanNeedsConnection") : t("scanReceiptFailed") });
    } finally {
      setScanning(false);
    }
  }

  if (error) return <Muted>{t("offline")}</Muted>;
  if (workers.length === 0) return <Loading />;

  return (
    <Card>
      <PhotoPicker photos={receipt} onChange={setReceipt} max={1} label={t("receiptPhoto")} />
      {receipt.length > 0 && (
        <SecondaryButton label={scanning ? t("scanReceiptScanning") : t("scanReceiptButton")} onPress={scan} disabled={scanning} />
      )}
      <SelectField
        label={tt("worker")}
        value={form.workerId}
        options={workers.map((w) => ({ value: w.id, label: w.name }))}
        onChange={(workerId) => setForm((f) => ({ ...f, workerId }))}
      />
      <SelectField<ExpenseCategory>
        label={te("category")}
        value={form.category}
        options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: te(c) }))}
        onChange={(category) => setForm((f) => ({ ...f, category }))}
      />
      <Field label={te("amount")}>
        <TextField
          keyboardType="decimal-pad"
          value={form.amount}
          onChangeText={(amount) => setForm((f) => ({ ...f, amount }))}
        />
      </Field>
      <DateStepper
        label={te("date")}
        value={form.incurredAt}
        onChange={(incurredAt) => setForm((f) => ({ ...f, incurredAt }))}
      />
      <Field label={te("description")}>
        <TextField value={form.description} onChangeText={(description) => setForm((f) => ({ ...f, description }))} />
      </Field>
      <PrimaryButton label={te("submit")} onPress={submit} busy={busy} disabled={!form.amount.trim()} />
      {message && <FieldMessage type={message.type} text={message.text} />}
    </Card>
  );
}
