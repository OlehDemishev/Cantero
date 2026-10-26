import { useTranslations } from "next-intl";

/** A custom-report column's display name: built-in columns come with a `labelKey` (messages:
 * reportFields.*), custom fields only with the name the company gave them. */
export function useReportFieldLabel(): (field: { label: string; labelKey?: string }) => string {
  const t = useTranslations("reportFields");
  return (field) => (field.labelKey && t.has(field.labelKey) ? t(field.labelKey) : field.label);
}
