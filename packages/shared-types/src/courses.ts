import { z } from "zod";

/**
 * Course domain schemas. `lecturerId` is validated at the service layer through
 * registry.get('lecturers') — never by importing the lecturers plugin directly.
 */

/** Syllabus §11 Course Type. */
export const COURSE_TYPES = ["Basic", "Core", "Elective", "Specialization", "MoeysHeip"] as const;
export const CourseTypeSchema = z.enum(COURSE_TYPES);
export type CourseType = z.infer<typeof CourseTypeSchema>;

/** Human label for a course type (falls back to a dash when unset). */
export function courseTypeLabel(type: CourseType | null | undefined): string {
  switch (type) {
    case "Basic":
      return "Basic";
    case "Core":
      return "Core";
    case "Elective":
      return "Elective";
    case "Specialization":
      return "Specialization";
    case "MoeysHeip":
      return "MoEYS / HEIP";
    default:
      return "—";
  }
}

export const CourseSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  lecturerId: z.string().uuid().nullable().optional(),
  credits: z.number().int().nullable().optional(),
  prerequisites: z.string().nullable().optional(),
  courseType: CourseTypeSchema.nullable().optional(),
  // Admin-entered total SLT (hours) for the course. Independent of §16 — always a
  // direct input, never derived. Used as the §14 CLO Focus % denominator.
  totalSltHours: z.number().int().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type Course = z.infer<typeof CourseSchema>;

/**
 * Shared invariant for co-lecturer assignment (issue #73), factored out so both
 * the Zod validation below and the courses service's merged-state check (which
 * sees the full lecturerId/coLecturerIds pair even on a partial PATCH) agree on
 * one rule: no duplicate co-lecturers, and the primary lecturer can't also be a
 * co-lecturer. `null` means the assignment is valid.
 */
export interface CoLecturerAssignment {
  lecturerId?: string | null;
  coLecturerIds?: string[];
}
export type CoLecturerViolation = "duplicate" | "primaryIsCoLecturer";

export function coLecturerViolation({
  lecturerId,
  coLecturerIds,
}: CoLecturerAssignment): CoLecturerViolation | null {
  if (!coLecturerIds || coLecturerIds.length === 0) return null;
  if (new Set(coLecturerIds).size !== coLecturerIds.length) return "duplicate";
  if (lecturerId && coLecturerIds.includes(lecturerId)) return "primaryIsCoLecturer";
  return null;
}

function refineCoLecturers(data: CoLecturerAssignment, ctx: z.RefinementCtx): void {
  const violation = coLecturerViolation(data);
  if (violation === "duplicate") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate co-lecturer", path: ["coLecturerIds"] });
  } else if (violation === "primaryIsCoLecturer") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The primary lecturer cannot also be a co-lecturer",
      path: ["coLecturerIds"],
    });
  }
}

const CourseInputShape = z.object({
  code: z.string().min(1, "Course code is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  lecturerId: z.string().uuid().nullable().optional(),
  // Existing lecturer users assigned alongside the primary lecturer (issue #73).
  // Distinct from Offering.otherLecturers (per-term free text) — untouched here.
  coLecturerIds: z.array(z.string().uuid()).optional(),
  // Syllabus Course Information — §4 credits, §5 prerequisites, §11 type.
  credits: z.coerce.number().int().min(1).max(30).nullable().optional(),
  prerequisites: z.string().optional(),
  courseType: CourseTypeSchema.nullable().optional(),
  totalSltHours: z.coerce.number().int().min(0).nullable().optional(),
});

export const CreateCourseInput = CourseInputShape.superRefine(refineCoLecturers);
export type CreateCourseInput = z.infer<typeof CreateCourseInput>;

export const UpdateCourseInput = CourseInputShape.partial().superRefine(refineCoLecturers);
export type UpdateCourseInput = z.infer<typeof UpdateCourseInput>;

export const ListCoursesQuery = z.object({
  search: z.string().trim().optional(),
});
export type ListCoursesQuery = z.infer<typeof ListCoursesQuery>;
