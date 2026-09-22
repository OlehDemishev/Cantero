import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useTranslations } from "use-intl";
import { PrimaryButton } from "@/components/field/ui";
import { useTheme, type Theme } from "@/theme";
import { useSession } from "./session";

const PREFERENCE_KEY = "cantero_biometric_lock";
/** Away from the app longer than this (a site phone left on a bench) locks it again. */
const RELOCK_AFTER_MS = 2 * 60 * 1000;

type Preference = "on" | "off" | null;

/**
 * Face ID / fingerprint unlock for a phone that stays signed in for days. Offered once after
 * signing in; when on, the app is covered on launch and after RELOCK_AFTER_MS in the background
 * until the owner authenticates (the device passcode is the fallback the OS offers). The session
 * token itself stays in Keychain/Keystore either way — this guards the screen, not the token.
 */
export function BiometricGate({ children }: { children: ReactNode }) {
  const { token, restoring, signOut } = useSession();
  const t = useTranslations("field");
  const [preference, setPreference] = useState<Preference | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const offered = useRef(false);

  // Read the stored choice once; lock straight away on a launch that restored a session.
  useEffect(() => {
    SecureStore.getItemAsync(PREFERENCE_KEY)
      .then((v) => {
        const pref = v === "on" || v === "off" ? v : null;
        setPreference(pref);
        if (pref === "on") setLocked(true);
      })
      .catch(() => setPreference(null));
  }, []);

  // Offer it once, the first time someone signs in on a phone that has biometrics set up.
  useEffect(() => {
    if (!token || restoring || preference !== null || offered.current) return;
    offered.current = true;
    (async () => {
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return;
      Alert.alert(t("biometricOfferTitle"), t("biometricOfferBody"), [
        { text: t("biometricOfferNo"), style: "cancel", onPress: () => void store("off") },
        { text: t("biometricOfferYes"), onPress: () => void store("on") },
      ]);
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, restoring, preference]);

  // Signing out forgets the choice: the next person to sign in on this phone decides for themselves.
  useEffect(() => {
    if (!restoring && !token && preference !== undefined && preference !== null) {
      void SecureStore.deleteItemAsync(PREFERENCE_KEY);
      setPreference(null);
      setLocked(false);
      offered.current = false;
    }
  }, [token, restoring, preference]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") backgroundedAt.current = Date.now();
      if (state === "active" && backgroundedAt.current !== null) {
        if (preference === "on" && token && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [preference, token]);

  async function store(value: "on" | "off") {
    await SecureStore.setItemAsync(PREFERENCE_KEY, value);
    setPreference(value);
  }

  if (preference === undefined) return null;
  return (
    <>
      {children}
      {locked && token && <LockScreen onUnlocked={() => setLocked(false)} onSignOut={signOut} />}
    </>
  );
}

function LockScreen({ onUnlocked, onSignOut }: { onUnlocked: () => void; onSignOut: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useTranslations("field");
  const tc = useTranslations("common");
  const [failed, setFailed] = useState(false);

  const unlock = useCallback(async () => {
    setFailed(false);
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: t("biometricPrompt"), cancelLabel: tc("cancel") });
    if (result.success) onUnlocked();
    else setFailed(result.error !== "user_cancel" && result.error !== "app_cancel" && result.error !== "system_cancel");
  }, [onUnlocked, t, tc]);

  // Ask straight away rather than making the person tap first — once per time the lock appears.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void unlock();
  }, [unlock]);

  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <Text style={styles.title}>Cantero Field</Text>
      <Text style={styles.body}>{t("lockedBody")}</Text>
      {failed && <Text style={styles.error}>{t("biometricFailed")}</Text>}
      <View style={styles.button}>
        <PrimaryButton label={t("unlock")} onPress={() => void unlock()} />
      </View>
      <Pressable onPress={onSignOut} hitSlop={12} accessibilityRole="button">
        <Text style={styles.link}>{tc("signOut")}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    cover: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
    title: { fontSize: 26, fontWeight: "700", color: theme.text },
    body: { fontSize: 15, color: theme.textMuted, textAlign: "center" },
    error: { fontSize: 14, color: theme.dangerText, textAlign: "center" },
    button: { alignSelf: "stretch" },
    link: { fontSize: 15, color: theme.accent, fontWeight: "500" },
  });
}
