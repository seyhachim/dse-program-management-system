import { z } from "zod";

export const BindCurriculumCourseSpecSchema = z.object({
  courseSpecVersionId: z.string().uuid().nullable(),
});
export type BindCurriculumCourseSpecInput = z.infer<
  typeof BindCurriculumCourseSpecSchema
>;

export const CurriculumCourseSpecVersionSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  versionMajor: z.number().int().min(1),
  versionMinor: z.number().int().min(0),
  version: z.string(),
  approvedAt: z.string().nullable(),
  effectiveFrom: z.string().nullable(),
});
export type CurriculumCourseSpecVersion = z.infer<
  typeof CurriculumCourseSpecVersionSchema
>;

export const CurriculumCourseSpecBindingSchema = z.object({
  placementId: z.string().uuid(),
  courseId: z.string().uuid(),
  courseCode: z.string(),
  courseTitle: z.string(),
  linkedVersion: CurriculumCourseSpecVersionSchema.nullable(),
  eligibleVersions: z.array(CurriculumCourseSpecVersionSchema),
});
export type CurriculumCourseSpecBinding = z.infer<
  typeof CurriculumCourseSpecBindingSchema
>;

export const CurriculumCourseSpecBindingsSchema = z.object({
  curriculumId: z.string().uuid(),
  versionId: z.string().uuid(),
  versionStatus: z.enum(["Draft", "Approved", "Active", "Superseded"]),
  activationReady: z.boolean(),
  missingBindingCount: z.number().int().min(0),
  bindings: z.array(CurriculumCourseSpecBindingSchema),
});
export type CurriculumCourseSpecBindings = z.infer<
  typeof CurriculumCourseSpecBindingsSchema
>;
