import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { curriculumService } from "./curriculum-service.ts";
import { competencyFrameworkService } from "./competency-framework-service.ts";
import { curriculumCompetencyMapService } from "./curriculum-competency-map-service.ts";
import { courseCompetencyContextService } from "./course-competency-context-service.ts";
import { curriculumCourseSpecService } from "./curriculum-course-spec-service.ts";
import { gradingScaleService } from "./grading-scale-service.ts";

const dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = () => crypto.randomUUID().slice(0, 8);

async function createApprovedDefaultGradingScale(
  programmeId: string,
  actorId: string,
) {
  const draft = await gradingScaleService.create(actorId, {
    programmeId,
    code: "standard",
    name: "Standard Grading Scale",
    description: "Course competency context test fixture",
    effectiveFrom: "2026-01-01",
    changeSummary: "Initial fixture grading policy",
    grades: [
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
    ],
  });
  return gradingScaleService.approve(draft.id, actorId, {
    note: "Approve fixture grading policy",
  });
}

async function createBase() {
  const token = suffix();
  const user = await prisma.user.create({
    data: {
      email: `course-context-${token}@example.test`,
      name: `Course Context ${token}`,
    },
  });
  const programme = await prisma.programme.create({
    data: {
      id: `course-context-${token}`,
      code: `CC${token}`,
      name: `Course Context Programme ${token}`,
    },
  });
  const curriculum = await curriculumService.createInitial(
    programme.id,
    user.id,
    {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "",
      intakeYear: null,
      academicYear: "2026",
      effectiveFrom: null,
    },
  );
  const course = await prisma.course.create({
    data: {
      code: `CTX-${token}`,
      title: "Context Course",
      programmeId: programme.id,
      credits: 3,
      courseType: "Core",
    },
  });
  const placement = await prisma.programmeCurriculumCourse.create({
    data: {
      curriculumVersionId: curriculum.selectedVersion.id,
      courseId: course.id,
      yearLevel: 3,
      semester: "First",
      creditsSnapshot: 3,
      courseTypeSnapshot: "Core",
      sortOrder: 0,
    },
  });
  const framework = await competencyFrameworkService.createSnapshot(
    programme.id,
    user.id,
    {
      code: `framework-${token}`,
      name: "Graduate Competencies",
      changeNote: "Context baseline",
    },
  );
  await competencyFrameworkService.bindToCurriculumVersion(
    curriculum.selectedVersion.id,
    framework.frameworkVersionId,
    user.id,
  );
  const snapshotCompetency = framework.competencies[0]!;
  await curriculumCompetencyMapService.updateMapping(
    curriculum.selectedVersion.id,
    placement.id,
    snapshotCompetency.id,
    user.id,
    {
      teachLevel: "Intermediate",
      useLevel: "Advanced",
      assessLevel: "Advanced",
      note: "Programme expectation",
    },
  );
  await createApprovedDefaultGradingScale(programme.id, user.id);
  const draftSpec = await prisma.courseSpec.create({
    data: {
      courseId: course.id,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    },
  });
  const approvedSpec = await prisma.courseSpec.update({
    where: { id: draftSpec.id },
    data: {
      reviewStatus: "Approved",
      approvedAt: new Date(),
    },
  });
  await curriculumCourseSpecService.bind(
    curriculum.selectedVersion.id,
    placement.id,
    user.id,
    { courseSpecVersionId: approvedSpec.id },
  );
  return {
    user,
    programme,
    curriculum,
    course,
    placement,
    framework,
    competency: snapshotCompetency,
    approvedSpec,
  };
}

describeDb("CourseSpec programme competency context", () => {
  test("resolves a unique Active placement without fabricating another context", async () => {
    const base = await createBase();
    await prisma.programmeCurriculumVersion.update({
      where: { id: base.curriculum.selectedVersion.id },
      data: { status: "Active", approvedAt: new Date() },
    });

    const result =
      await courseCompetencyContextService.getCourseSpecCompetencyContext(
        base.course.id,
        null,
      );

    expect(result.state).toBe("ready");
    expect(result.source).toMatchObject({
      curriculumVersionId: base.curriculum.selectedVersion.id,
      placementId: base.placement.id,
      frameworkVersionId: base.framework.frameworkVersionId,
    });
    expect(result.expectations[0]).toMatchObject({
      competencyId: base.competency.id,
      teachLevel: "Intermediate",
      useLevel: "Advanced",
      assessLevel: "Advanced",
    });
  });

  test("fails closed when more than one Active curriculum placement could apply", async () => {
    const base = await createBase();
    await prisma.programmeCurriculumVersion.update({
      where: { id: base.curriculum.selectedVersion.id },
      data: { status: "Active", approvedAt: new Date() },
    });

    const token = suffix();
    const second = await curriculumService.createInitial(
      base.programme.id,
      base.user.id,
      {
        code: `CURR-ALT-${token}`,
        name: `Alternate Curriculum ${token}`,
        cohortLabel: "Alternate cohort",
        intakeYear: 2027,
        academicYear: "2027",
        effectiveFrom: null,
      },
    );
    const secondPlacement = await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: second.selectedVersion.id,
        courseId: base.course.id,
        yearLevel: 3,
        semester: "First",
        creditsSnapshot: 3,
        courseTypeSnapshot: "Core",
        sortOrder: 0,
      },
    });
    await competencyFrameworkService.bindToCurriculumVersion(
      second.selectedVersion.id,
      base.framework.frameworkVersionId,
      base.user.id,
    );
    await curriculumCompetencyMapService.updateMapping(
      second.selectedVersion.id,
      secondPlacement.id,
      base.competency.id,
      base.user.id,
      {
        teachLevel: "Intermediate",
        useLevel: "Advanced",
        assessLevel: "Advanced",
        note: "Alternate active context",
      },
    );
    await curriculumCourseSpecService.bind(
      second.selectedVersion.id,
      secondPlacement.id,
      base.user.id,
      { courseSpecVersionId: base.approvedSpec.id },
    );
    await prisma.programmeCurriculumVersion.update({
      where: { id: second.selectedVersion.id },
      data: { status: "Active", approvedAt: new Date() },
    });

    const result =
      await courseCompetencyContextService.getCourseSpecCompetencyContext(
        base.course.id,
        null,
      );

    expect(result.state).toBe("ambiguous");
    expect(result.expectations).toEqual([]);
    expect(result.message).toContain("more than one Active curriculum version");
  });

  test("fails closed when no authoritative curriculum placement exists", async () => {
    const token = suffix();
    const programme = await prisma.programme.create({
      data: {
        id: `course-context-missing-${token}`,
        code: `CCM${token}`,
        name: "Missing Context Programme",
      },
    });
    const course = await prisma.course.create({
      data: {
        code: `MISS-${token}`,
        title: "Missing Context Course",
        programmeId: programme.id,
      },
    });

    const result =
      await courseCompetencyContextService.getCourseSpecCompetencyContext(
        course.id,
        null,
      );

    expect(result.state).toBe("missing");
    expect(result.expectations).toEqual([]);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
