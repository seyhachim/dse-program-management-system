import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient } from "@prisma/client";
import { curriculumImportService } from "./curriculum-import-service.ts";
import { curriculumService } from "./curriculum-service.ts";

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

const applyInput = (upload: ReturnType<typeof uploadFor>) => ({ ...upload, decisions: [] });

describeDb("curriculum JSON import and artifact persistence", () => {
  test("preview is read-only and all alternatives become canonical pathway placements", async () => {
    const f = await fixture();
    const upload = uploadFor(f);

    const preview = await curriculumImportService.preview(f.version.id, upload);
    expect(preview.canApply).toBe(true);
    expect(preview.totals.commonCredits).toBe(3);
    expect(preview.totals.computedSelectedRouteCredits).toBe(6);
    expect(preview.totals.selectedRouteCredits).toBe(6);
    expect(preview.totals.pathways.find((pathway) => pathway.code === "RESEARCH")?.credits).toBe(18);
    expect(
      await prisma.programmeCurriculumCourse.count({
        where: { curriculumVersionId: f.version.id },
      }),
    ).toBe(0);

    const artifact = await curriculumImportService.apply(
      f.version.id,
      f.user.id,
      applyInput(upload),
    );

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
    expect(canonicalPlacements).toHaveLength(3);
    expect(canonicalPlacements.map((row) => row.course.code).sort()).toEqual(
      [f.common.code, f.coursework.code, f.research.code].sort(),
    );

    const membership = await prisma.$queryRaw<
      Array<{ courseCode: string; pathwayCode: string | null; isDefault: boolean | null }>
    >`
      SELECT c."code" AS "courseCode", p."code" AS "pathwayCode", p."isDefault"
      FROM public."ProgrammeCurriculumCourse" pc
      JOIN public."Course" c ON c."id" = pc."courseId"
      LEFT JOIN public."ProgrammeCurriculumPathway" p ON p."id" = pc."pathwayId"
      WHERE pc."curriculumVersionId" = ${f.version.id}
      ORDER BY c."code"
    `;
    expect(membership.find((row) => row.courseCode === f.common.code)?.pathwayCode).toBeNull();
    expect(membership.find((row) => row.courseCode === f.coursework.code)?.pathwayCode).toBe("COURSEWORK");
    expect(membership.find((row) => row.courseCode === f.research.code)?.pathwayCode).toBe("RESEARCH");
    expect(membership.find((row) => row.courseCode === f.coursework.code)?.isDefault).toBe(true);
    expect(membership.find((row) => row.courseCode === f.research.code)?.isDefault).toBe(false);

    const alternativeRows = await prisma.$queryRaw<Array<{ code: string; placementId: string | null }>>`
      SELECT "courseCodeSnapshot" AS code, "placementId"
      FROM curriculum_artifact."CourseSnapshot"
      WHERE "curriculumVersionId" = ${f.version.id}
        AND "scopeCode" = 'RESEARCH'
    `;
    expect(alternativeRows).toHaveLength(1);
    expect(alternativeRows[0]?.code).toBe(f.research.code);
    expect(alternativeRows[0]?.placementId).toMatch(/^[0-9a-f-]{36}$/);

    const normalRead = await curriculumService.getById(f.curriculum.id, f.version.id);
    expect(normalRead.totals.programmeCredits).toBe(6);
    expect(
      normalRead.years.flatMap((year) => year.semesters.flatMap((semester) => semester.courses)).map((course) => course.code).sort(),
    ).toEqual([f.common.code, f.coursework.code].sort());

    const importAudit = await prisma.programmeCurriculumAuditAction.findFirst({
      where: {
        curriculumVersionId: f.version.id,
        note: { contains: "Imported curriculum JSON" },
      },
    });
    expect(importAudit).not.toBeNull();
  });

  test("title conflicts require an explicit keep-existing decision", async () => {
    const f = await fixture();
    const upload = uploadFor(f);
    const json = JSON.parse(upload.jsonText) as { courses: Array<{ code: string; title: string }> };
    json.courses[0]!.title = "A silently changed title";
    const conflictUpload = { ...upload, jsonText: JSON.stringify(json) };

    const preview = await curriculumImportService.preview(f.version.id, conflictUpload);
    expect(preview.canApply).toBe(false);
    expect(preview.courses[0]?.requiredDecision).toBe("keep-existing-course");

    await expect(
      curriculumImportService.apply(f.version.id, f.user.id, {
        ...conflictUpload,
        decisions: [],
      }),
    ).rejects.toThrow("blocking issues");
    expect(
      await prisma.programmeCurriculumCourse.count({
        where: { curriculumVersionId: f.version.id },
      }),
    ).toBe(0);

    const artifact = await curriculumImportService.apply(f.version.id, f.user.id, {
      ...conflictUpload,
      decisions: [
        { courseCode: f.common.code, action: "keep-existing-course" },
      ],
    });
    expect(artifact.courses.find((course) => course.code === f.common.code)?.title).toBe(f.common.title);
    expect(artifact.source?.decisions).toEqual([
      { courseCode: f.common.code, action: "keep-existing-course" },
    ]);
  });

  test("missing Course creation is explicit, authorized-input-driven, and creates no CourseSpec or Offering", async () => {
    const f = await fixture();
    const upload = uploadFor(f);
    const json = JSON.parse(upload.jsonText) as {
      courses: Array<{ code: string; title: string; credits: { total: number } }>;
    };
    const missingCode = `NEW-${f.token}`;
    json.courses[0]!.code = missingCode;
    json.courses[0]!.title = `Explicit New Course ${f.token}`;
    const missingUpload = { ...upload, jsonText: JSON.stringify(json) };

    const beforeCourses = await prisma.course.count({ where: { programmeId: f.programme.id } });
    const preview = await curriculumImportService.preview(f.version.id, missingUpload);
    expect(preview.canApply).toBe(false);
    expect(preview.courses[0]?.requiredDecision).toBe("create-course");
    expect(await prisma.course.count({ where: { programmeId: f.programme.id } })).toBe(beforeCourses);

    const artifact = await curriculumImportService.apply(f.version.id, f.user.id, {
      ...missingUpload,
      decisions: [
        { courseCode: missingCode, action: "create-course", courseType: "Core" },
      ],
    });
    const created = await prisma.course.findFirstOrThrow({
      where: { programmeId: f.programme.id, code: missingCode },
    });
    expect(created.title).toBe(`Explicit New Course ${f.token}`);
    expect(created.courseType).toBe(CourseType.Core);
    expect(artifact.courses.some((course) => course.courseId === created.id)).toBe(true);
    expect(await prisma.courseSpec.count({ where: { courseId: created.id } })).toBe(0);
    expect(await prisma.offering.count({ where: { courseId: created.id } })).toBe(0);
  });

  test("official declared totals remain auditable beside row arithmetic", async () => {
    const f = await fixture();
    const upload = uploadFor(f);
    const json = JSON.parse(upload.jsonText) as Record<string, unknown>;
    json.declaredTotals = {
      semesterCredits: [{ yearLevel: 1, semester: "First", credits: 2 }],
      pathwayCredits: [{ pathwayCode: "COURSEWORK", credits: 3 }],
      programmeCourseCount: 2,
      programmeCredits: 5,
    };
    const declaredUpload = { ...upload, jsonText: JSON.stringify(json) };

    const preview = await curriculumImportService.preview(f.version.id, declaredUpload);
    expect(preview.totals.computedSelectedRouteCredits).toBe(6);
    expect(preview.totals.selectedRouteCredits).toBe(5);
    expect(preview.warnings.some((item) => item.includes("official source declares 5"))).toBe(true);

    const artifact = await curriculumImportService.apply(
      f.version.id,
      f.user.id,
      { ...declaredUpload, decisions: [] },
    );
    expect(artifact.declaredTotals?.programmeCredits).toBe(5);
    expect(artifact.totals.computedSelectedRouteCredits).toBe(6);
    expect(artifact.totals.selectedRouteCredits).toBe(5);
    expect(artifact.source?.warnings.some((item) => item.includes("official source declares 5"))).toBe(true);
  });

  test("pathways and export snapshots remain immutable after approval", async () => {
    const f = await fixture();
    await curriculumImportService.apply(f.version.id, f.user.id, applyInput(uploadFor(f)));

    await expect(curriculumImportService.artifactForExport(f.version.id)).rejects.toThrow(
      "export is unavailable",
    );

    await prisma.programmeCurriculumVersion.update({
      where: { id: f.version.id },
      data: { status: "Approved", approvedAt: new Date() },
    });

    await expect(
      Promise.resolve(
        prisma.$executeRaw`
          UPDATE public."ProgrammeCurriculumPathway"
          SET "name" = 'Mutated history'
          WHERE "curriculumVersionId" = ${f.version.id}
            AND "code" = 'COURSEWORK'
        `,
      ),
    ).rejects.toThrow("immutable curriculum version");

    const exported = await curriculumImportService.artifactForExport(f.version.id);
    expect(exported.curriculum.status).toBe("Approved");
    const preview = await curriculumImportService.preview(f.version.id, uploadFor(f));
    expect(preview.canApply).toBe(false);
    expect(preview.blockers.some((item) => item.includes("Only an editable Draft"))).toBe(true);
  });

  test("revision clone preserves canonical pathway membership and export snapshots", async () => {
    const f = await fixture();
    const upload = uploadFor(f);
    const json = JSON.parse(upload.jsonText) as Record<string, unknown>;
    json.declaredTotals = {
      semesterCredits: [],
      pathwayCredits: [
        { pathwayCode: "COURSEWORK", credits: 3 },
        { pathwayCode: "RESEARCH", credits: 18 },
      ],
      programmeCourseCount: 2,
      programmeCredits: 6,
    };
    await curriculumImportService.apply(f.version.id, f.user.id, {
      ...upload,
      jsonText: JSON.stringify(json),
      decisions: [],
    });
    await prisma.programmeCurriculumVersion.update({
      where: { id: f.version.id },
      data: { status: "Approved", approvedAt: new Date() },
    });

    const revision = await curriculumService.createRevision(
      f.curriculum.id,
      f.version.id,
      f.user.id,
      {
        revisionType: "Minor",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "Regression clone",
        changeSummary: "Preserve pathways and snapshots",
      },
    );
    const revisionId = revision.selectedVersion.id;

    const membership = await prisma.$queryRaw<Array<{ code: string; pathwayCode: string | null }>>`
      SELECT c."code", p."code" AS "pathwayCode"
      FROM public."ProgrammeCurriculumCourse" pc
      JOIN public."Course" c ON c."id" = pc."courseId"
      LEFT JOIN public."ProgrammeCurriculumPathway" p ON p."id" = pc."pathwayId"
      WHERE pc."curriculumVersionId" = ${revisionId}
      ORDER BY c."code"
    `;
    expect(membership).toHaveLength(3);
    expect(membership.find((row) => row.code === f.coursework.code)?.pathwayCode).toBe("COURSEWORK");
    expect(membership.find((row) => row.code === f.research.code)?.pathwayCode).toBe("RESEARCH");

    const clonedArtifact = await curriculumImportService.artifact(revisionId);
    expect(clonedArtifact.courses).toHaveLength(3);
    expect(clonedArtifact.declaredTotals?.programmeCredits).toBe(6);
    expect(clonedArtifact.courses.find((course) => course.code === f.common.code)?.lecturerText).toBe("Dr. Common");
  });

  test("normal common Draft placement edits keep artifact location and credits synchronized", async () => {
    const f = await fixture();
    await curriculumImportService.apply(f.version.id, f.user.id, applyInput(uploadFor(f)));
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
