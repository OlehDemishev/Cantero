import { z } from "zod";

export const MATERIAL_RFQ_STATUSES = ["open", "closed"] as const;
export type MaterialRfqStatus = (typeof MATERIAL_RFQ_STATUSES)[number];

export const createMaterialRfqSchema = z.object({
  title: z.string().min(1).max(160),
  projectId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  lines: z
    .array(
      z.object({
        materialCatalogItemId: z.string().uuid(),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
});
export type CreateMaterialRfqInput = z.infer<typeof createMaterialRfqSchema>;

export const submitMaterialRfqQuoteSchema = z.object({
  rfqLineId: z.string().uuid(),
  supplierId: z.string().uuid(),
  unitPrice: z.number().nonnegative(),
  notes: z.string().max(300).optional(),
});
export type SubmitMaterialRfqQuoteInput = z.infer<typeof submitMaterialRfqQuoteSchema>;
