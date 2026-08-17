import { z } from "zod";
import { CourseTypeSchema } from "./courses.ts";
import { CurriculumSemesterSchema } from "./curriculum.ts";

export const DSE_CURRICULUM_IMPORT_FORMAT_VERSION = "dse-curriculum-v1" as const;
export const CURRICULUM_COMMON_SCOPE = "__COMMON__" as const;

export const CurriculumHourBreakdownSchema = z
  .object({
    total: z.number().int().min(0),
    lecture: z.number().int().min(0),
    lab: z.number().int().min(0),
    fieldVisit: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.lecture + value.lab + value.fieldVisit !== value.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hour breakdown must sum to total",
      });
    }
  });

export const CurriculumCreditBreakdownSchema = z.object({
  total: z.number().int().min(0).max(30),
  lecture: z.number().int().min(0).max(30),
  lab: z.number().int().min(0).max(30),
  fieldVisit: z.number().int().min(0).max(30),
  breakdownProvided: z.boolean().optional(),
});

export const CurriculumImportPathwaySchema = z.object({
  code: z.string().trim().min(1).max(40).refine((value) => value !== CURRICULUM_COMMON_SCOPE, {
    message: `${CURRICULUM_COMMON_SCOPE} is reserved for common curriculum rows`,
  }),
  name: z.string().trim().min(1).max(240),
  yearLevel: z.number().int().min(1).max(4),
  semester: CurriculumSemesterSchema,
  isDefault: z.boolean().default(false),
  creditTarget: z.number().int().min(0).max(120).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const CurriculumImportCourseSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(320),
  yearLevel: z.number().int().min(1).max(4),
  semester: CurriculumSemesterSchema,
  pathwayCode: z.string().trim().min(1).max(40).nullable().default(null),
  sortOrder: z.number().int().min(0).default(0),
  weeklyHours: CurriculumHourBreakdownSchema.nullable().default(null),
  credits: CurriculumCreditBreakdownSchema,
  lecturerText: z.string().trim().max(1200).default(""),
  courseType: CourseTypeSchema.nullable().optional(),
});

export const CurriculumImportMetadataSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(240),
  academicYear: z.string().trim().max(40),
  version: z.string().trim().regex(/^\d+\.\d+$/),
  defaultPathwayCode: z.string().trim().min(1).max(40).nullable().default(null),
});

export const DseCurriculumImportSchema = z
  .object({
    formatVersion: z.literal(DSE_CURRICULUM_IMPORT_FORMAT_VERSION),
    programmeCode: z.string().trim().min(1).max(40),
    curriculum: CurriculumImportMetadataSchema,
    pathways: z.array(CurriculumImportPathwaySchema),
    courses: z.array(CurriculumImportCourseSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const pathwayCodes = new Set<string>();
    let defaultCount = 0;
    for (const pathway of value.pathways) {
      if (pathwayCodes.has(pathway.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pathways"],
          message: `Duplicate pathway code: ${pathway.code}`,
        });
      }
      pathwayCodes.add(pathway.code);
      if (pathway.isDefault) defaultCount += 1;
    }
    if (defaultCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pathways"],
        message: "Only one default pathway is allowed",
      });
    }
    if (
      value.curriculum.defaultPathwayCode &&
      !pathwayCodes.has(value.curriculum.defaultPathwayCode)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["curriculum", "defaultPathwayCode"],
        message: "Default pathway code does not exist",
      });
    }
    if (value.curriculum.defaultPathwayCode) {
      const declared = value.pathways.find(
        (pathway) => pathway.code === value.curriculum.defaultPathwayCode,
      );
      const marked = value.pathways.find((pathway) => pathway.isDefault);
      if (marked && declared && marked.code !== declared.code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["curriculum", "defaultPathwayCode"],
          message: "defaultPathwayCode conflicts with the pathway marked isDefault",
        });
      }
    }

    const placementKeys = new Set<string>();
    for (const [index, course] of value.courses.entries()) {
      if (course.pathwayCode && !pathwayCodes.has(course.pathwayCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["courses", index, "pathwayCode"],
          message: `Unknown pathway code: ${course.pathwayCode}`,
        });
      }
      const key = `${course.pathwayCode ?? CURRICULUM_COMMON_SCOPE}:${course.code}`;
      if (placementKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["courses", index, "code"],
          message: `Duplicate curriculum course placement: ${course.code}`,
        });
      }
      placementKeys.add(key);
    }
  });

export type DseCurriculumImport = z.infer<typeof DseCurriculumImportSchema>;
export type CurriculumImportCourse = z.infer<typeof CurriculumImportCourseSchema>;
export type CurriculumImportPathway = z.infer<typeof CurriculumImportPathwaySchema>;

export const CurriculumJsonUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  jsonText: z.string().min(2).max(2_000_000),
});
export type CurriculumJsonUpload = z.infer<typeof CurriculumJsonUploadSchema>;

export const CurriculumImportMatchStatusSchema = z.enum([
  "matched",
  "conflict",
  "missing",
  "blocked",
]);
export type CurriculumImportMatchStatus = z.infer<
  typeof CurriculumImportMatchStatusSchema
>;

export const CurriculumImportPreviewCourseSchema = CurriculumImportCourseSchema.extend({
  matchStatus: CurriculumImportMatchStatusSchema,
  existingCourseId: z.string().uuid().nullable(),
  existingTitle: z.string().nullable(),
  existingCourseType: CourseTypeSchema.nullable(),
  message: z.string(),
});

export const CurriculumPathwayTotalSchema = z.object({
  code: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  credits: z.number().int().min(0),
  courseCount: z.number().int().min(0),
});

export const CurriculumImportPreviewSchema = z.object({
  source: z.object({
    fileName: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    formatVersion: z.literal(DSE_CURRICULUM_IMPORT_FORMAT_VERSION),
  }),
  target: z.object({
    curriculumId: z.string().uuid(),
    curriculumVersionId: z.string().uuid(),
    programmeId: z.string(),
    programmeCode: z.string(),
    status: z.string(),
  }),
  curriculum: CurriculumImportMetadataSchema,
  pathways: z.array(CurriculumImportPathwaySchema),
  courses: z.array(CurriculumImportPreviewCourseSchema),
  totals: z.object({
    commonCredits: z.number().int().min(0),
    commonCourseCount: z.number().int().min(0),
    pathways: z.array(CurriculumPathwayTotalSchema),
    selectedRouteCredits: z.number().int().min(0),
    selectedRouteCourseCount: z.number().int().min(0),
  }),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
  canApply: z.boolean(),
});
export type CurriculumImportPreview = z.infer<typeof CurriculumImportPreviewSchema>;

export const CurriculumArtifactCourseSchema = CurriculumImportCourseSchema.extend({
  courseId: z.string().uuid().nullable(),
  placementId: z.string().uuid().nullable(),
});

export const CurriculumArtifactViewSchema = z.object({
  curriculum: z.object({
    id: z.string().uuid(),
    programmeId: z.string(),
    programmeCode: z.string(),
    code: z.string(),
    name: z.string(),
    academicYear: z.string(),
    version: z.string(),
    status: z.string(),
    defaultPathwayCode: z.string().nullable(),
  }),
  pathways: z.array(CurriculumImportPathwaySchema),
  courses: z.array(CurriculumArtifactCourseSchema),
  totals: z.object({
    commonCredits: z.number().int().min(0),
    commonCourseCount: z.number().int().min(0),
    pathways: z.array(CurriculumPathwayTotalSchema),
    selectedRouteCredits: z.number().int().min(0),
    selectedRouteCourseCount: z.number().int().min(0),
  }),
  source: z
    .object({
      fileName: z.string(),
      sha256: z.string(),
      formatVersion: z.string(),
      importedAt: z.string(),
      importedById: z.string().uuid(),
    })
    .nullable(),
});
export type CurriculumArtifactView = z.infer<typeof CurriculumArtifactViewSchema>;
