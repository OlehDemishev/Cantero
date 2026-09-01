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

export const generateProgressInvoiceSchema = z.object({
  estimateId: z.string().uuid(),
  percentComplete: z.number().min(0.01).max(100),
  retainagePercent: z.number().min(0).max(100).default(0),
});
export type GenerateProgressInvoiceInput = z.infer<typeof generateProgressInvoiceSchema>;

export const addInstallmentSchema = z.object({
  label: z.string().min(1).max(160),
  amount: z.number().positive(),
  dueDate: z.string().datetime().optional(),
});
export type AddInstallmentInput = z.infer<typeof addInstallmentSchema>;

/** amount is optional — omitted means "pay the full remaining balance," same as before this
 * field existed. When given (paying a single installment) the server still caps it at the
 * actual remaining balance, so this is a convenience default, not a trust boundary. */
export const payInvoiceSchema = z.object({
  amount: z.number().positive().optional(),
});
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

export const createSubcontractorSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
});
export type CreateSubcontractorInput = z.infer<typeof createSubcontractorSchema>;

export const updateSubcontractorProfileSchema = z.object({
  specialization: z.string().max(120).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  licenseNumber: z.string().max(80).nullable().optional(),
  bondingCapacity: z.number().nonnegative().nullable().optional(),
  safetyProgramSummary: z.string().max(2000).nullable().optional(),
});
export type UpdateSubcontractorProfileInput = z.infer<typeof updateSubcontractorProfileSchema>;

export const setSubcontractorPublicListedSchema = z.object({
  publicListed: z.boolean(),
});
export type SetSubcontractorPublicListedInput = z.infer<typeof setSubcontractorPublicListedSchema>;

export const assignSubcontractorSchema = z.object({
  projectId: z.string().uuid(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
export type AssignSubcontractorInput = z.infer<typeof assignSubcontractorSchema>;

export const setAssignmentActualEndDateSchema = z.object({
  actualEndDate: z.string().datetime().nullable(),
});
export type SetAssignmentActualEndDateInput = z.infer<typeof setAssignmentActualEndDateSchema>;

export const createPerformanceReviewSchema = z.object({
  assignmentId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  onTime: z.boolean().optional(),
  safetyIncidents: z.number().int().min(0).default(0),
  reworkCount: z.number().int().min(0).default(0),
  wouldHireAgain: z.boolean().optional(),
  comments: z.string().max(2000).optional(),
});
export type CreatePerformanceReviewInput = z.infer<typeof createPerformanceReviewSchema>;

export const SUBCONTRACTOR_DOCUMENT_TYPES = ["general_liability_insurance", "workers_comp_insurance", "license", "bonding", "other"] as const;
export type SubcontractorDocumentType = (typeof SUBCONTRACTOR_DOCUMENT_TYPES)[number];

export const addSubcontractorDocumentSchema = z.object({
  type: z.enum(SUBCONTRACTOR_DOCUMENT_TYPES),
  name: z.string().min(1).max(160),
  expiresAt: z.string().datetime(),
});
export type AddSubcontractorDocumentInput = z.infer<typeof addSubcontractorDocumentSchema>;

export const updateSubcontractorTaxProfileSchema = z.object({
  taxId: z.string().max(40).nullable().optional(),
  legalBusinessName: z.string().max(200).nullable().optional(),
  mailingAddress: z.string().max(400).nullable().optional(),
});
export type UpdateSubcontractorTaxProfileInput = z.infer<typeof updateSubcontractorTaxProfileSchema>;

export const addSubcontractorPaymentSchema = z.object({
  subcontractorCostId: z.string().uuid().optional(),
  amount: z.number().positive(),
  paidAt: z.string().datetime().optional(),
  note: z.string().max(300).optional(),
});
export type AddSubcontractorPaymentInput = z.infer<typeof addSubcontractorPaymentSchema>;

export const createSubcontractorCostSchema = z.object({
  subcontractorId: z.string().uuid(),
  projectId: z.string().uuid(),
  description: z.string().min(1).max(300),
  amount: z.number().positive(),
  incurredDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  costCodeId: z.string().uuid().optional(),
});
export type CreateSubcontractorCostInput = z.infer<typeof createSubcontractorCostSchema>;

export const LIEN_WAIVER_TYPES = ["conditional_progress", "unconditional_progress", "conditional_final", "unconditional_final"] as const;
export type LienWaiverType = (typeof LIEN_WAIVER_TYPES)[number];

export const requestLienWaiverSchema = z.object({
  isFinal: z.boolean().default(false),
});
export type RequestLienWaiverInput = z.infer<typeof requestLienWaiverSchema>;

export const signLienWaiverSchema = z.object({
  signerName: z.string().min(1).max(160),
  /// Drawn signature exported from a <canvas> as a base64 PNG data URL — capped well above a typical hand-drawn trace.
  signatureDataUrl: z
    .string()
    .regex(/^data:image\/png;base64,/, "Signature must be a PNG data URL")
    .max(300_000),
});
export type SignLienWaiverInput = z.infer<typeof signLienWaiverSchema>;

export const DRAW_REQUEST_STATUSES = ["draft", "submitted", "under_review", "approved", "funded"] as const;
export type DrawRequestStatus = (typeof DRAW_REQUEST_STATUSES)[number];

export const createDrawRequestSchema = z.object({
  projectId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  lenderName: z.string().max(160).optional(),
  lenderContactEmail: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateDrawRequestInput = z.infer<typeof createDrawRequestSchema>;

export const updateDrawRequestStatusSchema = z.object({
  status: z.enum(DRAW_REQUEST_STATUSES),
});
export type UpdateDrawRequestStatusInput = z.infer<typeof updateDrawRequestStatusSchema>;

export const createBidRequestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime().optional(),
  subcontractorIds: z.array(z.string().uuid()).min(1),
});
export type CreateBidRequestInput = z.infer<typeof createBidRequestSchema>;

export const submitBidSchema = z.object({
  amount: z.number().positive(),
  notes: z.string().max(2000).optional(),
});
export type SubmitBidInput = z.infer<typeof submitBidSchema>;

export const addBidScoreCriterionSchema = z.object({
  label: z.string().min(1).max(80),
  weight: z.number().int().min(1).max(10),
});
export type AddBidScoreCriterionInput = z.infer<typeof addBidScoreCriterionSchema>;

export const scoreBidSchema = z.object({
  criterionId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
});
export type ScoreBidInput = z.infer<typeof scoreBidSchema>;

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
  autopayEnabled: z.boolean().optional(),
  lines: z.array(recurringInvoiceLineSchema).min(1).optional(),
});
export type UpdateRecurringInvoiceInput = z.infer<typeof updateRecurringInvoiceSchema>;
