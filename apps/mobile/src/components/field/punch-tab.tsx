import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";
import { fetchCached, updateCache } from "@/lib/offline-cache";
import { attachFiles, submitOrQueue, submitOrQueueUpload } from "@/lib/offline-queue";
import { capturePhoto, PhotoPermissionError, type LocalPhoto } from "@/lib/photos";
import { useTheme, type Theme } from "@/theme";
import {
  CachedNote,
  Card,
  Field,
  FieldMessage,
  Loading,
  Muted,
  PrimaryButton,
  SecondaryButton,
  TextField,
  type FieldMessageType,
} from "./ui";
import { PhotoPicker } from "./photo-picker";

const photoPath = (itemId: string) => `/documents?punchListItemId=${encodeURIComponent(itemId)}&category=photo`;

interface PunchListItem {
  id: string;
  title: string;
  location: string | null;
  status: "open" | "resolved" | "verified";
}

export function PunchTab({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useTranslations("field");
  const tp = useTranslations("punchList");
  const tc = useTranslations("common");
  const [items, setItems] = useState<PunchListItem[] | null>(null);
  const [form, setForm] = useState({ title: "", location: "" });
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const cacheKey = `field:punch-list:${projectId}`;

  const load = useCallback(() => {
    fetchCached<PunchListItem[]>(cacheKey, `/punch-list?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data, stale, cachedAt: at }) => {
        setItems(data);
        setCachedAt(stale ? at : null);
      })
      .catch(() => setItems([]));
  }, [cacheKey, projectId]);

  useEffect(load, [load, reloadKey]);

  async function submit() {
    if (!form.title.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const record = await submitOrQueue<{ id: string }>("punch-list-item", "/punch-list", "POST", {
        projectId,
        title: form.title,
        location: form.location || undefined,
      });
      const { queued } = record;
      // The record is saved either way; its photos follow it (right now, or queued behind it).
      const sent = photos.length > 0 ? await attachFiles("punch-photo", record, photos, photoPath) : { queued: 0, failed: 0 };
      setPhotos([]);
      setMessage(
        sent.failed > 0
          ? { type: "warning", text: t("photosFailed", { n: sent.failed }) }
          : { type: "success", text: queued ? t("queuedOffline") : sent.queued > 0 ? t("photosQueued", { n: sent.queued }) : tc("saved") },
      );
      if (queued) {
        const optimistic: PunchListItem = {
          id: `queued-${Date.now()}`,
          title: form.title,
          location: form.location || null,
          status: "open",
        };
        const updated = [...(items ?? []), optimistic];
        setItems(updated);
        updateCache(cacheKey, updated).catch(() => {});
      }
      setForm({ title: "", location: "" });
      if (!queued) load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string) {
    const previous = items ?? [];
    try {
      const { queued } = await submitOrQueue("punch-list-resolve", `/punch-list/${id}/resolve`, "POST", {});
      if (queued) {
        const updated = previous.map((i) => (i.id === id ? { ...i, status: "resolved" as const } : i));
        setItems(updated);
        updateCache(cacheKey, updated).catch(() => {});
      } else {
        load();
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    }
  }

  /** A photo for an item that already exists — typically the "after" shot once it's fixed. */
  async function addPhoto(item: PunchListItem) {
    try {
      const photo = await capturePhoto("camera");
      if (!photo) return;
      const { queued } = await submitOrQueueUpload("punch-photo", photoPath(item.id), photo);
      setMessage({ type: "success", text: queued ? t("photoQueued") : t("photoAdded", { item: item.title }) });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof PhotoPermissionError ? t("cameraDenied") : err instanceof Error ? err.message : tc("error"),
      });
    }
  }

  const visible = (items ?? []).filter((i) => i.status !== "verified");

  return (
    <View style={styles.stack}>
      <CachedNote cachedAt={cachedAt} />
      <Card>
        <Field label={tp("itemTitle")}>
          <TextField value={form.title} onChangeText={(title) => setForm((f) => ({ ...f, title }))} />
        </Field>
        <Field label={tp("location")}>
          <TextField
            placeholder={tp("locationPlaceholder")}
            value={form.location}
            onChangeText={(location) => setForm((f) => ({ ...f, location }))}
          />
        </Field>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        <PrimaryButton label={tp("newItem")} onPress={submit} busy={busy} disabled={!form.title.trim()} />
        {message && <FieldMessage type={message.type} text={message.text} />}
      </Card>

      {items === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Muted>{tp("noItems")}</Muted>
      ) : (
        visible.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.title}>{item.title}</Text>
              {item.location && <Text style={styles.subtitle}>{item.location}</Text>}
            </View>
            {/* An item still waiting in the offline queue has no id to attach a photo to yet. */}
            {!item.id.startsWith("queued-") && <SecondaryButton label={t("photo")} onPress={() => addPhoto(item)} />}
            {item.status === "open" ? (
              <SecondaryButton label={tp("markResolved")} onPress={() => resolve(item.id)} />
            ) : (
              <View style={styles.resolvedPill}>
                <Text style={styles.resolvedText}>{tp("resolved")}</Text>
              </View>
            )}
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
    title: { fontSize: 15, fontWeight: "500", color: theme.text },
    subtitle: { fontSize: 13, color: theme.textMuted },
    resolvedPill: { backgroundColor: theme.warningBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    resolvedText: { fontSize: 12, fontWeight: "600", color: theme.warningText },
  });
}
