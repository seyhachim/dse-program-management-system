import { z } from "zod";
import { OfferingStatusSchema, SemesterSchema } from "./offerings.ts";
import { StudentStatusSchema } from "./students.ts";

const CountSchema = z.number().int().nonnegative();

export const DashboardCourseSpecProgressSchema = z
  .object({
    courseId: z.string().uuid(),
    code: z.string().min(1),
    title: z.string().min(1),
    completed: CountSchema,
    total: CountSchema,
    curriculumPlacement: z
      .object({
        programmeYear: z.number().int().min(1),
        semester: SemesterSchema,
        sortOrder: z.number().int(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type DashboardCourseSpecProgress = z.infer<
  typeof DashboardCourseSpecProgressSchema
>;

export const DashboardStudentsSummarySchema = z
  .object({
    total: CountSchema,
    byStatus: z.array(
      z
        .object({
          status: StudentStatusSchema,
          count: CountSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type DashboardStudentsSummary = z.infer<
  typeof DashboardStudentsSummarySchema
>;

export const DashboardCoursesSummarySchema = z
  .object({
    total: CountSchema,
    specProgress: z.array(DashboardCourseSpecProgressSchema),
  })
  .strict();
export type DashboardCoursesSummary = z.infer<
  typeof DashboardCoursesSummarySchema
>;

export const DashboardOfferingsSummarySchema = z
  .object({
    total: CountSchema,
    byStatus: z.array(
      z
        .object({
          status: OfferingStatusSchema,
          count: CountSchema,
        })
        .strict(),
    ),
    totalEnrolled: CountSchema,
    totalCapacity: CountSchema,
  })
  .strict();
export type DashboardOfferingsSummary = z.infer<
  typeof DashboardOfferingsSummarySchema
>;

export const DashboardLecturersSummarySchema = z
  .object({
    total: CountSchema,
  })
  .strict();
export type DashboardLecturersSummary = z.infer<
  typeof DashboardLecturersSummarySchema
>;

export type DashboardSourceResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

function sourceResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("status", [
    z.object({ status: z.literal("ok"), data: dataSchema }).strict(),
    z
      .object({
        status: z.literal("error"),
        message: z.string().trim().min(1),
      })
      .strict(),
  ]);
}

export const DashboardSummarySchema = z
  .object({
    generatedAt: z.string().datetime(),
    students: sourceResultSchema(DashboardStudentsSummarySchema),
    courses: sourceResultSchema(DashboardCoursesSummarySchema),
    offerings: sourceResultSchema(DashboardOfferingsSummarySchema),
    lecturers: sourceResultSchema(DashboardLecturersSummarySchema),
  })
  .strict();
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
