import { z } from "zod";
import { CourseTypeSchema } from "./courses.ts";

export const PROGRAMME_CURRICULUM_STATUSES = [
  "Draft",
  "Approved",
  "Active",
  "Superseded",
] as const;
export const ProgrammeCurriculumStatusSchema = z.enum(PROGRAMME_CURRICULUM_STATUSES);
export type ProgrammeCurriculumStatus = z.infer<typeof ProgrammeCurriculumStatusSchema>;

export const PROGRAMME_CURRICULUM_REVISION_TYPES = ["Initial", "Minor", "Major"] as const;
export const ProgrammeCurriculumRevisionTypeSchema = z.enum(
  PROGRAMME_CURRICULUM_REVISION_TYPES,
);
export type ProgrammeCurriculumRevisionType = z.infer<
  typeof ProgrammeCurriculumRevisionTypeSchema
>;

export const PROGRAMME_CURRICULUM_REVISION_TRIGGERS = [
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
] as const;
export const ProgrammeCurriculumRevisionTriggerSchema = z.enum(
  PROGRAMME_CURRICULUM_REVISION_TRIGGERS,
);
export type ProgrammeCurriculumRevisionTrigger = z.infer<
  typeof ProgrammeCurriculumRevisionTriggerSchema
>;

export const CurriculumSemesterSchema = z.enum(["First", "Second"]);
export type CurriculumSemester = z.infer<typeof CurriculumSemesterSchema>;

export const CreateInitialCurriculumSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(240),
  cohortLabel: z.string().trim().max(120).default(""),
  intakeYear: z.number().int().min(1900).max(2200).nullable().optional(),
  academicYear: z.string().trim().max(40).default(""),
  effectiveFrom: z.string().date().nullable().optional(),
});
export type CreateInitialCurriculumInput = z.infer<
  typeof CreateInitialCurriculumSchema
>;

export const CreateCurriculumRevisionSchema = z
  .object({
    revisionType: z.enum(["Minor", "Major"]),
    revisionTriggers: z
      .array(ProgrammeCurriculumRevisionTriggerSchema)
      .min(1, "At least one revision trigger is required"),
    revisionReason: z.string().trim().min(1),
    changeSummary: z.string().trim().min(1),
    cohortLabel: z.string().trim().max(120).optional(),
    intakeYear: z.number().int().min(1900).max(2200).nullable().optional(),
    academicYear: z.string().trim().max(40).optional(),
    effectiveFrom: z.string().date().nullable().optional(),
  })
  .strict();
export type CreateCurriculumRevisionInput = z.infer<
  typeof CreateCurriculumRevisionSchema
>;

const CurriculumPlacementLocationSchema = z.object({
  yearLevel: z.number().int().min(1).max(4),
  semester: CurriculumSemesterSchema,
  sortOrder: z.number().int().min(0).default(0),
});

export const AddCurriculumCourseSchema = CurriculumPlacementLocationSchema.extend({
  courseId: z.string().uuid(),
  credits: z.number().int().min(0).optional(),
  courseType: CourseTypeSchema.optional(),
});
export type AddCurriculumCourseInput = z.infer<typeof AddCurriculumCourseSchema>;

export const UpdateCurriculumCourseSchema = CurriculumPlacementLocationSchema.extend({
  credits: z.number().int().min(0).optional(),
  courseType: CourseTypeSchema.optional(),
});
export type UpdateCurriculumCourseInput = z.infer<
  typeof UpdateCurriculumCourseSchema
>;

export const ReorderCurriculumCoursesSchema = z.object({
  yearLevel: z.number().int().min(1).max(4),
  semester: CurriculumSemesterSchema,
  placementIds: z.array(z.string().uuid()).min(1),
});
export type ReorderCurriculumCoursesInput = z.infer<
  typeof ReorderCurriculumCoursesSchema
>;

export const RemoveCurriculumCourseSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type RemoveCurriculumCourseInput = z.infer<
  typeof RemoveCurriculumCourseSchema
>;

export const CurriculumCourseSchema = z.object({
  placementId: z.string().uuid(),
  courseId: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  yearLevel: z.number().int().min(1).max(4),
  semester: CurriculumSemesterSchema,
  credits: z.number().int().min(0),
  courseType: CourseTypeSchema,
  sortOrder: z.number().int().min(0),
  pathwayId: z.string().uuid().nullable(),
});
export type CurriculumCourse = z.infer<typeof CurriculumCourseSchema>;

export const CurriculumPathwaySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  yearLevel: z.number().int().min(1).max(4),
  semester: CurriculumSemesterSchema,
  isDefault: z.boolean(),
  creditTarget: z.number().int().min(0).nullable(),
  sortOrder: z.number().int().min(0),
  courses: z.array(CurriculumCourseSchema),
  totalCredits: z.number().int().min(0),
});
export type CurriculumPathway = z.infer<typeof CurriculumPathwaySchema>;

export const CurriculumSemesterGroupSchema = z.object({
  semester: CurriculumSemesterSchema,
  courses: z.array(CurriculumCourseSchema),
  totalCredits: z.number().int().min(0),
});
export type CurriculumSemesterGroup = z.infer<
  typeof CurriculumSemesterGroupSchema
>;

export const CurriculumYearGroupSchema = z.object({
  yearLevel: z.number().int().min(1).max(4),
  semesters: z.array(CurriculumSemesterGroupSchema),
  totalCredits: z.number().int().min(0),
});
export type CurriculumYearGroup = z.infer<typeof CurriculumYearGroupSchema>;

export const CurriculumVersionSummarySchema = z.object({
  id: z.string().uuid(),
  versionMajor: z.number().int().min(1),
  versionMinor: z.number().int().min(0),
  version: z.string(),
  status: ProgrammeCurriculumStatusSchema,
  revisionType: ProgrammeCurriculumRevisionTypeSchema,
  revisionTriggers: z.array(ProgrammeCurriculumRevisionTriggerSchema),
  revisionReason: z.string(),
  changeSummary: z.string(),
  basedOnVersionId: z.string().uuid().nullable(),
  cohortLabel: z.string(),
  intakeYear: z.number().int().nullable(),
  academicYear: z.string(),
  effectiveFrom: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CurriculumVersionSummary = z.infer<
  typeof CurriculumVersionSummarySchema
>;

export const ProgrammeCompetencyFrameworkCompetencySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  sourceActive: z.boolean(),
  ploCodes: z.array(z.string()),
});
export type ProgrammeCompetencyFrameworkCompetency = z.infer<
  typeof ProgrammeCompetencyFrameworkCompetencySchema
>;

export const ProgrammeCompetencyFrameworkVersionSchema = z.object({
  frameworkId: z.string().uuid(),
  programmeId: z.string(),
  frameworkCode: z.string(),
  frameworkVersionId: z.string().uuid(),
  version: z.number().int().min(1),
  name: z.string(),
  changeNote: z.string(),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  competencies: z.array(ProgrammeCompetencyFrameworkCompetencySchema),
});
export type ProgrammeCompetencyFrameworkVersion = z.infer<
  typeof ProgrammeCompetencyFrameworkVersionSchema
>;

export const CurriculumCompetencyFrameworkBindingSchema =
  ProgrammeCompetencyFrameworkVersionSchema.extend({
    assignedById: z.string().uuid(),
    assignedAt: z.string(),
  });
export type CurriculumCompetencyFrameworkBinding = z.infer<
  typeof CurriculumCompetencyFrameworkBindingSchema
>;

export const CreateProgrammeCompetencyFrameworkVersionSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(240),
    changeNote: z.string().trim().max(2000).default(""),
  })
  .strict();
export type CreateProgrammeCompetencyFrameworkVersionInput = z.infer<
  typeof CreateProgrammeCompetencyFrameworkVersionSchema
>;

export const BindProgrammeCurriculumCompetencyFrameworkSchema = z
  .object({ frameworkVersionId: z.string().uuid() })
  .strict();
export type BindProgrammeCurriculumCompetencyFrameworkInput = z.infer<
  typeof BindProgrammeCurriculumCompetencyFrameworkSchema
>;

export const ProgrammeCurriculumReadSchema = z.object({
  curriculum: z.object({
    id: z.string().uuid(),
    programmeId: z.string(),
    code: z.string(),
    name: z.string(),
  }),
  selectedVersion: CurriculumVersionSummarySchema,
  versions: z.array(CurriculumVersionSummarySchema),
  competencyFramework: CurriculumCompetencyFrameworkBindingSchema.nullable(),
  years: z.array(CurriculumYearGroupSchema),
  pathways: z.array(CurriculumPathwaySchema),
  totals: z.object({
    programmeCredits: z.number().int().min(0),
    basicCredits: z.number().int().min(0),
    coreCredits: z.number().int().min(0),
    electiveCredits: z.number().int().min(0),
    specializationCredits: z.number().int().min(0),
    moeysHeipCredits: z.number().int().min(0),
  }),
});
export type ProgrammeCurriculumRead = z.infer<
  typeof ProgrammeCurriculumReadSchema
>;
