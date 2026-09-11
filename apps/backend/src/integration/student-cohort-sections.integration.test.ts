import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { prisma } from "../core/db/prisma.ts";
import { studentCohortService } from "../plugins/students/cohort-service.ts";
import {
  StudentCohortSectionError,
  studentCohortSectionService,
} from "../plugins/students/cohort-section-service.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

integrationDescribe("Student cohort section integrity", () => {
  let cohortAId = "";
  let cohortBId = "";
  let studentId = "";
  let cohortMembershipId = "";
  let sectionM1Id = "";
  let sectionM2Id = "";

  beforeAll(async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const student = await prisma.student.create({
      data: {
        name: `Section Test ${suffix}`,
        studentId: `SEC-${suffix}`,
        status: "Active",
      },
    });
    studentId = student.id;

    const cohortA = await prisma.studentCohort.create({
      data: {
        programmeId: "dse",
        code: `SEC-A-${suffix}`,
        name: `Section Cohort A ${suffix}`,
        intakeYear: 2098,
        expectedGraduationYear: 2102,
        status: "Active",
      },
    });
    cohortAId = cohortA.id;

    const cohortB = await prisma.studentCohort.create({
      data: {
        programmeId: "dse",
        code: `SEC-B-${suffix}`,
        name: `Section Cohort B ${suffix}`,
        intakeYear: 2098,
        expectedGraduationYear: 2102,
        status: "Active",
      },
    });
    cohortBId = cohortB.id;

    const membership = await prisma.studentCohortMembership.create({
      data: {
        cohortId: cohortAId,
        studentId,
        joinedAt: new Date("2098-09-01T00:00:00.000Z"),
      },
    });
    cohortMembershipId = membership.id;

    const m1 = await studentCohortSectionService.create({
      cohortId: cohortAId,
      code: "M1",
      name: "Morning 1",
    });
    sectionM1Id = m1.id;

    const m2 = await studentCohortSectionService.create({
      cohortId: cohortAId,
      code: "M2",
      name: "Morning 2",
    });
    sectionM2Id = m2.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("requires canonical membership in the same cohort", async () => {
    const otherSection = await studentCohortSectionService.create({
      cohortId: cohortBId,
      code: "A1",
      name: "Afternoon 1",
    });

    await expect(studentCohortSectionService.addMembership(otherSection.id, {
      studentId,
      joinedAt: "2098-09-01",
      note: "cross-cohort attempt",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<StudentCohortSectionError>);
  });

  test("rejects overlapping section membership and preserves dated history after a move", async () => {
    const first = await studentCohortSectionService.addMembership(sectionM1Id, {
      studentId,
      joinedAt: "2098-09-01",
      note: "initial section",
    });
    expect(first.section.code).toBe("M1");

    await expect(studentCohortSectionService.addMembership(sectionM2Id, {
      studentId,
      joinedAt: "2098-10-01",
      note: "overlap attempt",
    })).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<StudentCohortSectionError>);

    const closed = await studentCohortSectionService.exitMembership(sectionM1Id, first.id, {
      exitedAt: "2098-09-30",
      note: "approved section transfer",
    });
    expect(closed.exitedAt).toBe("2098-09-30");

    const second = await studentCohortSectionService.addMembership(sectionM2Id, {
      studentId,
      joinedAt: "2098-10-01",
      note: "new section",
    });
    expect(second.section.code).toBe("M2");

    const history = await studentCohortSectionService.listHistory(cohortAId);
    const studentHistory = history.filter((row) => row.studentId === studentId);
    expect(studentHistory).toHaveLength(2);
    expect(studentHistory.map((row) => row.section.code).sort()).toEqual(["M1", "M2"]);
  });

  test("database blocks cohort exit while a section membership is active", async () => {
    await expect(studentCohortService.exitMembership(cohortAId, cohortMembershipId, {
      exitedAt: "2099-01-01",
      exitReason: "Transferred",
      note: "must be blocked until section closes",
    })).rejects.toThrow("Close the active cohort section membership before closing cohort membership");

    const members = await studentCohortSectionService.listMembers(cohortAId);
    const current = members.find((member) => member.studentId === studentId)?.currentSectionMembership;
    expect(current?.section.code).toBe("M2");
    if (!current) throw new Error("Expected active section membership fixture");

    await studentCohortSectionService.exitMembership(current.sectionId, current.id, {
      exitedAt: "2098-12-31",
      note: "close section before cohort exit",
    });

    const exited = await studentCohortService.exitMembership(cohortAId, cohortMembershipId, {
      exitedAt: "2099-01-01",
      exitReason: "Transferred",
      note: "section closed first",
    });
    expect(exited.exitedAt?.toISOString().slice(0, 10)).toBe("2099-01-01");
  });
});
