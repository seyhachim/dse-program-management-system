import { afterAll, describe, expect, test } from "bun:test";
import {
  CourseType,
  Prisma,
  PrismaClient,
  Semester,
} from "@prisma/client";

const dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

const suffix = () => crypto.randomUUID().slice(0, 8);

async function createFixture() {
  const token = suffix();
  const user = await prisma.user.create({
    data: {
      email: `curriculum-${token}@example.test`,
      name: `Curriculum Test ${token}`,
    },
  });
  const programme = await prisma.programme.create({
    data: {
      id: `curriculum-programme-${token}`,
      code: `CT${token}`,
      name: `Curriculum Test Programme ${token}`,
    },
  });
  const curriculum = await prisma.programmeCurriculum.create({
    data: {
      programmeId: programme.id,
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
    },
  });
  const course = await prisma.course.create({
    data: {
      code: `COURSE-${token}`,
      title: `Course ${token}`,
      programmeId: programme.id,
      credits: 3,
      courseType: CourseType.Core,
    },
  });

  return { user, programme, curriculum, course };
}

async function createDraftVersion(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Partial<Prisma.ProgrammeCurriculumVersionUncheckedCreateInput> = {},
) {
  return prisma.programmeCurriculumVersion.create({
    data: {
      curriculumId: fixture.curriculum.id,
      versionMajor: 1,
      versionMinor: 0,
      createdById: fixture.user.id,
      ...overrides,
    },
  });
}

function asPromise<T>(value: PromiseLike<T>): Promise<T> {
  return Promise.resolve(value);
}

describeDb("programme curriculum database invariants", () => {
  test("creates initial 1.0 draft metadata", async () => {
    const fixture = await createFixture();
    const version = await createDraftVersion(fixture);

    expect(version.versionMajor).toBe(1);
    expect(version.versionMinor).toBe(0);
    expect(version.status).toBe("Draft");
    expect(version.revisionType).toBe("Initial");
  });

  test("rejects duplicate version number in the same curriculum", async () => {
    const fixture = await createFixture();
    await createDraftVersion(fixture);

    await expect(createDraftVersion(fixture)).rejects.toMatchObject({ code: "P2002" });
  });

  test("allows the same version number in another curriculum", async () => {
    const fixture = await createFixture();
    await createDraftVersion(fixture);
    const token = suffix();
    const secondCurriculum = await prisma.programmeCurriculum.create({
      data: {
        programmeId: fixture.programme.id,
        code: `CURR-SECOND-${token}`,
        name: `Second Curriculum ${token}`,
      },
    });

    const second = await prisma.programmeCurriculumVersion.create({
      data: {
        curriculumId: secondCurriculum.id,
        versionMajor: 1,
        versionMinor: 0,
        createdById: fixture.user.id,
      },
    });

    expect(second.versionMajor).toBe(1);
    expect(second.versionMinor).toBe(0);
  });

  test("rejects duplicate course placement in one version", async () => {
    const fixture = await createFixture();
    const version = await createDraftVersion(fixture);
    const placement = {
      curriculumVersionId: version.id,
      courseId: fixture.course.id,
      yearLevel: 1,
      semester: Semester.First,
      creditsSnapshot: 3,
      courseTypeSnapshot: CourseType.Core,
    } as const;

    await prisma.programmeCurriculumCourse.create({ data: placement });
    await expect(
      asPromise(prisma.programmeCurriculumCourse.create({ data: placement })),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  test.each([0, 5])("database rejects year level %d", async (yearLevel) => {
    const fixture = await createFixture();
    const version = await createDraftVersion(fixture);

    await expect(
      asPromise(
        prisma.programmeCurriculumCourse.create({
          data: {
            curriculumVersionId: version.id,
            courseId: fixture.course.id,
            yearLevel,
            semester: Semester.First,
            creditsSnapshot: 3,
            courseTypeSnapshot: CourseType.Core,
          },
        }),
      ),
    ).rejects.toThrow("ProgrammeCurriculumCourse_yearLevel_check");
  });

  test("reuses the canonical Semester enum", async () => {
    const fixture = await createFixture();
    const version = await createDraftVersion(fixture);
    const first = await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: version.id,
        courseId: fixture.course.id,
        yearLevel: 1,
        semester: Semester.First,
        creditsSnapshot: 3,
        courseTypeSnapshot: CourseType.Core,
      },
    });

    expect(first.semester).toBe(Semester.First);
  });

  test("requires reason and summary for non-initial revisions", async () => {
    const fixture = await createFixture();

    await expect(
      createDraftVersion(fixture, {
        versionMinor: 1,
        revisionType: "Minor",
        revisionReason: "",
        changeSummary: "",
      }),
    ).rejects.toThrow("ProgrammeCurriculumVersion_revision_metadata_check");
  });

  test("predecessor resolves and must belong to the same curriculum", async () => {
    const fixture = await createFixture();
    const first = await createDraftVersion(fixture);
    const second = await createDraftVersion(fixture, {
      versionMinor: 1,
      revisionType: "Minor",
      revisionReason: "Scheduled review",
      changeSummary: "Minor curriculum update",
      basedOnVersionId: first.id,
    });
    const resolved = await prisma.programmeCurriculumVersion.findUniqueOrThrow({
      where: { id: second.id },
      include: { basedOnVersion: true },
    });

    expect(resolved.basedOnVersion?.id).toBe(first.id);

    const other = await createFixture();
    const otherVersion = await createDraftVersion(other);
    await expect(
      createDraftVersion(fixture, {
        versionMajor: 2,
        revisionType: "Major",
        revisionReason: "Major review",
        changeSummary: "Major curriculum update",
        basedOnVersionId: otherVersion.id,
      }),
    ).rejects.toThrow("Curriculum predecessor must belong to the same curriculum");
  });

  test("credit and course-type snapshots remain historical when Course changes", async () => {
    const fixture = await createFixture();
    const version = await createDraftVersion(fixture);
    const placement = await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: version.id,
        courseId: fixture.course.id,
        yearLevel: 2,
        semester: Semester.Second,
        creditsSnapshot: fixture.course.credits ?? 0,
        courseTypeSnapshot: fixture.course.courseType ?? CourseType.Core,
      },
    });

    await prisma.course.update({
      where: { id: fixture.course.id },
      data: { credits: 4, courseType: CourseType.Elective },
    });
    const historical = await prisma.programmeCurriculumCourse.findUniqueOrThrow({
      where: { id: placement.id },
    });

    expect(historical.creditsSnapshot).toBe(3);
    expect(historical.courseTypeSnapshot).toBe(CourseType.Core);
  });

  test("approved version placements cannot be mutated", async () => {
    const fixture = await createFixture();
    const version = await createDraftVersion(fixture);
    const placement = await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: version.id,
        courseId: fixture.course.id,
        yearLevel: 3,
        semester: Semester.First,
        creditsSnapshot: 3,
        courseTypeSnapshot: CourseType.Core,
      },
    });
    await prisma.programmeCurriculumVersion.update({
      where: { id: version.id },
      data: { status: "Approved", approvedAt: new Date() },
    });

    await expect(
      asPromise(
        prisma.programmeCurriculumCourse.update({
          where: { id: placement.id },
          data: { yearLevel: 4 },
        }),
      ),
    ).rejects.toThrow("Cannot mutate course placements of an immutable curriculum version");
  });

  test("approved versions cannot be deleted even without dependent rows", async () => {
    const fixture = await createFixture();
    const version = await createDraftVersion(fixture);
    await prisma.programmeCurriculumVersion.update({
      where: { id: version.id },
      data: { status: "Approved", approvedAt: new Date() },
    });

    await expect(
      asPromise(
        prisma.programmeCurriculumVersion.delete({ where: { id: version.id } }),
      ),
    ).rejects.toThrow(
      "Approved, Active, and Superseded curriculum versions cannot be deleted",
    );
  });

  test("audit actions are append-only", async () => {
    const fixture = await createFixture();
    const version = await createDraftVersion(fixture);
    const action = await prisma.programmeCurriculumAuditAction.create({
      data: {
        curriculumVersionId: version.id,
        actorId: fixture.user.id,
        action: "Created",
        note: "Initial draft",
      },
    });

    await expect(
      asPromise(
        prisma.programmeCurriculumAuditAction.update({
          where: { id: action.id },
          data: { note: "rewritten" },
        }),
      ),
    ).rejects.toThrow("Programme curriculum audit actions are append-only");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
