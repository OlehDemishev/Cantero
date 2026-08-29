import { z } from "zod";

export const createWageClassificationSchema = z.object({
  trade: z.string().min(1).max(120),
  hourlyRate: z.number().positive(),
  fringeRate: z.number().min(0).default(0),
});
export type CreateWageClassificationInput = z.infer<typeof createWageClassificationSchema>;

export const updateWageClassificationSchema = z.object({
  trade: z.string().min(1).max(120).optional(),
  hourlyRate: z.number().positive().optional(),
  fringeRate: z.number().min(0).optional(),
  active: z.boolean().optional(),
});
export type UpdateWageClassificationInput = z.infer<typeof updateWageClassificationSchema>;

export const generateCertifiedPayrollSchema = z.object({
  weekEndingDate: z.string().min(1),
});
export type GenerateCertifiedPayrollInput = z.infer<typeof generateCertifiedPayrollSchema>;

export const signCertifiedPayrollSchema = z.object({
  signerName: z.string().min(1).max(160),
});
export type SignCertifiedPayrollInput = z.infer<typeof signCertifiedPayrollSchema>;

export interface CertifiedPayrollLine {
  workerId: string;
  workerName: string;
  trade: string | null;
  regularHours: number;
  overtimeHours: number;
  ratePerHour: number | null;
  fringeRate: number;
  grossPay: number | null;
  belowPrevailingRate: boolean;
}
