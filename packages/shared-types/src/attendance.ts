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

export const SaveAttendanceInput = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: AttendanceStatusSchema,
        note: z.string().trim().max(300).default(""),
      }),
    )
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
export type SaveAttendanceInput = z.infer<typeof SaveAttendanceInput>;

export interface AttendanceRecordView {
  studentId: string;
  studentNumber: string;
  studentName: string;
  status: AttendanceStatus | null;
  note: string;
}

export interface AttendanceSessionView {
  sessionId: string | null;
  offeringId: string;
  date: string;
  records: AttendanceRecordView[];
  counts: Record<AttendanceStatus, number> & { Unmarked: number };
  updatedAt: string | null;
}

export interface AttendanceSessionSummary {
  sessionId: string;
  offeringId: string;
  date: string;
  counts: Record<AttendanceStatus, number>;
  updatedAt: string;
}
