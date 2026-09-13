import type { AttendanceCheckpointView, AttendanceRecordView } from "@dse-pms/shared-types";

export type AttendanceRecheckState =
  | "not-started"
  | "needs-recheck"
  | "checked-twice"
  | "changed";

export function checkpointLabel(checkpoint: AttendanceCheckpointView | undefined): string {
  if (!checkpoint) return "Not checked";
  if (checkpoint.permissionPending) return "Permission Pending";
  return checkpoint.status ?? "Not checked";
}

export function attendanceRecheckState(record: AttendanceRecordView): AttendanceRecheckState {
  const check1 = record.checkpoints.find((checkpoint) => checkpoint.checkNumber === 1);
  const check2 = record.checkpoints.find((checkpoint) => checkpoint.checkNumber === 2);
  if (!check1) return "not-started";
  if (!check2) return "needs-recheck";
  const changed =
    check1.permissionPending !== check2.permissionPending ||
    check1.status !== check2.status;
  return changed ? "changed" : "checked-twice";
}

export function recheckStateLabel(state: AttendanceRecheckState): string {
  if (state === "needs-recheck") return "Needs recheck";
  if (state === "checked-twice") return "Checked twice";
  if (state === "changed") return "Changed";
  return "Not checked";
}
