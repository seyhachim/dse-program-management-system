import { z } from "zod";
import {
  DocumentFontFamilySchema,
  DocumentMarginsSchema,
  DocumentTextAlignmentSchema,
} from "./document-theme.ts";

/**
 * Presentation-only settings for an official Course Specification document.
 * Academic/semantic content is deliberately excluded from this contract.
 */
export const CourseSpecDocumentThemeSchema = z.object({
  bodyFontFamily: DocumentFontFamilySchema,
  bodyFontSizePt: z.number().min(8).max(13),
  documentTitleSizePt: z.number().min(13).max(22),
  heading1SizePt: z.number().min(11).max(18),
  heading2SizePt: z.number().min(10).max(16),
  heading3SizePt: z.number().min(9).max(14),
  lineHeight: z.number().min(1).max(1.8),
  paragraphSpacingPt: z.number().min(0).max(18),
  letterSpacingPx: z.number().min(-0.2).max(1),
  defaultAlignment: DocumentTextAlignmentSchema,
  marginsMm: DocumentMarginsSchema,
  tableFontSizePt: z.number().min(7).max(11),
  tableCellPaddingPt: z.number().min(1).max(8),
  headerFontSizePt: z.number().min(7).max(12),
  footerFontSizePt: z.number().min(6).max(10),
  showHeader: z.boolean(),
  showFooter: z.boolean(),
  showPageNumbers: z.boolean(),
});
export type CourseSpecDocumentTheme = z.infer<
  typeof CourseSpecDocumentThemeSchema
>;

export const DEFAULT_COURSE_SPEC_DOCUMENT_THEME: CourseSpecDocumentTheme = {
  bodyFontFamily: "Arial",
  bodyFontSizePt: 9,
  documentTitleSizePt: 16,
  heading1SizePt: 15,
  heading2SizePt: 13,
  heading3SizePt: 11,
  lineHeight: 1.3,
  paragraphSpacingPt: 4,
  letterSpacingPx: 0,
  defaultAlignment: "left",
  marginsMm: { top: 10, bottom: 10, left: 10, right: 10 },
  tableFontSizePt: 7.5,
  tableCellPaddingPt: 3,
  headerFontSizePt: 9,
  footerFontSizePt: 7,
  showHeader: true,
  showFooter: true,
  showPageNumbers: true,
};

export const UpdateCourseSpecDocumentThemeSchema = CourseSpecDocumentThemeSchema;
export type UpdateCourseSpecDocumentThemeInput = z.infer<
  typeof UpdateCourseSpecDocumentThemeSchema
>;

export const CourseSpecDocumentThemeResponseSchema = z.object({
  courseSpecId: z.string().uuid().nullable(),
  reviewStatus: z.string().nullable(),
  theme: CourseSpecDocumentThemeSchema,
  programmeDefault: CourseSpecDocumentThemeSchema,
});
export type CourseSpecDocumentThemeResponse = z.infer<
  typeof CourseSpecDocumentThemeResponseSchema
>;
