import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFormatter, useTranslations } from "use-intl";
import { useTheme, type Theme } from "@/theme";

export type FieldMessageType = "success" | "warning" | "error";

function useStyles() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return { theme, styles };
}

/** German, Polish and Ukrainian decimal keypads type "7,5" — Number() would read that as NaN. */
export function parseDecimal(input: string): number {
  return Number(input.trim().replace(",", "."));
}

export function Card({ children }: { children: ReactNode }) {
  const { styles } = useStyles();
  return <View style={styles.card}>{children}</View>;
}

export function Muted({ children }: { children: ReactNode }) {
  const { styles } = useStyles();
  return <Text style={styles.muted}>{children}</Text>;
}

export function Loading() {
  const { theme, styles } = useStyles();
  return <ActivityIndicator style={styles.spinner} color={theme.textMuted} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { styles } = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function TextField(props: TextInputProps) {
  const { theme, styles } = useStyles();
  return (
    <TextInput
      placeholderTextColor={theme.textFaint}
      {...props}
      style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
    />
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { styles } = useStyles();
  const tc = useTranslations("common");
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Field label={label}>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.select]}>
        <Text style={styles.selectText} numberOfLines={1}>
          {selected?.label ?? ""}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Inner Pressable swallows taps so touching the sheet itself doesn't close it. */}
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value || "__none"}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              }}
            />
            <Pressable onPress={() => setOpen(false)} style={styles.cancel}>
              <Text style={styles.cancelText}>{tc("cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Field>
  );
}

/** Day-by-day stepper over a YYYY-MM-DD value. Crews log today or yesterday almost every time, so
 * two taps beat opening a calendar — and it needs no native date-picker dependency. The value is a
 * plain calendar date, so all arithmetic and display is pinned to UTC to keep it from drifting a
 * day in timezones west of it. */
export function DateStepper({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { styles } = useStyles();
  const format = useFormatter();

  function shift(days: number) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    onChange(date.toISOString().slice(0, 10));
  }

  return (
    <Field label={label}>
      <View style={styles.stepper}>
        <Pressable onPress={() => shift(-1)} style={styles.stepButton} hitSlop={6}>
          <Text style={styles.stepGlyph}>‹</Text>
        </Pressable>
        <View style={[styles.input, styles.stepValue]}>
          <Text style={styles.selectText}>
            {format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}
          </Text>
        </View>
        <Pressable onPress={() => shift(1)} style={styles.stepButton} hitSlop={6}>
          <Text style={styles.stepGlyph}>›</Text>
        </Pressable>
      </View>
    </Field>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const { theme, styles } = useStyles();
  const inactive = busy || disabled;
  return (
    <Pressable
      onPress={() => {
        // The result message renders below the button — with the keyboard still up it'd be hidden.
        Keyboard.dismiss();
        onPress();
      }}
      disabled={inactive}
      style={({ pressed }) => [styles.primary, (inactive || pressed) && styles.dimmed]}
    >
      {busy ? <ActivityIndicator color={theme.accentText} /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { styles } = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.secondary, (disabled || pressed) && styles.dimmed]}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

/** Success/warning/error line under a form — a failed submit must never reuse the success colour. */
export function FieldMessage({ type, text }: { type: FieldMessageType; text: string }) {
  const { theme, styles } = useStyles();
  const color = { success: theme.successText, warning: theme.warningText, error: theme.dangerText }[type];
  return <Text style={[styles.message, { color }]}>{text}</Text>;
}

/** Shown when a tab's data came from the offline cache rather than a fresh fetch. */
export function CachedNote({ cachedAt }: { cachedAt: number | null }) {
  const { styles } = useStyles();
  const t = useTranslations("field");
  const format = useFormatter();
  if (cachedAt === null) return null;
  return (
    <Text style={styles.cachedNote}>
      {t("cachedFrom", { time: format.dateTime(new Date(cachedAt), { timeStyle: "short" }) })}
    </Text>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 16,
      gap: 14,
    },
    muted: { fontSize: 14, color: theme.textFaint, paddingVertical: 12 },
    spinner: { marginTop: 24 },
    field: { gap: 8 },
    label: { fontSize: 13, fontWeight: "600", color: theme.textMuted },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      // 48pt keeps every control comfortable to hit with work gloves on.
      minHeight: 48,
      fontSize: 16,
    },
    inputMultiline: { minHeight: 96, paddingTop: 12, paddingBottom: 12, textAlignVertical: "top" },
    select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    selectText: { flexShrink: 1, fontSize: 16, color: theme.text },
    chevron: { fontSize: 14, color: theme.textMuted },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "70%",
      paddingTop: 16,
    },
    sheetTitle: { fontSize: 13, fontWeight: "600", color: theme.textMuted, paddingHorizontal: 20, paddingBottom: 8 },
    option: { minHeight: 52, paddingHorizontal: 20, justifyContent: "center" },
    optionActive: { backgroundColor: theme.neutralBg },
    optionText: { fontSize: 16, color: theme.text },
    optionTextActive: { color: theme.accent, fontWeight: "600" },
    cancel: {
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    cancelText: { fontSize: 16, fontWeight: "600", color: theme.accent },
    stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
    stepButton: {
      width: 48,
      height: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    stepGlyph: { fontSize: 24, lineHeight: 28, color: theme.text },
    stepValue: { flex: 1, alignItems: "center", justifyContent: "center" },
    primary: {
      backgroundColor: theme.accent,
      borderRadius: 10,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryText: { color: theme.accentText, fontSize: 16, fontWeight: "600" },
    secondary: {
      backgroundColor: theme.neutralBg,
      borderRadius: 8,
      minHeight: 44,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { color: theme.neutralText, fontSize: 14, fontWeight: "600" },
    dimmed: { opacity: 0.6 },
    message: { fontSize: 14 },
    cachedNote: { fontSize: 13, color: theme.warningText },
  });
}
