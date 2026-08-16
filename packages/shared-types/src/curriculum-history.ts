import { z } from "zod";
import { CourseTypeSchema } from "./courses.ts";
import { CurriculumSemesterSchema, CurriculumVersionSummarySchema } from "./curriculum.ts";

export const CURRICULUM_DIFF_KINDS = [
  "Added",
  "Removed",
  "YearChanged",
  "SemesterChanged",
  "CreditsChanged",
  "TypeChanged",
  "OrderChanged",
] as const;
export const CurriculumDiffKindSchema = z.enum(CURRICULUM_DIFF_KINDS);
export type CurriculumDiffKind = z.infer<typeof CurriculumDiffKindSchema>;

export const CurriculumPlacementSnapshotSchema = z.object({
  courseId: z.string().uuid(),
  yearLevel: z.number().int().min(1).max(4),
  semester: CurriculumSemesterSchema,
  credits: z.number().int().min(0),
  courseType: CourseTypeSchema,
  sortOrder: z.number().int().min(0),
});
export type CurriculumPlacementSnapshot = z.infer<typeof CurriculumPlacementSnapshotSchema>;

export const CurriculumCourseDiffSchema = z.object({
  courseId: z.string().uuid(),
  code: z.string().nullable(),
  title: z.string().nullable(),
  changes: z.array(CurriculumDiffKindSchema).min(1),
  before: CurriculumPlacementSnapshotSchema.nullable(),
  after: CurriculumPlacementSnapshotSchema.nullable(),
});
export type CurriculumCourseDiff = z.infer<typeof CurriculumCourseDiffSchema>;

export const CurriculumComparisonSchema = z.object({
  curriculumId: z.string().uuid(),
  fromVersion: CurriculumVersionSummarySchema,
  toVersion: CurriculumVersionSummarySchema,
  changes: z.array(CurriculumCourseDiffSchema),
  counts: z.object({
    coursesChanged: z.number().int().min(0),
    added: z.number().int().min(0),
    removed: z.number().int().min(0),
    moved: z.number().int().min(0),
    creditsChanged: z.number().int().min(0),
    typeChanged: z.number().int().min(0),
    orderChanged: z.number().int().min(0),
  }),
});
export type CurriculumComparison = z.infer<typeof CurriculumComparisonSchema>;

export const CurriculumAuditHistoryItemSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  action: z.string(),
  note: z.string(),
  details: z.unknown().nullable(),
  actorId: z.string().uuid(),
  actorName: z.string(),
  createdAt: z.string(),
});
export type CurriculumAuditHistoryItem = z.infer<typeof CurriculumAuditHistoryItemSchema>;

export const CurriculumVersionHistorySchema = z.object({
  curriculumId: z.string().uuid(),
  versions: z.array(
    z.object({
      version: CurriculumVersionSummarySchema,
      auditActions: z.array(CurriculumAuditHistoryItemSchema),
    }),
  ),
});
export type CurriculumVersionHistory = z.infer<typeof CurriculumVersionHistorySchema>;
