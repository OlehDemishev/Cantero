import { z } from "zod";

export const COMMISSIONING_SYSTEM_STATUSES = ["pending_testing", "testing", "complete"] as const;
export type CommissioningSystemStatus = (typeof COMMISSIONING_SYSTEM_STATUSES)[number];

export const createCommissioningSystemSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.string().max(120).optional(),
});
export type CreateCommissioningSystemInput = z.infer<typeof createCommissioningSystemSchema>;

export const addCommissioningChecklistItemSchema = z.object({
  description: z.string().min(1).max(500),
});
export type AddCommissioningChecklistItemInput = z.infer<typeof addCommissioningChecklistItemSchema>;

export const FUNCTIONAL_TEST_RESULTS = ["pass", "fail"] as const;
export type FunctionalTestResult = (typeof FUNCTIONAL_TEST_RESULTS)[number];

export const addFunctionalTestSchema = z.object({
  procedure: z.string().min(1).max(300),
  result: z.enum(FUNCTIONAL_TEST_RESULTS),
  testedByName: z.string().min(1).max(160),
  notes: z.string().max(1000).optional(),
});
export type AddFunctionalTestInput = z.infer<typeof addFunctionalTestSchema>;

export const scheduleOwnerTrainingSchema = z.object({
  trainerName: z.string().min(1).max(160),
  trainingDate: z.string().datetime(),
  attendeeNames: z.string().max(1000).optional(),
});
export type ScheduleOwnerTrainingInput = z.infer<typeof scheduleOwnerTrainingSchema>;

export const signOffOwnerTrainingSchema = z.object({
  ownerSignerName: z.string().min(1).max(160),
});
export type SignOffOwnerTrainingInput = z.infer<typeof signOffOwnerTrainingSchema>;
