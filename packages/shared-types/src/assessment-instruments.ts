import { z } from "zod";

/**
 * Shared authoring and score-entry contract for point-based marking schemes.
 * This is not a public/student response DTO. Never expose markingGuidance
 * through the existing public rubric endpoint.
 */
export const ASSESSMENT_INSTRUMENT_KINDS = ["rubric", "marking_scheme"] as const;
export const AssessmentInstrumentKindSchema = z.enum(ASSESSMENT_INSTRUMENT_KINDS);
export type AssessmentInstrumentKind = z.infer<typeof AssessmentInstrumentKindSchema>;

export const MarkingSchemeQuestionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  maxPoints: z.number().finite().positive(),
  markingGuidance: z.string().default(""),
});
export type MarkingSchemeQuestion = z.infer<typeof MarkingSchemeQuestionSchema>;

export const MarkingSchemeDefinitionSchema = z.object({
  name: z.string().trim().min(1),
  questions: z.array(MarkingSchemeQuestionSchema).min(1),
}).superRefine((scheme, ctx) => {
  const ids = new Set<string>();
  scheme.questions.forEach((question, index) => {
    if (ids.has(question.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", index, "id"],
        message: "Question IDs must be unique",
      });
    }
    ids.add(question.id);
  });
});
export type MarkingSchemeDefinition = z.infer<typeof MarkingSchemeDefinitionSchema>;

// Explicit null and omitted rows are unmarked, not zero. Persisting and
// publishing scores must additionally check enrollment, instrument version,
// offering authorization and the existing result lifecycle.
export const MarkingSchemeScoreSchema = z.object({
  questionId: z.string().trim().min(1),
  score: z.number().finite().nonnegative().nullable(),
});
export type MarkingSchemeScore = z.infer<typeof MarkingSchemeScoreSchema>;

export type MarkingSchemeScoreSummary = {
  complete: boolean;
  earnedPoints: number | null;
  maximumPoints: number;
  rows: Array<{ questionId: string; score: number | null; maxScore: number }>;
};

/**
 * Validate and normalize actual score rows for a single instrument.
 * The returned rows are candidates for the existing CLO evidence service;
 * this helper deliberately does not calculate or publish CLO attainment.
 */
export function summarizeMarkingSchemeScores(
  definition: MarkingSchemeDefinition,
  scores: readonly MarkingSchemeScore[],
): MarkingSchemeScoreSummary {
  const scheme = MarkingSchemeDefinitionSchema.parse(definition);
  const questionsById = new Map(scheme.questions.map((q) => [q.id, q]));
  const scoreById = new Map<string, number | null>();
  for (const input of scores) {
    const row = MarkingSchemeScoreSchema.parse(input);
    const question = questionsById.get(row.questionId);
    if (!question) throw new Error("Score references an unknown question");
    if (scoreById.has(row.questionId)) throw new Error("Duplicate question score");
    if (row.score !== null && row.score > question.maxPoints) {
      throw new Error("Question score exceeds maximum points");
    }
    scoreById.set(row.questionId, row.score);
  }

  const rows = scheme.questions.map((q) => ({
    questionId: q.id,
    score: scoreById.get(q.id) ?? null,
    maxScore: q.maxPoints,
  }));
  const maximumPoints = rows.reduce((sum, row) => sum + row.maxScore, 0);
  if (!Number.isFinite(maximumPoints)) throw new Error("Invalid total maximum points");
  const complete = rows.every((row) => row.score !== null);
  return {
    complete,
    maximumPoints,
    earnedPoints: complete ? rows.reduce((sum, row) => sum + (row.score ?? 0), 0) : null,
    rows,
  };
}
