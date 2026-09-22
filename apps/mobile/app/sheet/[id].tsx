import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import SheetCanvas, { type SheetLinkBox, type SheetPin } from "@/components/plans/sheet-canvas";
import { PhotoPicker } from "@/components/field/photo-picker";
import { FieldMessage, PrimaryButton, SecondaryButton, TextField } from "@/components/field/ui";
import { fetchCached, updateCache } from "@/lib/offline-cache";
import { attachFiles, followUp, submitOrQueue } from "@/lib/offline-queue";
import type { LocalPhoto } from "@/lib/photos";
import { useSession } from "@/lib/session";
import { sheetBase64 } from "@/lib/sheets";
import { useTheme, type Theme } from "@/theme";

interface Sheet {
  id: string;
  projectId: string;
  sheetNumber: string;
  title: string | null;
  revision: string | null;
  mimeType: string;
}
interface SheetLinks {
  outgoing: { id: string; label: string; x: number; y: number; width: number; height: number; targetSheetId: string; targetSheetNumber: string }[];
}
/** What the punch list and RFI endpoints return, as far as pins need it. Cached under the same keys
 * the Punch and RFI tabs use, so an item created there offline also shows here. */
interface PinnedRow {
  id: string;
  title?: string;
  subject?: string;
  number?: string;
  status: string;
  drawingSheetId?: string | null;
  pinX?: number | null;
  pinY?: number | null;
}

/**
 * One drawing sheet on the phone: pins for this sheet's RFIs and punch items, the sheet's printed
 * references to other sheets as tappable boxes, and "tap to add a punch item here" — which works
 * offline, the item and its pin following the rest of the queue.
 */
export default function SheetScreen() {
  const { token, restoring } = useSession();
  if (restoring) return null;
  if (!token) return <Redirect href="/login" />;
  return <SheetView />;
}

function SheetView() {
  const { id, projectId: projectParam } = useLocalSearchParams<{ id: string; projectId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const t = useTranslations("plans");
  const tp = useTranslations("punchList");
  const tc = useTranslations("common");

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [links, setLinks] = useState<SheetLinkBox[]>([]);
  const [punch, setPunch] = useState<PinnedRow[]>([]);
  const [rfis, setRfis] = useState<PinnedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [form, setForm] = useState({ title: "", location: "" });
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);
  const [selected, setSelected] = useState<{ id: string; kind: "rfi" | "punch" } | null>(null);

  const projectId = sheet?.projectId ?? projectParam ?? null;
  const punchKey = projectId ? `field:punch-list:${projectId}` : null;

  useEffect(() => {
    setSheet(null);
    setData(null);
    setError(null);
    fetchCached<Sheet>(`field:sheet:${id}`, `/drawing-sheets/${encodeURIComponent(id)}`)
      .then(async ({ data: s }) => {
        setSheet(s);
        setData(await sheetBase64(s.id, s.mimeType));
      })
      .catch(() => setError(t("notAvailableOffline")));
    fetchCached<SheetLinks>(`field:sheet-links:${id}`, `/drawing-sheets/${encodeURIComponent(id)}/links`)
      .then(({ data: l }) => setLinks(l.outgoing.map((o) => ({ id: o.id, x: o.x, y: o.y, width: o.width, height: o.height, targetSheetId: o.targetSheetId, label: t("openSheet", { sheet: o.targetSheetNumber }) }))))
      .catch(() => setLinks([]));
  }, [id, t]);

  const loadPins = useCallback(() => {
    if (!projectId) return;
    fetchCached<PinnedRow[]>(`field:punch-list:${projectId}`, `/punch-list?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data: rows }) => setPunch(rows))
      .catch(() => {});
    fetchCached<PinnedRow[]>(`field:rfis:${projectId}`, `/rfis?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data: rows }) => setRfis(rows))
      .catch(() => {});
  }, [projectId]);
  useEffect(loadPins, [loadPins]);

  const onThisSheet = (r: PinnedRow) => r.drawingSheetId === id && r.pinX != null && r.pinY != null;
  const pins: SheetPin[] = [
    ...punch.filter(onThisSheet).map((r) => ({ id: r.id, kind: "punch" as const, x: r.pinX!, y: r.pinY!, label: r.title ?? "", done: r.status !== "open" })),
    ...rfis.filter(onThisSheet).map((r) => ({ id: r.id, kind: "rfi" as const, x: r.pinX!, y: r.pinY!, label: `${r.number ?? ""} ${r.subject ?? ""}`.trim(), done: r.status === "closed" })),
    ...(draft ? [{ id: "draft", kind: "punch" as const, x: draft.x, y: draft.y, label: t("newPin"), done: false }] : []),
  ];

  const selectedRow = selected ? (selected.kind === "punch" ? punch : rfis).find((r) => r.id === selected.id) : null;

  async function savePunchItem() {
    if (!draft || !projectId || !form.title.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const record = await submitOrQueue<{ id: string }>("punch-list-item", "/punch-list", "POST", {
        projectId,
        title: form.title.trim(),
        location: form.location.trim() || sheet?.sheetNumber || undefined,
      });
      // The create endpoint takes no pin; the pin follows the item, queued behind it when offline.
      const pin = { drawingSheetId: id, pinX: draft.x, pinY: draft.y };
      await followUp("punch-list-pin", record, "PATCH", (itemId) => `/punch-list/${encodeURIComponent(itemId)}/pin`, pin);
      const sent = photos.length > 0 ? await attachFiles("punch-photo", record, photos, (itemId) => `/documents?punchListItemId=${encodeURIComponent(itemId)}&category=photo`) : { queued: 0, failed: 0 };

      // Show it on the sheet (and in the Punch tab) right away, whether it went out or is queued.
      const created: PinnedRow = { id: record.data?.id ?? `queued-${Date.now()}`, title: form.title.trim(), status: "open", ...pin };
      const updated = [...punch, created];
      setPunch(updated);
      if (punchKey) updateCache(punchKey, updated).catch(() => {});

      setDraft(null);
      setPlacing(false);
      setForm({ title: "", location: "" });
      setPhotos([]);
      setMessage(
        sent.failed > 0
          ? { type: "warning", text: t("pinnedPhotosFailed", { n: sent.failed }) }
          : { type: "success", text: record.queued ? t("pinnedOffline") : t("pinned") },
      );
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  function cancelPlacing() {
    setPlacing(false);
    setDraft(null);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹ {t("back")}</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.number} numberOfLines={1}>
            {sheet?.sheetNumber ?? "…"}
            {sheet?.revision ? `  ·  ${t("revision", { rev: sheet.revision })}` : ""}
          </Text>
          {sheet?.title && (
            <Text style={styles.title} numberOfLines={1}>
              {sheet.title}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.canvas}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : !data || !sheet ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.textMuted} />
            <Text style={styles.muted}>{t("loadingSheet")}</Text>
          </View>
        ) : (
          <SheetCanvas
            data={data}
            mimeType={sheet.mimeType}
            pins={pins}
            links={links}
            placing={placing}
            dark={dark}
            labels={{ zoomIn: t("zoomIn"), zoomOut: t("zoomOut"), fit: t("fit") }}
            onTap={async (x, y) => setDraft({ x, y })}
            onOpenSheet={async (target) => router.push({ pathname: "/sheet/[id]", params: { id: target, projectId: projectId ?? "" } })}
            onPinPress={async (pinId, kind) => (pinId === "draft" ? undefined : setSelected({ id: pinId, kind }))}
            onError={async (msg) => setError(t("renderFailed", { message: msg }))}
            dom={{ style: { flex: 1 }, scrollEnabled: false }}
          />
        )}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
          {message && <FieldMessage type={message.type} text={message.text} />}
          {placing && draft ? (
            <View style={styles.form}>
              <TextField placeholder={tp("itemTitle")} value={form.title} onChangeText={(title) => setForm((f) => ({ ...f, title }))} autoFocus />
              <TextField placeholder={tp("locationPlaceholder")} value={form.location} onChangeText={(location) => setForm((f) => ({ ...f, location }))} />
              <PhotoPicker photos={photos} onChange={setPhotos} />
              <View style={styles.row}>
                <SecondaryButton label={tc("cancel")} onPress={cancelPlacing} />
                <View style={styles.flex}>
                  <PrimaryButton label={tp("newItem")} onPress={savePunchItem} busy={busy} disabled={!form.title.trim()} />
                </View>
              </View>
            </View>
          ) : placing ? (
            <View style={styles.row}>
              <Text style={[styles.muted, styles.flex]}>{t("tapToPlace")}</Text>
              <SecondaryButton label={tc("cancel")} onPress={cancelPlacing} />
            </View>
          ) : selectedRow && selected ? (
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.kind}>{selected.kind === "rfi" ? t("rfi") : t("punchItem")}</Text>
                <Text style={styles.selectedTitle} numberOfLines={2}>
                  {selected.kind === "rfi" ? `${selectedRow.number ?? ""} ${selectedRow.subject ?? ""}`.trim() : selectedRow.title}
                </Text>
                <Text style={styles.muted}>{t(`status_${selectedRow.status}` as "status_open")}</Text>
              </View>
              <SecondaryButton label={t("close")} onPress={() => setSelected(null)} />
            </View>
          ) : (
            <PrimaryButton label={t("addPunchHere")} onPress={() => setPlacing(true)} disabled={!sheet || !data} />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
    back: { fontSize: 16, color: theme.accent, fontWeight: "500" },
    headerText: { flex: 1 },
    number: { fontSize: 17, fontWeight: "700", color: theme.text, fontVariant: ["tabular-nums"] },
    title: { fontSize: 13, color: theme.textMuted },
    canvas: { flex: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
    muted: { fontSize: 13, color: theme.textMuted },
    panel: { paddingHorizontal: 16, paddingTop: 12, gap: 10, backgroundColor: theme.card },
    form: { gap: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    flex: { flex: 1 },
    kind: { fontSize: 12, fontWeight: "600", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
    selectedTitle: { fontSize: 15, fontWeight: "500", color: theme.text },
  });
}
