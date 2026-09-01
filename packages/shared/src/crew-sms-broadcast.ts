import { z } from "zod";

export const sendCrewSmsBroadcastSchema = z.object({
  message: z.string().min(1).max(480),
  /// When present, sends only to workers currently assigned to this project; omitted sends
  /// company-wide, to every active Worker with a phone number on file.
  projectId: z.string().uuid().optional(),
});
export type SendCrewSmsBroadcastInput = z.infer<typeof sendCrewSmsBroadcastSchema>;
