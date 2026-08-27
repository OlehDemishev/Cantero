import { z } from "zod";

export const createMaterialCatalogItemSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  unit: z.string().min(1).max(20),
  defaultUnitPrice: z.number().nonnegative(),
  reorderThreshold: z.number().nonnegative().optional(),
  carbonFootprintKgCo2e: z.number().nonnegative().optional(),
  greenCertified: z.boolean().default(false),
  greenCertificationBody: z.string().max(120).optional(),
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

export const updateMaterialSustainabilitySchema = z.object({
  carbonFootprintKgCo2e: z.number().nonnegative().nullable().optional(),
  greenCertified: z.boolean().optional(),
  greenCertificationBody: z.string().max(120).nullable().optional(),
});
export type UpdateMaterialSustainabilityInput = z.infer<typeof updateMaterialSustainabilitySchema>;

export const GREEN_CERTIFICATION_TYPES = [
  "leed_certified",
  "leed_silver",
  "leed_gold",
  "leed_platinum",
  "breeam",
  "well",
  "energy_star",
  "other",
] as const;
export type GreenCertificationType = (typeof GREEN_CERTIFICATION_TYPES)[number];

export const createGreenCertificationSchema = z.object({
  projectId: z.string().uuid(),
  type: z.enum(GREEN_CERTIFICATION_TYPES),
  name: z.string().min(1).max(160),
  issuedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateGreenCertificationInput = z.infer<typeof createGreenCertificationSchema>;

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
  catalogId: z.string().uuid().optional(),
  formula: z.string().min(1).max(500).optional(),
  formulaParams: z.array(z.string().min(1).max(40)).default([]),
});
export type CreateRateCatalogItemInput = z.infer<typeof createRateCatalogItemSchema>;

export const updateRateCatalogItemSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  unit: z.string().min(1).max(20).optional(),
  laborHoursPerUnit: z.number().nonnegative().optional(),
  catalogId: z.string().uuid().nullable().optional(),
  formula: z.string().min(1).max(500).nullable().optional(),
  formulaParams: z.array(z.string().min(1).max(40)).optional(),
});
export type UpdateRateCatalogItemInput = z.infer<typeof updateRateCatalogItemSchema>;

export const evaluateFormulaSchema = z.object({
  variables: z.record(z.string(), z.number()),
});
export type EvaluateFormulaInput = z.infer<typeof evaluateFormulaSchema>;

export const createCatalogSchema = z.object({
  name: z.string().min(1).max(120),
});
export type CreateCatalogInput = z.infer<typeof createCatalogSchema>;

export const createTakeoffSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(160),
});
export type CreateTakeoffInput = z.infer<typeof createTakeoffSchema>;

export const calibrateTakeoffSchema = z.object({
  scalePixelLength: z.number().positive(),
  scaleRealLength: z.number().positive(),
  scaleUnit: z.string().min(1).max(20),
});
export type CalibrateTakeoffInput = z.infer<typeof calibrateTakeoffSchema>;

export const TAKEOFF_MEASUREMENT_TYPES = ["length", "area"] as const;
export type TakeoffMeasurementType = (typeof TAKEOFF_MEASUREMENT_TYPES)[number];

export const takeoffPointSchema = z.object({ x: z.number(), y: z.number() });

export const createTakeoffMeasurementSchema = z.object({
  type: z.enum(TAKEOFF_MEASUREMENT_TYPES),
  label: z.string().min(1).max(160),
  points: z.array(takeoffPointSchema).min(2),
  rateCatalogItemId: z.string().uuid().optional(),
});
export type CreateTakeoffMeasurementInput = z.infer<typeof createTakeoffMeasurementSchema>;

export const createProjectSchema = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(300).optional(),
  clientId: z.string().uuid().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectWarrantySchema = z.object({
  handoverDate: z.string().datetime().nullable().optional(),
  warrantyMonths: z.number().int().min(1).max(120).nullable().optional(),
});
export type UpdateProjectWarrantyInput = z.infer<typeof updateProjectWarrantySchema>;

export const addProjectMemberSchema = z.object({
  userId: z.string().uuid(),
});
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;

export const setProjectRestrictedSchema = z.object({
  restrictedToMembers: z.boolean(),
});
export type SetProjectRestrictedInput = z.infer<typeof setProjectRestrictedSchema>;

/// Sets/replaces the geofence wholesale — no partial updates. To disable it, call the dedicated
/// DELETE endpoint instead of PATCHing a null body (Express's strict JSON parser rejects a bare
/// `null` top-level body before it ever reaches validation).
export const updateProjectGeofenceSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(10).max(5000),
});
export type UpdateProjectGeofenceInput = z.infer<typeof updateProjectGeofenceSchema>;

export const createClientSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  estimatedValue: z.number().nonnegative().max(100_000_000).optional(),
  ownerWorkerId: z.string().uuid().optional(),
  referredByClientId: z.string().uuid().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const createEstimateLineSchema = z.object({
  rateCatalogItemId: z.string().uuid(),
  quantity: z.number().positive(),
  sectionId: z.string().uuid().optional(),
  costCodeId: z.string().uuid().optional(),
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

export const updateEstimateCoverLetterSchema = z.object({
  coverLetter: z.string().max(8000).nullable(),
});
export type UpdateEstimateCoverLetterInput = z.infer<typeof updateEstimateCoverLetterSchema>;

export const assemblyItemInputSchema = z.object({
  rateCatalogItemId: z.string().uuid(),
  quantityPerUnit: z.number().positive(),
});
export type AssemblyItemInput = z.infer<typeof assemblyItemInputSchema>;

export const createAssemblySchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  unit: z.string().min(1).max(20),
  items: z.array(assemblyItemInputSchema).min(1).max(50),
});
export type CreateAssemblyInput = z.infer<typeof createAssemblySchema>;

export const updateAssemblySchema = z.object({
  name: z.string().min(1).max(160).optional(),
  unit: z.string().min(1).max(20).optional(),
  items: z.array(assemblyItemInputSchema).min(1).max(50).optional(),
});
export type UpdateAssemblyInput = z.infer<typeof updateAssemblySchema>;

export const addAssemblyToEstimateSchema = z.object({
  assemblyId: z.string().uuid(),
  quantity: z.number().positive(),
  sectionId: z.string().uuid().optional(),
});
export type AddAssemblyToEstimateInput = z.infer<typeof addAssemblyToEstimateSchema>;

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
  costCodeId: z.string().uuid().optional(),
});
export type AddChangeOrderLineInput = z.infer<typeof addChangeOrderLineSchema>;
