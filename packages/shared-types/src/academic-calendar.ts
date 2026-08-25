import { z } from "zod";

export const ACADEMIC_CALENDAR_STATUSES = ["Draft", "Published", "Superseded", "Archived"] as const;
export const AcademicCalendarStatusSchema = z.enum(ACADEMIC_CALENDAR_STATUSES);
export type AcademicCalendarStatus = z.infer<typeof AcademicCalendarStatusSchema>;

export const ACADEMIC_CALENDAR_EVENT_TYPES = [
  "Registration", "Enrollment", "Orientation", "EntranceExam", "SemesterStart",
  "Teaching", "Midterm", "FinalExam", "SemesterBreak", "Holiday", "Other",
] as const;
export const AcademicCalendarEventTypeSchema = z.enum(ACADEMIC_CALENDAR_EVENT_TYPES);
export type AcademicCalendarEventType = z.infer<typeof AcademicCalendarEventTypeSchema>;

export const AcademicCalendarStudyYearSchema = z.coerce.number().int().min(1).max(4);
export type AcademicCalendarStudyYear = z.infer<typeof AcademicCalendarStudyYearSchema>;
export const AcademicCalendarSemesterSchema = z.enum(["First", "Second"]);
export type AcademicCalendarSemester = z.infer<typeof AcademicCalendarSemesterSchema>;

export const AcademicCalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date");

export const CreateAcademicYearSchema = z.object({
  label: z.string().trim().min(4).max(40),
  startYear: z.coerce.number().int().min(1900).max(2200),
  endYear: z.coerce.number().int().min(1900).max(2200),
  isCurrent: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.endYear < value.startYear) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endYear"], message: "End year cannot precede start year" });
});
export type CreateAcademicYearInput = z.infer<typeof CreateAcademicYearSchema>;

export const AcademicCalendarPeriodInputSchema = z.object({
  semester: AcademicCalendarSemesterSchema,
  teachingStart: AcademicCalendarDateSchema,
  teachingEnd: AcademicCalendarDateSchema,
  examStart: AcademicCalendarDateSchema.nullable().optional(),
  examEnd: AcademicCalendarDateSchema.nullable().optional(),
  breakStart: AcademicCalendarDateSchema.nullable().optional(),
  breakEnd: AcademicCalendarDateSchema.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.teachingEnd < value.teachingStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["teachingEnd"], message: "Teaching end cannot precede teaching start" });
  const pairs: Array<["examStart" | "breakStart", "examEnd" | "breakEnd", string]> = [["examStart", "examEnd", "Exam"], ["breakStart", "breakEnd", "Break"]];
  for (const [startKey, endKey, label] of pairs) {
    const start = value[startKey]; const end = value[endKey];
    if (Boolean(start) !== Boolean(end)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [end ? startKey : endKey], message: `${label} start and end must be set together` });
    if (start && end && end < start) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [endKey], message: `${label} end cannot precede start` });
  }
});
export type AcademicCalendarPeriodInput = z.infer<typeof AcademicCalendarPeriodInputSchema>;

export const AcademicCalendarEventInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: AcademicCalendarEventTypeSchema,
  semester: AcademicCalendarSemesterSchema.nullable().optional(),
  startDate: AcademicCalendarDateSchema,
  endDate: AcademicCalendarDateSchema.nullable().optional(),
  note: z.string().trim().max(2000).default(""),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
}).superRefine((value, ctx) => {
  if (value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date cannot precede start date" });
});
export type AcademicCalendarEventInput = z.infer<typeof AcademicCalendarEventInputSchema>;

const SourceFields = {
  sourceTitle: z.string().trim().max(300).default(""),
  sourcePublishedAt: AcademicCalendarDateSchema.nullable().optional(),
  sourceUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  sourceFileRef: z.string().trim().max(500).nullable().optional(),
  sourceNote: z.string().trim().max(3000).default(""),
} as const;

const CalendarContentShape = z.object({
  studyYears: z.array(AcademicCalendarStudyYearSchema).min(1).max(4),
  periods: z.array(AcademicCalendarPeriodInputSchema).min(1).max(2),
  events: z.array(AcademicCalendarEventInputSchema).max(100).default([]),
  ...SourceFields,
}).superRefine((value, ctx) => {
  if (new Set(value.studyYears).size !== value.studyYears.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["studyYears"], message: "Study years must be unique" });
  if (new Set(value.periods.map((period) => period.semester)).size !== value.periods.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periods"], message: "Each semester may appear once per calendar" });
});

export const CreateAcademicCalendarSchema = z.object({
  academicYearId: z.string().uuid(),
  revisionReason: z.string().trim().max(2000).default(""),
  studyYears: z.array(AcademicCalendarStudyYearSchema).min(1).max(4),
  periods: z.array(AcademicCalendarPeriodInputSchema).min(1).max(2),
  events: z.array(AcademicCalendarEventInputSchema).max(100).default([]),
  ...SourceFields,
}).superRefine((value, ctx) => {
  if (new Set(value.studyYears).size !== value.studyYears.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["studyYears"], message: "Study years must be unique" });
  if (new Set(value.periods.map((period) => period.semester)).size !== value.periods.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periods"], message: "Each semester may appear once per calendar" });
});
export type CreateAcademicCalendarInput = z.infer<typeof CreateAcademicCalendarSchema>;
export const UpdateAcademicCalendarDraftSchema = CalendarContentShape;
export type UpdateAcademicCalendarDraftInput = z.infer<typeof UpdateAcademicCalendarDraftSchema>;
export const CreateAcademicCalendarRevisionSchema = z.object({ reason: z.string().trim().min(3).max(2000) });
export type CreateAcademicCalendarRevisionInput = z.infer<typeof CreateAcademicCalendarRevisionSchema>;

export const AcademicCalendarContextQuerySchema = z.object({
  academicYearId: z.string().uuid(),
  studyYear: AcademicCalendarStudyYearSchema,
  semester: AcademicCalendarSemesterSchema,
});
export type AcademicCalendarContextQuery = z.infer<typeof AcademicCalendarContextQuerySchema>;

export const PublicAcademicCalendarQuerySchema = z.object({
  academicYear: z.string().trim().min(1).max(40).optional(),
  studyYear: AcademicCalendarStudyYearSchema,
});
export type PublicAcademicCalendarQuery = z.infer<typeof PublicAcademicCalendarQuerySchema>;

export interface AcademicYearView { id: string; programmeId: string; label: string; startYear: number; endYear: number; isCurrent: boolean; createdAt: string; updatedAt: string; }
export interface AcademicCalendarProgrammeRef { id: string; code: string; name: string; }
export interface AcademicCalendarSourceView { title: string; publishedAt: string | null; url: string | null; fileRef: string | null; note: string; }
export interface PublicAcademicCalendarSourceView { title: string; publishedAt: string | null; url: string | null; note: string; }
export interface AcademicCalendarAuditView { id: string; calendarId: string; actorId: string; actorName: string; action: string; reason: string; beforeSnapshot: unknown; afterSnapshot: unknown; details: unknown; createdAt: string; }
export interface AcademicCalendarPeriodView { id: string; calendarId: string; semester: AcademicCalendarSemester; teachingStart: string; teachingEnd: string; examStart: string | null; examEnd: string | null; breakStart: string | null; breakEnd: string | null; }
export interface AcademicCalendarEventView { id: string; calendarId: string; title: string; type: AcademicCalendarEventType; semester: AcademicCalendarSemester | null; startDate: string; endDate: string | null; note: string; sortOrder: number; }
export interface AcademicCalendarView { id: string; academicYear: AcademicYearView; seriesKey: string; revision: number; status: AcademicCalendarStatus; studyYears: number[]; periods: AcademicCalendarPeriodView[]; events: AcademicCalendarEventView[]; source: AcademicCalendarSourceView; revisionReason: string; supersedesCalendarId: string | null; publishedAt: string | null; createdAt: string; updatedAt: string; }
export interface AcademicCalendarCourseOption { id: string; code: string; title: string; credits: number | null; courseType: string | null; curriculumVersionId: string; }
export interface AcademicCalendarContextView { academicYear: AcademicYearView; studyYear: number; semester: AcademicCalendarSemester; calendar: AcademicCalendarView; period: AcademicCalendarPeriodView; courses: AcademicCalendarCourseOption[]; }
export interface AcademicCalendarTimelineEvent { key: string; title: string; type: AcademicCalendarEventType; semester: AcademicCalendarSemester | null; startDate: string; endDate: string | null; note: string; }
export type PublishedAcademicCalendarProjection =
  | { status: "available"; academicYear: AcademicYearView; studyYear: number; periods: AcademicCalendarPeriodView[]; events: AcademicCalendarEventView[]; sources: PublicAcademicCalendarSourceView[]; nextEvent: AcademicCalendarTimelineEvent | null; }
  | { status: "unavailable"; academicYear: AcademicYearView | null; studyYear: number; reason: "academic-year-unavailable" | "calendar-unpublished"; message: string; };

/** Student-facing projection. Source/provenance metadata remains on the management/public
 * contract; the portal receives only the published dates applicable to the authenticated
 * student's authoritative progression record. */
export type StudentAcademicCalendarView =
  | { status: "available"; academicYear: AcademicYearView; studyYear: number; periods: AcademicCalendarPeriodView[]; events: AcademicCalendarEventView[]; nextEvent: AcademicCalendarTimelineEvent | null; }
  | { status: "unavailable"; academicYear: AcademicYearView | null; studyYear: number | null; reason: "student-context-unavailable" | "academic-year-unavailable" | "calendar-unpublished"; message: string; };

export interface AcademicCalendarOfferingPeriodRef { id: string; calendarId: string; programmeId: string; academicYearId: string; academicYearLabel: string; studyYears: number[]; semester: AcademicCalendarSemester; teachingStart: string; teachingEnd: string; revision: number; }
export interface AcademicCalendarServiceContract {
  getPublishedPeriodForOffering(periodId: string, programmeId: string, studyYear: number): Promise<AcademicCalendarOfferingPeriodRef | null>;
  assertCoursePlacement(programmeId: string, academicYearId: string, studyYear: number, semester: AcademicCalendarSemester, courseId: string): Promise<void>;
}
