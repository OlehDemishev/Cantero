import type { Locale } from "@cantero/shared";

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

/** Hand-maintained email bodies per launch locale for the handful of transactional emails sent
 * directly to a Client (invoice/estimate/change order "sent" notices) — same reasoning as
 * sms-templates.ts, scoped to what's actually client-facing rather than every mail.service.ts
 * call site (internal-team notifications stay in the company's own UI locale). */

export function invoiceSentEmail(locale: Locale, companyName: string, number: string, total: string, currency: string): EmailBody {
  switch (locale) {
    case "de":
      return {
        subject: `Rechnung ${number} von ${companyName}`,
        html: `<p>${companyName} hat Ihnen die Rechnung <strong>${number}</strong> über ${total} ${currency} gesendet.</p><p>Die Rechnung ist als PDF angehängt.</p>`,
        text: `${companyName} hat Ihnen die Rechnung ${number} über ${total} ${currency} gesendet. Die Rechnung ist als PDF angehängt.`,
      };
    case "es":
      return {
        subject: `Factura ${number} de ${companyName}`,
        html: `<p>${companyName} le ha enviado la factura <strong>${number}</strong> por ${total} ${currency}.</p><p>La factura se adjunta en PDF.</p>`,
        text: `${companyName} le ha enviado la factura ${number} por ${total} ${currency}. La factura se adjunta en PDF.`,
      };
    case "pl":
      return {
        subject: `Faktura ${number} od ${companyName}`,
        html: `<p>${companyName} przesłał(a) Ci fakturę <strong>${number}</strong> na kwotę ${total} ${currency}.</p><p>Faktura jest załączona w formacie PDF.</p>`,
        text: `${companyName} przesłał(a) Ci fakturę ${number} na kwotę ${total} ${currency}. Faktura jest załączona w formacie PDF.`,
      };
    case "uk":
      return {
        subject: `Рахунок ${number} від ${companyName}`,
        html: `<p>${companyName} надіслав(-ла) вам рахунок <strong>${number}</strong> на суму ${total} ${currency}.</p><p>Рахунок додано у форматі PDF.</p>`,
        text: `${companyName} надіслав(-ла) вам рахунок ${number} на суму ${total} ${currency}. Рахунок додано у форматі PDF.`,
      };
    case "en":
    default:
      return {
        subject: `Invoice ${number} from ${companyName}`,
        html: `<p>${companyName} has sent you invoice <strong>${number}</strong> for ${total} ${currency}.</p><p>The invoice is attached as a PDF.</p>`,
        text: `${companyName} has sent you invoice ${number} for ${total} ${currency}. The invoice is attached as a PDF.`,
      };
  }
}

export function estimateSentEmail(locale: Locale, companyName: string, estimateName: string, link: string): EmailBody {
  switch (locale) {
    case "de":
      return {
        subject: `Kostenvoranschlag von ${companyName}: ${estimateName}`,
        html: `<p>${companyName} hat Ihnen einen Kostenvoranschlag zur Prüfung gesendet: <strong>${estimateName}</strong>.</p><p><a href="${link}">Kostenvoranschlag ansehen und beantworten</a></p>`,
        text: `${companyName} hat Ihnen einen Kostenvoranschlag zur Prüfung gesendet: ${estimateName}.\n\nAnsehen und beantworten: ${link}`,
      };
    case "es":
      return {
        subject: `Presupuesto de ${companyName}: ${estimateName}`,
        html: `<p>${companyName} le ha enviado un presupuesto para su revisión: <strong>${estimateName}</strong>.</p><p><a href="${link}">Ver y responder al presupuesto</a></p>`,
        text: `${companyName} le ha enviado un presupuesto para su revisión: ${estimateName}.\n\nVer y responder: ${link}`,
      };
    case "pl":
      return {
        subject: `Kosztorys od ${companyName}: ${estimateName}`,
        html: `<p>${companyName} przesłał(a) Ci kosztorys do przeglądu: <strong>${estimateName}</strong>.</p><p><a href="${link}">Zobacz i odpowiedz na kosztorys</a></p>`,
        text: `${companyName} przesłał(a) Ci kosztorys do przeglądu: ${estimateName}.\n\nZobacz i odpowiedz: ${link}`,
      };
    case "uk":
      return {
        subject: `Кошторис від ${companyName}: ${estimateName}`,
        html: `<p>${companyName} надіслав(-ла) вам кошторис для розгляду: <strong>${estimateName}</strong>.</p><p><a href="${link}">Переглянути та відповісти на кошторис</a></p>`,
        text: `${companyName} надіслав(-ла) вам кошторис для розгляду: ${estimateName}.\n\nПереглянути та відповісти: ${link}`,
      };
    case "en":
    default:
      return {
        subject: `Estimate from ${companyName}: ${estimateName}`,
        html: `<p>${companyName} has sent you an estimate for review: <strong>${estimateName}</strong>.</p><p><a href="${link}">View and respond to the estimate</a></p>`,
        text: `${companyName} has sent you an estimate for review: ${estimateName}.\n\nView and respond: ${link}`,
      };
  }
}

export function changeOrderSentEmail(locale: Locale, companyName: string, number: number, title: string, link: string): EmailBody {
  switch (locale) {
    case "de":
      return {
        subject: `Nachtrag NT-${number} von ${companyName}: ${title}`,
        html: `<p>${companyName} hat Ihnen einen Nachtrag zur Prüfung gesendet: <strong>${title}</strong>.</p><p><a href="${link}">Nachtrag ansehen und beantworten</a></p>`,
        text: `${companyName} hat Ihnen einen Nachtrag zur Prüfung gesendet: ${title}.\n\nAnsehen und beantworten: ${link}`,
      };
    case "es":
      return {
        subject: `Orden de cambio CO-${number} de ${companyName}: ${title}`,
        html: `<p>${companyName} le ha enviado una orden de cambio para su revisión: <strong>${title}</strong>.</p><p><a href="${link}">Ver y responder a la orden de cambio</a></p>`,
        text: `${companyName} le ha enviado una orden de cambio para su revisión: ${title}.\n\nVer y responder: ${link}`,
      };
    case "pl":
      return {
        subject: `Zlecenie zmiany CO-${number} od ${companyName}: ${title}`,
        html: `<p>${companyName} przesłał(a) Ci zlecenie zmiany do przeglądu: <strong>${title}</strong>.</p><p><a href="${link}">Zobacz i odpowiedz na zlecenie zmiany</a></p>`,
        text: `${companyName} przesłał(a) Ci zlecenie zmiany do przeglądu: ${title}.\n\nZobacz i odpowiedz: ${link}`,
      };
    case "uk":
      return {
        subject: `Наряд-замовлення НЗ-${number} від ${companyName}: ${title}`,
        html: `<p>${companyName} надіслав(-ла) вам наряд-замовлення для розгляду: <strong>${title}</strong>.</p><p><a href="${link}">Переглянути та відповісти на наряд-замовлення</a></p>`,
        text: `${companyName} надіслав(-ла) вам наряд-замовлення для розгляду: ${title}.\n\nПереглянути та відповісти: ${link}`,
      };
    case "en":
    default:
      return {
        subject: `Change Order CO-${number} from ${companyName}: ${title}`,
        html: `<p>${companyName} has sent you a change order for review: <strong>${title}</strong>.</p><p><a href="${link}">View and respond to the change order</a></p>`,
        text: `${companyName} has sent you a change order for review: ${title}.\n\nView and respond: ${link}`,
      };
  }
}
