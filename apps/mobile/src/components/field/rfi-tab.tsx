import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";
import { RFI_PRIORITIES, type RfiPriority } from "@cantero/shared";
import { fetchCached, updateCache } from "@/lib/offline-cache";
import { attachFiles, submitOrQueue } from "@/lib/offline-queue";
import type { LocalPhoto } from "@/lib/photos";
import { useTheme, type Theme } from "@/theme";
import {
  CachedNote,
  Card,
  Field,
  FieldMessage,
  Loading,
  Muted,
  PrimaryButton,
  SelectField,
  TextField,
  type FieldMessageType,
} from "./ui";
import { PhotoPicker } from "./photo-picker";

interface FieldRfi {
  id: string;
  number: string;
  subject: string;
  status: "open" | "answered" | "closed";
  priority: RfiPriority;
}

export function RfiTab({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useTranslations("field");
  const tr = useTranslations("rfi");
  const tc = useTranslations("common");
  const [items, setItems] = useState<FieldRfi[] | null>(null);
  const [form, setForm] = useState({ subject: "", question: "", priority: "medium" as RfiPriority });
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const cacheKey = `field:rfis:${projectId}`;

  const load = useCallback(() => {
    fetchCached<FieldRfi[]>(cacheKey, `/rfis?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data, stale, cachedAt: at }) => {
        setItems(data);
        setCachedAt(stale ? at : null);
      })
      .catch(() => setItems([]));
  }, [cacheKey, projectId]);

  useEffect(load, [load, reloadKey]);

  async function submit() {
    if (!form.subject.trim() || !form.question.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const record = await submitOrQueue<{ id: string }>("rfi", "/rfis", "POST", {
        projectId,
        subject: form.subject,
        question: form.question,
        priority: form.priority,
      });
      const { queued } = record;
      const sent = photos.length > 0 ? await attachFiles("rfi-photo", record, photos, (id) => `/documents?rfiId=${encodeURIComponent(id)}&category=photo`) : { queued: 0, failed: 0 };
      setPhotos([]);
      setMessage(
        sent.failed > 0
          ? { type: "warning", text: t("photosFailed", { n: sent.failed }) }
          : { type: "success", text: queued ? t("queuedOffline") : sent.queued > 0 ? t("photosQueued", { n: sent.queued }) : tc("saved") },
      );
      if (queued) {
        const optimistic: FieldRfi = {
          id: `queued-${Date.now()}`,
          number: "—",
          subject: form.subject,
          status: "open",
          priority: form.priority,
        };
        const updated = [...(items ?? []), optimistic];
        setItems(updated);
        updateCache(cacheKey, updated).catch(() => {});
      }
      setForm({ subject: "", question: "", priority: "medium" });
      if (!queued) load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  const statusColors: Record<FieldRfi["status"], { bg: string; fg: string }> = {
    open: { bg: theme.warningBg, fg: theme.warningText },
    answered: { bg: theme.neutralBg, fg: theme.accent },
    closed: { bg: theme.successBg, fg: theme.successText },
  };

  return (
    <View style={styles.stack}>
      <CachedNote cachedAt={cachedAt} />
      <Card>
        <Field label={tr("subject")}>
          <TextField value={form.subject} onChangeText={(subject) => setForm((f) => ({ ...f, subject }))} />
        </Field>
        <Field label={tr("question")}>
          <TextField multiline value={form.question} onChangeText={(question) => setForm((f) => ({ ...f, question }))} />
        </Field>
        <SelectField<RfiPriority>
          label={tr("priority")}
          value={form.priority}
          options={RFI_PRIORITIES.map((p) => ({ value: p, label: tr(p) }))}
          onChange={(priority) => setForm((f) => ({ ...f, priority }))}
        />
        <PhotoPicker photos={photos} onChange={setPhotos} />
        <PrimaryButton
          label={tr("newRfi")}
          onPress={submit}
          busy={busy}
          disabled={!form.subject.trim() || !form.question.trim()}
        />
        {message && <FieldMessage type={message.type} text={message.text} />}
      </Card>

      {items === null ? (
        <Loading />
      ) : items.length === 0 ? (
        <Muted>{tr("noItems")}</Muted>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.number}>{item.number}</Text>
              <Text style={styles.title}>{item.subject}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: statusColors[item.status].bg }]}>
              <Text style={[styles.pillText, { color: statusColors[item.status].fg }]}>{tr(item.status)}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    stack: { gap: 10 },
    row: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    rowText: { flex: 1, gap: 2 },
    number: { fontSize: 12, color: theme.textFaint, fontVariant: ["tabular-nums"] },
    title: { fontSize: 15, fontWeight: "500", color: theme.text },
    pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    pillText: { fontSize: 12, fontWeight: "600" },
  });
}
