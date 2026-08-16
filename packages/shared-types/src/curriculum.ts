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

export const CurriculumDraftPlacementInputSchema = z.object({
  courseId: z.string().uuid(),
  yearLevel: z.number().int().min(1).max(4),
  semester: CurriculumSemesterSchema,
  credits: z.number().int().min(0).max(30),
  courseType: CourseTypeSchema,
  sortOrder: z.number().int().min(0),
});
export type CurriculumDraftPlacementInput = z.infer<
  typeof CurriculumDraftPlacementInputSchema
>;

export const SaveCurriculumDraftSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    cohortLabel: z.string().trim().max(120),
    intakeYear: z.number().int().min(1900).max(2200).nullable(),
    academicYear: z.string().trim().max(40),
    effectiveFrom: z.string().date().nullable(),
    placements: z.array(CurriculumDraftPlacementInputSchema).max(240),
  })
  .strict()
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.placements.forEach((placement, index) => {
      if (seen.has(placement.courseId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["placements", index, "courseId"],
          message: "A course can appear only once in a curriculum version",
        });
      }
      seen.add(placement.courseId);
    });
  });
export type SaveCurriculumDraftInput = z.infer<typeof SaveCurriculumDraftSchema>;

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
});
export type CurriculumCourse = z.infer<typeof CurriculumCourseSchema>;

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

export const ProgrammeCurriculumReadSchema = z.object({
  curriculum: z.object({
    id: z.string().uuid(),
    programmeId: z.string(),
    code: z.string(),
    name: z.string(),
  }),
  selectedVersion: CurriculumVersionSummarySchema,
  versions: z.array(CurriculumVersionSummarySchema),
  years: z.array(CurriculumYearGroupSchema),
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
