import { useMemo, useRef } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { useTheme, type Theme } from "@/theme";
import { PrimaryButton, SecondaryButton } from "./ui";

/** Codes printed on building materials and on labels a warehouse prints itself. */
const BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "qr", "datamatrix"];

/** Full-screen camera that reports the first barcode it reads, then closes. */
export function BarcodeScanner({ visible, onScanned, onClose }: { visible: boolean; onScanned: (code: string) => void; onClose: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const t = useTranslations("field");
  const tc = useTranslations("common");
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same code many times a second; act on the first read only.
  const done = useRef(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => (done.current = false)}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.text}>{t("scanNeedsCamera")}</Text>
            {permission.canAskAgain ? <PrimaryButton label={t("allowCamera")} onPress={requestPermission} /> : <Text style={styles.muted}>{t("cameraDenied")}</Text>}
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={({ data }) => {
                if (done.current || !data) return;
                done.current = true;
                onScanned(data.trim());
              }}
            />
            <View style={styles.frame} pointerEvents="none" />
            <Text style={styles.hint}>{t("scanHint")}</Text>
          </View>
        )}
        <View style={styles.footer}>
          <SecondaryButton label={tc("cancel")} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#000" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24, backgroundColor: theme.background },
    text: { fontSize: 15, color: theme.text, textAlign: "center" },
    muted: { fontSize: 13, color: theme.textMuted, textAlign: "center" },
    cameraWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    frame: { width: "72%", aspectRatio: 1.6, borderWidth: 2, borderColor: "#ffffffcc", borderRadius: 12 },
    hint: { position: "absolute", bottom: 32, color: "#fff", fontSize: 15, fontWeight: "500", textShadowColor: "#000", textShadowRadius: 4 },
    footer: { paddingHorizontal: 20, paddingTop: 12 },
  });
}
