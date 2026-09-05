import { z } from "zod";

export const createMeetingActionItemInputSchema = z.object({
  description: z.string().min(1).max(500),
  ownerName: z.string().min(1).max(160),
  dueDate: z.string().datetime().optional(),
});
export type CreateMeetingActionItemInput = z.infer<typeof createMeetingActionItemInputSchema>;

export const createMeetingSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  meetingDate: z.string().datetime(),
  location: z.string().max(200).optional(),
  attendees: z.array(z.string().min(1).max(160)).max(100).default([]),
  notes: z.string().max(10000).optional(),
  actionItems: z.array(createMeetingActionItemInputSchema).max(100).default([]),
});
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

export const addMeetingActionItemSchema = createMeetingActionItemInputSchema;
export type AddMeetingActionItemInput = z.infer<typeof addMeetingActionItemSchema>;

export const resolveMeetingActionItemSchema = z.object({
  resolvedByName: z.string().min(1).max(160),
});
export type ResolveMeetingActionItemInput = z.infer<typeof resolveMeetingActionItemSchema>;
