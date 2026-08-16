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
} from "./roll-call-state";

const records: AttendanceRecordView[] = [
  {
    studentId: "11111111-1111-1111-1111-111111111111",
    studentNumber: "DSE001",
    studentName: "Student One",
    status: "Present",
    note: "",
  },
  {
    studentId: "22222222-2222-2222-2222-222222222222",
    studentNumber: "DSE002",
    studentName: "Student Two",
    status: null,
    note: "  follow up  ",
  },
  {
    studentId: "33333333-3333-3333-3333-333333333333",
    studentNumber: "DSE003",
    studentName: "Student Three",
    status: "Late",
    note: "traffic",
  },
];

describe("roll call counts and status", () => {
  test("counts persisted statuses and unmarked separately", () => {
    expect(getAttendanceCounts(records)).toEqual({
      Present: 1,
      Absent: 0,
      Late: 1,
      Excused: 0,
      Unmarked: 1,
      Total: 3,
    });
  });

  test("status selection updates only the selected student", () => {
    const next = markAttendanceStatus(records, records[1]!.studentId, "Excused");
    expect(next[0]!.status).toBe("Present");
    expect(next[1]!.status).toBe("Excused");
    expect(next[2]!.status).toBe("Late");
  });

  test("skip leaves an unmarked record unmarked by making no status mutation", () => {
    const skipped = cloneAttendanceRecords(records);
    expect(skipped[1]!.status).toBeNull();
    expect(getUnmarkedStudentIds(skipped)).toEqual([records[1]!.studentId]);
    expect(getSkipFeedback(skipped[1]!)).toBe("Student Two skipped and left Unmarked.");
  });

  test("skip preserves a reopened saved status for historical-session compatibility", () => {
    const reopenedHistorical = cloneAttendanceRecords(records);
    expect(reopenedHistorical[0]!.status).toBe("Present");
    expect(getSkipFeedback(reopenedHistorical[0]!)).toBe("Student One skipped; existing Present status kept.");
    expect(reopenedHistorical[0]!.status).toBe("Present");
  });
});

describe("roll call navigation", () => {
  test("next and previous clamp to the roster bounds", () => {
    expect(getNextIndex(0, 3)).toBe(1);
    expect(getNextIndex(2, 3)).toBe(2);
    expect(getPreviousIndex(2, 3)).toBe(1);
    expect(getPreviousIndex(0, 3)).toBe(0);
  });

  test("unmarked review includes only skipped or untouched students", () => {
    expect(getUnmarkedStudentIds(records)).toEqual([records[1]!.studentId]);
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

describe("existing save flow", () => {
  test("preserves existing marks and omits unmarked students from the PUT payload", () => {
    expect(toSaveAttendanceRecords(records)).toEqual([
      {
        studentId: records[0]!.studentId,
        status: "Present",
        note: "",
      },
      {
        studentId: records[2]!.studentId,
        status: "Late",
        note: "traffic",
      },
    ]);
  });

  test("cloning a reopened register preserves its saved values", () => {
    const reopened = cloneAttendanceRecords(records);
    expect(attendanceRecordsEqual(reopened, records)).toBe(true);
    reopened[0] = { ...reopened[0]!, status: "Absent" };
    expect(records[0]!.status).toBe("Present");
    expect(attendanceRecordsEqual(reopened, records)).toBe(false);
  });
});
