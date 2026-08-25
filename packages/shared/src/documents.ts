import { z } from "zod";

export const DOCUMENT_CATEGORIES = [
  "contract",
  "permit",
  "photo",
  "invoice_scan",
  "insurance_certificate",
  "gallery_before",
  "gallery_after",
  "other",
] as const;
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;

export const updateDocumentTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(40)).max(20),
});
export type UpdateDocumentTagsInput = z.infer<typeof updateDocumentTagsSchema>;
