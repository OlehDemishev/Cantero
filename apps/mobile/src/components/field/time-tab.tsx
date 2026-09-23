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
import { useWorkerChoice, WorkerPicker } from "./worker-picker";

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

export function TimeTab({
  projectId,
  meUserId,
  permissions,
  reloadKey,
}: {
  projectId: string;
  meUserId: string | null;
  permissions: readonly string[] | undefined;
  reloadKey: number;
}) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const tc = useTranslations("common");
  const worker = useWorkerChoice({ kind: "time", meUserId, permissions, reloadKey });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({ taskId: "", hours: "8", date: today() });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCached<Task[]>(`field:tasks:${projectId}`, `/tasks?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data }) => setTasks(data))
      .catch(() => setError(true));
  }, [projectId, reloadKey]);

  async function submit() {
    if (!worker.workerId) return;
    setBusy(true);
    setMessage(null);
    try {
      const position = await getCurrentPositionSafe();
      const { queued, data } = await submitOrQueue<{ withinGeofence: boolean | null }>(
        "time-entry",
        "/time-entries",
        "POST",
        {
          workerId: worker.workerId,
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

  if (error || worker.error) return <Muted>{t("offline")}</Muted>;
  if (!worker.loaded) return <Loading />;

  return (
    <Card>
      <WorkerPicker choice={worker} />
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
      <PrimaryButton label={t("logTimeButton")} onPress={submit} busy={busy} disabled={!form.hours.trim() || !worker.workerId} />
      {message && <FieldMessage type={message.type} text={message.text} />}
    </Card>
  );
}
