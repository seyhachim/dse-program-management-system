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

export const SaveAttendanceRecordInput = z
  .object({
    studentId: z.string().uuid(),
    status: AttendanceStatusSchema.nullable().default(null),
    permissionPending: z.boolean().default(false),
    note: z.string().trim().max(300).default(""),
  })
  .superRefine((record, ctx) => {
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
  });

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
