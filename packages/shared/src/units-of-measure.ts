import { z } from "zod";

export const createUnitOfMeasureSchema = z
  .object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(80),
    baseUnitId: z.string().uuid().optional(),
    factorToBase: z.number().positive().optional(),
  })
  .refine((data) => (data.baseUnitId == null) === (data.factorToBase == null), {
    message: "baseUnitId and factorToBase must be given together",
    path: ["factorToBase"],
  });
export type CreateUnitOfMeasureInput = z.infer<typeof createUnitOfMeasureSchema>;

export const updateUnitOfMeasureSchema = z.object({
  name: z.string().min(1).max(80),
});
export type UpdateUnitOfMeasureInput = z.infer<typeof updateUnitOfMeasureSchema>;

export const updateMaterialUnitsSchema = z.object({
  unitId: z.string().uuid(),
  purchaseUnitId: z.string().uuid().nullable().optional(),
});
export type UpdateMaterialUnitsInput = z.infer<typeof updateMaterialUnitsSchema>;
