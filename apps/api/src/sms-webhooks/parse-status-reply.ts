import type { Locale } from "@cantero/shared";

/** Keywords a worker might text back to mark a task done — matched as a substring so natural
 * phrasing ("job done", "все готово") still hits, not just the bare word. */
const DONE_KEYWORDS: Record<Locale, string[]> = {
  en: ["done", "finished", "complete", "completed"],
  de: ["fertig", "erledigt", "abgeschlossen"],
  es: ["listo", "hecho", "terminado", "completado"],
  pl: ["gotowe", "zrobione", "ukończone"],
  uk: ["готово", "завершено", "зроблено"],
};

const STARTED_KEYWORDS: Record<Locale, string[]> = {
  en: ["started", "start", "begin"],
  de: ["begonnen", "angefangen", "start"],
  es: ["empezado", "comenzado", "inicio"],
  pl: ["zaczęte", "rozpoczęte", "start"],
  uk: ["розпочато", "почав", "почато", "старт"],
};

export type StatusReply = "done" | "in_progress" | null;

/** Checks the worker's own preferredLocale keyword set first, then falls back to every other
 * locale's — a worker set to "en" in their profile but texting in Ukrainian should still work. */
export function parseStatusReply(locale: Locale, body: string): StatusReply {
  const normalized = body.trim().toLowerCase();
  if (!normalized) return null;

  const locales = [locale, ...(Object.keys(DONE_KEYWORDS) as Locale[]).filter((l) => l !== locale)];
  for (const loc of locales) {
    if (DONE_KEYWORDS[loc]?.some((k) => normalized.includes(k))) return "done";
  }
  for (const loc of locales) {
    if (STARTED_KEYWORDS[loc]?.some((k) => normalized.includes(k))) return "in_progress";
  }
  return null;
}
