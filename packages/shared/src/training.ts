import { z } from "zod";

export const TRAINING_ENROLLMENT_STATUSES = ["enrolled", "completed"] as const;
export type TrainingEnrollmentStatus = (typeof TRAINING_ENROLLMENT_STATUSES)[number];

export const createTrainingCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(80).optional(),
  validityMonths: z.number().int().min(1).max(120).optional(),
});
export type CreateTrainingCourseInput = z.infer<typeof createTrainingCourseSchema>;

export const updateTrainingCourseSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  validityMonths: z.number().int().min(1).max(120).nullable().optional(),
});
export type UpdateTrainingCourseInput = z.infer<typeof updateTrainingCourseSchema>;

export const enrollWorkerSchema = z.object({
  workerId: z.string().uuid(),
});
export type EnrollWorkerInput = z.infer<typeof enrollWorkerSchema>;

export const completeEnrollmentSchema = z.object({
  score: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
});
export type CompleteEnrollmentInput = z.infer<typeof completeEnrollmentSchema>;
