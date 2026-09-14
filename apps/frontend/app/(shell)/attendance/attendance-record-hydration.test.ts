import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const attendanceClientSource = readFileSync(
  new URL("./attendance-client.tsx", import.meta.url),
  "utf8",
);

describe("Attendance local record hydration", () => {
  test("server hydration reads the latest local register without subscribing to local record changes", () => {
    expect(attendanceClientSource).toContain("setRecords((current) => {");
    expect(attendanceClientSource).toContain(
      "const dirty = !attendanceRecordsEqual(current, baselineRecordsRef.current);",
    );
    expect(attendanceClientSource).toContain("if (dirty) return current;");
    expect(attendanceClientSource).toContain(
      "}, [attendanceContext, date, offeringId, session]);",
    );
    expect(attendanceClientSource).not.toContain(
      "}, [attendanceContext, date, offeringId, records, session]);",
    );
  });

  test("roll call still writes through the authoritative parent register", () => {
    expect(attendanceClientSource).toContain(
      "setRecords((current) => updateAttendanceRecord(current, studentId, patch));",
    );
    expect(attendanceClientSource).toContain("records={records}");
    expect(attendanceClientSource).toContain("onUpdateRecord={updateRecord}");
  });
});
