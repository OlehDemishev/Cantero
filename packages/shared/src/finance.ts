import { z } from "zod";

export const PAYMENT_METHODS = ["bank_transfer", "card", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const updateInvoiceSchema = z.object({
  dueDate: z.string().datetime().nullable().optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const addInstallmentSchema = z.object({
  label: z.string().min(1).max(160),
  amount: z.number().positive(),
  dueDate: z.string().datetime().optional(),
});
export type AddInstallmentInput = z.infer<typeof addInstallmentSchema>;

export const createSubcontractorSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
});
export type CreateSubcontractorInput = z.infer<typeof createSubcontractorSchema>;

export const assignSubcontractorSchema = z.object({
  projectId: z.string().uuid(),
});
export type AssignSubcontractorInput = z.infer<typeof assignSubcontractorSchema>;

export const SUBCONTRACTOR_DOCUMENT_TYPES = ["general_liability_insurance", "workers_comp_insurance", "license", "other"] as const;
export type SubcontractorDocumentType = (typeof SUBCONTRACTOR_DOCUMENT_TYPES)[number];

export const addSubcontractorDocumentSchema = z.object({
  type: z.enum(SUBCONTRACTOR_DOCUMENT_TYPES),
  name: z.string().min(1).max(160),
  expiresAt: z.string().datetime(),
});
export type AddSubcontractorDocumentInput = z.infer<typeof addSubcontractorDocumentSchema>;

export const createSubcontractorCostSchema = z.object({
  subcontractorId: z.string().uuid(),
  projectId: z.string().uuid(),
  description: z.string().min(1).max(300),
  amount: z.number().positive(),
  incurredDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreateSubcontractorCostInput = z.infer<typeof createSubcontractorCostSchema>;

export const RECURRING_INVOICE_FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type RecurringInvoiceFrequency = (typeof RECURRING_INVOICE_FREQUENCIES)[number];

export const recurringInvoiceLineSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
export type RecurringInvoiceLineInput = z.infer<typeof recurringInvoiceLineSchema>;

export const createRecurringInvoiceSchema = z.object({
  projectId: z.string().uuid(),
  clientId: z.string().uuid(),
  name: z.string().min(1).max(160),
  frequency: z.enum(RECURRING_INVOICE_FREQUENCIES),
  taxPercent: z.number().min(0).max(100).default(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable().optional(),
  lines: z.array(recurringInvoiceLineSchema).min(1),
});
export type CreateRecurringInvoiceInput = z.infer<typeof createRecurringInvoiceSchema>;

export const updateRecurringInvoiceSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  frequency: z.enum(RECURRING_INVOICE_FREQUENCIES).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  endDate: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
  lines: z.array(recurringInvoiceLineSchema).min(1).optional(),
});
export type UpdateRecurringInvoiceInput = z.infer<typeof updateRecurringInvoiceSchema>;
