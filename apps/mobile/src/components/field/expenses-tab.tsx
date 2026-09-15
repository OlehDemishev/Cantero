import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@cantero/shared";
import { fetchCached } from "@/lib/offline-cache";
import { submitOrQueue } from "@/lib/offline-queue";
import {
  Card,
  DateStepper,
  Field,
  FieldMessage,
  Loading,
  Muted,
  parseDecimal,
  PrimaryButton,
  SelectField,
  TextField,
  type FieldMessageType,
} from "./ui";

interface Worker {
  id: string;
  name: string;
  userId: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Receipt photos (capture, OCR scan, queued upload) aren't ported yet — they need the camera and a
 * file-aware upload queue, which is a separate step. */
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
      const { queued } = await submitOrQueue("expense", "/expenses", "POST", {
        projectId,
        workerId: form.workerId,
        category: form.category,
        amount: parseDecimal(form.amount),
        description: form.description || undefined,
        incurredAt: new Date(form.incurredAt).toISOString(),
      });
      setMessage({ type: "success", text: queued ? t("queuedOffline") : te("submitted") });
      setForm((f) => ({ ...f, amount: "", description: "" }));
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Muted>{t("offline")}</Muted>;
  if (workers.length === 0) return <Loading />;

  return (
    <Card>
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
