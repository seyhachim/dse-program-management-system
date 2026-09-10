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

  test("email-keyed provisional student is accepted as Pending", async () => {
    const store = new MemoryStore();
    const document = manifest([{ sourceRef: "G5/M1/row-2", cohortCode: "DSE-G5", studentId: null, name: "Pending Student", email: "pending@rupp.edu.kh", status: "Pending" }]);
    const plan = await planStudentRosterImport(store, document);
    expect(plan.students[0]?.action).toBe("would_create");
    expect(plan.students[0]?.blockers).toEqual([]);
    expect(store.writes).toBe(0);
  });

  test("provisional creation requires institutional email and Pending status", () => {
    expect(() => manifest([{ sourceRef: "G5/M1/row-2", cohortCode: "DSE-G5", studentId: null, name: "Missing Email", email: null, status: "Pending" }])).toThrow();
    expect(() => manifest([{ sourceRef: "G5/M1/row-3", cohortCode: "DSE-G5", studentId: null, name: "Not Pending", email: "active@rupp.edu.kh", status: "Active" }])).toThrow();
  });

  test("official ID attaches to the same provisional Student resolved by email", async () => {
    const store = new MemoryStore();
    store.cohort = { id: "cohort-1", programmeId: "dse", code: "DSE-G5", name: "DSE Generation 5", intakeYear: 2025, expectedGraduationYear: 2029, status: "Active" };
    store.students.set("provisional", { id: "student-1", studentId: null, name: "Pending Student", email: "pending@rupp.edu.kh", status: "Pending", userId: null, profile: null });
    store.memberships.set("student-1", [{ id: "membership-1", cohortId: "cohort-1", joinedAt: new Date("2025-11-01T00:00:00.000Z"), exitedAt: null, cohort: { id: "cohort-1", code: "DSE-G5", programmeId: "dse" } }]);
    const plan = await planStudentRosterImport(store, manifest([{ sourceRef: "G5/M1/row-2", cohortCode: "DSE-G5", studentId: "RUPP-001", name: "Pending Student", email: "pending@rupp.edu.kh", status: "Pending" }]));
    expect(plan.students[0]?.existingStudentRecordId).toBe("student-1");
    expect(plan.students[0]?.studentIdPatch).toBe("RUPP-001");
    expect(plan.students[0]?.action).toBe("would_update");
  });

  test("email and official ID resolving to different students fails closed", async () => {
    const store = new MemoryStore();
    store.students.set("RUPP-001", { id: "student-1", studentId: "RUPP-001", name: "One", email: "one@rupp.edu.kh", status: "Active", userId: null, profile: null });
    store.students.set("RUPP-002", { id: "student-2", studentId: "RUPP-002", name: "Two", email: "two@rupp.edu.kh", status: "Active", userId: null, profile: null });
    const plan = await planStudentRosterImport(store, manifest([{ sourceRef: "G5/M1/row-2", cohortCode: "DSE-G5", studentId: "RUPP-001", name: "One", email: "two@rupp.edu.kh", status: "Active" }]));
    expect(plan.students[0]?.action).toBe("blocked");
    expect(plan.students[0]?.blockers.join(" ")).toContain("resolve to different Student records");
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
