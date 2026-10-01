import { z } from "zod";
import {
  CurriculumCompetencyLevelSchema,
  ProgrammeCurriculumStatusSchema,
} from "./curriculum.ts";

export const CourseSpecCompetencyContextStateSchema = z.enum([
  "ready",
  "missing",
  "ambiguous",
]);
export type CourseSpecCompetencyContextState = z.infer<
  typeof CourseSpecCompetencyContextStateSchema
>;

export const CourseSpecCompetencySourceSchema = z.object({
  curriculumId: z.string().uuid(),
  curriculumVersionId: z.string().uuid(),
  curriculumVersion: z.string(),
  curriculumStatus: ProgrammeCurriculumStatusSchema,
  placementId: z.string().uuid(),
  frameworkVersionId: z.string().uuid(),
  frameworkVersion: z.number().int().min(1),
  frameworkName: z.string(),
});
export type CourseSpecCompetencySource = z.infer<
  typeof CourseSpecCompetencySourceSchema
>;

export const CourseSpecCompetencyExpectationSchema = z.object({
  mappingId: z.string().uuid(),
  competencyId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  ploCodes: z.array(z.string()),
  teachLevel: CurriculumCompetencyLevelSchema.nullable(),
  useLevel: CurriculumCompetencyLevelSchema.nullable(),
  assessLevel: CurriculumCompetencyLevelSchema.nullable(),
  mappingUpdatedAt: z.string().datetime(),
});
export type CourseSpecCompetencyExpectation = z.infer<
  typeof CourseSpecCompetencyExpectationSchema
>;

export const CourseSpecCompetencyContextSchema = z.object({
  state: CourseSpecCompetencyContextStateSchema,
  message: z.string(),
  source: CourseSpecCompetencySourceSchema.nullable(),
  expectations: z.array(CourseSpecCompetencyExpectationSchema),
});
export type CourseSpecCompetencyContext = z.infer<
  typeof CourseSpecCompetencyContextSchema
>;

export const CourseSpecCompetencyEvidenceStatusSchema = z.enum([
  "notExpected",
  "evidenced",
  "missing",
]);
export type CourseSpecCompetencyEvidenceStatus = z.infer<
  typeof CourseSpecCompetencyEvidenceStatusSchema
>;

const WeekEvidenceSchema = z.object({
  id: z.string(),
  week: z.number().int(),
  topic: z.string(),
});
const AssessmentEvidenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number().nullable(),
  rubricCriterionCount: z.number().int().min(0),
});

export const CourseSpecCompetencyEvidenceSnapshotSchema = z.object({
  id: z.string().uuid(),
  sourceMappingId: z.string().uuid().nullable(),
  sourceCurriculumVersionId: z.string().uuid(),
  sourcePlacementId: z.string().uuid(),
  sourceFrameworkVersionId: z.string().uuid(),
  competencyId: z.string().uuid(),
  competencyCode: z.string(),
  competencyName: z.string(),
  teachLevel: CurriculumCompetencyLevelSchema.nullable(),
  useLevel: CurriculumCompetencyLevelSchema.nullable(),
  assessLevel: CurriculumCompetencyLevelSchema.nullable(),
  linkedCloIds: z.array(z.string()),
  linkedCloCodes: z.array(z.string()),
  stale: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CourseSpecCompetencyEvidenceSnapshot = z.infer<
  typeof CourseSpecCompetencyEvidenceSnapshotSchema
>;

export const CourseSpecCompetencyAlignmentItemSchema = z.object({
  expectation: CourseSpecCompetencyExpectationSchema,
  evidence: CourseSpecCompetencyEvidenceSnapshotSchema.nullable(),
  teachStatus: CourseSpecCompetencyEvidenceStatusSchema,
  useStatus: CourseSpecCompetencyEvidenceStatusSchema,
  assessStatus: CourseSpecCompetencyEvidenceStatusSchema,
  teachingWeeks: z.array(WeekEvidenceSchema),
  applicationWeeks: z.array(WeekEvidenceSchema),
  assessments: z.array(AssessmentEvidenceSchema),
});
export type CourseSpecCompetencyAlignmentItem = z.infer<
  typeof CourseSpecCompetencyAlignmentItemSchema
>;

export const CourseSpecCompetencyAlignmentSchema = z.object({
  context: CourseSpecCompetencyContextSchema,
  items: z.array(CourseSpecCompetencyAlignmentItemSchema),
  summary: z.object({
    expectedCompetencies: z.number().int().min(0),
    evidencedCompetencies: z.number().int().min(0),
    needsAttention: z.number().int().min(0),
  }),
});
export type CourseSpecCompetencyAlignment = z.infer<
  typeof CourseSpecCompetencyAlignmentSchema
>;

export const SaveCourseSpecCompetencyEvidenceSchema = z
  .object({
    cloIds: z
      .array(z.string().uuid())
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "CLO evidence links must be unique",
      }),
  })
  .strict();
export type SaveCourseSpecCompetencyEvidenceInput = z.infer<
  typeof SaveCourseSpecCompetencyEvidenceSchema
>;
