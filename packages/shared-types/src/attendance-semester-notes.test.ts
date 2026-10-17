import { describe, expect, test } from "bun:test";
import { SaveStudentSemesterNoteInput } from "./attendance";

describe("Offering student semester note validation", () => {
  test("accepts explicit clear and optimistic create version", () => {
    expect(SaveStudentSemesterNoteInput.parse({ note: "", expectedVersion: 0 })).toEqual({
      note: "", expectedVersion: 0,
    });
  });

  test("trims lecturer observations without changing status data", () => {
    expect(SaveStudentSemesterNoteInput.parse({ note: "  Follow up in tutorial  ", expectedVersion: 3 }))
      .toEqual({ note: "Follow up in tutorial", expectedVersion: 3 });
  });

  test("rejects oversized notes, invalid versions, and undeclared attendance changes", () => {
    expect(SaveStudentSemesterNoteInput.safeParse({ note: "x".repeat(1001), expectedVersion: 0 }).success).toBe(false);
    expect(SaveStudentSemesterNoteInput.safeParse({ note: "ok", expectedVersion: -1 }).success).toBe(false);
    expect(SaveStudentSemesterNoteInput.safeParse({ note: "ok", expectedVersion: 2.1 }).success).toBe(false);
    expect(SaveStudentSemesterNoteInput.safeParse({
      note: "ok", expectedVersion: 0, status: "Absent",
    }).success).toBe(false);
  });
});
