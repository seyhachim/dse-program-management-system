import { describe, expect, test } from "bun:test";
import { safePermissionDocuments } from "./permission-documents";

describe("Permission letter API fallback", () => {
  test("unavailable or unexpectedly shaped evidence does not crash attendance", () => {
    expect(safePermissionDocuments(null)).toEqual([]);
    expect(safePermissionDocuments({ error: "Not available" })).toEqual([]);
    expect(safePermissionDocuments({ data: [] })).toEqual([]);
    expect(safePermissionDocuments("Bad response")).toEqual([]);
  });

  test("retains only safe letter summaries from a mixed response", () => {
    const ok = {
      id: "document-id", studentId: "student-id", filename: "letter.pdf",
      mimeType: "application/pdf", sizeBytes: 1024, submittedAt: "2026-11-18T00:00:00.000Z",
    };
    expect(safePermissionDocuments([null, {}, ok, { studentId: "other" }])).toEqual([ok]);
  });
});
