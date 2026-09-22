import { z } from "zod";

export const ANNOTATION_TYPES = ["freehand", "rectangle", "cloud", "arrow", "text"] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export const createDrawingSheetSchema = z.object({
  sheetNumber: z.string().min(1).max(40),
  discipline: z.string().max(80).optional(),
  title: z.string().max(200).optional(),
  revision: z.string().max(40).optional(),
  revisionDate: z.string().datetime().optional(),
});
export type CreateDrawingSheetInput = z.infer<typeof createDrawingSheetSchema>;

export const updateDrawingSheetSchema = z.object({
  sheetNumber: z.string().min(1).max(40).optional(),
  discipline: z.string().max(80).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  revision: z.string().max(40).nullable().optional(),
  revisionDate: z.string().datetime().nullable().optional(),
});
export type UpdateDrawingSheetInput = z.infer<typeof updateDrawingSheetSchema>;

/** One reviewed page of an uploaded drawing set; pages left out of the list aren't imported. */
export const importDrawingSetSchema = z.object({
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1),
        sheetNumber: z.string().trim().min(1).max(40),
        title: z.string().trim().max(200).optional(),
        discipline: z.string().trim().max(80).optional(),
        revision: z.string().trim().max(40).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type ImportDrawingSetInput = z.infer<typeof importDrawingSetSchema>;

const annotationPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const createAnnotationSchema = z.object({
  type: z.enum(ANNOTATION_TYPES),
  points: z.array(annotationPointSchema).min(1),
  color: z.string().max(20).optional(),
  text: z.string().max(500).optional(),
});
export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;

export const setDrawingPinSchema = z.object({
  drawingSheetId: z.string().uuid().nullable(),
  pinX: z.number().min(0).max(1).nullable(),
  pinY: z.number().min(0).max(1).nullable(),
});
export type SetDrawingPinInput = z.infer<typeof setDrawingPinSchema>;
