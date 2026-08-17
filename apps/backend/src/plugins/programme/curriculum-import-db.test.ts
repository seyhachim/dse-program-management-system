import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient } from "@prisma/client";
import { curriculumImportService } from "./curriculum-import-service.ts";

const dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

const suffix = () => crypto.randomUUID().slice(0, 8);

async function fixture() {
  const token = suffix();
  const user = await prisma.user.create({
    data: {
      email: `curriculum-import-${token}@example.test`,
      name: `Curriculum Import ${token}`,
    },
  });
  const programme = await prisma.programme.create({
    data: {
      id: `curriculum-import-programme-${token}`,
      code: `DI${token}`,
      name: `Curriculum Import Programme ${token}`,
    },
  });
  const curriculum = await prisma.programmeCurriculum.create({
    data: {
      programmeId: programme.id,
      code: `DSE-${token}`,
      name: `Bachelor of Engineering in Data Science ${token}`,
    },
  });
  const version = await prisma.programmeCurriculumVersion.create({
    data: {
      curriculumId: curriculum.id,
      versionMajor: 1,
      versionMinor: 0,
      createdById: user.id,
      cohortLabel: "2026 intake",
      academicYear: "2026",
    },
  });
  const [common, coursework, research] = await Promise.all([
    prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `COMMON-${token}`,
        title: `Common Course ${token}`,
        credits: 3,
        courseType: CourseType.Core,
      },
    }),
    prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `WORK-${token}`,
        title: `Coursework Course ${token}`,
        credits: 3,
        courseType: CourseType.Core,
      },
    }),
    prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `THESIS-${token}`,
        title: `Thesis ${token}`,
        credits: 18,
        courseType: CourseType.Specialization,
      },
    }),
  ]);
  return { token, user, programme, curriculum, version, common, coursework, research };
}

function uploadFor(f: Awaited<ReturnType<typeof fixture>>) {
  const data = {
    formatVersion: "dse-curriculum-v1",
    programmeCode: f.programme.code,
    curriculum: {
      code: f.curriculum.code,
      name: f.curriculum.name,
      academicYear: "2026",
      version: "1.0",
      defaultPathwayCode: "COURSEWORK",
    },
    pathways: [
      {
        code: "COURSEWORK",
        name: "Option 1 (Coursework)",
        yearLevel: 4,
        semester: "Second",
        isDefault: true,
        creditTarget: 3,
        sortOrder: 0,
      },
      {
        code: "RESEARCH",
        name: "Option 2 (Research)",
        yearLevel: 4,
        semester: "Second",
        isDefault: false,
        creditTarget: 18,
        sortOrder: 1,
      },
    ],
    courses: [
      {
        code: f.common.code,
        title: f.common.title,
        yearLevel: 1,
        semester: "First",
        pathwayCode: null,
        sortOrder: 0,
        weeklyHours: { total: 3, lecture: 3, lab: 0, fieldVisit: 0 },
        credits: {
          total: 3,
          lecture: 3,
          lab: 0,
          fieldVisit: 0,
          breakdownProvided: true,
        },
        lecturerText: "Dr. Common",
      },
      {
        code: f.coursework.code,
        title: f.coursework.title,
        yearLevel: 4,
        semester: "Second",
        pathwayCode: "COURSEWORK",
        sortOrder: 0,
        weeklyHours: { total: 3, lecture: 3, lab: 0, fieldVisit: 0 },
        credits: {
          total: 3,
          lecture: 3,
          lab: 0,
          fieldVisit: 0,
          breakdownProvided: true,
        },
        lecturerText: "Dr. Coursework",
      },
      {
        code: f.research.code,
        title: f.research.title,
        yearLevel: 4,
        semester: "Second",
        pathwayCode: "RESEARCH",
        sortOrder: 0,
        weeklyHours: null,
        credits: {
          total: 18,
          lecture: 0,
          lab: 0,
          fieldVisit: 0,
          breakdownProvided: false,
        },
        lecturerText: "",
      },
    ],
  };
  return {
    fileName: `curriculum-${f.token}.json`,
    jsonText: JSON.stringify(data),
  };
}

describeDb("curriculum JSON import and artifact persistence", () => {
  test("preview is read-only and apply separates default route from alternatives", async () => {
    const f = await fixture();
    const upload = uploadFor(f);

    const preview = await curriculumImportService.preview(f.version.id, upload);
    expect(preview.canApply).toBe(true);
    expect(preview.totals.commonCredits).toBe(3);
    expect(preview.totals.selectedRouteCredits).toBe(6);
    expect(preview.totals.pathways.find((pathway) => pathway.code === "RESEARCH")?.credits).toBe(18);
    expect(
      await prisma.programmeCurriculumCourse.count({
        where: { curriculumVersionId: f.version.id },
      }),
    ).toBe(0);

    const artifact = await curriculumImportService.apply(f.version.id, f.user.id, upload);

    expect(artifact.courses).toHaveLength(3);
    expect(artifact.curriculum.defaultPathwayCode).toBe("COURSEWORK");
    expect(artifact.totals.selectedRouteCredits).toBe(6);
    expect(artifact.source?.fileName).toBe(upload.fileName);
    expect(artifact.source?.sha256).toMatch(/^[a-f0-9]{64}$/);

    const canonicalPlacements = await prisma.programmeCurriculumCourse.findMany({
      where: { curriculumVersionId: f.version.id },
      include: { course: true },
      orderBy: { sortOrder: "asc" },
    });
    expect(canonicalPlacements).toHaveLength(2);
    expect(canonicalPlacements.map((row) => row.course.code).sort()).toEqual(
      [f.common.code, f.coursework.code].sort(),
    );
    expect(canonicalPlacements.some((row) => row.course.code === f.research.code)).toBe(false);

    const alternativeRows = await prisma.$queryRaw<Array<{ code: string; placementId: string | null }>>`
      SELECT "courseCodeSnapshot" AS code, "placementId"
      FROM curriculum_artifact."CourseSnapshot"
      WHERE "curriculumVersionId" = ${f.version.id}
        AND "scopeCode" = 'RESEARCH'
    `;
    expect(alternativeRows).toEqual([{ code: f.research.code, placementId: null }]);

    const importAudit = await prisma.programmeCurriculumAuditAction.findFirst({
      where: {
        curriculumVersionId: f.version.id,
        note: { contains: "Imported curriculum JSON" },
      },
    });
    expect(importAudit).not.toBeNull();
  });

  test("existing code with conflicting title blocks apply without partial mutation", async () => {
    const f = await fixture();
    const upload = uploadFor(f);
    const json = JSON.parse(upload.jsonText) as { courses: Array<{ code: string; title: string }> };
    json.courses[0]!.title = "A silently changed title";
    const conflictUpload = { ...upload, jsonText: JSON.stringify(json) };

    const preview = await curriculumImportService.preview(f.version.id, conflictUpload);
    expect(preview.canApply).toBe(false);
    expect(preview.blockers.some((item) => item.includes("title conflicts"))).toBe(true);

    await expect(
      curriculumImportService.apply(f.version.id, f.user.id, conflictUpload),
    ).rejects.toThrow("blocking issues");
    expect(
      await prisma.programmeCurriculumCourse.count({
        where: { curriculumVersionId: f.version.id },
      }),
    ).toBe(0);
  });

  test("artifact rows become immutable after curriculum approval", async () => {
    const f = await fixture();
    await curriculumImportService.apply(f.version.id, f.user.id, uploadFor(f));
    await prisma.programmeCurriculumVersion.update({
      where: { id: f.version.id },
      data: { status: "Approved", approvedAt: new Date() },
    });

    await expect(
      prisma.$executeRaw`
        UPDATE curriculum_artifact."Pathway"
        SET "name" = 'Mutated history'
        WHERE "curriculumVersionId" = ${f.version.id}
          AND "code" = 'COURSEWORK'
      `,
    ).rejects.toThrow("immutable");

    const preview = await curriculumImportService.preview(f.version.id, uploadFor(f));
    expect(preview.canApply).toBe(false);
    expect(preview.blockers.some((item) => item.includes("Only an editable Draft"))).toBe(true);
  });

  test("normal Draft placement edits keep artifact location and credits synchronized", async () => {
    const f = await fixture();
    await curriculumImportService.apply(f.version.id, f.user.id, uploadFor(f));
    const placement = await prisma.programmeCurriculumCourse.findFirstOrThrow({
      where: { curriculumVersionId: f.version.id, courseId: f.common.id },
    });

    await prisma.programmeCurriculumCourse.update({
      where: { id: placement.id },
      data: { yearLevel: 2, semester: "Second", sortOrder: 4, creditsSnapshot: 4 },
    });

    const artifact = await curriculumImportService.artifact(f.version.id);
    const row = artifact.courses.find((course) => course.placementId === placement.id);
    expect(row?.yearLevel).toBe(2);
    expect(row?.semester).toBe("Second");
    expect(row?.sortOrder).toBe(4);
    expect(row?.credits.total).toBe(4);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
