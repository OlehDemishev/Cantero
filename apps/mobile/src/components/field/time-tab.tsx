import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { useTranslations } from "use-intl";
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
interface Task {
  id: string;
  name: string;
}

const LOCATION_TIMEOUT_MS = 8000;

/** Best-effort current position — resolves null (never rejects) on denial, timeout or any failure,
 * so logging time never blocks on location. Same contract as the web client's geolocation helper. */
async function getCurrentPositionSafe(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ]);
    return position ? { lat: position.coords.latitude, lng: position.coords.longitude } : null;
  } catch {
    return null;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export function TimeTab({ projectId, meUserId, reloadKey }: { projectId: string; meUserId: string | null; reloadKey: number }) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const tc = useTranslations("common");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({ workerId: "", taskId: "", hours: "8", date: today() });
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

  useEffect(() => {
    fetchCached<Task[]>(`field:tasks:${projectId}`, `/tasks?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data }) => setTasks(data))
      .catch(() => setError(true));
  }, [projectId, reloadKey]);

  async function submit() {
    if (!form.workerId) return;
    setBusy(true);
    setMessage(null);
    try {
      const position = await getCurrentPositionSafe();
      const { queued, data } = await submitOrQueue<{ withinGeofence: boolean | null }>(
        "time-entry",
        "/time-entries",
        "POST",
        {
          workerId: form.workerId,
          projectId,
          taskId: form.taskId || undefined,
          hours: parseDecimal(form.hours),
          date: new Date(form.date).toISOString(),
          clockInLat: position?.lat,
          clockInLng: position?.lng,
        },
      );
      if (queued) {
        setMessage({ type: "success", text: t("queuedOffline") });
      } else if (data?.withinGeofence === false) {
        setMessage({ type: "warning", text: t("loggedOutsideGeofence") });
      } else {
        setMessage({ type: "success", text: tc("saved") });
      }
      setForm((f) => ({ ...f, hours: "8" }));
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
      <SelectField
        label={tt("task")}
        value={form.taskId}
        options={[{ value: "", label: tt("noneTask") }, ...tasks.map((task) => ({ value: task.id, label: task.name }))]}
        onChange={(taskId) => setForm((f) => ({ ...f, taskId }))}
      />
      <Field label={tt("hours")}>
        <TextField
          keyboardType="decimal-pad"
          value={form.hours}
          onChangeText={(hours) => setForm((f) => ({ ...f, hours }))}
        />
      </Field>
      <DateStepper label={tt("date")} value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} />
      <PrimaryButton label={t("logTimeButton")} onPress={submit} busy={busy} disabled={!form.hours.trim()} />
      {message && <FieldMessage type={message.type} text={message.text} />}
    </Card>
  );
}
