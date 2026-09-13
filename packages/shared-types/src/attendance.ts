import { z } from "zod";

export const ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Excused"] as const;
export const AttendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const AttendanceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date");

function validateAttendanceMark(
  record: { status: AttendanceStatus | null; permissionPending: boolean },
  ctx: z.RefinementCtx,
) {
  if (record.status !== null && record.permissionPending) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Final attendance status and Permission Pending cannot both be set",
      path: ["permissionPending"],
    });
  }
  if (record.status === null && !record.permissionPending) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Attendance record must contain a finalized status or Permission Pending",
      path: ["status"],
    });
  }
}

export const SaveAttendanceRecordInput = z
  .object({
    studentId: z.string().uuid(),
    status: AttendanceStatusSchema.nullable().default(null),
    permissionPending: z.boolean().default(false),
    note: z.string().trim().max(300).default(""),
  })
  .superRefine(validateAttendanceMark);

export const SaveAttendanceInput = z.object({
  records: z
    .array(SaveAttendanceRecordInput)
    .max(1000)
    .superRefine((records, ctx) => {
      const ids = new Set<string>();
      records.forEach((record, index) => {
        if (ids.has(record.studentId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Duplicate student attendance record",
            path: [index, "studentId"],
          });
        }
        ids.add(record.studentId);
      });
    }),
});

// Callers may omit defaulted fields; parsed data still normalizes them to
// status=null, permissionPending=false, note="" before reaching the service.
export type SaveAttendanceInput = z.input<typeof SaveAttendanceInput>;

const RecheckAttendanceMarkInput = z
  .object({
    status: AttendanceStatusSchema.nullable().default(null),
    permissionPending: z.boolean().default(false),
    note: z.string().trim().max(300).default(""),
  })
  .superRefine(validateAttendanceMark);

/**
 * Check 2 is an observation, while final is the explicit academic attendance
 * state the lecturer wants to keep for the section/date. They intentionally may
 * differ; the PMS does not infer policy such as Absent -> Present meaning Late.
 */
export const RecheckAttendanceInput = z.object({
  studentId: z.string().uuid(),
  observation: RecheckAttendanceMarkInput,
  final: RecheckAttendanceMarkInput,
});
export type RecheckAttendanceInput = z.input<typeof RecheckAttendanceInput>;
export type RecheckAttendanceData = z.infer<typeof RecheckAttendanceInput>;

export type AttendanceMotivationBadge =
  | "Great Start"
  | "Reliable Learner"
  | "Perfect Attendance";

export interface AttendanceStudentSummary {
  attendanceRate: number | null;
  attendedSessions: number;
  markedSessions: number;
  counts: Record<AttendanceStatus, number>;
  badges: AttendanceMotivationBadge[];
}

export interface AttendanceCheckpointView {
  checkNumber: 1 | 2;
  status: AttendanceStatus | null;
  permissionPending: boolean;
  note: string;
  checkedAt: string;
  checkedById: string | null;
}

export interface AttendanceRecordView {
  studentId: string;
  studentNumber: string | null;
  studentName: string;
  /** Official Khmer full name when available. Kept optional for historical snapshots. */
  studentKhmerName?: string | null;
  /** Canonical StudentProfile gender/sex value when available. */
  studentGender?: string | null;
  /** Course-to-date attendance context used by focused Roll Call UI. */
  attendanceSummary?: AttendanceStudentSummary | null;
  /** Immutable first/second roll-call observations for this section/date. */
  checkpoints: AttendanceCheckpointView[];
  status: AttendanceStatus | null;
  permissionPending: boolean;
  permissionPendingSince: string | null;
  note: string;
}

export interface AttendanceSessionView {
  sessionId: string | null;
  offeringId: string;
  date: string;
  records: AttendanceRecordView[];
  counts: Record<AttendanceStatus, number> & { PermissionPending: number; Unmarked: number };
  updatedAt: string | null;
}

export interface AttendanceSessionSummary {
  sessionId: string;
  offeringId: string;
  date: string;
  counts: Record<AttendanceStatus, number> & { PermissionPending: number };
  updatedAt: string;
}

export interface AttendanceStudentHistoryItem {
  sessionId: string;
  date: string;
  status: AttendanceStatus | null;
  permissionPending: boolean;
  note: string;
  updatedAt: string;
}

export interface AttendanceStudentHistoryView {
  offeringId: string;
  studentId: string;
  history: AttendanceStudentHistoryItem[];
}
