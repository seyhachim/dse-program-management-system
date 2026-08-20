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

export const CreateCourseInput = z.object({
  code: z.string().min(1, "Course code is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  lecturerId: z.string().uuid().nullable().optional(),
  // Syllabus Course Information — §4 credits, §5 prerequisites, §11 type.
  credits: z.coerce.number().int().min(1).max(30).nullable().optional(),
  prerequisites: z.string().optional(),
  courseType: CourseTypeSchema.nullable().optional(),
  totalSltHours: z.coerce.number().int().min(0).nullable().optional(),
});
export type CreateCourseInput = z.infer<typeof CreateCourseInput>;

export const UpdateCourseInput = CreateCourseInput.partial();
export type UpdateCourseInput = z.infer<typeof UpdateCourseInput>;

export const ListCoursesQuery = z.object({
  search: z.string().trim().optional(),
});
export type ListCoursesQuery = z.infer<typeof ListCoursesQuery>;

/**
 * Global class-section existence metadata for a course that the current caller
 * is already authorized to see. The endpoint intentionally exposes only this
 * boolean rather than another lecturer's Offering details.
 */
export type CourseSectionPresence = {
  courseId: string;
  hasSections: boolean;
};

export const SetCourseSpecResponsibleLecturersInputSchema = z.object({
  lecturerIds: z
    .array(z.string().uuid())
    .max(20, "A Course Specification can have at most 20 responsible lecturers")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Responsible lecturers must be unique",
    }),
});
export type SetCourseSpecResponsibleLecturersInput = z.infer<
  typeof SetCourseSpecResponsibleLecturersInputSchema
>;

export type CourseSpecResponsibleLecturerRef = {
  id: string;
  name: string;
  email: string;
};

export type CourseSpecResponsibleLecturersView = {
  courseId: string;
  courseSpecId: string | null;
  academicVersion: string;
  reviewStatus: string;
  lecturers: CourseSpecResponsibleLecturerRef[];
};
