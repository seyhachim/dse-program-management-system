import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient, Semester } from "@prisma/client";
import {
  InvalidCurriculumRevisionError,
  curriculumService,
} from "./curriculum-service.ts";

const dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

const suffix = () => crypto.randomUUID().slice(0, 8);

async function createBase() {
  const token = suffix();
  const user = await prisma.user.create({
    data: {
      email: `curriculum-service-${token}@example.test`,
      name: `Curriculum Service ${token}`,
    },
  });
  const programme = await prisma.programme.create({
    data: {
      id: `curriculum-service-${token}`,
      code: `CS${token}`,
      name: `Curriculum Service Programme ${token}`,
    },
  });
  return { user, programme, token };
}

async function approve(versionId: string) {
  return prisma.programmeCurriculumVersion.update({
    where: { id: versionId },
    data: { status: "Approved", approvedAt: new Date() },
  });
}

describeDb("programme curriculum revision/read service", () => {
  test("creates initial 1.0 draft and canonical empty Year 1-4 structure", async () => {
    const { user, programme, token } = await createBase();
    const result = await curriculumService.createInitial(programme.id, user.id, {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "2026 intake",
      intakeYear: 2026,
      academicYear: "2026-2027",
      effectiveFrom: "2026-09-01",
    });

    expect(result.selectedVersion.version).toBe("1.0");
    expect(result.selectedVersion.status).toBe("Draft");
    expect(result.selectedVersion.revisionType).toBe("Initial");
    expect(result.years.map((year) => year.yearLevel)).toEqual([1, 2, 3, 4]);
    expect(result.pathways).toEqual([]);
    expect(result.totals.programmeCredits).toBe(0);
  });

  test("minor revision clones placements exactly and 1.9 becomes 1.10", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "Cohort A",
      intakeYear: 2025,
      academicYear: "2025-2026",
      effectiveFrom: null,
    });
    const course = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `CORE-${token}`,
        title: `Core Course ${token}`,
        credits: 4,
        courseType: CourseType.Core,
      },
    });
    await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: initial.selectedVersion.id,
        courseId: course.id,
        yearLevel: 2,
        semester: Semester.Second,
        creditsSnapshot: 4,
        courseTypeSnapshot: CourseType.Core,
        sortOrder: 7,
      },
    });
    await prisma.programmeCurriculumVersion.update({
      where: { id: initial.selectedVersion.id },
      data: { versionMinor: 9 },
    });
    await approve(initial.selectedVersion.id);

    const revision = await curriculumService.createRevision(
      initial.curriculum.id,
      initial.selectedVersion.id,
      user.id,
      {
        revisionType: "Minor",
        revisionTriggers: ["ScheduledReview"],
        revisionReason: "Scheduled annual review",
        changeSummary: "Prepare a minor curriculum update",
      },
    );

    expect(revision.selectedVersion.version).toBe("1.10");
    expect(revision.selectedVersion.basedOnVersionId).toBe(initial.selectedVersion.id);
    expect(revision.years[1]?.semesters[1]?.courses).toHaveLength(1);
    expect(revision.years[1]?.semesters[1]?.courses[0]).toMatchObject({
      courseId: course.id,
      credits: 4,
      courseType: "Core",
      sortOrder: 7,
      pathwayId: null,
    });

    const predecessor = await curriculumService.getById(
      initial.curriculum.id,
      initial.selectedVersion.id,
    );
    expect(predecessor.selectedVersion.version).toBe("1.9");
    expect(predecessor.selectedVersion.status).toBe("Approved");
  });

  test("major revision advances to next major and resets minor to zero", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "",
      intakeYear: null,
      academicYear: "",
      effectiveFrom: null,
    });
    await approve(initial.selectedVersion.id);

    const revision = await curriculumService.createRevision(
      initial.curriculum.id,
      initial.selectedVersion.id,
      user.id,
      {
        revisionType: "Major",
        revisionTriggers: ["EmployerFeedback"],
        revisionReason: "Material programme redesign",
        changeSummary: "Create the next major curriculum baseline",
      },
    );

    expect(revision.selectedVersion.version).toBe("2.0");
    expect(revision.selectedVersion.revisionType).toBe("Major");
  });

  test("rejects revision from a Draft predecessor", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "",
      intakeYear: null,
      academicYear: "",
      effectiveFrom: null,
    });

    await expect(
      curriculumService.createRevision(
        initial.curriculum.id,
        initial.selectedVersion.id,
        user.id,
        {
          revisionType: "Minor",
          revisionTriggers: ["Other"],
          revisionReason: "Not allowed yet",
          changeSummary: "Should fail",
        },
      ),
    ).rejects.toBeInstanceOf(InvalidCurriculumRevisionError);
  });

  test("canonical read groups placements and totals from snapshots", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "",
      intakeYear: null,
      academicYear: "",
      effectiveFrom: null,
    });
    const courses = await Promise.all([
      prisma.course.create({
        data: {
          programmeId: programme.id,
          code: `BASIC-${token}`,
          title: "Basic",
          credits: 99,
          courseType: CourseType.Elective,
        },
      }),
      prisma.course.create({
        data: {
          programmeId: programme.id,
          code: `ELECT-${token}`,
          title: "Elective",
          credits: 99,
          courseType: CourseType.Core,
        },
      }),
    ]);
    await prisma.programmeCurriculumCourse.createMany({
      data: [
        {
          curriculumVersionId: initial.selectedVersion.id,
          courseId: courses[0]!.id,
          yearLevel: 1,
          semester: Semester.First,
          creditsSnapshot: 3,
          courseTypeSnapshot: CourseType.Basic,
          sortOrder: 0,
        },
        {
          curriculumVersionId: initial.selectedVersion.id,
          courseId: courses[1]!.id,
          yearLevel: 1,
          semester: Semester.Second,
          creditsSnapshot: 2,
          courseTypeSnapshot: CourseType.Elective,
          sortOrder: 0,
        },
      ],
    });

    const result = await curriculumService.getById(initial.curriculum.id);
    expect(result.years[0]?.totalCredits).toBe(5);
    expect(result.totals).toMatchObject({
      programmeCredits: 5,
      basicCredits: 3,
      electiveCredits: 2,
      coreCredits: 0,
    });
    expect(result.years[0]?.semesters[0]?.courses[0]?.credits).toBe(3);
    expect(result.years[0]?.semesters[0]?.courses[0]?.courseType).toBe("Basic");
    expect(result.years[0]?.semesters[0]?.courses[0]?.pathwayId).toBeNull();
  });

  test("returns all mutually exclusive pathways while totals use only the default route", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "",
      intakeYear: null,
      academicYear: "",
      effectiveFrom: null,
    });

    const common = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `COMMON-${token}`,
        title: "Common Curriculum",
        credits: 131,
        courseType: CourseType.Core,
      },
    });
    const coursework = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `WORK-${token}`,
        title: "Coursework Completion",
        credits: 15,
        courseType: CourseType.Specialization,
      },
    });
    const thesis = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `THE-${token}`,
        title: "Thesis",
        credits: 15,
        courseType: CourseType.Specialization,
      },
    });
    const internship = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `INT-${token}`,
        title: "Industrial Internship",
        credits: 15,
        courseType: CourseType.Specialization,
      },
    });

    const [courseworkPathway, researchPathway, industryPathway] = await Promise.all([
      prisma.programmeCurriculumPathway.create({
        data: {
          curriculumVersionId: initial.selectedVersion.id,
          code: "COURSEWORK",
          name: "Coursework",
          yearLevel: 4,
          semester: Semester.Second,
          isDefault: true,
          creditTarget: 15,
          sortOrder: 0,
        },
      }),
      prisma.programmeCurriculumPathway.create({
        data: {
          curriculumVersionId: initial.selectedVersion.id,
          code: "RESEARCH",
          name: "Research / Thesis",
          yearLevel: 4,
          semester: Semester.Second,
          isDefault: false,
          creditTarget: 15,
          sortOrder: 1,
        },
      }),
      prisma.programmeCurriculumPathway.create({
        data: {
          curriculumVersionId: initial.selectedVersion.id,
          code: "INDUSTRY",
          name: "Industrial Internship",
          yearLevel: 4,
          semester: Semester.Second,
          isDefault: false,
          creditTarget: 15,
          sortOrder: 2,
        },
      }),
    ]);

    await prisma.programmeCurriculumCourse.createMany({
      data: [
        {
          curriculumVersionId: initial.selectedVersion.id,
          courseId: common.id,
          yearLevel: 1,
          semester: Semester.First,
          creditsSnapshot: 131,
          courseTypeSnapshot: CourseType.Core,
          sortOrder: 0,
        },
        {
          curriculumVersionId: initial.selectedVersion.id,
          courseId: coursework.id,
          pathwayId: courseworkPathway.id,
          yearLevel: 4,
          semester: Semester.Second,
          creditsSnapshot: 15,
          courseTypeSnapshot: CourseType.Specialization,
          sortOrder: 0,
        },
        {
          curriculumVersionId: initial.selectedVersion.id,
          courseId: thesis.id,
          pathwayId: researchPathway.id,
          yearLevel: 4,
          semester: Semester.Second,
          creditsSnapshot: 15,
          courseTypeSnapshot: CourseType.Specialization,
          sortOrder: 0,
        },
        {
          curriculumVersionId: initial.selectedVersion.id,
          courseId: internship.id,
          pathwayId: industryPathway.id,
          yearLevel: 4,
          semester: Semester.Second,
          creditsSnapshot: 15,
          courseTypeSnapshot: CourseType.Specialization,
          sortOrder: 0,
        },
      ],
    });

    const result = await curriculumService.getById(initial.curriculum.id);

    expect(result.pathways.map((pathway) => pathway.code)).toEqual([
      "COURSEWORK",
      "RESEARCH",
      "INDUSTRY",
    ]);
    expect(result.pathways.map((pathway) => pathway.totalCredits)).toEqual([15, 15, 15]);
    expect(result.pathways.find((pathway) => pathway.code === "RESEARCH")?.courses[0]).toMatchObject({
      courseId: thesis.id,
      credits: 15,
      pathwayId: researchPathway.id,
    });
    expect(result.years[3]?.semesters[1]?.courses.map((course) => course.courseId)).toEqual([
      coursework.id,
    ]);
    expect(result.totals.programmeCredits).toBe(146);
  });
});

afterAll(async () => {
  // The test database is disposable per CI job. Approved curriculum fixtures are
  // intentionally immutable and therefore must not be deleted as test cleanup.
  await prisma.$disconnect();
});
