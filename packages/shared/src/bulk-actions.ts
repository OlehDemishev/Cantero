import { z } from "zod";

export const bulkActionIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type BulkActionIdsInput = z.infer<typeof bulkActionIdsSchema>;

export interface BulkActionFailure {
  id: string;
  message: string;
}

export interface BulkActionResult {
  succeeded: number;
  failed: BulkActionFailure[];
}
