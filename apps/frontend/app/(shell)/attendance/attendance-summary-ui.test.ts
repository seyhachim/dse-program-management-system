import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const summary = readFileSync(new URL("./attendance-summary.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("./attendance-client.tsx", import.meta.url), "utf8");

describe("Attendance classroom layout", () => {
  test("compact summary preserves all six distinct attendance counts", () => {
    for (const key of ["Present", "Absent", "Late", "Excused", "PermissionPending", "Unmarked"]) {
      expect(summary).toContain(`key: "${key}"`);
    }
    expect(summary).toContain("counts.Total - counts.Unmarked");
    expect(summary).toContain('role="progressbar"');
    expect(summary).toContain("hasUnsavedChanges ? \"Unsaved changes\"");
  });

  test("the prominent class action reuses the existing confirmation-gated Roll Call", () => {
    expect(client).toContain("<AttendanceSummary counts={counts}");
    expect(client).toContain("<Play className=\"h-4 w-4\" />Start Roll Call");
    expect(client).toContain("onClick={startRollCall}");
    expect(client).toContain("<RollCallDialog open={rollCallOpen}");
  });

  test("the compact register retains bilingual names, pending ID, status, notes and recheck", () => {
    expect(client).toContain("record.studentKhmerName");
    expect(client).toContain("record.studentName");
    expect(client).toContain('record.studentNumber ?? "Pending ID"');
    expect(client).toContain("setRecordMark(record.studentId");
    expect(client).toContain("note: event.target.value");
    expect(client).toContain("<RecheckAction record={record}");
    expect(client).toContain("<StudentRecheckDialog open={Boolean(recheckRecord)}");
  });
});
