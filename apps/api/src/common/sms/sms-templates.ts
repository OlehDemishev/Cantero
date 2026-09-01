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

function taskStatusConfirmed(locale: Locale, taskName: string, status: "done" | "in_progress"): string {
  switch (locale) {
    case "de":
      return status === "done" ? `✓ "${taskName}" als erledigt markiert.` : `✓ "${taskName}" als begonnen markiert.`;
    case "es":
      return status === "done" ? `✓ "${taskName}" marcada como completada.` : `✓ "${taskName}" marcada como iniciada.`;
    case "pl":
      return status === "done" ? `✓ "${taskName}" oznaczone jako zrobione.` : `✓ "${taskName}" oznaczone jako rozpoczęte.`;
    case "uk":
      return status === "done" ? `✓ «${taskName}» позначено виконаним.` : `✓ «${taskName}» позначено розпочатим.`;
    case "en":
    default:
      return status === "done" ? `✓ "${taskName}" marked done.` : `✓ "${taskName}" marked in progress.`;
  }
}

function taskStatusNoTask(locale: Locale): string {
  switch (locale) {
    case "de":
      return "Keine aktuelle Aufgabe für Sie gefunden.";
    case "es":
      return "No se encontró ninguna tarea actual asignada a usted.";
    case "pl":
      return "Nie znaleziono aktualnego zadania przypisanego do Ciebie.";
    case "uk":
      return "Не знайдено активного завдання, призначеного вам.";
    case "en":
    default:
      return "No current task found assigned to you.";
  }
}

function taskStatusNotUnderstood(locale: Locale): string {
  switch (locale) {
    case "de":
      return 'Antworten Sie mit "fertig" oder "begonnen", um den Aufgabenstatus zu aktualisieren.';
    case "es":
      return 'Responda "listo" o "empezado" para actualizar el estado de la tarea.';
    case "pl":
      return 'Odpowiedz "gotowe" lub "zaczęte", aby zaktualizować status zadania.';
    case "uk":
      return 'Відповідайте "готово" або "розпочато", щоб оновити статус завдання.';
    case "en":
    default:
      return 'Reply "done" or "started" to update your task status.';
  }
}

export const smsTemplates = {
  taskAssigned,
  safetyBriefingScheduled,
  taskStatusConfirmed,
  taskStatusNoTask,
  taskStatusNotUnderstood,
};
