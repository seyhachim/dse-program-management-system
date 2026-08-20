import { z } from "zod";

export const PublicQuestionSourceSchema = z.enum(["Telegram", "PublicHttp"]);
export type PublicQuestionSource = z.infer<typeof PublicQuestionSourceSchema>;

export const PublicQuestionOutcomeSchema = z.enum(["Suggestions", "None"]);
export type PublicQuestionOutcome = z.infer<typeof PublicQuestionOutcomeSchema>;

export const PublicQuestionReviewStateSchema = z.enum([
  "Unreviewed",
  "Reviewed",
  "Resolved",
]);
export type PublicQuestionReviewState = z.infer<typeof PublicQuestionReviewStateSchema>;

export const PublicQuestionSuggestionSchema = z.object({
  rank: z.number().int().min(1).max(3),
  faqSlug: z.string().min(1).max(120),
  score: z.number().int().min(0).max(100),
});
export type PublicQuestionSuggestion = z.infer<typeof PublicQuestionSuggestionSchema>;

export const PublicQuestionEventRecordSchema = z.object({
  id: z.string().uuid(),
  programmeId: z.string().min(1),
  source: PublicQuestionSourceSchema,
  questionTextSanitized: z.string().min(1).max(500),
  normalizedQuestion: z.string().min(1).max(500),
  outcome: PublicQuestionOutcomeSchema,
  topMatchFaqSlug: z.string().max(120).nullable(),
  topMatchScore: z.number().int().min(0).max(100).nullable(),
  suggestions: z.array(PublicQuestionSuggestionSchema).max(3),
  answerDelivered: z.boolean(),
  reviewState: PublicQuestionReviewStateSchema,
  repeatCount: z.number().int().positive(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});
export type PublicQuestionEventRecord = z.infer<typeof PublicQuestionEventRecordSchema>;

export const PublicQuestionEventListSchema = z.object({
  items: z.array(PublicQuestionEventRecordSchema),
  retentionDays: z.number().int().positive(),
});
export type PublicQuestionEventList = z.infer<typeof PublicQuestionEventListSchema>;

export const PublicQuestionEventFilterSchema = z.object({
  state: PublicQuestionReviewStateSchema.optional(),
  q: z.string().trim().max(200).optional(),
});
export type PublicQuestionEventFilter = z.infer<typeof PublicQuestionEventFilterSchema>;

export const PublicQuestionReviewUpdateSchema = z.object({
  state: PublicQuestionReviewStateSchema,
});
export type PublicQuestionReviewUpdate = z.infer<typeof PublicQuestionReviewUpdateSchema>;

export const PublicQuestionFaqDraftResultSchema = z.object({
  faqId: z.string().uuid(),
  faqSlug: z.string().min(1).max(120),
  created: z.boolean(),
});
export type PublicQuestionFaqDraftResult = z.infer<typeof PublicQuestionFaqDraftResultSchema>;
