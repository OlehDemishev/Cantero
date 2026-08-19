import { z } from "zod";

export const DOCUMENT_CATEGORIES = ["contract", "permit", "photo", "invoice_scan", "other"] as const;
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;
