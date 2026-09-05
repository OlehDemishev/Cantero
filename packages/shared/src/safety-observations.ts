import { z } from "zod";

export const OBSERVATION_CATEGORIES = ["safe", "at_risk"] as const;
export type ObservationCategory = (typeof OBSERVATION_CATEGORIES)[number];

export const createSafetyObservationSchema = z
  .object({
    projectId: z.string().uuid(),
    category: z.enum(OBSERVATION_CATEGORIES),
    behaviorObserved: z.string().min(1).max(1000),
    correctiveAction: z.string().max(1000).optional(),
  })
  .refine((v) => v.category !== "at_risk" || !!v.correctiveAction, {
    message: "Corrective action is required for an at-risk observation",
    path: ["correctiveAction"],
  });
export type CreateSafetyObservationInput = z.infer<typeof createSafetyObservationSchema>;
