import { z } from "zod";

export const PROGRAMME_OUTCOME_INDICATOR_TYPES = [
  "ProgressionRate", "RetentionRate", "CompletionRate", "DropoutRate", "CloAttainmentRate", "PloAttainmentRate",
] as const;
export const ProgrammeOutcomeIndicatorTypeSchema = z.enum(PROGRAMME_OUTCOME_INDICATOR_TYPES);

export const RecordProgrammeOutcomeIndicatorInput = z.object({
  programmeId: z.string().trim().min(1),
  cohortId: z.string().uuid(),
  indicatorType: ProgrammeOutcomeIndicatorTypeSchema,
  academicYear: z.string().trim().min(4).max(20),
  periodKey: z.string().trim().min(1).max(100),
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  definitionVersion: z.string().trim().min(1).max(100),
  definition: z.record(z.string(), z.unknown()),
  calculationVersion: z.string().trim().min(1).max(100),
  sourceRefs: z.array(z.string().trim().min(1).max(500)).min(1),
}).superRefine((value, ctx) => {
  if (value.numerator > value.denominator) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["numerator"], message: "Numerator cannot exceed denominator" });
  }
});
export type RecordProgrammeOutcomeIndicatorInput = z.infer<typeof RecordProgrammeOutcomeIndicatorInput>;
