import { describe, expect, test } from "bun:test";
import type { AttendanceRecordView } from "@dse-pms/shared-types";
import {
  attendanceDraftKey, clearAttendanceDraft, readAttendanceDraft, writeAttendanceDraft,
} from "./attendance-draft";

function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    map,
  };
}

const original = [
  { studentId: "internal-student-1", studentNumber: "OFFICIAL-01", studentName: "Private Student", studentKhmerName: "សិស្ស", status: null, permissionPending: false, permissionPendingSince: null, note: "" },
  { studentId: "internal-student-2", studentNumber: null, studentName: "Another Student", status: "Present", permissionPending: false, permissionPendingSince: null, note: "" },
] as AttendanceRecordView[];
const key = attendanceDraftKey("lecturer-1", "offering-A", "2026-09-15");
const updatedAt = "2026-09-15T12:00:00.000Z";

describe("attendance local draft", () => {
  test("scopes drafts to the exact user, offering, and date", () => {
    const store = storage();
    const changes = original.map((record) => record.studentId === "internal-student-1" ? { ...record, status: "Late" as const } : record);
    expect(writeAttendanceDraft(store, key, updatedAt, original, changes)).toBe(true);
    expect(readAttendanceDraft(store, key, updatedAt, original)?.[0]?.status).toBe("Late");
    for (const otherKey of [
      attendanceDraftKey("lecturer-2", "offering-A", "2026-09-15"),
      attendanceDraftKey("lecturer-1", "offering-B", "2026-09-15"),
      attendanceDraftKey("lecturer-1", "offering-A", "2026-09-16"),
    ]) expect(readAttendanceDraft(store, otherKey, updatedAt, original)).toBeNull();
  });

  test("persists only changed internal IDs and editable fields, never private roster or query payloads", () => {
    const store = storage();
    const changes = original.map((record) => record.studentId === "internal-student-1" ? { ...record, permissionPending: true, note: "letter to follow" } : record);
    writeAttendanceDraft(store, key, null, original, changes);
    const persisted = store.map.get(key)!;
    expect(persisted).toContain("internal-student-1");
    expect(persisted).not.toContain("internal-student-2");
    expect(persisted).not.toContain("Private Student");
    expect(persisted).not.toContain("OFFICIAL-01");
    expect(persisted).not.toContain("សិស្ស");
    expect(readAttendanceDraft(store, key, null, original)?.[0]?.permissionPending).toBe(true);
  });

  test("rejects and removes stale server version, changed baseline, malformed and unknown students", () => {
    const store = storage();
    const changes = original.map((record) => ({ ...record, note: "updated locally" }));
    writeAttendanceDraft(store, key, updatedAt, original, changes);
    expect(readAttendanceDraft(store, key, "2026-09-15T12:01:00.000Z", original)).toBeNull();
    expect(store.map.has(key)).toBe(false);
    writeAttendanceDraft(store, key, updatedAt, original, changes);
    expect(readAttendanceDraft(store, key, updatedAt, [{ ...original[0]!, status: "Absent" }, original[1]!])).toBeNull();
    store.setItem(key, "{invalid JSON");
    expect(readAttendanceDraft(store, key, updatedAt, original)).toBeNull();
    writeAttendanceDraft(store, key, updatedAt, original, changes);
    const payload = JSON.parse(store.getItem(key)!);
    payload.marks[0].studentId = "unrecognized";
    store.setItem(key, JSON.stringify(payload));
    expect(readAttendanceDraft(store, key, updatedAt, original)).toBeNull();
  });

  test("clears after saved-equivalent records or explicit successful save", () => {
    const store = storage();
    const changes = original.map((record) => ({ ...record, note: "draft" }));
    writeAttendanceDraft(store, key, updatedAt, original, changes);
    expect(writeAttendanceDraft(store, key, updatedAt, original, original)).toBe(true);
    expect(store.getItem(key)).toBeNull();
    writeAttendanceDraft(store, key, updatedAt, original, changes);
    clearAttendanceDraft(store, key);
    expect(store.getItem(key)).toBeNull();
  });

  test("storage unavailable fails safely without corrupting the canonical register", () => {
    const unavailable = { getItem: (_: string): string | null => { throw Error("blocked"); }, setItem: (_: string, __: string): void => { throw Error("blocked"); }, removeItem: (_: string): void => { throw Error("blocked"); } };
    expect(writeAttendanceDraft(unavailable, key, updatedAt, original, original.map((record) => ({ ...record, note: "unsaved" })))).toBe(false);
    expect(readAttendanceDraft(unavailable, key, updatedAt, original)).toBeNull();
    expect(() => clearAttendanceDraft(unavailable, key)).not.toThrow();
  });
});
