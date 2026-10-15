import type { AttendanceCheckpointView, AttendanceRecordView } from "@dse-pms/shared-types";

export type AttendanceRecheckState =
  | "not-started"
  | "needs-recheck"
  | "checked-twice"
  | "changed"
  | "view-only";

export function checkpointLabel(checkpoint: AttendanceCheckpointView | undefined): string {
  if (!checkpoint) return "Not checked";
  if (checkpoint.permissionPending) return "Permission Pending";
  return checkpoint.status ?? "Not checked";
}

export function attendanceRecheckState(record: AttendanceRecordView): AttendanceRecheckState {
  if (record.recheckEligible === false) return "view-only";
  const checkpoints = record.checkpoints ?? [];
  const check1 = checkpoints.find((checkpoint) => checkpoint.checkNumber === 1);
  const check2 = checkpoints.find((checkpoint) => checkpoint.checkNumber === 2);
  if (!check1) return "not-started";
  if (!check2) return "needs-recheck";
  const changed =
    check1.permissionPending !== check2.permissionPending ||
    check1.status !== check2.status;
  return changed ? "changed" : "checked-twice";
}

/** A targeted late arrival must start from an actual, saved Absent Check 1.
 * Ordinary corrections and historical/view-only records cannot invent Check 2 evidence.
 */
export function isLateArrivalCandidate(record: AttendanceRecordView): boolean {
  if (record.recheckEligible === false || record.status !== "Absent" || record.permissionPending) return false;
  const checkpoints = record.checkpoints ?? [];
  return checkpoints.some((check) =>
    check.checkNumber === 1 && check.status === "Absent" && !check.permissionPending,
  ) && !checkpoints.some((check) => check.checkNumber === 2);
}

export function recheckStateLabel(state: AttendanceRecheckState): string {
  if (state === "needs-recheck") return "Awaiting Check 2";
  if (state === "checked-twice") return "Checked twice";
  if (state === "changed") return "Changed";
  if (state === "view-only") return "Historical";
  return "Not checked";
}
