import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  StudentCurrentStudyYearConflictError,
  StudentPromotionConflictError,
  studentCohortService,
} from "./cohort-service.ts";

const enabled = process.env.COHORT_PROGRESSION_DB_TESTS === "1";
const db = new PrismaClient();
const cohortId = crypto.randomUUID();
const otherCohortId = crypto.randomUUID();
const students = Array.from({ length: 7 }, (_, index) => ({
  id: crypto.randomUUID(),
  membershipId: crypto.randomUUID(),
  studentId: `I542-${index + 1}-${crypto.randomUUID().slice(0, 6)}`,
  name: `Issue 542 Student ${index + 1}`,
}));

const period1 = {
  sourceProgrammeYear: 1 as const,
  targetProgrammeYear: 2 as const,
  academicYear: "2026-2027",
  term: "Year end",
  periodStart: "2026-09-01",
  periodEnd: "2027-06-30",
};

const period2 = {
  sourceProgrammeYear: 2 as const,
  targetProgrammeYear: 3 as const,
  academicYear: "2027-2028",
  term: "Year end",
  periodStart: "2027-09-01",
  periodEnd: "2028-06-30",
};

describe.skipIf(!enabled)("cohort promotion database integrity", () => {
  beforeAll(async () => {
    await db.studentCohort.createMany({
      data: [
        {
          id: cohortId,
          programmeId: "dse",
          code: `I542-${cohortId.slice(0, 6)}`,
          name: "Issue 542 promotion cohort",
          intakeYear: 2026,
          expectedGraduationYear: 2030,
        },
        {
          id: otherCohortId,
          programmeId: "dse",
          code: `I542-X-${otherCohortId.slice(0, 6)}`,
          name: "Issue 542 other cohort",
          intakeYear: 2026,
          expectedGraduationYear: 2030,
        },
      ],
    });
    await db.student.createMany({
      data: students.map((student) => ({
        id: student.id,
        name: student.name,
        email: null,
        studentId: student.studentId,
        status: "Active",
      })),
    });
    for (const [index, student] of students.entries()) {
      await db.studentCohortMembership.create({
        data: {
          id: student.membershipId,
          cohortId: index === students.length - 1 ? otherCohortId : cohortId,
          studentId: student.id,
          joinedAt: new Date("2026-09-01"),
        },
      });
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  test("previews eligible open members without writing", async () => {
    const before = await db.studentProgressionRecord.count({ where: { membership: { cohortId } } });
    const preview = await studentCohortService.previewPromotion(cohortId, period1);
    expect(preview.canApply).toBe(true);
    expect(preview.eligibleCount).toBe(6);
    expect(preview.members.every((member) => member.proposedStatus === "Progressed")).toBe(true);
    expect(await db.studentProgressionRecord.count({ where: { membership: { cohortId } } })).toBe(before);
  });

  test("applies one atomic batch with progressed, retained, and terminal exceptions", async () => {
    const decisions = [
      "Progressed",
      "Progressed",
      "Retained",
      "Withdrawn",
      "Inactive",
      "Transferred",
    ] as const;
    const result = await studentCohortService.applyPromotion(cohortId, {
      ...period1,
      decisions: students.slice(0, 6).map((student, index) => ({
        membershipId: student.membershipId,
        status: decisions[index]!,
        note: index === 2 ? "Retained by coordinator decision" : "",
      })),
    });

    expect(result.recordsCreated).toBe(6);
    expect(result.summary.Progressed).toBe(2);
    expect(result.summary.Retained).toBe(1);
    expect(result.summary.Withdrawn).toBe(1);
    expect(result.summary.Inactive).toBe(1);
    expect(result.summary.Transferred).toBe(1);

    const rows = await db.studentProgressionRecord.findMany({
      where: { membership: { cohortId }, academicYear: period1.academicYear, term: period1.term },
      orderBy: { membershipId: "asc" },
    });
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.programmeYear === 1)).toBe(true);
    expect(await db.studentCompletionOutcome.count({ where: { membership: { cohortId } } })).toBe(0);
    expect(await db.enrollment.count({ where: { studentId: { in: students.slice(0, 6).map((student) => student.id) } } })).toBe(0);
    expect(await db.studentCohortMembership.count({ where: { cohortId } })).toBe(6);
  });

  test("next-year preview includes only students who actually progressed", async () => {
    const preview = await studentCohortService.previewPromotion(cohortId, period2);
    expect(preview.canApply).toBe(true);
    expect(preview.eligibleCount).toBe(2);
    const eligible = preview.members.filter((member) => member.eligible).map((member) => member.studentNumber).sort();
    expect(eligible).toEqual(students.slice(0, 2).map((student) => student.studentId).sort());
    expect(preview.members.find((member) => member.studentNumber === students[2]!.studentId)?.blocker).toContain("Current programme year is 1");
    expect(preview.members.find((member) => member.studentNumber === students[3]!.studentId)?.blocker).toContain("Withdrawn");
  });

  test("replay is blocked and does not append duplicate progression", async () => {
    const before = await db.studentProgressionRecord.count({ where: { membership: { cohortId } } });
    const preview = await studentCohortService.previewPromotion(cohortId, period1);
    expect(preview.canApply).toBe(false);
    expect(preview.blockers.some((blocker) => blocker.includes("already recorded"))).toBe(true);
    expect(await db.studentProgressionRecord.count({ where: { membership: { cohortId } } })).toBe(before);
  });

  test("cross-cohort decision blocks the whole next-year batch before any write", async () => {
    const preview = await studentCohortService.previewPromotion(cohortId, period2);
    const eligible = preview.members.filter((member) => member.eligible);
    const before = await db.studentProgressionRecord.count({
      where: { membership: { cohortId }, academicYear: period2.academicYear, term: period2.term },
    });

    await expect(studentCohortService.applyPromotion(cohortId, {
      ...period2,
      decisions: [
        ...eligible.map((member) => ({ membershipId: member.membershipId, status: "Progressed" as const, note: "" })),
        { membershipId: students[6]!.membershipId, status: "Progressed" as const, note: "cross cohort" },
      ],
    })).rejects.toBeInstanceOf(StudentPromotionConflictError);

    expect(await db.studentProgressionRecord.count({
      where: { membership: { cohortId }, academicYear: period2.academicYear, term: period2.term },
    })).toBe(before);
  });
});


const initDb = new PrismaClient();
const initCohortId = crypto.randomUUID();
const initOtherCohortId = crypto.randomUUID();
const initStudents = {
  noHistory: makeInitStudent("no-history"),
  progressed: makeInitStudent("progressed"),
  retained: makeInitStudent("retained"),
  inactive: makeInitStudent("inactive"),
  closed: makeInitStudent("closed"),
  terminal: makeInitStudent("terminal"),
  laterHistory: makeInitStudent("later-history"),
  otherCohort: makeInitStudent("other-cohort"),
};
const initPeriod = {
  defaultProgrammeYear: 3 as const,
  academicYear: "2027-2028",
  periodStart: "2027-09-01",
  periodEnd: "2028-06-30",
};

describe.skipIf(!enabled)("current study year initialization database integrity", () => {
  beforeAll(async () => {
    await initDb.studentCohort.createMany({
      data: [
        {
          id: initCohortId,
          programmeId: "dse",
          code: `I1224-${initCohortId.slice(0, 6)}`,
          name: "Issue 1224 current study year cohort",
          intakeYear: 2025,
          expectedGraduationYear: 2029,
        },
        {
          id: initOtherCohortId,
          programmeId: "dse",
          code: `I1224-X-${initOtherCohortId.slice(0, 6)}`,
          name: "Issue 1224 other cohort",
          intakeYear: 2025,
          expectedGraduationYear: 2029,
        },
      ],
    });

    await initDb.student.createMany({
      data: Object.values(initStudents).map((student) => ({
        id: student.id,
        name: student.name,
        studentId: student.studentId,
        status: student === initStudents.inactive ? "Inactive" : "Active",
      })),
    });

    for (const student of [
      initStudents.noHistory,
      initStudents.progressed,
      initStudents.retained,
      initStudents.inactive,
      initStudents.terminal,
      initStudents.laterHistory,
    ]) {
      await initDb.studentCohortMembership.create({
        data: {
          id: student.membershipId,
          cohortId: initCohortId,
          studentId: student.id,
          joinedAt: new Date("2025-09-01"),
        },
      });
    }

    await initDb.studentCohortMembership.create({
      data: {
        id: initStudents.closed.membershipId,
        cohortId: initCohortId,
        studentId: initStudents.closed.id,
        joinedAt: new Date("2025-09-01"),
        exitedAt: new Date("2027-06-30"),
        exitReason: "Other",
      },
    });
    await initDb.studentCohortMembership.create({
      data: {
        id: initStudents.otherCohort.membershipId,
        cohortId: initOtherCohortId,
        studentId: initStudents.otherCohort.id,
        joinedAt: new Date("2025-09-01"),
      },
    });

    await initDb.studentProgressionRecord.createMany({
      data: [
        {
          membershipId: initStudents.progressed.membershipId,
          programmeYear: 2,
          academicYear: "2026-2027",
          term: "Year end",
          periodStart: new Date("2026-09-01"),
          periodEnd: new Date("2027-06-30"),
          status: "Progressed",
        },
        {
          membershipId: initStudents.retained.membershipId,
          programmeYear: 2,
          academicYear: "2026-2027",
          term: "Year end",
          periodStart: new Date("2026-09-01"),
          periodEnd: new Date("2027-06-30"),
          status: "Retained",
        },
        {
          membershipId: initStudents.terminal.membershipId,
          programmeYear: 2,
          academicYear: "2026-2027",
          term: "Year end",
          periodStart: new Date("2026-09-01"),
          periodEnd: new Date("2027-06-30"),
          status: "Withdrawn",
        },
        {
          membershipId: initStudents.laterHistory.membershipId,
          programmeYear: 4,
          academicYear: "2028-2029",
          term: "Academic year",
          periodStart: new Date("2028-09-01"),
          periodEnd: new Date("2029-06-30"),
          status: "Continuing",
        },
      ],
    });
  });

  afterAll(async () => {
    await initDb.$disconnect();
  });

  test("previews only eligible members and constrains explicit prior outcomes without writing", async () => {
    const before = await countInitRows();
    const preview = await studentCohortService.previewCurrentStudyYear(initCohortId, initPeriod);

    expect(preview.eligibleCount).toBe(3);
    expect(preview.excludedCount).toBe(4);
    expect(await countInitRows()).toBe(before);

    const noHistory = preview.members.find((member) => member.membershipId === initStudents.noHistory.membershipId)!;
    expect(noHistory.proposedProgrammeYear).toBe(3);
    expect(noHistory.programmeYearLockedByHistory).toBe(false);

    const progressed = preview.members.find((member) => member.membershipId === initStudents.progressed.membershipId)!;
    expect(progressed.proposedProgrammeYear).toBe(3);
    expect(progressed.programmeYearLockedByHistory).toBe(true);

    const retained = preview.members.find((member) => member.membershipId === initStudents.retained.membershipId)!;
    expect(retained.proposedProgrammeYear).toBe(2);
    expect(retained.programmeYearLockedByHistory).toBe(true);

    expect(preview.members.find((member) => member.membershipId === initStudents.inactive.membershipId)?.blocker).toContain("Inactive");
    expect(preview.members.find((member) => member.membershipId === initStudents.closed.membershipId)?.blocker).toContain("closed");
    expect(preview.members.find((member) => member.membershipId === initStudents.terminal.membershipId)?.blocker).toContain("Withdrawn");
    expect(preview.members.find((member) => member.membershipId === initStudents.laterHistory.membershipId)?.blocker)
      .toContain("Later progression history");
  });

  test("blocks cross-cohort and history-conflicting assignments atomically", async () => {
    const before = await countInitRows();

    await expect(studentCohortService.applyCurrentStudyYear(initCohortId, {
      ...initPeriod,
      assignments: [
        { membershipId: initStudents.noHistory.membershipId, programmeYear: 3, note: "" },
        { membershipId: initStudents.progressed.membershipId, programmeYear: 4, note: "contradicts history" },
        { membershipId: initStudents.retained.membershipId, programmeYear: 2, note: "" },
        { membershipId: initStudents.otherCohort.membershipId, programmeYear: 3, note: "cross cohort" },
      ],
    })).rejects.toBeInstanceOf(StudentCurrentStudyYearConflictError);

    expect(await countInitRows()).toBe(before);
  });

  test("appends neutral Continuing context and feeds the later promotion workflow", async () => {
    const result = await studentCohortService.applyCurrentStudyYear(initCohortId, {
      ...initPeriod,
      assignments: [
        { membershipId: initStudents.noHistory.membershipId, programmeYear: 3, note: "" },
        { membershipId: initStudents.progressed.membershipId, programmeYear: 3, note: "Prior Year 2 progression" },
        { membershipId: initStudents.retained.membershipId, programmeYear: 2, note: "Prior retention preserved" },
      ],
    });

    expect(result.recordsCreated).toBe(3);
    const rows = await initDb.studentProgressionRecord.findMany({
      where: {
        membership: { cohortId: initCohortId },
        academicYear: initPeriod.academicYear,
        term: "Academic year",
      },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "Continuing")).toBe(true);
    expect(new Map(rows.map((row) => [row.membershipId, row.programmeYear]))).toEqual(new Map([
      [initStudents.noHistory.membershipId, 3],
      [initStudents.progressed.membershipId, 3],
      [initStudents.retained.membershipId, 2],
    ]));

    const promotion = await studentCohortService.previewPromotion(initCohortId, {
      sourceProgrammeYear: 3,
      targetProgrammeYear: 4,
      academicYear: initPeriod.academicYear,
      term: "Year end",
      periodStart: initPeriod.periodStart,
      periodEnd: initPeriod.periodEnd,
    });
    expect(promotion.members.filter((member) => member.eligible).map((member) => member.membershipId).sort())
      .toEqual([initStudents.noHistory.membershipId, initStudents.progressed.membershipId].sort());
    expect(promotion.members.find((member) => member.membershipId === initStudents.retained.membershipId)?.blocker)
      .toContain("Current programme year is 2");

    expect(await initDb.studentCompletionOutcome.count({
      where: { membership: { cohortId: initCohortId } },
    })).toBe(0);
    expect(await initDb.enrollment.count({
      where: { studentId: { in: [initStudents.noHistory.id, initStudents.progressed.id, initStudents.retained.id] } },
    })).toBe(0);
  });

  test("replay is blocked without duplicate current-year rows", async () => {
    const before = await countInitRows();
    await expect(studentCohortService.applyCurrentStudyYear(initCohortId, {
      ...initPeriod,
      assignments: [
        { membershipId: initStudents.noHistory.membershipId, programmeYear: 3, note: "" },
        { membershipId: initStudents.progressed.membershipId, programmeYear: 3, note: "" },
        { membershipId: initStudents.retained.membershipId, programmeYear: 2, note: "" },
      ],
    })).rejects.toBeInstanceOf(StudentCurrentStudyYearConflictError);
    expect(await countInitRows()).toBe(before);
  });
});

function countInitRows() {
  return initDb.studentProgressionRecord.count({
    where: {
      membership: { cohortId: initCohortId },
      academicYear: initPeriod.academicYear,
    },
  });
}

function makeInitStudent(label: string) {
  const id = crypto.randomUUID();
  return {
    id,
    membershipId: crypto.randomUUID(),
    studentId: `I1224-${label}-${id.slice(0, 6)}`,
    name: `Issue 1224 ${label}`,
  };
}
