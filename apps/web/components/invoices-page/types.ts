import type { RecurringInvoiceFrequency } from "@cantero/shared";

export interface Invoice {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: string;
  client: { id: string; name: string };
  project: { id: string; name: string };
}
export interface Project {
  id: string;
  name: string;
}
export interface Client {
  id: string;
  name: string;
}
export interface RecurringInvoiceLine {
  description: string;
  quantity: string;
  unitPrice: string;
}
export interface RecurringInvoice {
  id: string;
  name: string;
  frequency: RecurringInvoiceFrequency;
  taxPercent: string;
  active: boolean;
  autopayEnabled: boolean;
  startDate: string;
  nextRunDate: string;
  endDate: string | null;
  lastGeneratedAt: string | null;
  project: { id: string; name: string };
  client: { id: string; name: string };
  lines: RecurringInvoiceLine[];
}
export interface RecurringLineForm {
  description: string;
  quantity: string;
  unitPrice: string;
}
