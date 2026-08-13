import { z } from "zod";
import type { LecturerRef } from "./contracts.ts";

/**
 * Course Offering schemas. An offering is a course delivered in a term with an
 * assigned lecturer, a seat capacity, and enrolled students. The offerings
 * service resolves course/lecturer/student references through the registry.
 */
export const OFFERING_STATUSES = ["Planned", "Active", "Completed"] as const;
export const OfferingStatusSchema = z.enum(OFFERING_STATUSES);
export type OfferingStatus = z.infer<typeof OfferingStatusSchema>;

/** Syllabus §12 Course Availability — which semester the course runs in. */
export const SEMESTERS = ["First", "Second"] as const;
export const SemesterSchema = z.enum(SEMESTERS);
export type Semester = z.infer<typeof SemesterSchema>;

/** Human label for a semester value (falls back to a dash when unset). */
export function semesterLabel(semester: Semester | null | undefined): string {
  if (semester === "First") return "1st Semester";
  if (semester === "Second") return "2nd Semester";
  return "—";
}

/**
 * Shared invariant for co-lecturer assignment (issue #79, moved from Course to
 * Offering — see #73/#71), factored out so both the Zod validation below and the
 * offerings service's merged-state check (which sees the full
 * lecturerId/coLecturerIds pair even on a partial PATCH) agree on one rule: no
 * duplicate co-lecturers, and the primary lecturer can't also be a co-lecturer.
 * `null` means the assignment is valid.
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

const OfferingInputShape = z.object({
  courseId: z.string().uuid("A course is required"),
  term: z.string().min(1, "Term is required"),
  lecturerId: z.string().uuid().nullable().optional(),
  // Existing lecturer users assigned alongside the primary lecturer (issue #79).
  // Distinct from otherLecturers (per-term free text) — untouched here.
  coLecturerIds: z.array(z.string().uuid()).optional(),
  capacity: z.coerce.number().int().min(1).max(1000).default(30),
  status: OfferingStatusSchema.default("Planned"),
  // §12 Course Availability — optional. Year is the programme/study year (1–6).
  semester: SemesterSchema.nullable().optional(),
  programmeYear: z.coerce.number().int().min(1).max(6).nullable().optional(),
  // §10 Other Course Lecturer(s) — optional free text, co-teachers this term.
  otherLecturers: z.string().optional(),
});

export const CreateOfferingInput = OfferingInputShape.superRefine(refineCoLecturers);
export type CreateOfferingInput = z.infer<typeof CreateOfferingInput>;

export const UpdateOfferingInput = OfferingInputShape.omit({ courseId: true })
  .partial()
  .superRefine(refineCoLecturers);
export type UpdateOfferingInput = z.infer<typeof UpdateOfferingInput>;

export const ListOfferingsQuery = z.object({
  term: z.string().trim().optional(),
  status: OfferingStatusSchema.optional(),
});
export type ListOfferingsQuery = z.infer<typeof ListOfferingsQuery>;

/** Body for POST /api/offerings/:id/enrollments */
export const EnrollInput = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "Select at least one student"),
});
export type EnrollInput = z.infer<typeof EnrollInput>;

/** Enriched offering as returned by the API (joined via the registry). */
export interface OfferingView {
  id: string;
  term: string;
  status: OfferingStatus;
  capacity: number;
  enrolledCount: number;
  createdAt: string;
  semester: Semester | null;
  programmeYear: number | null;
  otherLecturers: string | null;
  // programmeId backs the router's programme-scope access check (issue #147) —
  // not otherwise used by the frontend today. Every Course has exactly one
  // programme (issue #150 phase C); only the whole `course` object is nullable.
  course: { id: string; code: string; title: string; programmeId: string } | null;
  lecturer: {
    id: string;
    name: string;
    email: string;
    title: string | null;
    qualification: string | null;
    phone: string | null;
  } | null;
  // Existing lecturer users assigned alongside the primary lecturer (issue #79).
  coLecturers: LecturerRef[];
  students: { id: string; name: string; studentId: string }[];
}
