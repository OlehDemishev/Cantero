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

export const createSubcontractorCostSchema = z.object({
  subcontractorId: z.string().uuid(),
  projectId: z.string().uuid(),
  description: z.string().min(1).max(300),
  amount: z.number().positive(),
  incurredDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreateSubcontractorCostInput = z.infer<typeof createSubcontractorCostSchema>;
