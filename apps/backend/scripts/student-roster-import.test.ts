import { describe, expect, test } from "bun:test";
import {
  applyStudentRosterImportPlan,
  dryRunStudentRosterImport,
  parseStudentRosterImportDocument,
  planStudentRosterImport,
  StudentRosterImportBlockedError,
  type ExistingRosterCohort,
  type ExistingRosterMembership,
  type ExistingRosterStudent,
  type StudentRosterImportStore,
} from "./student-roster-import.ts";

function manifest(students: Array<Record<string, unknown>>) {
  return parseStudentRosterImportDocument({
    schemaVersion: 1,
    source: "test-roster.xlsx",
    programmeId: "dse",
    importMode: "one-time-upsert",
    cohorts: [
      {
        code: "DSE-G5",
        name: "DSE Generation 5",
        intakeYear: 2025,
        expectedGraduationYear: 2029,
        joinedAt: "2025-11-01",
        status: "Active",
      },
    ],
    students,
  });
}

class MemoryStore implements StudentRosterImportStore {
  programme = true;
  cohort: ExistingRosterCohort | null = null;
  students = new Map<string, ExistingRosterStudent>();
  memberships = new Map<string, ExistingRosterMembership[]>();
  writes = 0;

  async programmeExists() { return this.programme; }
  async findCohort() { return this.cohort; }
  async findStudentByStudentId(studentId: string) { return this.students.get(studentId) ?? null; }
  async findStudentsByEmail(email: string) {
    return [...this.students.values()].filter(
      (student) => student.email?.toLowerCase() === email.toLowerCase(),
    );
  }
  async findMembershipsForStudent(studentRecordId: string) {
    return this.memberships.get(studentRecordId) ?? [];
  }
  async createCohort() { this.writes += 1; return { id: "new-cohort" }; }
  async createStudent() { this.writes += 1; return { id: "new-student" }; }
  async fillStudentMissingFields() { this.writes += 1; }
  async createMembership() { this.writes += 1; }
}

describe("student roster importer", () => {
  test("dry-run plans a new roster without writing", async () => {
    const store = new MemoryStore();
    const document = manifest([
      {
        sourceRef: "G5/M1/row-2",
        cohortCode: "DSE-G5",
        studentId: "RUPP-001",
        name: "Seng Kimhour",
        email: "",
        profile: { latinFamilyName: "Seng", latinGivenName: "Kimhour" },
      },
    ]);

    const summary = await dryRunStudentRosterImport(store, document);
    expect(summary.mode).toBe("dry-run");
    expect(summary.wouldCreate).toBe(1);
    expect(summary.cohortsToCreate).toBe(1);
    expect(summary.blocked).toBe(0);
    expect(store.writes).toBe(0);
  });

  test("missing official studentId blocks the whole apply before any write", async () => {
    const store = new MemoryStore();
    const document = manifest([
      {
        sourceRef: "G5/M1/row-2",
        cohortCode: "DSE-G5",
        studentId: "RUPP-001",
        name: "Valid Student",
      },
      {
        sourceRef: "G5/M1/row-3",
        cohortCode: "DSE-G5",
        studentId: null,
        name: "Missing ID Student",
      },
    ]);
    const plan = await planStudentRosterImport(store, document);

    expect(plan.students[1]?.action).toBe("blocked");
    expect(plan.students[1]?.blockers.join(" ")).toContain("Official studentId is missing");
    expect(() => applyStudentRosterImportPlan(store, plan)).toThrow(StudentRosterImportBlockedError);
    expect(store.writes).toBe(0);
  });

  test("fills only missing email/profile data and blocks an identity conflict", async () => {
    const store = new MemoryStore();
    store.cohort = {
      id: "cohort-1",
      programmeId: "dse",
      code: "DSE-G5",
      name: "DSE Generation 5",
      intakeYear: 2025,
      expectedGraduationYear: 2029,
      status: "Active",
    };
    store.students.set("RUPP-001", {
      id: "student-1",
      studentId: "RUPP-001",
      name: "Seng Kimhour",
      email: null,
      status: "Active",
      userId: null,
      profile: null,
    });
    store.memberships.set("student-1", [
      {
        id: "membership-1",
        cohortId: "cohort-1",
        joinedAt: new Date("2025-11-01T00:00:00.000Z"),
        exitedAt: null,
        cohort: { id: "cohort-1", code: "DSE-G5", programmeId: "dse" },
      },
    ]);

    const fillPlan = await planStudentRosterImport(
      store,
      manifest([
        {
          sourceRef: "G5/M1/row-2",
          cohortCode: "DSE-G5",
          studentId: "RUPP-001",
          name: "Seng Kimhour",
          email: "kimhour@example.edu",
          profile: { latinFamilyName: "Seng", latinGivenName: "Kimhour" },
        },
      ]),
    );
    expect(fillPlan.students[0]?.action).toBe("would_update");
    expect(fillPlan.students[0]?.emailPatch).toBe("kimhour@example.edu");
    expect(fillPlan.students[0]?.profilePatch).toEqual({
      latinFamilyName: "Seng",
      latinGivenName: "Kimhour",
    });

    store.students.set("RUPP-OTHER", {
      id: "student-other",
      studentId: "RUPP-OTHER",
      name: "Other Student",
      email: "conflict@example.edu",
      status: "Active",
      userId: null,
      profile: null,
    });
    const conflictPlan = await planStudentRosterImport(
      store,
      manifest([
        {
          sourceRef: "G5/M1/row-4",
          cohortCode: "DSE-G5",
          studentId: "RUPP-NEW",
          name: "New Student",
          email: "conflict@example.edu",
        },
      ]),
    );
    expect(conflictPlan.students[0]?.action).toBe("blocked");
    expect(conflictPlan.students[0]?.blockers.join(" ")).toContain("already belongs to studentId");
  });
});
