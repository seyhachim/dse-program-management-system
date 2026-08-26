import { z } from "zod";
import type { CourseSpecVersionRef, LecturerRef } from "./contracts.ts";

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

/** ISO date-only value used for offering teaching periods. */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date");

/** Short, stable class label within a course and term (for example A or B2). */
export const SectionCodeSchema = z
  .string()
  .trim()
  .min(1, "Class / section is required")
  .max(12, "Class / section must be 12 characters or fewer")
  .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, or hyphens only")
  .transform((value) => value.toUpperCase());
export type SectionCode = z.infer<typeof SectionCodeSchema>;

export const MEETING_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export const MeetingDaySchema = z.enum(MEETING_DAYS);
export type MeetingDay = z.infer<typeof MeetingDaySchema>;

export const MEETING_ACTIVITY_TYPES = [
  "Lecture",
  "Tutorial",
  "Practice",
  "Lab",
  "Other",
] as const;
export const MeetingActivityTypeSchema = z.enum(MEETING_ACTIVITY_TYPES);
export type MeetingActivityType = z.infer<typeof MeetingActivityTypeSchema>;

const MeetingTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid 24-hour time");

/** One recurring weekly timetable entry for a class offering. */
export const OfferingMeetingInput = z
  .object({
    dayOfWeek: MeetingDaySchema,
    startTime: MeetingTimeSchema,
    endTime: MeetingTimeSchema,
    room: z.string().trim().max(80, "Room must be 80 characters or fewer").optional(),
    activityType: MeetingActivityTypeSchema.default("Lecture"),
  })
  .superRefine((meeting, ctx) => {
    if (meeting.endTime <= meeting.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be after start time",
        path: ["endTime"],
      });
    }
  });
export type OfferingMeetingInput = z.infer<typeof OfferingMeetingInput>;

export interface OfferingMeetingView {
  id: string;
  dayOfWeek: MeetingDay;
  startTime: string;
  endTime: string;
  room: string | null;
  activityType: MeetingActivityType;
  /** Derived from start/end time; callers never enter duration separately. */
  durationHours: number;
}

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

export interface TeachingPeriodAssignment {
  startDate?: string | null;
  endDate?: string | null;
}
export type TeachingPeriodViolation = "missingStart" | "missingEnd" | "endBeforeStart";

/** Final-state teaching-period invariant used by validation and the PATCH service. */
export function teachingPeriodViolation({
  startDate,
  endDate,
}: TeachingPeriodAssignment): TeachingPeriodViolation | null {
  if (startDate && !endDate) return "missingEnd";
  if (!startDate && endDate) return "missingStart";
  if (startDate && endDate && endDate < startDate) return "endBeforeStart";
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

function refineTeachingPeriod(
  data: TeachingPeriodAssignment,
  ctx: z.RefinementCtx,
  requirePair: boolean,
): void {
  const hasStart = data.startDate !== undefined;
  const hasEnd = data.endDate !== undefined;
  if (!requirePair && hasStart !== hasEnd) return;

  const violation = teachingPeriodViolation(data);
  if (violation === "missingStart") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Set a teaching start date", path: ["startDate"] });
  } else if (violation === "missingEnd") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Set a teaching end date", path: ["endDate"] });
  } else if (violation === "endBeforeStart") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End date must be on or after start date", path: ["endDate"] });
  }
}

const OfferingInputShape = z.object({
  courseId: z.string().uuid("A course is required"),
  courseSpecId: z.string().uuid("An Approved CourseSpec version is required"),
  term: z.string().min(1, "Term is required"),
  // Default keeps older API clients compatible while the database migration
  // backfills every existing offering as Class A.
  sectionCode: SectionCodeSchema.default("A"),
  meetings: z.array(OfferingMeetingInput).max(20, "Use at most 20 weekly meetings").default([]),
  lecturerId: z.string().uuid().nullable().optional(),
  // Existing lecturer users assigned alongside the primary lecturer (issue #79).
  // Distinct from otherLecturers (per-term free text) — untouched here.
  coLecturerIds: z.array(z.string().uuid()).optional(),
  capacity: z.coerce.number().int().min(1).max(1000).default(30),
  status: OfferingStatusSchema.default("Planned"),
  // Academic context. New offerings require a published canonical period; nullability remains only for historical PATCH compatibility.
  semester: SemesterSchema.nullable().optional(),
  programmeYear: z.coerce.number().int().min(1).max(6).nullable().optional(),
  academicCalendarPeriodId: z.string().uuid().nullable().optional(),
  // Legacy delivery-date snapshots are retained for historical rows only. New creates must not send them.
  startDate: DateOnlySchema.nullable().optional(),
  endDate: DateOnlySchema.nullable().optional(),
  // §10 Other Course Lecturer(s) — optional free text, co-teachers this term.
  otherLecturers: z.string().optional(),
});

export const CreateOfferingInput = OfferingInputShape.superRefine((data, ctx) => {
  refineCoLecturers(data, ctx);

  if (!data.lecturerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A primary lecturer is required", path: ["lecturerId"] });
  }
  if (!data.meetings || data.meetings.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add at least one weekly class session", path: ["meetings"] });
  }
  if (!data.academicCalendarPeriodId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A published Academic Calendar period is required", path: ["academicCalendarPeriodId"] });
  }
  if (!data.programmeYear || data.programmeYear < 1 || data.programmeYear > 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Study year must be between 1 and 4", path: ["programmeYear"] });
  }
  if (!data.semester) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Semester is required", path: ["semester"] });
  }
  if (data.startDate !== undefined || data.endDate !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Teaching dates come from the published Academic Calendar and must not be entered on the offering",
      path: ["academicCalendarPeriodId"],
    });
  }
});
export type CreateOfferingInput = z.infer<typeof CreateOfferingInput>;

export const UpdateOfferingInput = OfferingInputShape.omit({ courseId: true })
  .partial()
  .superRefine((data, ctx) => {
    refineCoLecturers(data, ctx);
    // A PATCH may send one side while the other already exists; the service
    // validates the merged final state. When both are supplied, catch ordering here.
    refineTeachingPeriod(data, ctx, false);
  });
export type UpdateOfferingInput = z.infer<typeof UpdateOfferingInput>;

export const ListOfferingsQuery = z.object({
  term: z.string().trim().optional(),
  status: OfferingStatusSchema.optional(),
});
export type ListOfferingsQuery = z.infer<typeof ListOfferingsQuery>;

export const ListLecturerWorkloadQuery = z.object({
  term: z.string().trim().min(1).optional(),
});
export type ListLecturerWorkloadQuery = z.infer<typeof ListLecturerWorkloadQuery>;

/** Body for POST /api/offerings/:id/enrollments */
export const EnrollInput = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "Select at least one student"),
});
export type EnrollInput = z.infer<typeof EnrollInput>;

/** Enriched offering as returned by the API (joined via the registry). */
export interface OfferingView {
  id: string;
  term: string;
  sectionCode: string;
  status: OfferingStatus;
  capacity: number;
  enrolledCount: number;
  createdAt: string;
  semester: Semester | null;
  programmeYear: number | null;
  academicCalendarPeriodId: string | null;
  academicCalendar: { periodId: string; calendarId: string; academicYearId: string; academicYearLabel: string; revision: number; studyYears: number[]; semester: Semester; teachingStart: string; teachingEnd: string } | null;
  /** Effective teaching dates: derived from Academic Calendar for linked offerings, legacy snapshots otherwise. */
  startDate: string | null;
  endDate: string | null;
  otherLecturers: string | null;
  meetings: OfferingMeetingView[];
  // programmeId backs the router's programme-scope access check (issue #147) —
  // not otherwise used by the frontend today. Every Course has exactly one
  // programme (issue #150 phase C); only the whole `course` object is nullable.
  course: { id: string; code: string; title: string; programmeId: string } | null;
  /** Exact approved CourseSpec version used for this delivery. Null only for unresolved legacy rows. */
  courseSpec: CourseSpecVersionRef | null;
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

export interface LecturerWorkloadRow {
  offeringId: string;
  course: { id: string; code: string; title: string };
  term: string;
  sectionCode: string;
  role: "Primary" | "Co-Lecturer";
  week: number;
  lectureHours: number;
  tutorialHours: number;
  practiceHours: number;
  otherHours: number;
  totalContactHours: number;
}

export interface LecturerScheduleRow {
  meetingId: string;
  offeringId: string;
  course: { id: string; code: string; title: string };
  term: string;
  sectionCode: string;
  role: "Primary" | "Co-Lecturer";
  dayOfWeek: MeetingDay;
  startTime: string;
  endTime: string;
  room: string | null;
  activityType: MeetingActivityType;
  durationHours: number;
}

export interface LecturerWorkloadSummary {
  /** Actual recurring timetable used for the lecturer's weekly scheduled load. */
  scheduleRows: LecturerScheduleRow[];
  scheduledWeeklyHours: number;
  rows: LecturerWorkloadRow[];
  weeklyTotals: { term: string; week: number; totalContactHours: number }[];
  peakWeeklyHours: number;
  /** Sum across every returned teaching week; useful for term-level reporting. */
  totalHours: number;
  /** Until workload-sharing rules are configured, each co-lecturer counts fully. */
  coLecturerAssumption: "full";
}
