import type { Locale } from "@cantero/shared";

/** Hand-maintained label set per launch locale for client-facing PDFs (invoice/estimate/change
 * order) — same reasoning and shape as sms-templates.ts: a small fixed vocabulary translated
 * once, not routed through next-intl (frontend-only) or an external translation API. Falls back
 * to English for any locale not covered. */
export interface DocumentPdfLabels {
  status: string;
  currency: string;
  item: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  materialsTotal: string;
  laborTotal: string;
  subtotal: string;
  markup: string;
  tax: string;
  totalDue: string;
  grandTotal: string;
  dueDate: string;
}

export function documentPdfLabels(locale: Locale): DocumentPdfLabels {
  switch (locale) {
    case "de":
      return {
        status: "Status",
        currency: "Währung",
        item: "Position",
        description: "Beschreibung",
        qty: "Menge",
        unit: "Einheit",
        unitPrice: "Einzelpreis",
        lineTotal: "Gesamt",
        materialsTotal: "Materialkosten",
        laborTotal: "Lohnkosten",
        subtotal: "Zwischensumme",
        markup: "Aufschlag",
        tax: "MwSt.",
        totalDue: "Fälliger Betrag",
        grandTotal: "Gesamtsumme",
        dueDate: "Fälligkeitsdatum",
      };
    case "es":
      return {
        status: "Estado",
        currency: "Moneda",
        item: "Artículo",
        description: "Descripción",
        qty: "Cant.",
        unit: "Unidad",
        unitPrice: "Precio unitario",
        lineTotal: "Total línea",
        materialsTotal: "Total materiales",
        laborTotal: "Total mano de obra",
        subtotal: "Subtotal",
        markup: "Margen",
        tax: "Impuesto",
        totalDue: "Total a pagar",
        grandTotal: "Total general",
        dueDate: "Fecha de vencimiento",
      };
    case "pl":
      return {
        status: "Status",
        currency: "Waluta",
        item: "Pozycja",
        description: "Opis",
        qty: "Ilość",
        unit: "Jedn.",
        unitPrice: "Cena jedn.",
        lineTotal: "Suma pozycji",
        materialsTotal: "Materiały razem",
        laborTotal: "Robocizna razem",
        subtotal: "Suma częściowa",
        markup: "Narzut",
        tax: "Podatek",
        totalDue: "Kwota do zapłaty",
        grandTotal: "Suma całkowita",
        dueDate: "Termin płatności",
      };
    case "uk":
      return {
        status: "Статус",
        currency: "Валюта",
        item: "Позиція",
        description: "Опис",
        qty: "К-сть",
        unit: "Од.",
        unitPrice: "Ціна за од.",
        lineTotal: "Сума",
        materialsTotal: "Матеріали разом",
        laborTotal: "Робота разом",
        subtotal: "Проміжна сума",
        markup: "Націнка",
        tax: "Податок",
        totalDue: "До сплати",
        grandTotal: "Загальна сума",
        dueDate: "Термін оплати",
      };
    case "en":
    default:
      return {
        status: "Status",
        currency: "Currency",
        item: "Item",
        description: "Description",
        qty: "Qty",
        unit: "Unit",
        unitPrice: "Unit price",
        lineTotal: "Line total",
        materialsTotal: "Materials total",
        laborTotal: "Labor total",
        subtotal: "Subtotal",
        markup: "Markup",
        tax: "Tax",
        totalDue: "Total due",
        grandTotal: "Grand total",
        dueDate: "Due date",
      };
  }
}
