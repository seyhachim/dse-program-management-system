import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { curriculumService } from "./curriculum-service.ts";
import {
  InvalidCompetencyFrameworkAssignmentError,
  competencyFrameworkService,
} from "./competency-framework-service.ts";
import {
  CurriculumCompetencyMapConflictError,
  curriculumCompetencyMapService,
} from "./curriculum-competency-map-service.ts";

const dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = () => crypto.randomUUID().slice(0, 8);

async function createBase() {
  const token = suffix();
  const user = await prisma.user.create({
    data: {
      email: `competency-map-${token}@example.test`,
      name: `Competency Map ${token}`,
    },
  });
  const programme = await prisma.programme.create({
    data: {
      id: `competency-map-${token}`,
      code: `CM${token}`,
      name: `Competency Map Programme ${token}`,
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
      code: `CM-${token}`,
      title: "Competency Mapping Course",
      programmeId: programme.id,
      credits: 3,
      courseType: "Core",
    },
  });
  const placement = await prisma.programmeCurriculumCourse.create({
    data: {
      curriculumVersionId: curriculum.selectedVersion.id,
      courseId: course.id,
      yearLevel: 2,
      semester: "Second",
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
      changeNote: "Competency map baseline",
    },
  );
  await competencyFrameworkService.bindToCurriculumVersion(
    curriculum.selectedVersion.id,
    framework.frameworkVersionId,
    user.id,
  );
  return { user, programme, curriculum, course, placement, framework, token };
}

describeDb("curriculum course competency map", () => {
  test("records T/U/A levels, audits changes, blocks framework reassignment, and inherits mappings into a new revision", async () => {
    const base = await createBase();
    const competency = base.framework.competencies[0]!;
    const versionId = base.curriculum.selectedVersion.id;

    const mapped = await curriculumCompetencyMapService.updateMapping(
      versionId,
      base.placement.id,
      competency.id,
      base.user.id,
      {
        teachLevel: "Basic",
        useLevel: "Intermediate",
        assessLevel: "Advanced",
        note: "Reviewed by curriculum team",
      },
    );

    expect(mapped.summary).toMatchObject({
      courseCount: 1,
      competencyCount: base.framework.competencies.length,
      mappedCourseCount: 1,
      unmappedCourseCount: 0,
      mappedCompetencyCount: 1,
    });
    expect(mapped.courses[0]?.mappings[0]).toMatchObject({
      competencyId: competency.id,
      teachLevel: "Basic",
      useLevel: "Intermediate",
      assessLevel: "Advanced",
    });

    const audit = await prisma.programmeCurriculumAuditAction.findFirstOrThrow({
      where: {
        curriculumVersionId: versionId,
        action: "CompetencyMappingUpdated",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.actorId).toBe(base.user.id);
    expect(audit.details).toMatchObject({
      courseCode: base.course.code,
      competencyCode: competency.code,
      before: null,
      after: {
        teachLevel: "Basic",
        useLevel: "Intermediate",
        assessLevel: "Advanced",
      },
    });

    const nextFramework = await competencyFrameworkService.createSnapshot(
      base.programme.id,
      base.user.id,
      {
        code: base.framework.frameworkCode,
        name: "Graduate Competencies 2027",
        changeNote: "Next framework version",
      },
    );
    await expect(
      competencyFrameworkService.bindToCurriculumVersion(
        versionId,
        nextFramework.frameworkVersionId,
        base.user.id,
      ),
    ).rejects.toBeInstanceOf(InvalidCompetencyFrameworkAssignmentError);

    await prisma.programmeCurriculumVersion.update({
      where: { id: versionId },
      data: { status: "Approved", approvedAt: new Date() },
    });
    await expect(
      curriculumCompetencyMapService.updateMapping(
        versionId,
        base.placement.id,
        competency.id,
        base.user.id,
        {
          teachLevel: "Intermediate",
          useLevel: "Intermediate",
          assessLevel: "Advanced",
          note: "",
        },
      ),
    ).rejects.toBeInstanceOf(CurriculumCompetencyMapConflictError);

    await expect(
      Promise.resolve(
        prisma.programmeCurriculumCourseCompetencyMapping.updateMany({
          where: { curriculumVersionId: versionId },
          data: { teachLevel: "Advanced" },
        }),
      ),
    ).rejects.toThrow();

    const revision = await curriculumService.createRevision(
      base.curriculum.curriculum.id,
      versionId,
      base.user.id,
      {
        revisionType: "Minor",
        revisionTriggers: ["ScheduledReview"],
        revisionReason: "Periodic review",
        changeSummary: "Carry the approved competency map into the next draft",
      },
    );
    const revisionMap = await curriculumCompetencyMapService.getMap(
      revision.selectedVersion.id,
    );
    expect(revisionMap.curriculumVersion.status).toBe("Draft");
    expect(revisionMap.framework?.frameworkVersionId).toBe(
      base.framework.frameworkVersionId,
    );
    expect(revisionMap.courses[0]?.mappings[0]).toMatchObject({
      competencyId: competency.id,
      teachLevel: "Basic",
      useLevel: "Intermediate",
      assessLevel: "Advanced",
    });
  });

  test("clearing all three dimensions deletes the mapping and records an audit event", async () => {
    const base = await createBase();
    const competency = base.framework.competencies[0]!;
    const versionId = base.curriculum.selectedVersion.id;

    await curriculumCompetencyMapService.updateMapping(
      versionId,
      base.placement.id,
      competency.id,
      base.user.id,
      {
        teachLevel: "Basic",
        useLevel: null,
        assessLevel: null,
        note: "",
      },
    );

    const cleared = await curriculumCompetencyMapService.updateMapping(
      versionId,
      base.placement.id,
      competency.id,
      base.user.id,
      {
        teachLevel: null,
        useLevel: null,
        assessLevel: null,
        note: "",
      },
    );

    expect(cleared.courses[0]?.mappings).toEqual([]);
    expect(cleared.summary.mappedCourseCount).toBe(0);
    expect(
      await prisma.programmeCurriculumAuditAction.count({
        where: {
          curriculumVersionId: versionId,
          action: "CompetencyMappingCleared",
        },
      }),
    ).toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
