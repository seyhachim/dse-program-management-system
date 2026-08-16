import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient } from "@prisma/client";
import type { SaveCurriculumDraftInput } from "@dse-pms/shared-types";
import { curriculumDraftService } from "./curriculum-draft-service.ts";
import {
  CurriculumConflictError,
  InvalidCurriculumRevisionError,
  curriculumService,
} from "./curriculum-service.ts";

const dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = () => crypto.randomUUID().slice(0, 8);

async function createFixture() {
  const token = suffix();
  const user = await prisma.user.create({
    data: {
      email: `curriculum-draft-${token}@example.test`,
      name: `Curriculum Draft ${token}`,
    },
  });
  const programme = await prisma.programme.create({
    data: {
      id: `curriculum-draft-${token}`,
      code: `CD${token}`,
      name: `Curriculum Draft Programme ${token}`,
    },
  });
  const initial = await curriculumService.createInitial(programme.id, user.id, {
    code: `CURR-${token}`,
    name: `Curriculum ${token}`,
    cohortLabel: "Original cohort",
    intakeYear: 2026,
    academicYear: "2026-2027",
    effectiveFrom: null,
  });
  const courses = await Promise.all(
    [
      ["A", 3, CourseType.Basic],
      ["B", 4, CourseType.Core],
    ].map(([name, credits, courseType]) =>
      prisma.course.create({
        data: {
          programmeId: programme.id,
          code: `${name}-${token}`,
          title: `Course ${name} ${token}`,
          credits: credits as number,
          courseType: courseType as CourseType,
        },
      }),
    ),
  );
  return { user, programme, initial, courses, token };
}

describeDb("curriculum draft editing", () => {
  test("atomically saves draft metadata and placements and records audit actions", async () => {
    const { user, initial, courses } = await createFixture();

    const saved = await curriculumDraftService.save(
      initial.curriculum.id,
      initial.selectedVersion.id,
      user.id,
      {
        expectedUpdatedAt: initial.selectedVersion.updatedAt,
        cohortLabel: "2027 intake",
        intakeYear: 2027,
        academicYear: "2027-2028",
        effectiveFrom: "2027-09-01",
        placements: [
          {
            courseId: courses[1]!.id,
            yearLevel: 2,
            semester: "Second",
            credits: 5,
            courseType: "Specialization",
            sortOrder: 1,
          },
          {
            courseId: courses[0]!.id,
            yearLevel: 1,
            semester: "First",
            credits: 3,
            courseType: "Basic",
            sortOrder: 0,
          },
        ],
      },
    );

    expect(saved.selectedVersion.status).toBe("Draft");
    expect(saved.selectedVersion.cohortLabel).toBe("2027 intake");
    expect(saved.selectedVersion.updatedAt).not.toBe(initial.selectedVersion.updatedAt);
    expect(saved.totals.programmeCredits).toBe(8);
    expect(saved.years[1]?.semesters[1]?.courses[0]).toMatchObject({
      courseId: courses[1]!.id,
      credits: 5,
      courseType: "Specialization",
      sortOrder: 1,
    });

    const actions = await prisma.programmeCurriculumAuditAction.findMany({
      where: { curriculumVersionId: initial.selectedVersion.id },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(actions.map((action) => action.action)).toContain("MetadataUpdated");
    expect(actions.map((action) => action.action)).toContain("CourseAdded");
  });

  test("rejects stale saves instead of overwriting newer draft work", async () => {
    const { user, initial } = await createFixture();
    const input: SaveCurriculumDraftInput = {
      expectedUpdatedAt: initial.selectedVersion.updatedAt,
      cohortLabel: "First save",
      intakeYear: 2026,
      academicYear: "2026-2027",
      effectiveFrom: null,
      placements: [],
    };

    await curriculumDraftService.save(
      initial.curriculum.id,
      initial.selectedVersion.id,
      user.id,
      input,
    );

    await expect(
      curriculumDraftService.save(
        initial.curriculum.id,
        initial.selectedVersion.id,
        user.id,
        { ...input, cohortLabel: "Stale overwrite" },
      ),
    ).rejects.toBeInstanceOf(CurriculumConflictError);
  });

  test("never mutates Approved versions", async () => {
    const { user, initial } = await createFixture();
    await prisma.programmeCurriculumVersion.update({
      where: { id: initial.selectedVersion.id },
      data: { status: "Approved", approvedAt: new Date() },
    });
    const approved = await curriculumService.getById(
      initial.curriculum.id,
      initial.selectedVersion.id,
    );

    await expect(
      curriculumDraftService.save(
        initial.curriculum.id,
        initial.selectedVersion.id,
        user.id,
        {
          expectedUpdatedAt: approved.selectedVersion.updatedAt,
          cohortLabel: "Must not change",
          intakeYear: 2030,
          academicYear: "2030-2031",
          effectiveFrom: null,
          placements: [],
        },
      ),
    ).rejects.toBeInstanceOf(InvalidCurriculumRevisionError);

    const unchanged = await curriculumService.getById(
      initial.curriculum.id,
      initial.selectedVersion.id,
    );
    expect(unchanged.selectedVersion.cohortLabel).toBe("Original cohort");
  });

  test("rejects course placements from another programme", async () => {
    const { user, initial, token } = await createFixture();
    const otherProgramme = await prisma.programme.create({
      data: {
        id: `other-${token}`,
        code: `OT${token}`,
        name: `Other ${token}`,
      },
    });
    const otherCourse = await prisma.course.create({
      data: {
        programmeId: otherProgramme.id,
        code: `OTHER-${token}`,
        title: "Wrong programme course",
        credits: 3,
        courseType: CourseType.Core,
      },
    });

    await expect(
      curriculumDraftService.save(
        initial.curriculum.id,
        initial.selectedVersion.id,
        user.id,
        {
          expectedUpdatedAt: initial.selectedVersion.updatedAt,
          cohortLabel: "Original cohort",
          intakeYear: 2026,
          academicYear: "2026-2027",
          effectiveFrom: null,
          placements: [
            {
              courseId: otherCourse.id,
              yearLevel: 1,
              semester: "First",
              credits: 3,
              courseType: "Core",
              sortOrder: 0,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(InvalidCurriculumRevisionError);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
