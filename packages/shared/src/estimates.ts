import { z } from "zod";

export const createMaterialCatalogItemSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  unit: z.string().min(1).max(20),
  defaultUnitPrice: z.number().nonnegative(),
  reorderThreshold: z.number().nonnegative().optional(),
});
export type CreateMaterialCatalogItemInput = z.infer<typeof createMaterialCatalogItemSchema>;

/** Reorder settings only — the low-stock processor auto-drafts a PO once both
 * reorderQuantity and preferredSupplierId are set alongside reorderThreshold. */
export const updateMaterialReorderSchema = z.object({
  reorderThreshold: z.number().nonnegative().nullable().optional(),
  reorderQuantity: z.number().positive().nullable().optional(),
  preferredSupplierId: z.string().uuid().nullable().optional(),
});
export type UpdateMaterialReorderInput = z.infer<typeof updateMaterialReorderSchema>;

export const rateCatalogItemMaterialSchema = z.object({
  materialCatalogItemId: z.string().uuid(),
  quantityPerUnit: z.number().positive(),
  wasteFactorPercent: z.number().min(0).max(100).default(0),
});
export type RateCatalogItemMaterialInput = z.infer<typeof rateCatalogItemMaterialSchema>;

export const createRateCatalogItemSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  unit: z.string().min(1).max(20),
  laborHoursPerUnit: z.number().nonnegative(),
  materials: z.array(rateCatalogItemMaterialSchema).default([]),
});
export type CreateRateCatalogItemInput = z.infer<typeof createRateCatalogItemSchema>;

export const createProjectSchema = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(300).optional(),
  clientId: z.string().uuid().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const createClientSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const createEstimateLineSchema = z.object({
  rateCatalogItemId: z.string().uuid(),
  quantity: z.number().positive(),
  sectionId: z.string().uuid().optional(),
});
export type CreateEstimateLineInput = z.infer<typeof createEstimateLineSchema>;

export const createEstimateSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(160),
  laborRatePerHour: z.number().nonnegative(),
  markupPercent: z.number().min(0).max(500).default(15),
  taxPercent: z.number().min(0).max(100).default(0),
});
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;

export const saveAsTemplateSchema = z.object({
  name: z.string().min(1).max(160),
});
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;

export const createFromTemplateSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(160),
  laborRatePerHour: z.number().nonnegative(),
  markupPercent: z.number().min(0).max(500).default(15),
  taxPercent: z.number().min(0).max(100).default(0),
});
export type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;

export const createVariantSchema = z.object({
  label: z.string().min(1).max(80),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const clientDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    note: z.string().max(2000).optional(),
    signerName: z.string().min(1).max(160).optional(),
    /// Drawn signature exported from a <canvas> as a base64 PNG data URL — capped well above a typical hand-drawn trace.
    signatureDataUrl: z
      .string()
      .regex(/^data:image\/png;base64,/, "Signature must be a PNG data URL")
      .max(300_000)
      .optional(),
  })
  .refine((data) => data.decision !== "approved" || (!!data.signerName && !!data.signatureDataUrl), {
    message: "A typed name and drawn signature are required to approve",
    path: ["signatureDataUrl"],
  });
export type ClientDecisionInput = z.infer<typeof clientDecisionSchema>;

export const createChangeOrderSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
});
export type CreateChangeOrderInput = z.infer<typeof createChangeOrderSchema>;

export const addChangeOrderLineSchema = z.object({
  rateCatalogItemId: z.string().uuid(),
  quantity: z.number().positive(),
});
export type AddChangeOrderLineInput = z.infer<typeof addChangeOrderLineSchema>;
