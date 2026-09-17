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
      "}, [attendanceContext, date, offeringId, session, draftKey]);",
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

  test("uses an authenticated scoped key and restores only against an unchanged server baseline", () => {
    expect(attendanceClientSource).toContain("attendanceDraftKey(me.id, offeringId, date)");
    expect(attendanceClientSource).toContain("readAttendanceDraft(window.localStorage, draftKey, session.updatedAt ?? null, serverRecords)");
    expect(attendanceClientSource).toContain("writeAttendanceDraft(");
    expect(attendanceClientSource).toContain("baselineVersionRef.current !== (session.updatedAt ?? null)");
    expect(attendanceClientSource).toContain("clearAttendanceDraft(window.localStorage, draftKey)");
  });

  test("failed saves remain editable and errors are passed to Roll Call", () => {
    expect(attendanceClientSource).toContain("saveError={mutationError}");
    expect(attendanceClientSource).toContain("if (!saved) return;");
    expect(attendanceClientSource).toContain("setMutationError(null);");
  });
});


describe("Attendance version-safe save", () => {
  test("sends the hydrated server version, checks refreshed cache and preserves local marks on conflict", () => {
    expect(attendanceClientSource).toContain("currentSession.updatedAt !== baselineVersionRef.current");
    expect(attendanceClientSource).toContain("expectedUpdatedAt: baselineVersionRef.current");
    expect(attendanceClientSource).toContain("err.status === 409");
    expect(attendanceClientSource).toContain("if (!saved) return;");
  });
});
