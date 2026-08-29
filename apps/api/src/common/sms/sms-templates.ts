import type { Locale } from "@cantero/shared";

/** Small hand-maintained set of SMS bodies per launch locale — deliberately not routed through
 * next-intl (that's frontend-only) or an external translation API (this session's established
 * "no external LLM/translation API" bias, same reasoning as the OCR/estimate-suggestion features).
 * Falls back to English for any locale not covered here (there shouldn't be any, given
 * SUPPORTED_LOCALES, but a Worker.preferredLocale value could in theory be null/unexpected). */

function taskAssigned(locale: Locale, taskName: string, projectName: string): string {
  switch (locale) {
    case "de":
      return `Neue Aufgabe für Sie: "${taskName}" bei ${projectName}.`;
    case "es":
      return `Nueva tarea asignada: "${taskName}" en ${projectName}.`;
    case "pl":
      return `Nowe zadanie: "${taskName}" w ${projectName}.`;
    case "uk":
      return `Нове завдання: "${taskName}" на об'єкті ${projectName}.`;
    case "en":
    default:
      return `You've been assigned to "${taskName}" at ${projectName}.`;
  }
}

function safetyBriefingScheduled(locale: Locale, topic: string, projectName: string, date: string): string {
  switch (locale) {
    case "de":
      return `Sicherheitsunterweisung "${topic}" bei ${projectName} am ${date}.`;
    case "es":
      return `Charla de seguridad "${topic}" en ${projectName} el ${date}.`;
    case "pl":
      return `Odprawa BHP "${topic}" w ${projectName}, ${date}.`;
    case "uk":
      return `Інструктаж з безпеки "${topic}" на об'єкті ${projectName}, ${date}.`;
    case "en":
    default:
      return `Safety briefing "${topic}" at ${projectName} on ${date}.`;
  }
}

export const smsTemplates = { taskAssigned, safetyBriefingScheduled };
