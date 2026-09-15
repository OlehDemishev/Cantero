import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useFormatter, useTranslations } from "use-intl";
import { WEATHER_CONDITIONS, type WeatherCondition } from "@cantero/shared";
import { fetchCached } from "@/lib/offline-cache";
import { submitOrQueue } from "@/lib/offline-queue";
import { useTheme } from "@/theme";
import {
  CachedNote,
  Card,
  Field,
  FieldMessage,
  Loading,
  PrimaryButton,
  SelectField,
  TextField,
  type FieldMessageType,
} from "./ui";

interface DailyLog {
  id: string;
  date: string;
  weatherCondition: WeatherCondition | null;
  crewCount: number | null;
  workPerformed: string;
  delays: string | null;
}

const EMPTY_FORM = { weatherCondition: "" as WeatherCondition | "", crewCount: "", workPerformed: "", delays: "" };

export function LogsTab({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  const theme = useTheme();
  const format = useFormatter();
  const t = useTranslations("field");
  const td = useTranslations("dailyLogs");
  const tc = useTranslations("common");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  useEffect(() => {
    // Matches the web client: "today" is the UTC calendar date the server stores logs under.
    const todayKey = new Date().toISOString().slice(0, 10);
    fetchCached<DailyLog[]>(`field:daily-logs:${projectId}`, `/daily-logs?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data: list, stale, cachedAt: at }) => {
        setCachedAt(stale ? at : null);
        const todays = list.find((l) => l.date.slice(0, 10) === todayKey);
        if (todays) {
          setExistingId(todays.id);
          setForm({
            weatherCondition: todays.weatherCondition ?? "",
            crewCount: todays.crewCount?.toString() ?? "",
            workPerformed: todays.workPerformed,
            delays: todays.delays ?? "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [projectId, reloadKey]);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const body = {
      weatherCondition: form.weatherCondition || undefined,
      crewCount: form.crewCount ? Number(form.crewCount) : undefined,
      workPerformed: form.workPerformed,
      delays: form.delays || undefined,
    };
    try {
      const { queued, data } = existingId
        ? await submitOrQueue<{ id: string }>("daily-log", `/daily-logs/${existingId}`, "PATCH", body)
        : await submitOrQueue<{ id: string }>("daily-log", "/daily-logs", "POST", {
            ...body,
            projectId,
            date: new Date().toISOString(),
          });
      // Remember the log just created, so saving again updates it instead of creating a second one.
      if (!existingId && !queued && data?.id) setExistingId(data.id);
      setMessage({ type: "success", text: queued ? t("queuedOffline") : tc("saved") });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <Loading />;

  return (
    <Card>
      <CachedNote cachedAt={cachedAt} />
      <Text style={{ fontSize: 13, color: theme.textMuted }}>{format.dateTime(new Date(), { dateStyle: "full" })}</Text>
      <SelectField<WeatherCondition | "">
        label={td("weather")}
        value={form.weatherCondition}
        options={[
          { value: "", label: tc("none") },
          ...WEATHER_CONDITIONS.map((w) => ({ value: w, label: td(`weather_${w}`) })),
        ]}
        onChange={(weatherCondition) => setForm((f) => ({ ...f, weatherCondition }))}
      />
      <Field label={td("crewCount")}>
        <TextField
          keyboardType="number-pad"
          value={form.crewCount}
          onChangeText={(crewCount) => setForm((f) => ({ ...f, crewCount: crewCount.replace(/\D/g, "") }))}
        />
      </Field>
      <Field label={td("workPerformed")}>
        <TextField
          multiline
          value={form.workPerformed}
          onChangeText={(workPerformed) => setForm((f) => ({ ...f, workPerformed }))}
        />
      </Field>
      <Field label={td("delays")}>
        <TextField multiline value={form.delays} onChangeText={(delays) => setForm((f) => ({ ...f, delays }))} />
      </Field>
      <PrimaryButton
        label={existingId ? tc("save") : td("newLog")}
        onPress={submit}
        busy={busy}
        disabled={!form.workPerformed.trim()}
      />
      {message && <FieldMessage type={message.type} text={message.text} />}
    </Card>
  );
}
