import { z } from "zod";

export const submitNpsSurveySchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string().max(2000).optional(),
});
export type SubmitNpsSurveyInput = z.infer<typeof submitNpsSurveySchema>;
