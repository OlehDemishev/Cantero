import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslations } from "use-intl";
import { fetchCached } from "@/lib/offline-cache";
import { downloadSheet, isSheetDownloaded } from "@/lib/sheets";
import { useTheme, type Theme } from "@/theme";
import { CachedNote, FieldMessage, Loading, Muted, SecondaryButton } from "./ui";

export interface PlanSheet {
  id: string;
  sheetNumber: string;
  title: string | null;
  discipline: string | null;
  revision: string | null;
  mimeType: string;
}

/** The project's current drawing sheets (Plan room). Opening one downloads it for offline use;
 * "Download all" does that for the whole set before heading somewhere without signal. */
export function PlansTab({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useTranslations("plans");
  const router = useRouter();
  const [sheets, setSheets] = useState<PlanSheet[] | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "warning"; text: string } | null>(null);

  const markDownloaded = useCallback((list: PlanSheet[]) => {
    setDownloaded(new Set(list.filter((s) => isSheetDownloaded(s.id, s.mimeType)).map((s) => s.id)));
  }, []);

  useEffect(() => {
    fetchCached<PlanSheet[]>(`field:sheets:${projectId}`, `/projects/${encodeURIComponent(projectId)}/drawing-sheets`)
      .then(({ data, stale, cachedAt: at }) => {
        setSheets(data);
        setCachedAt(stale ? at : null);
        markDownloaded(data);
      })
      .catch(() => setSheets([]));
  }, [projectId, reloadKey, markDownloaded]);

  async function downloadAll() {
    if (!sheets) return;
    const missing = sheets.filter((s) => !downloaded.has(s.id));
    setMessage(null);
    setProgress({ done: 0, total: missing.length });
    let failed = 0;
    for (const [i, sheet] of missing.entries()) {
      try {
        await downloadSheet(sheet.id, sheet.mimeType);
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: missing.length });
    }
    setProgress(null);
    markDownloaded(sheets);
    setMessage(failed > 0 ? { type: "warning", text: t("downloadFailed", { n: failed }) } : { type: "success", text: t("allDownloaded") });
  }

  if (sheets === null) return <Loading />;
  if (sheets.length === 0) return <Muted>{t("noSheets")}</Muted>;

  const missing = sheets.length - downloaded.size;

  return (
    <View style={styles.stack}>
      <CachedNote cachedAt={cachedAt} />
      <View style={styles.bar}>
        <Text style={styles.summary}>{t("summary", { total: sheets.length, offline: downloaded.size })}</Text>
        {missing > 0 && (
          <SecondaryButton
            label={progress ? t("downloading", { done: progress.done, total: progress.total }) : t("downloadAll")}
            onPress={downloadAll}
            disabled={progress !== null}
          />
        )}
      </View>
      {message && <FieldMessage type={message.type} text={message.text} />}
      {sheets.map((sheet) => (
        <Pressable
          key={sheet.id}
          onPress={() => router.push({ pathname: "/sheet/[id]", params: { id: sheet.id, projectId } })}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={[sheet.sheetNumber, sheet.title].filter(Boolean).join(", ")}
        >
          <View style={styles.rowText}>
            <Text style={styles.number}>{sheet.sheetNumber}</Text>
            {sheet.title && (
              <Text style={styles.title} numberOfLines={1}>
                {sheet.title}
              </Text>
            )}
            <Text style={styles.meta}>{[sheet.discipline, sheet.revision && t("revision", { rev: sheet.revision })].filter(Boolean).join(" · ")}</Text>
          </View>
          {downloaded.has(sheet.id) && (
            <View style={styles.offlinePill}>
              <Text style={styles.offlineText}>{t("offline")}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    stack: { gap: 10 },
    bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
    summary: { fontSize: 13, color: theme.textMuted, flexShrink: 1 },
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
    pressed: { opacity: 0.7 },
    rowText: { flex: 1, gap: 2 },
    number: { fontSize: 15, fontWeight: "600", color: theme.text, fontVariant: ["tabular-nums"] },
    title: { fontSize: 14, color: theme.text },
    meta: { fontSize: 12, color: theme.textMuted },
    offlinePill: { backgroundColor: theme.successBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    offlineText: { fontSize: 12, fontWeight: "600", color: theme.successText },
  });
}
