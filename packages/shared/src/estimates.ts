import { z } from "zod";

export const createMaterialCatalogItemSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  unit: z.string().min(1).max(20),
  defaultUnitPrice: z.number().nonnegative(),
  reorderThreshold: z.number().nonnegative().optional(),
});
export type CreateMaterialCatalogItemInput = z.infer<typeof createMaterialCatalogItemSchema>;

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
