import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient, Semester } from "@prisma/client";
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
  });

  test("atomically edits Draft metadata and placements and records audit actions", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `EDIT-${token}`,
      name: `Editable Curriculum ${token}`,
      cohortLabel: "Original cohort",
      intakeYear: 2026,
      academicYear: "2026-2027",
      effectiveFrom: null,
    });
    const course = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `EDIT-COURSE-${token}`,
        title: "Editable course",
        credits: 3,
        courseType: CourseType.Core,
      },
    });

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
            courseId: course.id,
            yearLevel: 2,
            semester: "Second",
            credits: 5,
            courseType: "Specialization",
            sortOrder: 0,
          },
        ],
      },
    );

    expect(saved.selectedVersion.cohortLabel).toBe("2027 intake");
    expect(saved.selectedVersion.updatedAt).not.toBe(initial.selectedVersion.updatedAt);
    expect(saved.totals.programmeCredits).toBe(5);
    expect(saved.years[1]?.semesters[1]?.courses[0]).toMatchObject({
      courseId: course.id,
      credits: 5,
      courseType: "Specialization",
    });

    const actions = await prisma.programmeCurriculumAuditAction.findMany({
      where: { curriculumVersionId: initial.selectedVersion.id },
      select: { action: true },
    });
    expect(actions.map((action) => action.action)).toContain("MetadataUpdated");
    expect(actions.map((action) => action.action)).toContain("CourseAdded");
  });

  test("rejects stale Draft saves instead of overwriting newer work", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `STALE-${token}`,
      name: `Stale Curriculum ${token}`,
      cohortLabel: "Original",
      intakeYear: 2026,
      academicYear: "2026-2027",
      effectiveFrom: null,
    });
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

  test("never edits Approved curriculum snapshots", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `LOCKED-${token}`,
      name: `Locked Curriculum ${token}`,
      cohortLabel: "Original cohort",
      intakeYear: 2026,
      academicYear: "2026-2027",
      effectiveFrom: null,
    });
    await approve(initial.selectedVersion.id);
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

  test("rejects placements that reference another programme", async () => {
    const { user, programme, token } = await createBase();
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `SCOPE-${token}`,
      name: `Scoped Curriculum ${token}`,
      cohortLabel: "",
      intakeYear: null,
      academicYear: "",
      effectiveFrom: null,
    });
    const otherProgramme = await prisma.programme.create({
      data: { id: `other-${token}`, code: `OT${token}`, name: `Other ${token}` },
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
          cohortLabel: "",
          intakeYear: null,
          academicYear: "",
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
  // The test database is disposable per CI job. Approved curriculum fixtures are
  // intentionally immutable and therefore must not be deleted as test cleanup.
  await prisma.$disconnect();
});
