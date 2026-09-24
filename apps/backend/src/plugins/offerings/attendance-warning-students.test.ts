import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import type { SaveAttendanceInput } from "@dse-pms/shared-types";
import { attendanceWarningStudentIds } from "./attendance-warning-students.ts";

function record(
  studentId: string,
  status: SaveAttendanceInput["records"][number]["status"],
  permissionPending = false,
): SaveAttendanceInput["records"][number] {
  return { studentId, status, permissionPending, note: "" };
}

describe("attendance warning student selection", () => {
  test("skips Present and Permission Pending because neither can create a warning", () => {
    expect(
      attendanceWarningStudentIds([
        record("present", "Present"),
        record("pending", null, true),
      ]),
    ).toEqual([]);
  });

  test("keeps warning-relevant statuses and deduplicates student ids", () => {
    expect(
      attendanceWarningStudentIds([
        record("late", "Late"),
        record("absent", "Absent"),
        record("excused", "Excused"),
        record("late", "Late"),
        record("present", "Present"),
      ]),
    ).toEqual(["late", "absent", "excused"]);
  });

  test("attendance save wires one batched warning-history read into post-save notification work", () => {
    const source = readFileSync(new URL("./attendance-service.ts", import.meta.url), "utf8");
    expect(source).toContain("attendanceWarningStudentIds(input.records)");
    expect(source).toContain("warningHealthForStudents(");
    expect(source).not.toContain("await studentAttendanceHistoryService.healthForStudent(studentId, offeringId)");
  });
});
