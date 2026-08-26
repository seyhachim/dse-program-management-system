import { z } from "zod";

/** Approved document fonts. Keep this bounded so browser preview and office/PDF exports stay predictable. */
export const DocumentFontFamilySchema = z.enum([
  "Arial",
  "Calibri",
  "Times New Roman",
]);
export type DocumentFontFamily = z.infer<typeof DocumentFontFamilySchema>;

export const DocumentTextAlignmentSchema = z.enum([
  "left",
  "center",
  "right",
  "justify",
]);
export type DocumentTextAlignment = z.infer<typeof DocumentTextAlignmentSchema>;

export const DocumentMarginsSchema = z.object({
  top: z.number().min(8).max(35),
  bottom: z.number().min(8).max(35),
  left: z.number().min(8).max(35),
  right: z.number().min(8).max(35),
});
export type DocumentMargins = z.infer<typeof DocumentMarginsSchema>;
