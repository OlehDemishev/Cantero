import { z } from "zod";

export const CONTRACT_STATUSES = ["draft", "sent", "signed", "void"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const createContractTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  body: z.string().min(1).max(50_000),
});
export type CreateContractTemplateInput = z.infer<typeof createContractTemplateSchema>;

export const updateContractTemplateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  body: z.string().min(1).max(50_000).optional(),
});
export type UpdateContractTemplateInput = z.infer<typeof updateContractTemplateSchema>;

export const createContractSchema = z
  .object({
    projectId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
    subcontractorId: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    templateId: z.string().uuid().optional(),
    body: z.string().min(1).max(50_000).optional(),
  })
  .refine((v) => v.templateId !== undefined || v.body !== undefined, {
    message: "Either templateId or body is required",
    path: ["body"],
  });
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractBodySchema = z.object({
  body: z.string().min(1).max(50_000),
});
export type UpdateContractBodyInput = z.infer<typeof updateContractBodySchema>;

export const signContractSchema = z.object({
  signerName: z.string().min(1).max(160),
  /// Drawn signature exported from a <canvas> as a base64 PNG data URL — same cap as the
  /// estimate/change-order signature fields.
  signatureDataUrl: z
    .string()
    .regex(/^data:image\/png;base64,/, "Signature must be a PNG data URL")
    .max(300_000),
});
export type SignContractInput = z.infer<typeof signContractSchema>;
