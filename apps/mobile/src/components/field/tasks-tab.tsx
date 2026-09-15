import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";
import { ApiError } from "@/lib/api-client";
import { fetchCached, updateCache } from "@/lib/offline-cache";
import { submitOrQueue } from "@/lib/offline-queue";
import { useTheme, type Theme } from "@/theme";
import { CachedNote, FieldMessage, Loading, Muted } from "./ui";

type TaskStatus = "planned" | "in_progress" | "done";
const STATUS_ORDER: TaskStatus[] = ["planned", "in_progress", "done"];

interface Task {
  id: string;
  name: string;
  status: TaskStatus;
}

export function TasksTab({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useTranslations("field");
  const tc = useTranslations("common");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState(false);
  const cacheKey = `field:tasks:${projectId}`;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, stale, cachedAt: at } = await fetchCached<Task[]>(
        cacheKey,
        `/tasks?projectId=${encodeURIComponent(projectId)}`,
      );
      setTasks(data);
      setCachedAt(stale ? at : null);
    } catch (err) {
      // Reaching here on a network failure means nothing was cached for this project yet.
      setLoadError(err instanceof ApiError ? err.message : t("offline"));
    }
  }, [cacheKey, projectId, t]);

  useEffect(() => {
    setQueuedNote(false);
    load();
  }, [load, reloadKey]);

  async function advance(task: Task) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length];
    const previous = tasks ?? [];
    const updated = previous.map((x) => (x.id === task.id ? { ...x, status: next } : x));
    setTasks(updated);
    updateCache(cacheKey, updated).catch(() => {});
    setActionError(null);
    setQueuedNote(false);
    try {
      const { queued } = await submitOrQueue("task-status", `/tasks/${task.id}`, "PATCH", { status: next });
      setQueuedNote(queued);
    } catch (err) {
      // The server rejected the change (offline would have queued it) — roll the optimistic update
      // back, cache included, so the list doesn't diverge from the backend.
      setTasks(previous);
      updateCache(cacheKey, previous).catch(() => {});
      setActionError(err instanceof ApiError ? err.message : tc("error"));
    }
  }

  if (loadError !== null) return <Muted>{loadError}</Muted>;
  if (tasks === null) return <Loading />;
  if (tasks.length === 0) return <Muted>{t("noTasks")}</Muted>;

  return (
    <View style={styles.list}>
      <CachedNote cachedAt={cachedAt} />
      {queuedNote && <FieldMessage type="success" text={t("queuedOffline")} />}
      {actionError !== null && <FieldMessage type="error" text={actionError} />}
      <Text style={styles.hint}>{t("tapToAdvance")}</Text>
      {tasks.map((task) => (
        <Pressable
          key={task.id}
          onPress={() => advance(task)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <Text style={styles.taskName} numberOfLines={2}>
            {task.name}
          </Text>
          <StatusBadge status={task.status} theme={theme} />
        </Pressable>
      ))}
    </View>
  );
}

function StatusBadge({ status, theme }: { status: TaskStatus; theme: Theme }) {
  const ts = useTranslations("scheduling");
  const { bg, fg } = {
    planned: { bg: theme.neutralBg, fg: theme.neutralText },
    in_progress: { bg: theme.warningBg, fg: theme.warningText },
    done: { bg: theme.successBg, fg: theme.successText },
  }[status];
  return (
    <View style={[badge.pill, { backgroundColor: bg }]}>
      <Text style={[badge.text, { color: fg }]}>{ts(status)}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  text: { fontSize: 12, fontWeight: "600" },
});

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    list: { gap: 10 },
    hint: { fontSize: 13, color: theme.textFaint },
    card: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      // Tall rows stay tappable with work gloves on.
      paddingVertical: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    cardPressed: { opacity: 0.6 },
    taskName: { flex: 1, fontSize: 16, fontWeight: "500", color: theme.text },
  });
}
