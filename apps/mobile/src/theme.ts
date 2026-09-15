import { useColorScheme } from "react-native";

/** Mirrors the semantic tokens the web field UI uses (gray / warning / success ramps), so the two
 * clients stay visually consistent without pulling Tailwind into React Native. */
const light = {
  background: "#f9fafb",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#6b7280",
  textFaint: "#9ca3af",
  accent: "#1d4ed8",
  accentText: "#ffffff",
  dangerBg: "#fef2f2",
  dangerText: "#b91c1c",
  warningBg: "#fffbeb",
  warningText: "#b45309",
  successBg: "#ecfdf5",
  successText: "#047857",
  neutralBg: "#f3f4f6",
  neutralText: "#4b5563",
};

const dark: typeof light = {
  background: "#0f1420",
  card: "#1f2937",
  border: "#374151",
  text: "#f9fafb",
  textMuted: "#9ca3af",
  textFaint: "#6b7280",
  accent: "#60a5fa",
  accentText: "#0f1420",
  dangerBg: "#7f1d1d33",
  dangerText: "#fca5a5",
  warningBg: "#78350f33",
  warningText: "#fcd34d",
  successBg: "#064e3b33",
  successText: "#6ee7b7",
  neutralBg: "#37415133",
  neutralText: "#d1d5db",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
