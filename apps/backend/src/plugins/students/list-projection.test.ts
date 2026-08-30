import { describe, expect, test } from "bun:test";
import { STUDENT_LIST_SELECT, STUDENT_REF_SELECT } from "./service.ts";

function selectedKeys(select: Record<string, boolean>): string[] {
  return Object.entries(select)
    .filter(([, selected]) => selected)
    .map(([key]) => key)
    .sort();
}

describe("student compact projections", () => {
  test("interactive list selects only fields rendered by the roster contract", () => {
    expect(selectedKeys(STUDENT_LIST_SELECT)).toEqual([
      "createdAt",
      "email",
      "id",
      "name",
      "status",
      "studentId",
    ]);
    expect("profile" in STUDENT_LIST_SELECT).toBe(false);
    expect("userId" in STUDENT_LIST_SELECT).toBe(false);
    expect("updatedAt" in STUDENT_LIST_SELECT).toBe(false);
  });

  test("cross-plugin StudentRef projection excludes profile and account-only fields", () => {
    expect(selectedKeys(STUDENT_REF_SELECT)).toEqual([
      "email",
      "id",
      "name",
      "status",
      "studentId",
    ]);
    expect("profile" in STUDENT_REF_SELECT).toBe(false);
    expect("userId" in STUDENT_REF_SELECT).toBe(false);
    expect("createdAt" in STUDENT_REF_SELECT).toBe(false);
  });

  test("representative list serialization is materially smaller without profile hydration", () => {
    const legacy = {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      name: "Sample Student",
      email: "student@example.edu",
      studentId: "DSE2026001",
      status: "Active",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      profile: {
        id: "33333333-3333-4333-8333-333333333333",
        studentRecordId: "11111111-1111-4111-8111-111111111111",
        khmerFamilyName: "Sample",
        khmerGivenName: "Student",
        latinFamilyName: "SAMPLE",
        latinGivenName: "STUDENT",
        gender: "Male",
        createdAt: "2026-08-30T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
      },
    };
    const compact = {
      id: legacy.id,
      name: legacy.name,
      email: legacy.email,
      studentId: legacy.studentId,
      status: legacy.status,
      createdAt: legacy.createdAt,
    };

    const legacyBytes = Buffer.byteLength(JSON.stringify(legacy));
    const compactBytes = Buffer.byteLength(JSON.stringify(compact));

    expect(legacyBytes).toBe(583);
    expect(compactBytes).toBe(181);
    expect(compactBytes).toBeLessThan(legacyBytes * 0.4);
  });
});
