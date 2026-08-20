import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  gradingScaleService,
  GradingScaleAuthorizationError,
} from "./grading-scale-service.ts";

const describeDb = process.env.CURRICULUM_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

const twoBandScale = [
  {
    sortOrder: 1,
    letterGrade: "P",
    gradePoint: 1,
    minScore: 50,
    maxScore: 100,
    minInclusive: true,
    maxInclusive: true,
    explanation: "Pass",
    isPassing: true,
  },
  {
    sortOrder: 2,
    letterGrade: "F",
    gradePoint: 0,
    minScore: 0,
    maxScore: 50,
    minInclusive: true,
    maxInclusive: false,
    explanation: "Fail",
    isPassing: false,
  },
] as const;

async function expectDatabaseRejection(action: () => Promise<unknown>) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

async function fixture() {
  const token = crypto.randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `grading-scale-${token}@example.test`,
      name: `Grading Scale ${token}`,
    },
  });
  const programme = await prisma.programme.create({
    data: {
      id: `grading-${token}`,
      code: `GS${token}`,
      name: `Grading Scale Programme ${token}`,
    },
  });
  const course = await prisma.course.create({
    data: {
      programmeId: programme.id,
      code: `GSC-${token}`,
      title: `Grading Scale Course ${token}`,
    },
  });
  const v1Draft = await gradingScaleService.create(user.id, {
    programmeId: programme.id,
    code: "standard",
    name: "Standard Grading Scale",
    description: "Fixture grading policy",
    effectiveFrom: "2026-01-01",
    changeSummary: "Initial fixture policy",
    grades: twoBandScale.map((grade) => ({ ...grade })),
  });
  const v1 = await gradingScaleService.approve(v1Draft.id, user.id, {
    note: "Approve v1",
  });
  return { user, programme, course, v1 };
}

describeDb("programme grading-scale database integrity", () => {
  test("migrates the exact legacy DSE A-F scale as baseline v1", async () => {
    const baseline = await prisma.programmeGradingScaleVersion.findFirst({
      where: {
        version: 1,
        legacyImported: true,
        gradingScale: {
          programmeId: "dse",
          code: "standard",
          isDefault: true,
        },
      },
      include: { grades: { orderBy: { sortOrder: "asc" } } },
    });

    expect(baseline).not.toBeNull();
    expect(baseline?.status).toBe("Approved");
    expect(baseline?.effectiveFrom).toBeNull();
    expect(
      baseline?.grades.map((grade) => ({
        grade: grade.letterGrade,
        point: Number(grade.gradePoint).toFixed(2),
        min: Number(grade.minScore),
        max: Number(grade.maxScore),
        maxInclusive: grade.maxInclusive,
        label: grade.explanation,
      })),
    ).toEqual([
      { grade: "A", point: "4.00", min: 85, max: 100, maxInclusive: true, label: "Excellent" },
      { grade: "B+", point: "3.50", min: 80, max: 85, maxInclusive: false, label: "Very Good" },
      { grade: "B", point: "3.00", min: 75, max: 80, maxInclusive: false, label: "Good" },
      { grade: "C+", point: "2.50", min: 70, max: 75, maxInclusive: false, label: "Fairly Good" },
      { grade: "C", point: "2.00", min: 65, max: 70, maxInclusive: false, label: "Fair" },
      { grade: "D+", point: "1.50", min: 60, max: 65, maxInclusive: false, label: "Poor" },
      { grade: "D", point: "1.00", min: 50, max: 60, maxInclusive: false, label: "Very Poor" },
      { grade: "F", point: "0.00", min: 0, max: 50, maxInclusive: false, label: "Fail" },
    ]);
  });

  test("pins a submitted CourseSpec to v1 and keeps it there after v2 approval", async () => {
    const f = await fixture();
    const spec = await prisma.courseSpec.create({
      data: {
        courseId: f.course.id,
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      },
    });

    const submitted = await prisma.courseSpec.update({
      where: { id: spec.id },
      data: {
        reviewStatus: "Submitted",
        submittedAt: new Date(),
        submittedById: f.user.id,
        submissionVersion: 1,
      },
    });
    expect(submitted.gradingScaleVersionId).toBe(f.v1.id);

    const v2Draft = await gradingScaleService.createRevision(
      f.v1.gradingScaleId,
      f.user.id,
      {
        changeSummary: "Future policy revision",
        effectiveFrom: "2027-01-01",
      },
    );
    await gradingScaleService.updateDraft(v2Draft.id, f.user.id, {
      grades: [
        {
          ...twoBandScale[0],
          letterGrade: "S",
          explanation: "Satisfactory",
        },
        { ...twoBandScale[1] },
      ],
    });
    const v2 = await gradingScaleService.approve(v2Draft.id, f.user.id, {
      note: "Approve v2",
    });

    expect(v2.status).toBe("Approved");
    const v1After = await prisma.programmeGradingScaleVersion.findUniqueOrThrow({
      where: { id: f.v1.id },
    });
    expect(v1After.status).toBe("Superseded");
    expect(v1After.effectiveTo?.toISOString().slice(0, 10)).toBe("2027-01-01");

    const currentCourse = await prisma.course.create({
      data: {
        programmeId: f.programme.id,
        code: `GSC-CURRENT-${crypto.randomUUID().slice(0, 8)}`,
        title: "Current-policy grading fixture",
      },
    });
    const currentDraft = await prisma.courseSpec.create({
      data: {
        courseId: currentCourse.id,
        effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
      },
    });
    expect(currentDraft.gradingScaleVersionId).toBe(f.v1.id);

    const futureCourse = await prisma.course.create({
      data: {
        programmeId: f.programme.id,
        code: `GSC-FUTURE-${crypto.randomUUID().slice(0, 8)}`,
        title: "Future-policy grading fixture",
      },
    });
    const futureDraft = await prisma.courseSpec.create({
      data: {
        courseId: futureCourse.id,
        effectiveFrom: new Date("2027-02-01T00:00:00.000Z"),
      },
    });
    expect(futureDraft.gradingScaleVersionId).toBe(v2.id);

    const historical = await prisma.courseSpec.findUniqueOrThrow({
      where: { id: spec.id },
    });
    expect(historical.gradingScaleVersionId).toBe(f.v1.id);
    expect(historical.gradingScaleVersionId).not.toBe(v2.id);

    await expectDatabaseRejection(async () => {
      await prisma.courseSpec.update({
        where: { id: spec.id },
        data: { gradingScaleVersionId: v2.id },
      });
    });

    const approved = await prisma.courseSpec.update({
      where: { id: spec.id },
      data: { reviewStatus: "Approved", approvedAt: new Date() },
    });
    expect(approved.gradingScaleVersionId).toBe(f.v1.id);

    const revision = await prisma.courseSpec.create({
      data: {
        courseId: f.course.id,
        versionMajor: 2,
        versionMinor: 0,
        basedOnVersionId: spec.id,
      },
    });
    expect(revision.gradingScaleVersionId).toBe(f.v1.id);
  });

  test("database blocks mutation of approved policy rows", async () => {
    const f = await fixture();
    const grade = await prisma.programmeGradingScaleGrade.findFirstOrThrow({
      where: { gradingScaleVersionId: f.v1.id },
    });

    await expectDatabaseRejection(async () => {
      await prisma.programmeGradingScaleGrade.update({
        where: { id: grade.id },
        data: { explanation: "Mutated after approval" },
      });
    });

    await expectDatabaseRejection(async () => {
      await prisma.programmeGradingScaleVersion.update({
        where: { id: f.v1.id },
        data: { changeSummary: "Rewrite history" },
      });
    });
  });

  test("rejects cross-programme CourseSpec binding", async () => {
    const left = await fixture();
    const right = await fixture();
    const spec = await prisma.courseSpec.create({ data: { courseId: left.course.id } });
    expect(spec.gradingScaleVersionId).toBe(left.v1.id);

    await expect(
      gradingScaleService.bindCourseSpec(left.course.id, right.v1.id),
    ).rejects.toBeInstanceOf(GradingScaleAuthorizationError);

    const latest = await prisma.courseSpec.findFirstOrThrow({
      where: { courseId: left.course.id },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
    });
    expect(latest.gradingScaleVersionId).toBe(left.v1.id);
    expect(latest.gradingScaleVersionId).not.toBe(right.v1.id);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
