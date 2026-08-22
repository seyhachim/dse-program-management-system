import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { StudentPromotionConflictError, studentCohortService } from "./cohort-service.ts";

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
