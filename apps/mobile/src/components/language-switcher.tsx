import { useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { useTranslations } from "use-intl";
import { LOCALE_NAMES, SUPPORTED_LOCALES, type Locale } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { updateCache } from "@/lib/offline-cache";
import type { Me } from "@/lib/use-me";
import { useAppLocale } from "@/i18n";
import { OptionSheet } from "./field/ui";

/**
 * The language picker in the app's header. The choice is saved to the person's profile, so the web
 * app follows it too; "company language" goes back to whatever the company uses.
 */
export function LanguageSwitcher({ me, style }: { me: Me | null; style: object }) {
  const t = useTranslations("field");
  const { locale, setLocale } = useAppLocale();
  const [open, setOpen] = useState(false);
  if (!me?.company) return null;
  const company = me.company;

  async function pick(value: Locale | "") {
    try {
      const res = await apiFetch<{ locale: Locale; userLocale: Locale | null }>("/me/language", {
        method: "PATCH",
        body: JSON.stringify({ locale: value || null }),
      });
      // So the next launch offline opens in the new language, not the one cached with /me before.
      await updateCache<Me>("me", { ...me!, locale: res.locale, user: { ...me!.user, locale: res.userLocale } });
      setLocale(res.locale);
    } catch (err) {
      Alert.alert(t("languageNotSaved"), err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("language")}>
        <Text style={style}>{locale.toUpperCase()} ▾</Text>
      </Pressable>
      <OptionSheet<Locale | "">
        visible={open}
        title={t("language")}
        value={me.user.locale ?? ""}
        options={[
          { value: "", label: t("companyLanguage", { language: LOCALE_NAMES[company.locale] }) },
          ...SUPPORTED_LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] })),
        ]}
        onPick={(v) => void pick(v)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
