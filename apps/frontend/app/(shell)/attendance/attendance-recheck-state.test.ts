import { describe, expect, test } from "bun:test";
import type { AttendanceRecordView } from "@dse-pms/shared-types";
import {
  attendanceRecheckState,
  checkpointLabel,
  isLateArrivalCandidate,
  recheckStateLabel,
} from "./attendance-recheck-state";

const BASE_RECORD: AttendanceRecordView = {
  studentId: "11111111-1111-1111-1111-111111111111",
  studentNumber: "DSE2026001",
  studentName: "Sample Student",
  status: "Present",
  permissionPending: false,
  permissionPendingSince: null,
  note: "",
};

const CHECK_1 = {
  checkNumber: 1 as const,
  status: "Present" as const,
  permissionPending: false,
  note: "First roll",
  checkedAt: "2026-09-13T00:35:00.000Z",
  checkedById: null,
};

const CHECK_2 = {
  checkNumber: 2 as const,
  status: "Present" as const,
  permissionPending: false,
  note: "Second roll",
  checkedAt: "2026-09-13T03:40:00.000Z",
  checkedById: null,
};

describe("attendance recheck state", () => {
  test("legacy or unsaved rows are not started", () => {
    expect(attendanceRecheckState(BASE_RECORD)).toBe("not-started");
    expect(recheckStateLabel("not-started")).toBe("Not checked");
  });

  test("historical unenrolled rows are view-only even when Check 1 exists", () => {
    expect(
      attendanceRecheckState({
        ...BASE_RECORD,
        checkpoints: [CHECK_1],
        recheckEligible: false,
      }),
    ).toBe("view-only");
    expect(recheckStateLabel("view-only")).toBe("Historical");
  });

  test("Check 1 without Check 2 awaits an optional second check", () => {
    expect(attendanceRecheckState({ ...BASE_RECORD, checkpoints: [CHECK_1] })).toBe(
      "needs-recheck",
    );
    expect(recheckStateLabel("needs-recheck")).toBe("Awaiting Check 2");
  });

  test("matching observations are checked twice", () => {
    expect(
      attendanceRecheckState({ ...BASE_RECORD, checkpoints: [CHECK_1, CHECK_2] }),
    ).toBe("checked-twice");
  });

  test("different status or pending state is surfaced as changed", () => {
    expect(
      attendanceRecheckState({
        ...BASE_RECORD,
        checkpoints: [
          CHECK_1,
          { ...CHECK_2, status: "Late" as const },
        ],
      }),
    ).toBe("changed");
    expect(
      attendanceRecheckState({
        ...BASE_RECORD,
        checkpoints: [
          CHECK_1,
          { ...CHECK_2, status: null, permissionPending: true },
        ],
      }),
    ).toBe("changed");
  });

  test("checkpoint labels distinguish permission pending", () => {
    expect(checkpointLabel(CHECK_1)).toBe("Present");
    expect(
      checkpointLabel({
        ...CHECK_2,
        status: null,
        permissionPending: true,
      }),
    ).toBe("Permission Pending");
  });
});

describe("late arrival eligibility", () => {
  const savedAbsent = {
    ...BASE_RECORD,
    status: "Absent" as const,
    checkpoints: [{ ...CHECK_1, status: "Absent" as const }],
  };

  test("requires saved Absent Check 1 and a currently absent enrolled student", () => {
    expect(isLateArrivalCandidate(savedAbsent)).toBe(true);
    expect(isLateArrivalCandidate({ ...savedAbsent, checkpoints: [] })).toBe(false);
    expect(isLateArrivalCandidate({ ...savedAbsent, status: "Present" })).toBe(false);
    expect(isLateArrivalCandidate({ ...savedAbsent, status: "Late" })).toBe(false);
    expect(isLateArrivalCandidate({ ...savedAbsent, status: "Excused" })).toBe(false);
    expect(isLateArrivalCandidate({ ...savedAbsent, permissionPending: true })).toBe(false);
    expect(isLateArrivalCandidate({ ...savedAbsent, recheckEligible: false })).toBe(false);
  });

  test("never offers a duplicate or inferred late arrival", () => {
    expect(isLateArrivalCandidate({
      ...savedAbsent,
      checkpoints: [...savedAbsent.checkpoints, { ...CHECK_2, status: "Late" }],
    })).toBe(false);
    expect(isLateArrivalCandidate({
      ...savedAbsent,
      checkpoints: [{ ...CHECK_1, status: "Present" }],
    })).toBe(false);
    expect(isLateArrivalCandidate({
      ...savedAbsent,
      checkpoints: [{ ...CHECK_1, status: null, permissionPending: true }],
    })).toBe(false);
  });
});
