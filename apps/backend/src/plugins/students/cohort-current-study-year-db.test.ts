import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  StudentCurrentStudyYearConflictError,
  studentCohortService,
} from "./cohort-service.ts";

const enabled = process.env.COHORT_PROGRESSION_DB_TESTS === "1";
const db = new PrismaClient();

const cohortId = crypto.randomUUID();
const otherCohortId = crypto.randomUUID();

const students = {
  noHistory: makeStudent("no-history"),
  progressed: makeStudent("progressed"),
  retained: makeStudent("retained"),
  inactive: makeStudent("inactive"),
  closed: makeStudent("closed"),
  terminal: makeStudent("terminal"),
  otherCohort: makeStudent("other-cohort"),
};

const input = {
  defaultProgrammeYear: 3 as const,
  academicYear: "2027-2028",
  periodStart: "2027-09-01",
  periodEnd: "2028-06-30",
};

describe.skipIf(!enabled)("current study year initialization database integrity", () => {
  beforeAll(async () => {
    await db.studentCohort.createMany({
      data: [
        {
          id: cohortId,
          programmeId: "dse",
          code: `I1224-${cohortId.slice(0, 6)}`,
          name: "Issue 1224 current study year cohort",
          intakeYear: 2025,
          expectedGraduationYear: 2029,
        },
        {
          id: otherCohortId,
          programmeId: "dse",
          code: `I1224-X-${otherCohortId.slice(0, 6)}`,
          name: "Issue 1224 other cohort",
          intakeYear: 2025,
          expectedGraduationYear: 2029,
        },
      ],
    });

    await db.student.createMany({
      data: Object.values(students).map((student) => ({
        id: student.id,
        name: student.name,
        studentId: student.studentId,
        status: student === students.inactive ? "Inactive" : "Active",
      })),
    });

    for (const student of [
      students.noHistory,
      students.progressed,
      students.retained,
      students.inactive,
      students.terminal,
    ]) {
      await db.studentCohortMembership.create({
        data: {
          id: student.membershipId,
          cohortId,
          studentId: student.id,
          joinedAt: new Date("2025-09-01"),
        },
      });
    }

    await db.studentCohortMembership.create({
      data: {
        id: students.closed.membershipId,
        cohortId,
        studentId: students.closed.id,
        joinedAt: new Date("2025-09-01"),
        exitedAt: new Date("2027-06-30"),
        exitReason: "Other",
      },
    });

    await db.studentCohortMembership.create({
      data: {
        id: students.otherCohort.membershipId,
        cohortId: otherCohortId,
        studentId: students.otherCohort.id,
        joinedAt: new Date("2025-09-01"),
      },
    });

    await db.studentProgressionRecord.createMany({
      data: [
        {
          membershipId: students.progressed.membershipId,
          programmeYear: 2,
          academicYear: "2026-2027",
          term: "Year end",
          periodStart: new Date("2026-09-01"),
          periodEnd: new Date("2027-06-30"),
          status: "Progressed",
        },
        {
          membershipId: students.retained.membershipId,
          programmeYear: 2,
          academicYear: "2026-2027",
          term: "Year end",
          periodStart: new Date("2026-09-01"),
          periodEnd: new Date("2027-06-30"),
          status: "Retained",
        },
        {
          membershipId: students.terminal.membershipId,
          programmeYear: 2,
          academicYear: "2026-2027",
          term: "Year end",
          periodStart: new Date("2026-09-01"),
          periodEnd: new Date("2027-06-30"),
          status: "Withdrawn",
        },
      ],
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  test("previews missing current-year context without writing and preserves explicit prior outcomes", async () => {
    const before = await countCurrentYearRows();
    const preview = await studentCohortService.previewCurrentStudyYear(cohortId, input);

    expect(preview.canApply).toBe(true);
    expect(preview.eligibleCount).toBe(3);
    expect(preview.excludedCount).toBe(3);
    expect(await countCurrentYearRows()).toBe(before);

    const noHistory = preview.members.find((member) => member.membershipId === students.noHistory.membershipId)!;
    expect(noHistory.eligible).toBe(true);
    expect(noHistory.proposedProgrammeYear).toBe(3);
    expect(noHistory.programmeYearLockedByHistory).toBe(false);

    const progressed = preview.members.find((member) => member.membershipId === students.progressed.membershipId)!;
    expect(progressed.eligible).toBe(true);
    expect(progressed.proposedProgrammeYear).toBe(3);
    expect(progressed.programmeYearLockedByHistory).toBe(true);

    const retained = preview.members.find((member) => member.membershipId === students.retained.membershipId)!;
    expect(retained.eligible).toBe(true);
    expect(retained.proposedProgrammeYear).toBe(2);
    expect(retained.programmeYearLockedByHistory).toBe(true);

    expect(preview.members.find((member) => member.membershipId === students.inactive.membershipId)?.blocker).toContain("Inactive");
    expect(preview.members.find((member) => member.membershipId === students.closed.membershipId)?.blocker).toContain("closed");
    expect(preview.members.find((member) => member.membershipId === students.terminal.membershipId)?.blocker).toContain("Withdrawn");
  });

  test("blocks cross-cohort or history-conflicting assignments atomically", async () => {
    const before = await countCurrentYearRows();

    await expect(studentCohortService.applyCurrentStudyYear(cohortId, {
      ...input,
      assignments: [
        { membershipId: students.noHistory.membershipId, programmeYear: 3, note: "" },
        { membershipId: students.progressed.membershipId, programmeYear: 4, note: "contradicts prior progression" },
        { membershipId: students.retained.membershipId, programmeYear: 2, note: "" },
        { membershipId: students.otherCohort.membershipId, programmeYear: 3, note: "cross cohort" },
      ],
    })).rejects.toBeInstanceOf(StudentCurrentStudyYearConflictError);

    expect(await countCurrentYearRows()).toBe(before);
  });

  test("appends one neutral Continuing record for every eligible member", async () => {
    const result = await studentCohortService.applyCurrentStudyYear(cohortId, {
      ...input,
      assignments: [
        { membershipId: students.noHistory.membershipId, programmeYear: 3, note: "" },
        { membershipId: students.progressed.membershipId, programmeYear: 3, note: "Derived from prior Year 2 progression" },
        { membershipId: students.retained.membershipId, programmeYear: 2, note: "Prior retention preserved" },
      ],
    });

    expect(result.recordsCreated).toBe(3);
    expect(result.term).toBe("Academic year");

    const rows = await db.studentProgressionRecord.findMany({
      where: {
        membership: { cohortId },
        academicYear: input.academicYear,
        term: "Academic year",
      },
      orderBy: { membershipId: "asc" },
    });

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "Continuing")).toBe(true);
    expect(new Map(rows.map((row) => [row.membershipId, row.programmeYear]))).toEqual(new Map([
      [students.noHistory.membershipId, 3],
      [students.progressed.membershipId, 3],
      [students.retained.membershipId, 2],
    ]));

    expect(await db.studentCompletionOutcome.count({
      where: { membership: { cohortId } },
    })).toBe(0);
    expect(await db.enrollment.count({
      where: {
        studentId: {
          in: [students.noHistory.id, students.progressed.id, students.retained.id],
        },
      },
    })).toBe(0);
    expect(await db.studentCohortMembership.count({ where: { cohortId } })).toBe(6);
  });

  test("Continuing is treated as the current year for the later promotion workflow", async () => {
    const preview = await studentCohortService.previewPromotion(cohortId, {
      sourceProgrammeYear: 3,
      targetProgrammeYear: 4,
      academicYear: input.academicYear,
      term: "Year end",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });

    const eligible = preview.members.filter((member) => member.eligible);
    expect(eligible.map((member) => member.membershipId).sort()).toEqual([
      students.noHistory.membershipId,
      students.progressed.membershipId,
    ].sort());
    expect(preview.members.find((member) => member.membershipId === students.retained.membershipId)?.blocker)
      .toContain("Current programme year is 2");
  });

  test("replay is blocked and cannot append duplicate current-year context", async () => {
    const before = await countCurrentYearRows();

    await expect(studentCohortService.applyCurrentStudyYear(cohortId, {
      ...input,
      assignments: [
        { membershipId: students.noHistory.membershipId, programmeYear: 3, note: "" },
        { membershipId: students.progressed.membershipId, programmeYear: 3, note: "" },
        { membershipId: students.retained.membershipId, programmeYear: 2, note: "" },
      ],
    })).rejects.toBeInstanceOf(StudentCurrentStudyYearConflictError);

    expect(await countCurrentYearRows()).toBe(before);
  });
});

async function countCurrentYearRows() {
  return db.studentProgressionRecord.count({
    where: {
      membership: { cohortId },
      academicYear: input.academicYear,
    },
  });
}

function makeStudent(label: string) {
  const id = crypto.randomUUID();
  return {
    id,
    membershipId: crypto.randomUUID(),
    studentId: `I1224-${label}-${id.slice(0, 6)}`,
    name: `Issue 1224 ${label}`,
  };
}
