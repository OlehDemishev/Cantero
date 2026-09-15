import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";
import { discardQueued, retryQueued, type QueuedMutation } from "@/lib/offline-queue";
import { useTheme, type Theme } from "@/theme";

/** A queued offline mutation the server rejected once connectivity came back — a real conflict (the
 * record was edited or deleted elsewhere, or the data no longer validates), not a network problem.
 * Shown so the worker can retry or explicitly give up on it, instead of it sitting in the queue
 * unseen. Mirrors apps/web/components/offline-conflicts-banner.tsx. */
export function OfflineConflictsBanner({ items, onChange }: { items: QueuedMutation[]; onChange: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useTranslations("field");
  const [busyId, setBusyId] = useState<number | null>(null);

  if (items.length === 0) return null;

  async function run(id: number, action: (id: number) => Promise<unknown>) {
    setBusyId(id);
    try {
      await action(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.heading}>{t("syncConflicts", { count: items.length })}</Text>
      {items.map((item) => {
        const busy = busyId === item.id;
        return (
          <View key={item.id} style={styles.item}>
            <Text style={styles.kind}>{item.kind}</Text>
            <Text style={styles.error}>{item.error}</Text>
            <View style={styles.actions}>
              <Pressable
                onPress={() => run(item.id, retryQueued)}
                disabled={busy}
                style={[styles.button, styles.retry, busy && styles.dimmed]}
              >
                <Text style={styles.retryText}>{t("retrySync")}</Text>
              </Pressable>
              <Pressable
                onPress={() => run(item.id, discardQueued)}
                disabled={busy}
                style={[styles.button, styles.discard, busy && styles.dimmed]}
              >
                <Text style={styles.discardText}>{t("discardSync")}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    banner: { backgroundColor: theme.dangerBg, borderRadius: 12, padding: 12, gap: 8 },
    heading: { fontSize: 13, fontWeight: "600", color: theme.dangerText },
    item: { backgroundColor: theme.card, borderRadius: 10, padding: 12, gap: 4 },
    kind: { fontSize: 13, fontWeight: "600", color: theme.text },
    error: { fontSize: 13, color: theme.dangerText },
    actions: { flexDirection: "row", gap: 8, marginTop: 8 },
    // 44pt minimum: these get tapped on site, often with gloves.
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, justifyContent: "center" },
    retry: { backgroundColor: theme.neutralBg },
    retryText: { fontSize: 14, fontWeight: "600", color: theme.neutralText },
    discard: { backgroundColor: theme.dangerBg },
    discardText: { fontSize: 14, fontWeight: "600", color: theme.dangerText },
    dimmed: { opacity: 0.5 },
  });
}
