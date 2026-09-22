import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";
import { capturePhoto, deletePhoto, PhotoPermissionError, type LocalPhoto, type PhotoSource } from "@/lib/photos";
import { useTheme, type Theme } from "@/theme";
import { FieldMessage, SecondaryButton } from "./ui";

/**
 * Photos taken for a record that hasn't been saved yet. The parent owns the list and hands it to
 * attachFiles() on submit; from then on the files belong to the upload queue. Removing one here
 * deletes its file.
 */
export function PhotoPicker({
  photos,
  onChange,
  max = 10,
  label,
}: {
  photos: LocalPhoto[];
  onChange: (photos: LocalPhoto[]) => void;
  max?: number;
  label?: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useTranslations("field");
  const tp = useTranslations("photos");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(source: PhotoSource) {
    setBusy(true);
    setError(null);
    try {
      const photo = await capturePhoto(source);
      if (photo) onChange([...photos, photo]);
    } catch (err) {
      setError(err instanceof PhotoPermissionError ? t(err.source === "camera" ? "cameraDenied" : "libraryDenied") : t("photoFailed"));
    } finally {
      setBusy(false);
    }
  }

  function remove(photo: LocalPhoto) {
    deletePhoto(photo.uri);
    onChange(photos.filter((p) => p.uri !== photo.uri));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label ?? tp("title")}</Text>
      {photos.length > 0 && (
        <View style={styles.grid}>
          {photos.map((p, i) => (
            <View key={p.uri} style={styles.thumbWrap}>
              <Image source={{ uri: p.uri }} style={styles.thumb} accessibilityLabel={t("photoN", { n: i + 1 })} />
              <Pressable
                onPress={() => remove(p)}
                style={styles.remove}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("removePhotoN", { n: i + 1 })}
              >
                <Text style={styles.removeGlyph}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {photos.length < max && (
        <View style={styles.actions}>
          <SecondaryButton label={t("takePhoto")} onPress={() => add("camera")} disabled={busy} />
          <SecondaryButton label={t("choosePhoto")} onPress={() => add("library")} disabled={busy} />
        </View>
      )}
      {error && <FieldMessage type="error" text={error} />}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    label: { fontSize: 13, fontWeight: "500", color: theme.textMuted },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    thumbWrap: { width: 72, height: 72 },
    thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: theme.neutralBg },
    remove: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.text,
      alignItems: "center",
      justifyContent: "center",
    },
    removeGlyph: { color: theme.card, fontSize: 16, lineHeight: 18, fontWeight: "600" },
    actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  });
}
