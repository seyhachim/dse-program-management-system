import { describe, expect, test } from "bun:test";
import type { AttendanceRecordView } from "@dse-pms/shared-types";
import {
  attendanceRecordsEqual,
  cloneAttendanceRecords,
  getAttendanceCounts,
  getNextIndex,
  getPreviousIndex,
  getSkipFeedback,
  getTeachingWeek,
  getUnmarkedStudentIds,
  markAttendanceStatus,
  toSaveAttendanceRecords,
  updateAttendanceRecord,
} from "./roll-call-state";

const records: AttendanceRecordView[] = [
  {
    studentId: "11111111-1111-1111-1111-111111111111",
    studentNumber: "DSE001",
    studentName: "Student One",
    status: "Present",
    permissionPending: false,
    permissionPendingSince: null,
    note: "",
  },
  {
    studentId: "22222222-2222-2222-2222-222222222222",
    studentNumber: "DSE002",
    studentName: "Student Two",
    status: null,
    permissionPending: false,
    permissionPendingSince: null,
    note: "  follow up  ",
  },
  {
    studentId: "33333333-3333-3333-3333-333333333333",
    studentNumber: "DSE003",
    studentName: "Student Three",
    status: "Late",
    permissionPending: false,
    permissionPendingSince: null,
    note: "traffic",
  },
];

describe("roll call counts and status", () => {
  test("counts finalized, pending, and unmarked separately", () => {
    const withPending = updateAttendanceRecord(records, records[1]!.studentId, {
      permissionPending: true,
    });
    expect(getAttendanceCounts(withPending)).toEqual({
      Present: 1,
      Absent: 0,
      Late: 1,
      Excused: 0,
      PermissionPending: 1,
      Unmarked: 0,
      Total: 3,
    });
  });

  test("final status selection clears Permission Pending", () => {
    const pending = updateAttendanceRecord(records, records[1]!.studentId, { permissionPending: true });
    const next = markAttendanceStatus(pending, records[1]!.studentId, "Excused");
    expect(next[1]!.status).toBe("Excused");
    expect(next[1]!.permissionPending).toBe(false);
  });

  test("skip leaves an unmarked record unmarked by making no status mutation", () => {
    const skipped = cloneAttendanceRecords(records);
    expect(skipped[1]!.status).toBeNull();
    expect(getUnmarkedStudentIds(skipped)).toEqual([records[1]!.studentId]);
    expect(getSkipFeedback(skipped[1]!)).toBe("Student Two skipped and left Unmarked.");
  });

  test("pending permission is not treated as unmarked", () => {
    const pending = updateAttendanceRecord(records, records[1]!.studentId, { permissionPending: true });
    expect(getUnmarkedStudentIds(pending)).toEqual([]);
    expect(getSkipFeedback(pending[1]!)).toBe("Student Two skipped; existing Permission Pending kept.");
  });
});

describe("roll call navigation", () => {
  test("next and previous clamp to the roster bounds", () => {
    expect(getNextIndex(0, 3)).toBe(1);
    expect(getNextIndex(2, 3)).toBe(2);
    expect(getPreviousIndex(2, 3)).toBe(1);
    expect(getPreviousIndex(0, 3)).toBe(0);
  });
});

describe("session context", () => {
  test("derives week 1 and week 5 from the offering start date", () => {
    expect(getTeachingWeek("2026-07-20", "2026-10-20", "2026-07-20")).toBe(1);
    expect(getTeachingWeek("2026-07-20", "2026-10-20", "2026-08-17")).toBe(5);
  });

  test("returns no week outside or without the teaching period", () => {
    expect(getTeachingWeek(null, null, "2026-08-17")).toBeNull();
    expect(getTeachingWeek("2026-07-20", "2026-10-20", "2026-07-19")).toBeNull();
    expect(getTeachingWeek("2026-07-20", "2026-08-16", "2026-08-17")).toBeNull();
  });
});

describe("save flow", () => {
  test("preserves finalized marks and omits unmarked students from the PUT payload", () => {
    expect(toSaveAttendanceRecords(records)).toEqual([
      {
        studentId: records[0]!.studentId,
        status: "Present",
        permissionPending: false,
        note: "",
      },
      {
        studentId: records[2]!.studentId,
        status: "Late",
        permissionPending: false,
        note: "traffic",
      },
    ]);
  });

  test("includes Permission Pending without inventing a finalized status", () => {
    const pending = updateAttendanceRecord(records, records[1]!.studentId, {
      status: null,
      permissionPending: true,
    });
    expect(toSaveAttendanceRecords(pending)[1]).toEqual({
      studentId: records[1]!.studentId,
      status: null,
      permissionPending: true,
      note: "follow up",
    });
  });

  test("cloning a reopened register preserves pending state", () => {
    const pending = updateAttendanceRecord(records, records[1]!.studentId, { permissionPending: true });
    const reopened = cloneAttendanceRecords(pending);
    expect(attendanceRecordsEqual(reopened, pending)).toBe(true);
    reopened[1] = { ...reopened[1]!, permissionPending: false };
    expect(attendanceRecordsEqual(reopened, pending)).toBe(false);
  });
});
