import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LocaleProvider } from "@/i18n";
import { BiometricGate } from "@/lib/biometric-lock";
import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <BiometricGate>
            <Stack screenOptions={{ headerShown: false }} />
          </BiometricGate>
        </SessionProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
