import { describe, expect, test } from "bun:test";
import type { CanonicalSectionRosterRef } from "@dse-pms/shared-types";
import { buildRosterSyncPreview } from "./roster-sync-service.ts";

const roster: CanonicalSectionRosterRef = {
  sectionId: "11111111-1111-4111-8111-111111111111",
  cohortId: "22222222-2222-4222-8222-222222222222",
  programmeId: "dse",
  code: "M1",
  name: "Morning 1",
  active: true,
  students: [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Student A", studentId: "001" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Student B", studentId: "002" },
  ],
};

const input = {
  sectionId: roster.sectionId,
  term: "2026-2027-S1",
  programmeYear: 3,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    term: input.term,
    programmeYear: 3,
    sectionCode: "M1",
    capacity: 45,
    status: "Active" as const,
    course: { id: "44444444-4444-4444-8444-444444444444", code: "TSA301", title: "Time Series Analysis" },
    enrollments: [{ studentId: roster.students[0]!.id }],
    ...overrides,
  };
}

describe("canonical roster sync planner", () => {
  test("finds missing canonical students without deleting current enrollment", () => {
    const preview = buildRosterSyncPreview(roster, input, [row()]);
    expect(preview.canApply).toBe(true);
    expect(preview.missingEnrollmentCount).toBe(1);
    expect(preview.offerings[0]!.state).toBe("needs_sync");
    expect(preview.offerings[0]!.missingStudents.map((student) => student.studentId)).toEqual(["002"]);
  });

  test("is idempotently synced when the offering already matches", () => {
    const preview = buildRosterSyncPreview(roster, input, [
      row({ enrollments: roster.students.map((student) => ({ studentId: student.id })) }),
    ]);
    expect(preview.canApply).toBe(true);
    expect(preview.missingEnrollmentCount).toBe(0);
    expect(preview.offerings[0]!.state).toBe("synced");
  });

  test("blocks an unexpected extra enrollment instead of silently removing it", () => {
    const preview = buildRosterSyncPreview(roster, input, [
      row({
        enrollments: [
          ...roster.students.map((student) => ({ studentId: student.id })),
          { studentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
        ],
      }),
    ]);
    expect(preview.canApply).toBe(false);
    expect(preview.blockedOfferingCount).toBe(1);
    expect(preview.offerings[0]!.state).toBe("blocked");
    expect(preview.offerings[0]!.unexpectedExtraStudents).toHaveLength(1);
  });

  test("blocks capacity overflow", () => {
    const preview = buildRosterSyncPreview(roster, input, [row({ capacity: 1 })]);
    expect(preview.canApply).toBe(false);
    expect(preview.offerings[0]!.blockedReason).toContain("capacity");
  });

  test("never makes a completed offering mutable", () => {
    const preview = buildRosterSyncPreview(roster, input, [row({ status: "Completed" as const })]);
    expect(preview.canApply).toBe(false);
    expect(preview.historicalOfferingCount).toBe(1);
    expect(preview.offerings[0]!.state).toBe("historical");
  });
});
