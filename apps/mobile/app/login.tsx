import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { useTheme, type Theme } from "@/theme";

type LoginResult = { accessToken: string; companyId: string } | { requires2fa: true; challengeToken: string };

export default function LoginScreen() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const { token, restoring, signIn } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (restoring) return <Centered theme={theme} />;
  if (token) return <Redirect href="/" />;

  async function submitCredentials() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<LoginResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if ("requires2fa" in res) {
        setChallengeToken(res.challengeToken);
        return;
      }
      await signIn(res.accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("loginError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode() {
    if (!challengeToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>("/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code: code.trim() }),
      });
      await signIn(res.accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("loginError"));
    } finally {
      setSubmitting(false);
    }
  }

  const twoFactor = challengeToken !== null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>{t("loginTitle")}</Text>

        {error !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {twoFactor ? (
          <>
            <Field label={t("twoFactorCode")} theme={theme}>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoFocus
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={theme.textFaint}
                editable={!submitting}
              />
            </Field>
            <SubmitButton
              label={t("verify")}
              onPress={submitCode}
              disabled={submitting || code.trim().length === 0}
              submitting={submitting}
              theme={theme}
            />
          </>
        ) : (
          <>
            <Field label={tc("email")} theme={theme}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                editable={!submitting}
              />
            </Field>
            <Field label={t("password")} theme={theme}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                editable={!submitting}
              />
            </Field>
            <SubmitButton
              label={t("login")}
              onPress={submitCredentials}
              disabled={submitting || email.trim().length === 0 || password.length === 0}
              submitting={submitting}
              theme={theme}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, theme, children }: { label: string; theme: Theme; children: React.ReactNode }) {
  const styles = makeStyles(theme);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function SubmitButton({
  label,
  onPress,
  disabled,
  submitting,
  theme,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  submitting: boolean;
  theme: Theme;
}) {
  const styles = makeStyles(theme);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, (disabled || pressed) && styles.buttonDimmed]}
    >
      {submitting ? (
        <ActivityIndicator color={theme.accentText} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function Centered({ theme }: { theme: Theme }) {
  return (
    <View style={[styles_centered.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.textMuted} />
    </View>
  );
}

const styles_centered = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    scroll: { paddingHorizontal: 24, gap: 4 },
    brand: { fontSize: 28, fontWeight: "700", color: theme.text, marginBottom: 28 },
    field: { marginBottom: 18 },
    label: { fontSize: 13, fontWeight: "600", color: theme.textMuted, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      // 48pt keeps the tap target comfortable in gloves on site.
      height: 48,
      fontSize: 16,
    },
    button: {
      backgroundColor: theme.accent,
      borderRadius: 10,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    buttonDimmed: { opacity: 0.6 },
    buttonText: { color: theme.accentText, fontSize: 16, fontWeight: "600" },
    errorBox: {
      backgroundColor: theme.dangerBg,
      borderRadius: 10,
      padding: 12,
      marginBottom: 18,
    },
    errorText: { color: theme.dangerText, fontSize: 14 },
  });
}
