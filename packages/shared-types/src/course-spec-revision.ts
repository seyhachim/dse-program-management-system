import { z } from "zod";

export const CourseSpecRevisionTypeSchema = z.enum(["Minor", "Major"]);
export type CourseSpecRevisionType = z.infer<typeof CourseSpecRevisionTypeSchema>;

export const CourseSpecRevisionTriggerSchema = z.enum([
  "ScheduledReview",
  "StudentFeedback",
  "AlumniFeedback",
  "EmployerFeedback",
  "LecturerReflection",
  "ProgrammeCoordinator",
  "ExternalExaminer",
  "QaFinding",
  "RegulatoryChange",
  "Other",
]);
export type CourseSpecRevisionTrigger = z.infer<typeof CourseSpecRevisionTriggerSchema>;

export const COURSE_SPEC_MAJOR_IMPACT_FIELDS = [
  "courseCodeOrTitle",
  "creditsOrSlt",
  "prerequisites",
  "materialCloChanges",
  "bloomOrCapLevels",
  "cloPloAlignment",
  "assessmentStructureOrWeighting",
  "curriculumOrRegulatoryAlignment",
] as const;

export const CourseSpecRevisionImpactSchema = z.object({
  courseCodeOrTitle: z.boolean(),
  creditsOrSlt: z.boolean(),
  prerequisites: z.boolean(),
  materialCloChanges: z.boolean(),
  bloomOrCapLevels: z.boolean(),
  cloPloAlignment: z.boolean(),
  assessmentStructureOrWeighting: z.boolean(),
  curriculumOrRegulatoryAlignment: z.boolean(),
});
export type CourseSpecRevisionImpact = z.infer<typeof CourseSpecRevisionImpactSchema>;

export function recommendedCourseSpecRevisionType(
  impact: CourseSpecRevisionImpact,
): CourseSpecRevisionType {
  return COURSE_SPEC_MAJOR_IMPACT_FIELDS.some((field) => impact[field])
    ? "Major"
    : "Minor";
}

const trimmedRequired = (label: string, min = 3, max = 4000) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} is too long`);

export const CreateCourseSpecRevisionRequestSchema = z
  .object({
    triggers: z.array(CourseSpecRevisionTriggerSchema).min(1, "Select at least one revision trigger"),
    evidenceSummary: trimmedRequired("Evidence / feedback summary", 10),
    changeSummary: trimmedRequired("Change summary", 10),
    impact: CourseSpecRevisionImpactSchema,
    proposedRevisionType: CourseSpecRevisionTypeSchema,
    effectiveAcademicTerm: trimmedRequired("Effective academic term", 2, 120),
    overrideJustification: z.string().trim().max(2000, "Override justification is too long").default(""),
  })
  .superRefine((value, ctx) => {
    const recommended = recommendedCourseSpecRevisionType(value.impact);
    if (
      recommended === "Major" &&
      value.proposedRevisionType === "Minor" &&
      value.overrideJustification.trim().length < 10
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overrideJustification"],
        message:
          "A written justification of at least 10 characters is required to override a Major recommendation",
      });
    }
  });
export type CreateCourseSpecRevisionRequest = z.infer<
  typeof CreateCourseSpecRevisionRequestSchema
>;

export const CourseSpecRevisionRequestSchema = z.object({
  id: z.string().uuid(),
  courseSpecId: z.string().uuid(),
  requestedById: z.string().uuid(),
  triggers: z.array(CourseSpecRevisionTriggerSchema),
  evidenceSummary: z.string(),
  changeSummary: z.string(),
  impact: CourseSpecRevisionImpactSchema,
  proposedRevisionType: CourseSpecRevisionTypeSchema,
  recommendedRevisionType: CourseSpecRevisionTypeSchema,
  overrideJustification: z.string(),
  effectiveAcademicTerm: z.string(),
  createdAt: z.string().datetime(),
});
export type CourseSpecRevisionRequest = z.infer<typeof CourseSpecRevisionRequestSchema>;

export const CourseSpecRevisionCreationResultSchema = z.object({
  revision: z.object({
    id: z.string().uuid(),
    courseId: z.string().uuid(),
    versionMajor: z.number().int().positive(),
    versionMinor: z.number().int().nonnegative(),
    revisionType: z.enum(["Minor", "Major"]),
    revisionTriggers: z.array(CourseSpecRevisionTriggerSchema),
    revisionReason: z.string(),
    changeSummary: z.string(),
    basedOnVersionId: z.string().uuid().nullable(),
    reviewStatus: z.literal("Draft"),
    submissionVersion: z.number().int().nonnegative(),
  }),
  request: CourseSpecRevisionRequestSchema,
});
export type CourseSpecRevisionCreationResult = z.infer<
  typeof CourseSpecRevisionCreationResultSchema
>;
