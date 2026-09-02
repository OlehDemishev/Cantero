import { z } from "zod";

export const SIGNATURE_REQUEST_STATUSES = ["draft", "sent", "completed", "voided"] as const;
export type SignatureRequestStatus = (typeof SIGNATURE_REQUEST_STATUSES)[number];

export const createSignatureRequestSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(1).max(200),
  signers: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        email: z.string().email(),
      }),
    )
    .min(1)
    .max(10),
});
export type CreateSignatureRequestInput = z.infer<typeof createSignatureRequestSchema>;

export const signSignatureRequestSchema = z.object({
  signatureDataUrl: z.string().min(100),
});
export type SignSignatureRequestInput = z.infer<typeof signSignatureRequestSchema>;
