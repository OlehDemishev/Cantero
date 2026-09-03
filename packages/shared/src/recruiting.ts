import { z } from "zod";

export const JOB_POSTING_STATUSES = ["open", "closed"] as const;
export type JobPostingStatus = (typeof JOB_POSTING_STATUSES)[number];

export const CANDIDATE_STAGES = ["applied", "screening", "interviewing", "offer", "hired", "rejected"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const createJobPostingSchema = z.object({
  title: z.string().min(1).max(160),
  trade: z.string().max(80).optional(),
  location: z.string().max(160).optional(),
  description: z.string().max(4000).optional(),
});
export type CreateJobPostingInput = z.infer<typeof createJobPostingSchema>;

export const updateJobPostingSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  trade: z.string().max(80).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  status: z.enum(JOB_POSTING_STATUSES).optional(),
});
export type UpdateJobPostingInput = z.infer<typeof updateJobPostingSchema>;

export const createCandidateSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  source: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export const moveCandidateStageSchema = z.object({
  stage: z.enum(CANDIDATE_STAGES),
});
export type MoveCandidateStageInput = z.infer<typeof moveCandidateStageSchema>;

export const addInterviewSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  interviewerName: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});
export type AddInterviewInput = z.infer<typeof addInterviewSchema>;

export const convertCandidateToWorkerSchema = z.object({
  role: z.string().max(80).optional(),
  hourlyCost: z.number().nonnegative().optional(),
});
export type ConvertCandidateToWorkerInput = z.infer<typeof convertCandidateToWorkerSchema>;
