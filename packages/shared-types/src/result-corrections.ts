import { z } from "zod";

export const FinalizedResultCorrectionSummarySchema = z.object({
  count: z.number().int().min(0),
  lastCorrectedAt: z.string().datetime().nullable(),
  lastCorrectedByName: z.string().nullable(),
});
export type FinalizedResultCorrectionSummary = z.infer<
  typeof FinalizedResultCorrectionSummarySchema
>;

export const FinalizedResultCorrectionRowSchema = z.object({
  assessmentResultId: z.string().uuid(),
  assessmentItemId: z.string().min(1),
  assessmentName: z.string().min(1),
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentCode: z.string().min(1),
  studentName: z.string().min(1),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  feedback: z.string(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime(),
  publishedByName: z.string().nullable(),
  finalizedAt: z.string().datetime(),
  finalizedByName: z.string().nullable(),
  correctionSummary: FinalizedResultCorrectionSummarySchema,
});
export type FinalizedResultCorrectionRow = z.infer<
  typeof FinalizedResultCorrectionRowSchema
>;

export const FinalizedResultCorrectionWorkspaceSchema = z.object({
  offeringId: z.string().uuid(),
  courseCode: z.string().min(1),
  courseTitle: z.string().min(1),
  sectionCode: z.string().min(1),
  term: z.string().min(1),
  results: z.array(FinalizedResultCorrectionRowSchema),
});
export type FinalizedResultCorrectionWorkspace = z.infer<
  typeof FinalizedResultCorrectionWorkspaceSchema
>;

export const FinalizedResultCorrectionHistoryItemSchema = z.object({
  correctionId: z.string().uuid(),
  beforeScore: z.number().min(0),
  beforeMaxScore: z.number().positive(),
  beforeFeedback: z.string(),
  afterScore: z.number().min(0),
  afterMaxScore: z.number().positive(),
  afterFeedback: z.string(),
  reason: z.string().min(1),
  correctedAt: z.string().datetime(),
  correctedById: z.string().uuid(),
  correctedByName: z.string().min(1),
});
export type FinalizedResultCorrectionHistoryItem = z.infer<
  typeof FinalizedResultCorrectionHistoryItemSchema
>;

export const FinalizedResultCorrectionHistorySchema = z.object({
  assessmentResultId: z.string().uuid(),
  offeringId: z.string().uuid(),
  courseCode: z.string().min(1),
  courseTitle: z.string().min(1),
  sectionCode: z.string().min(1),
  assessmentItemId: z.string().min(1),
  assessmentName: z.string().min(1),
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentCode: z.string().min(1),
  studentName: z.string().min(1),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  feedback: z.string(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime(),
  publishedByName: z.string().nullable(),
  finalizedAt: z.string().datetime(),
  finalizedByName: z.string().nullable(),
  corrections: z.array(FinalizedResultCorrectionHistoryItemSchema),
});
export type FinalizedResultCorrectionHistory = z.infer<
  typeof FinalizedResultCorrectionHistorySchema
>;
