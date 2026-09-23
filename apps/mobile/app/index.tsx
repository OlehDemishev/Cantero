import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { ExpensesTab } from "@/components/field/expenses-tab";
import { LogsTab } from "@/components/field/logs-tab";
import { PlansTab } from "@/components/field/plans-tab";
import { PunchTab } from "@/components/field/punch-tab";
import { RfiTab } from "@/components/field/rfi-tab";
import { StockTab } from "@/components/field/stock-tab";
import { TasksTab } from "@/components/field/tasks-tab";
import { TimeTab } from "@/components/field/time-tab";
import { Loading, Muted } from "@/components/field/ui";
import { OfflineConflictsBanner } from "@/components/offline-conflicts-banner";
import { ApiError } from "@/lib/api-client";
import { fetchCached } from "@/lib/offline-cache";
import { useOfflineQueue } from "@/lib/offline-queue";
import { registerForPush, usePushNavigation } from "@/lib/push";
import { useSession } from "@/lib/session";
import { useMe } from "@/lib/use-me";
import { useTheme, type Theme } from "@/theme";

interface Project {
  id: string;
  name: string;
}

const TABS = ["tasks", "time", "stock", "logs", "punch", "plans", "rfi", "expenses"] as const;
type TabKey = (typeof TABS)[number];

export default function FieldScreen() {
  const { token, restoring } = useSession();
  const theme = useTheme();

  if (restoring) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.textMuted} />
      </View>
    );
  }
  if (!token) return <Redirect href="/login" />;
  return <FieldShell token={token} />;
}

function FieldShell({ token }: { token: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const t = useTranslations("field");
  const tc = useTranslations("common");
  const { signOut } = useSession();
  const { me, unauthorized } = useMe();
  const { pendingCount, failedItems, flush, refresh: refreshQueue } = useOfflineQueue();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("tasks");
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (unauthorized) signOut();
  }, [unauthorized, signOut]);

  // Register this phone for alerts once signed in. Failing (offline, permission refused, no EAS
  // project in a dev build) just means no push; the app works the same.
  useEffect(() => {
    registerForPush().catch(() => {});
  }, [token]);

  // Tapping an alert opens its project, on the tab it's about.
  usePushNavigation(({ projectId: target, tab: targetTab }) => {
    if (target) setProjectId(target);
    if (targetTab && (TABS as readonly string[]).includes(targetTab)) setTab(targetTab as TabKey);
  });

  useEffect(() => {
    fetchCached<Project[]>("field:projects", "/projects")
      .then(({ data: list }) => {
        setProjectsError(null);
        setProjects(list);
        setProjectId((current) => (current && list.some((p) => p.id === current) ? current : (list[0]?.id ?? null)));
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          signOut();
          return;
        }
        setProjectsError(err instanceof ApiError ? err.message : t("offline"));
      });
  }, [token, reloadKey, signOut, t]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      // Deliver queued writes first, so the reload shows the server's view including them.
      await flush();
    } finally {
      setReloadKey((k) => k + 1);
      refreshQueue();
      setRefreshing(false);
    }
  }

  const meUserId = me?.user.id ?? null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("title")}</Text>
        <Pressable onPress={signOut} hitSlop={12}>
          <Text style={styles.signOut}>{tc("signOut")}</Text>
        </Pressable>
      </View>

      {projects !== null && projects.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
          contentContainerStyle={styles.chipRow}
          // Otherwise, while a form field still holds focus (e.g. the keyboard was closed with the
          // system back button), the first tap here is swallowed just to blur it.
          keyboardShouldPersistTaps="handled"
        >
          {projects.map((project) => {
            const active = project.id === projectId;
            return (
              <Pressable
                key={project.id}
                onPress={() => setProjectId(project.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {project.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroller}
        contentContainerStyle={styles.tabRow}
        keyboardShouldPersistTaps="handled"
      >
        {TABS.map((key) => {
          const active = key === tab;
          return (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, active && styles.tabActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t(key)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textMuted} />}
        >
          <OfflineConflictsBanner items={failedItems} onChange={refreshQueue} />

          {pendingCount > 0 && (
            <View style={styles.syncBox}>
              <Text style={styles.syncText}>{t("pendingSync", { count: pendingCount })}</Text>
            </View>
          )}

          {projectsError !== null ? (
            <Muted>{projectsError}</Muted>
          ) : projects === null ? (
            <Loading />
          ) : projects.length === 0 || projectId === null ? (
            <Muted>{t("noProjects")}</Muted>
          ) : (
            // Keyed by project so switching projects starts every form from a clean slate, while a
            // pull-to-refresh (reloadKey) keeps whatever the worker has already typed.
            <View key={projectId}>
              {tab === "tasks" && <TasksTab projectId={projectId} reloadKey={reloadKey} />}
              {tab === "time" && <TimeTab projectId={projectId} meUserId={meUserId} permissions={me?.user.permissions} reloadKey={reloadKey} />}
              {tab === "stock" && <StockTab projectId={projectId} reloadKey={reloadKey} />}
              {tab === "logs" && <LogsTab projectId={projectId} reloadKey={reloadKey} />}
              {tab === "punch" && <PunchTab projectId={projectId} reloadKey={reloadKey} />}
              {tab === "plans" && <PlansTab projectId={projectId} reloadKey={reloadKey} />}
              {tab === "rfi" && <RfiTab projectId={projectId} reloadKey={reloadKey} />}
              {tab === "expenses" && <ExpensesTab projectId={projectId} meUserId={meUserId} permissions={me?.user.permissions} reloadKey={reloadKey} />}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    title: { fontSize: 26, fontWeight: "700", color: theme.text },
    signOut: { fontSize: 15, color: theme.accent, fontWeight: "500" },
    // A horizontal ScrollView otherwise takes a flex share of the column's height and stretches
    // every chip to match it.
    scroller: { flexGrow: 0 },
    chipRow: { paddingHorizontal: 20, paddingVertical: 6, gap: 8, alignItems: "center" },
    chip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      maxWidth: 220,
    },
    chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    chipText: { fontSize: 14, color: theme.textMuted, fontWeight: "500" },
    chipTextActive: { color: theme.accentText },
    tabRow: { paddingHorizontal: 20, paddingVertical: 6, gap: 4, alignItems: "center" },
    tab: { borderRadius: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
    tabActive: { backgroundColor: theme.neutralBg },
    tabText: { fontSize: 15, color: theme.textMuted, fontWeight: "500" },
    tabTextActive: { color: theme.text, fontWeight: "700" },
    content: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
    syncBox: { backgroundColor: theme.warningBg, borderRadius: 10, padding: 12 },
    syncText: { color: theme.warningText, fontSize: 14, fontWeight: "500" },
  });
}
