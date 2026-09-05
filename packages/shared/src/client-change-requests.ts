import { z } from "zod";

export const CLIENT_CHANGE_REQUEST_STATUSES = ["submitted", "under_review", "converted", "declined"] as const;
export type ClientChangeRequestStatus = (typeof CLIENT_CHANGE_REQUEST_STATUSES)[number];

export const createClientChangeRequestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
});
export type CreateClientChangeRequestInput = z.infer<typeof createClientChangeRequestSchema>;

export const convertClientChangeRequestSchema = z.object({
  changeOrderId: z.string().uuid(),
});
export type ConvertClientChangeRequestInput = z.infer<typeof convertClientChangeRequestSchema>;

export const declineClientChangeRequestSchema = z.object({
  reviewNote: z.string().min(1).max(2000),
});
export type DeclineClientChangeRequestInput = z.infer<typeof declineClientChangeRequestSchema>;
