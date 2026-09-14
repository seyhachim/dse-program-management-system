import type { AttendanceStatus, SaveAttendanceInput } from "@dse-pms/shared-types";

const WARNING_RELEVANT_STATUSES: ReadonlySet<AttendanceStatus> = new Set([
  "Absent",
  "Late",
  "Excused",
]);

/**
 * Post-save warning evaluation only needs students whose newly saved status can
 * advance an attendance or punctuality warning. Present and Permission Pending
 * cannot create a warning candidate, so skipping them avoids historical
 * attendance reads on the synchronous save path without changing warning rules.
 */
export function attendanceWarningStudentIds(
  records: SaveAttendanceInput["records"],
): string[] {
  const studentIds = new Set<string>();
  for (const record of records) {
    if (record.status && WARNING_RELEVANT_STATUSES.has(record.status)) {
      studentIds.add(record.studentId);
    }
  }
  return [...studentIds];
}
