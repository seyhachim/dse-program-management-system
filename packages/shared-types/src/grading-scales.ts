import { z } from "zod";

export const PROGRAMME_GRADING_SCALE_VERSION_STATUSES = [
  "Draft",
  "Approved",
  "Superseded",
] as const;

export const ProgrammeGradingScaleVersionStatusSchema = z.enum(
  PROGRAMME_GRADING_SCALE_VERSION_STATUSES,
);
export type ProgrammeGradingScaleVersionStatus = z.infer<
  typeof ProgrammeGradingScaleVersionStatusSchema
>;

export const ProgrammeGradingScaleGradeSchema = z.object({
  id: z.string().uuid(),
  sortOrder: z.number().int().min(1),
  letterGrade: z.string().trim().min(1).max(16),
  gradePoint: z.number().min(0),
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  minInclusive: z.boolean(),
  maxInclusive: z.boolean(),
  explanation: z.string(),
  isPassing: z.boolean(),
  scoreLabel: z.string(),
});
export type ProgrammeGradingScaleGrade = z.infer<
  typeof ProgrammeGradingScaleGradeSchema
>;

export const ProgrammeGradingScaleVersionSchema = z.object({
  id: z.string().uuid(),
  gradingScaleId: z.string().uuid(),
  programmeId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.number().int().min(1),
  status: ProgrammeGradingScaleVersionStatusSchema,
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  changeSummary: z.string(),
  basedOnVersionId: z.string().uuid().nullable(),
  legacyImported: z.boolean(),
  createdById: z.string().uuid().nullable(),
  approvedById: z.string().uuid().nullable(),
  approvedAt: z.string().nullable(),
  supersededAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  grades: z.array(ProgrammeGradingScaleGradeSchema),
});
export type ProgrammeGradingScaleVersion = z.infer<
  typeof ProgrammeGradingScaleVersionSchema
>;

export const ProgrammeGradingScaleSchema = z.object({
  id: z.string().uuid(),
  programmeId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  versions: z.array(ProgrammeGradingScaleVersionSchema),
});
export type ProgrammeGradingScale = z.infer<typeof ProgrammeGradingScaleSchema>;

const DraftGradeInputSchema = z.object({
  sortOrder: z.number().int().min(1),
  letterGrade: z.string().trim().min(1).max(16),
  gradePoint: z.number().min(0),
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  minInclusive: z.boolean().default(true),
  maxInclusive: z.boolean().default(false),
  explanation: z.string().trim().max(240).default(""),
  isPassing: z.boolean().default(true),
});
export type DraftGradingScaleGradeInput = z.infer<typeof DraftGradeInputSchema>;

export const CreateProgrammeGradingScaleSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(240),
    description: z.string().trim().max(1000).default(""),
    effectiveFrom: z.string().date().nullable().optional(),
    changeSummary: z.string().trim().max(1000).default("Initial grading scale"),
    grades: z.array(DraftGradeInputSchema).min(1),
  })
  .strict();
export type CreateProgrammeGradingScaleInput = z.infer<
  typeof CreateProgrammeGradingScaleSchema
>;

export const CreateProgrammeGradingScaleRevisionSchema = z
  .object({
    changeSummary: z.string().trim().min(1).max(1000),
    effectiveFrom: z.string().date().nullable().optional(),
  })
  .strict();
export type CreateProgrammeGradingScaleRevisionInput = z.infer<
  typeof CreateProgrammeGradingScaleRevisionSchema
>;

export const UpdateProgrammeGradingScaleDraftSchema = z
  .object({
    effectiveFrom: z.string().date().nullable().optional(),
    changeSummary: z.string().trim().min(1).max(1000).optional(),
    grades: z.array(DraftGradeInputSchema).min(1).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.effectiveFrom !== undefined ||
      input.changeSummary !== undefined ||
      input.grades !== undefined,
    "At least one draft field must be supplied",
  );
export type UpdateProgrammeGradingScaleDraftInput = z.infer<
  typeof UpdateProgrammeGradingScaleDraftSchema
>;

export const ApproveProgrammeGradingScaleSchema = z
  .object({
    note: z.string().trim().max(1000).default(""),
  })
  .strict();
export type ApproveProgrammeGradingScaleInput = z.infer<
  typeof ApproveProgrammeGradingScaleSchema
>;

export const BindCourseSpecGradingScaleSchema = z
  .object({
    gradingScaleVersionId: z.string().uuid(),
  })
  .strict();
export type BindCourseSpecGradingScaleInput = z.infer<
  typeof BindCourseSpecGradingScaleSchema
>;

export const CourseSpecGradingScaleBindingSchema = z.object({
  courseId: z.string().uuid(),
  courseSpecId: z.string().uuid().nullable(),
  gradingScaleVersion: ProgrammeGradingScaleVersionSchema.nullable(),
});
export type CourseSpecGradingScaleBinding = z.infer<
  typeof CourseSpecGradingScaleBindingSchema
>;
