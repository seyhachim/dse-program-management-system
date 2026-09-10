import { describe, expect, test } from "bun:test";
import {
  applyStudentClassEnrollmentImportPlan,
  dryRunStudentClassEnrollmentImport,
  parseStudentClassEnrollmentImportDocument,
  planStudentClassEnrollmentImport,
  StudentClassEnrollmentImportBlockedError,
  type ExistingClassEnrollment,
  type ExistingClassEnrollmentCohort,
  type ExistingClassEnrollmentMembership,
  type ExistingClassEnrollmentStudent,
  type StudentClassEnrollmentImportStore,
  type TargetClassOffering,
} from "./student-class-enrollment-import.ts";

function document(studentIds: string[] = ["RUPP-001"]) {
  return parseStudentClassEnrollmentImportDocument({
    schemaVersion: 1,
    source: "test-class-roster.json",
    programmeId: "dse",
    term: "2026-2027-S1",
    classes: [
      {
        cohortCode: "DSE-2024",
        programmeYear: 3,
        classCode: " m1 ",
        studentIds,
      },
    ],
  });
}

function offering(
  id: string,
  courseId: string,
  courseCode: string,
  options: Partial<TargetClassOffering> = {},
): TargetClassOffering {
  return {
    id,
    term: "2026-2027-S1",
    programmeYear: 3,
    sectionCode: "M1",
    capacity: 45,
    status: "Planned",
    enrollmentCount: 0,
    course: { id: courseId, code: courseCode, programmeId: "dse" },
    ...options,
  };
}

class MemoryStore implements StudentClassEnrollmentImportStore {
  programme = true;
  cohort: ExistingClassEnrollmentCohort | null = {
    id: "cohort-2024",
    programmeId: "dse",
    code: "DSE-2024",
    status: "Active",
  };
  students = new Map<string, ExistingClassEnrollmentStudent>();
  memberships = new Map<string, ExistingClassEnrollmentMembership[]>();
  offerings: TargetClassOffering[] = [
    offering("offering-tsa", "course-tsa", "TSA301"),
    offering("offering-dss", "course-dss", "DSS301"),
  ];
  enrollments = new Map<string, ExistingClassEnrollment[]>();
  writes: Array<{ offeringId: string; studentRecordId: string }> = [];

  addActiveStudent(studentId: string, recordId = `student-${studentId}`) {
    this.students.set(studentId, {
      id: recordId,
      studentId,
      name: `Student ${studentId}`,
      email: null,
      status: "Active",
    });
    this.memberships.set(recordId, [
      {
        id: `membership-${studentId}`,
        cohortId: "cohort-2024",
        joinedAt: new Date("2024-11-01T00:00:00.000Z"),
        exitedAt: null,
        cohort: { id: "cohort-2024", code: "DSE-2024", programmeId: "dse" },
      },
    ]);
    return recordId;
  }

  async programmeExists() {
    return this.programme;
  }
  async findCohort() {
    return this.cohort;
  }
  async findStudentByStudentId(studentId: string) {
    return this.students.get(studentId) ?? null;
  }
  async findStudentsByEmail(email: string) {
    return [...this.students.values()].filter((student) => student.email?.toLowerCase() === email.toLowerCase());
  }
  async findMembershipsForStudent(studentRecordId: string) {
    return this.memberships.get(studentRecordId) ?? [];
  }
  async findTargetOfferings() {
    return this.offerings;
  }
  async findEnrollmentsForStudent(studentRecordId: string) {
    return this.enrollments.get(studentRecordId) ?? [];
  }
  async createEnrollment(input: { offeringId: string; studentRecordId: string }) {
    this.writes.push(input);
  }
}

function existingEnrollment(target: TargetClassOffering, classCode = target.sectionCode): ExistingClassEnrollment {
  return {
    offeringId: target.id,
    offering: {
      id: target.id,
      term: target.term,
      programmeYear: target.programmeYear,
      sectionCode: classCode,
      course: target.course,
    },
  };
}

describe("student class enrollment importer", () => {
  test("normalizes class code and dry-runs all matching offerings without writes", async () => {
    const store = new MemoryStore();
    store.addActiveStudent("RUPP-001");

    const parsed = document();
    expect(parsed.classes[0]?.classCode).toBe("M1");

    const summary = await dryRunStudentClassEnrollmentImport(store, parsed);
    expect(summary.mode).toBe("dry-run");
    expect(summary.totalStudents).toBe(1);
    expect(summary.targetOfferings).toBe(2);
    expect(summary.wouldCreateEnrollments).toBe(2);
    expect(summary.blockedStudents).toBe(0);
    expect(store.writes).toHaveLength(0);
  });

  test("rejects blank IDs and duplicate student IDs before planning", () => {
    expect(() => document([""])).toThrow("Official student ID is required");
    expect(() =>
      parseStudentClassEnrollmentImportDocument({
        schemaVersion: 1,
        source: "duplicate.json",
        programmeId: "dse",
        term: "2026-2027-S1",
        classes: [
          {
            cohortCode: "DSE-2024",
            programmeYear: 3,
            classCode: "M1",
            studentIds: ["RUPP-001"],
          },
          {
            cohortCode: "DSE-2024",
            programmeYear: 3,
            classCode: "M2",
            studentIds: ["rupp-001"],
          },
        ],
      }),
    ).toThrow("appears more than once");
  });

  test("blocks a student who is missing, inactive, or not an active member of the declared cohort", async () => {
    const missingStore = new MemoryStore();
    const missingPlan = await planStudentClassEnrollmentImport(missingStore, document());
    expect(missingPlan.students[0]?.blockers.join(" ")).toContain("does not exist in PMS");

    const inactiveStore = new MemoryStore();
    const inactiveRecordId = inactiveStore.addActiveStudent("RUPP-001");
    inactiveStore.students.get("RUPP-001")!.status = "Inactive";
    inactiveStore.memberships.set(inactiveRecordId, []);
    const inactivePlan = await planStudentClassEnrollmentImport(inactiveStore, document());
    expect(inactivePlan.students[0]?.blockers.join(" ")).toContain("not Active");
    expect(inactivePlan.students[0]?.blockers.join(" ")).toContain("no active membership");
  });

  test("enrolls a Pending provisional student resolved by institutional email", async () => {
    const store = new MemoryStore();
    const recordId = "student-pending";
    store.students.set("pending-key", {
      id: recordId,
      studentId: null,
      email: "pending@rupp.edu.kh",
      name: "Pending Student",
      status: "Pending",
    });
    store.memberships.set(recordId, [{
      id: "membership-pending",
      cohortId: "cohort-2024",
      joinedAt: new Date("2024-11-01T00:00:00.000Z"),
      exitedAt: null,
      cohort: { id: "cohort-2024", code: "DSE-2024", programmeId: "dse" },
    }]);
    const parsed = parseStudentClassEnrollmentImportDocument({
      schemaVersion: 1,
      source: "pending-email.json",
      programmeId: "dse",
      term: "2026-2027-S1",
      classes: [{
        cohortCode: "DSE-2024",
        programmeYear: 3,
        classCode: "M1",
        studentEmails: [" PENDING@RUPP.EDU.KH "],
      }],
    });
    expect(parsed.classes[0]?.studentEmails).toEqual(["pending@rupp.edu.kh"]);
    const plan = await planStudentClassEnrollmentImport(store, parsed);
    expect(plan.students[0]?.studentId).toBeNull();
    expect(plan.students[0]?.studentEmail).toBe("pending@rupp.edu.kh");
    expect(plan.students[0]?.action).toBe("would_enroll");
    await applyStudentClassEnrollmentImportPlan(store, plan);
    expect(store.writes).toHaveLength(2);
    expect(store.writes.every((write) => write.studentRecordId === recordId)).toBe(true);
  });

  test("rejects duplicate emails and blocks missing or inactive email identities", async () => {
    expect(() => parseStudentClassEnrollmentImportDocument({
      schemaVersion: 1,
      source: "duplicate-email.json",
      programmeId: "dse",
      term: "2026-2027-S1",
      classes: [{ cohortCode: "DSE-2024", programmeYear: 3, classCode: "M1", studentEmails: ["same@rupp.edu.kh", "SAME@RUPP.EDU.KH"] }],
    })).toThrow("appears more than once");

    const missingStore = new MemoryStore();
    const missing = parseStudentClassEnrollmentImportDocument({
      schemaVersion: 1,
      source: "missing-email.json",
      programmeId: "dse",
      term: "2026-2027-S1",
      classes: [{ cohortCode: "DSE-2024", programmeYear: 3, classCode: "M1", studentEmails: ["missing@rupp.edu.kh"] }],
    });
    const missingPlan = await planStudentClassEnrollmentImport(missingStore, missing);
    expect(missingPlan.students[0]?.action).toBe("blocked");
    expect(missingPlan.students[0]?.blockers.join(" ")).toContain("does not exist in PMS");

    const inactiveStore = new MemoryStore();
    inactiveStore.students.set("inactive-key", { id: "student-inactive", studentId: null, email: "inactive@rupp.edu.kh", name: "Inactive", status: "Inactive" });
    inactiveStore.memberships.set("student-inactive", []);
    const inactive = parseStudentClassEnrollmentImportDocument({
      schemaVersion: 1,
      source: "inactive-email.json",
      programmeId: "dse",
      term: "2026-2027-S1",
      classes: [{ cohortCode: "DSE-2024", programmeYear: 3, classCode: "M1", studentEmails: ["inactive@rupp.edu.kh"] }],
    });
    const inactivePlan = await planStudentClassEnrollmentImport(inactiveStore, inactive);
    expect(inactivePlan.students[0]?.blockers.join(" ")).toContain("Inactive");
  });

  test("keeps exact enrollments idempotent and blocks a conflicting parallel class", async () => {
    const store = new MemoryStore();
    const recordId = store.addActiveStudent("RUPP-001");
    store.enrollments.set(recordId, store.offerings.map((target) => existingEnrollment(target)));

    const unchanged = await planStudentClassEnrollmentImport(store, document());
    expect(unchanged.students[0]?.action).toBe("unchanged");
    expect(unchanged.students[0]?.existingEnrollments).toBe(2);
    expect(unchanged.students[0]?.enrollmentsToCreate).toBe(0);

    store.enrollments.set(recordId, [
      {
        offeringId: "different-m2-offering",
        offering: {
          id: "different-m2-offering",
          term: "2026-2027-S1",
          programmeYear: 3,
          sectionCode: "M2",
          course: store.offerings[0]!.course,
        },
      },
    ]);
    const conflict = await planStudentClassEnrollmentImport(store, document());
    expect(conflict.students[0]?.action).toBe("blocked");
    expect(conflict.students[0]?.blockers.join(" ")).toContain("Class 'M2'");
  });

  test("checks capacity across the whole batch and refuses every write when blocked", async () => {
    const store = new MemoryStore();
    store.addActiveStudent("RUPP-001");
    store.addActiveStudent("RUPP-002");
    store.offerings = [
      offering("offering-tsa", "course-tsa", "TSA301", {
        capacity: 2,
        enrollmentCount: 1,
      }),
    ];

    const plan = await planStudentClassEnrollmentImport(
      store,
      document(["RUPP-001", "RUPP-002"]),
    );
    expect(plan.students.every((student) => student.action === "blocked")).toBe(true);
    expect(plan.students[0]?.blockers.join(" ")).toContain("would exceed capacity");

    await expect(applyStudentClassEnrollmentImportPlan(store, plan)).rejects.toBeInstanceOf(
      StudentClassEnrollmentImportBlockedError,
    );
    expect(store.writes).toHaveLength(0);
  });

  test("apply creates only missing enrollments", async () => {
    const store = new MemoryStore();
    const recordId = store.addActiveStudent("RUPP-001");
    store.enrollments.set(recordId, [existingEnrollment(store.offerings[0]!)]);

    const plan = await planStudentClassEnrollmentImport(store, document());
    expect(plan.students[0]?.action).toBe("would_enroll");
    expect(plan.students[0]?.enrollmentsToCreate).toBe(1);

    await applyStudentClassEnrollmentImportPlan(store, plan);
    expect(store.writes).toEqual([
      { offeringId: "offering-dss", studentRecordId: recordId },
    ]);
  });

  test("blocks a missing class instead of creating an Offering", async () => {
    const store = new MemoryStore();
    store.addActiveStudent("RUPP-001");
    store.offerings = [];

    const plan = await planStudentClassEnrollmentImport(store, document());
    expect(plan.classes[0]?.action).toBe("blocked");
    expect(plan.classes[0]?.blockers.join(" ")).toContain("No existing Offerings match");
    expect(plan.students[0]?.action).toBe("blocked");
  });
});
