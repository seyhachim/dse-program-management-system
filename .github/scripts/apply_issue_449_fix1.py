from pathlib import Path

path = Path('packages/shared-types/src/student-portal.ts')
text = path.read_text()
old = '''export const CorrectAssessmentGroupScoreInput = SaveAssessmentGroupScoreInput.extend({
  reason: z.string().trim().min(1).max(2000),
  expectedUpdatedAt: z.string().datetime(),
});
export type CorrectAssessmentGroupScoreInput = z.infer<typeof CorrectAssessmentGroupScoreInput>;

export const CorrectAssessmentIndividualComponentInput = SaveAssessmentIndividualComponentInput.extend({
  reason: z.string().trim().min(1).max(2000),
  expectedUpdatedAt: z.string().datetime(),
});
export type CorrectAssessmentIndividualComponentInput = z.infer<typeof CorrectAssessmentIndividualComponentInput>;
'''
new = '''export const CorrectAssessmentGroupScoreInput = z.object({
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().positive(),
  feedback: z.string().trim().max(5000).default(""),
  reason: z.string().trim().min(1).max(2000),
  expectedUpdatedAt: z.string().datetime(),
}).refine((value) => value.score <= value.maxScore, {
  message: "Score cannot exceed maximum score",
  path: ["score"],
});
export type CorrectAssessmentGroupScoreInput = z.infer<typeof CorrectAssessmentGroupScoreInput>;

export const CorrectAssessmentIndividualComponentInput = z.object({
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().positive(),
  feedback: z.string().trim().max(5000).default(""),
  adjustmentPoints: z.coerce.number().default(0),
  adjustmentReason: z.string().trim().max(2000).default(""),
  reason: z.string().trim().min(1).max(2000),
  expectedUpdatedAt: z.string().datetime(),
}).superRefine((value, ctx) => {
  const adjusted = value.score + value.adjustmentPoints;
  if (adjusted < 0 || adjusted > value.maxScore) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["adjustmentPoints"],
      message: "Adjusted score must remain between 0 and the maximum score",
    });
  }
  if (value.adjustmentPoints !== 0 && !value.adjustmentReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["adjustmentReason"],
      message: "An adjustment reason is required",
    });
  }
});
export type CorrectAssessmentIndividualComponentInput = z.infer<typeof CorrectAssessmentIndividualComponentInput>;
'''
if text.count(old) != 1:
    raise SystemExit(f'expected one correction schema block, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
