import type { AttendanceRecordView, AttendanceStatus, SaveAttendanceInput } from "@dse-pms/shared-types";

export interface AttendanceCounts {
  Present: number;
  Absent: number;
  Late: number;
  Excused: number;
  PermissionPending: number;
  Unmarked: number;
  Total: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(value: string): number | null {
  const parsed = new Date(`${value}T00:00:00.000Z`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function getAttendanceCounts(records: AttendanceRecordView[]): AttendanceCounts {
  const counts: AttendanceCounts = {
    Present: 0,
    Absent: 0,
    Late: 0,
    Excused: 0,
    PermissionPending: 0,
    Unmarked: 0,
    Total: records.length,
  };

  for (const record of records) {
    if (record.status) counts[record.status] += 1;
    else if (record.permissionPending) counts.PermissionPending += 1;
    else counts.Unmarked += 1;
  }

  return counts;
}

export function getTeachingWeek(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  selectedDate: string,
): number | null {
  if (!startDate) return null;
  const start = dateValue(startDate);
  const selected = dateValue(selectedDate);
  const end = endDate ? dateValue(endDate) : null;
  if (start === null || selected === null || selected < start) return null;
  if (end !== null && selected > end) return null;
  return Math.floor((selected - start) / (7 * DAY_MS)) + 1;
}

export function getNextIndex(currentIndex: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(currentIndex + 1, length - 1);
}

export function getPreviousIndex(currentIndex: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(currentIndex - 1, 0);
}

export function getUnmarkedStudentIds(records: AttendanceRecordView[]): string[] {
  return records
    .filter((record) => record.status === null && !record.permissionPending)
    .map((record) => record.studentId);
}

export function getSkipFeedback(record: AttendanceRecordView): string {
  if (record.permissionPending) {
    return `${record.studentName} skipped; existing Permission Pending kept.`;
  }
  if (record.status === null) {
    return `${record.studentName} skipped and left Unmarked.`;
  }
  const label = record.status === "Excused" ? "Permission / Excused" : record.status;
  return `${record.studentName} skipped; existing ${label} status kept.`;
}

export function updateAttendanceRecord(
  records: AttendanceRecordView[],
  studentId: string,
  patch: Partial<Pick<AttendanceRecordView, "status" | "permissionPending" | "permissionPendingSince" | "note">>,
): AttendanceRecordView[] {
  return records.map((record) => (record.studentId === studentId ? { ...record, ...patch } : record));
}

export function markAttendanceStatus(
  records: AttendanceRecordView[],
  studentId: string,
  status: AttendanceStatus,
): AttendanceRecordView[] {
  return updateAttendanceRecord(records, studentId, {
    status,
    permissionPending: false,
    permissionPendingSince: null,
  });
}

export function toSaveAttendanceRecords(records: AttendanceRecordView[]): SaveAttendanceInput["records"] {
  return records
    .filter((record) => record.status !== null || record.permissionPending)
    .map((record) => ({
      studentId: record.studentId,
      status: record.status,
      permissionPending: record.permissionPending,
      note: record.note.trim(),
    }));
}

export function attendanceRecordsEqual(a: AttendanceRecordView[], b: AttendanceRecordView[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((record, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      record.studentId === other.studentId &&
      record.status === other.status &&
      record.permissionPending === other.permissionPending &&
      record.note === other.note
    );
  });
}

export function cloneAttendanceRecords(records: AttendanceRecordView[]): AttendanceRecordView[] {
  return records.map((record) => ({ ...record }));
}
