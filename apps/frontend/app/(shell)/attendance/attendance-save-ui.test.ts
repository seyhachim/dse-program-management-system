import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const attendanceClientSource = readFileSync(
  new URL("./attendance-client.tsx", import.meta.url),
  "utf8",
);

describe("Attendance save UX", () => {
  test("blocks an all-Unmarked save from the register", () => {
    expect(attendanceClientSource).toContain(
      "const canSaveAttendance = hasAttendanceObservation(records);",
    );
    expect(attendanceClientSource).toContain("!canSaveAttendance");
    expect(attendanceClientSource).toContain(
      "Mark at least one student before saving attendance.",
    );
  });

  test("successful save feedback reports marked and unmarked counts", () => {
    expect(attendanceClientSource).toContain(
      "const markedCount = savedCounts.Total - savedCounts.Unmarked;",
    );
    expect(attendanceClientSource).toContain(
      "${markedCount} marked, ${savedCounts.Unmarked} unmarked.",
    );
  });
});
