"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

/** What the person picked; "system" (the default) follows the OS setting live. */
export type ThemePreference = "light" | "dark" | "system";
/** What is actually on screen. */
export type ResolvedTheme = "light" | "dark";

type ThemeContextType = {
  /** The theme on screen (system preference already resolved). */
  theme: ResolvedTheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Switches to the opposite of what is on screen and pins it (leaves "system"). */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const CHANGE_EVENT = "cantero:theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Fallback for when storage is blocked (some private modes), so the toggle still works for the
// life of the page.
let memoryPreference: ThemePreference = "system";

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return memoryPreference;
  }
}

function subscribePreference(onChange: () => void) {
  // `storage` keeps other tabs in step; the custom event covers this tab's own writes.
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const systemIsDark = () => window.matchMedia(DARK_QUERY).matches;

function resolve(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The server (and the hydration pass) can't know either value, so both start at "system"/light
  // and correct right after hydration. The `dark` class itself is already right before paint —
  // THEME_INIT_SCRIPT in the root layout set it — so only theme-aware UI (the toggle icon) updates.
  const preference = useSyncExternalStore(subscribePreference, readPreference, () => "system" as const);
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false);
  const theme = resolve(preference, systemDark);

  useEffect(() => {
    // Read the live values, not `theme`: on the hydration render `theme` still holds the server
    // guess, and applying it would undo the init script and flash light for a dark-mode user.
    document.documentElement.classList.toggle("dark", resolve(readPreference(), systemIsDark()) === "dark");
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    memoryPreference = next;
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: memoryPreference carries the choice until the page closes.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const toggleTheme = useCallback(() => setPreference(theme === "dark" ? "light" : "dark"), [theme, setPreference]);

  const value = useMemo(() => ({ theme, preference, setPreference, toggleTheme }), [theme, preference, setPreference, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
