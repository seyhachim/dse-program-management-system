import { afterAll, describe, expect, test } from "bun:test";
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { registry } from "../../core/plugins/registry.ts";
import { curriculumService } from "../programme/curriculum-service.ts";
import { competencyFrameworkService } from "../programme/competency-framework-service.ts";
import { curriculumCompetencyMapService } from "../programme/curriculum-competency-map-service.ts";
import { courseCompetencyContextService } from "../programme/course-competency-context-service.ts";
import { curriculumCourseSpecService } from "../programme/curriculum-course-spec-service.ts";
import { gradingScaleService } from "../programme/grading-scale-service.ts";
import { courseSpecCompetencyEvidenceService } from "./competency-evidence-service.ts";
import { courseSpecRevisionService } from "./revision-service.ts";
import { CourseSpecLockedError } from "./spec-lock.ts";

const dbTestsEnabled = process.env.COURSE_SPEC_COMPETENCY_DB_TESTS === "1";
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
    description: "Course competency evidence test fixture",
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

if (!registry.has("programme")) {
  registry.register({
    manifest: {
      id: "programme",
      name: "Programme test service",
      version: "test",
    },
    router: Router(),
    service: {
      getCourseSpecCompetencyContext:
        courseCompetencyContextService.getCourseSpecCompetencyContext,
    },
  });
}

async function createBase() {
  const token = suffix();
  const user = await prisma.user.create({
    data: {
      email: `course-evidence-${token}@example.test`,
      name: `Course Evidence ${token}`,
    },
  });
  const programme = await prisma.programme.create({
    data: {
      id: `course-evidence-${token}`,
      code: `CE${token}`,
      name: `Course Evidence Programme ${token}`,
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
      code: `EVD-${token}`,
      title: "Evidence Course",
      programmeId: programme.id,
      credits: 3,
      courseType: "Core",
      totalSltHours: 120,
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
      changeNote: "Evidence baseline",
    },
  );
  await competencyFrameworkService.bindToCurriculumVersion(
    curriculum.selectedVersion.id,
    framework.frameworkVersionId,
    user.id,
  );
  const competency = framework.competencies[0]!;
  await curriculumCompetencyMapService.updateMapping(
    curriculum.selectedVersion.id,
    placement.id,
    competency.id,
    user.id,
    {
      teachLevel: "Intermediate",
      useLevel: "Advanced",
      assessLevel: "Advanced",
      note: "Programme expectation",
    },
  );
  await createApprovedDefaultGradingScale(programme.id, user.id);
  const baselineSpec = await prisma.courseSpec.create({
    data: {
      courseId: course.id,
      versionMajor: 1,
      versionMinor: 0,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    },
  });
  const approvedBaselineSpec = await prisma.courseSpec.update({
    where: { id: baselineSpec.id },
    data: {
      reviewStatus: "Approved",
      approvedAt: new Date(),
    },
  });
  await curriculumCourseSpecService.bind(
    curriculum.selectedVersion.id,
    placement.id,
    user.id,
    { courseSpecVersionId: approvedBaselineSpec.id },
  );
  await prisma.programmeCurriculumVersion.update({
    where: { id: curriculum.selectedVersion.id },
    data: { status: "Active", approvedAt: new Date() },
  });

  const cloId = crypto.randomUUID();
  const weekId = crypto.randomUUID();
  const assessmentId = crypto.randomUUID();
  const spec = await prisma.courseSpec.create({
    data: {
      courseId: course.id,
      versionMajor: 1,
      versionMinor: 1,
      basedOnVersionId: approvedBaselineSpec.id,
      revisionType: "Minor",
      revisionTriggers: ["ScheduledReview"],
      revisionReason: "Competency evidence fixture",
      changeSummary: "Draft competency evidence revision",
      reviewStatus: "Draft",
      clos: {
        create: {
          id: cloId,
          order: 0,
          description: "Analyse temporal data and justify conclusions",
          level: "C4",
          mappedPlos: ["PLO2"],
          sltHours: 40,
          status: "Active",
        },
      },
      weeks: {
        create: {
          id: weekId,
          order: 0,
          week: 1,
          topic: "Pattern analysis",
          cloCodes: ["CLO1"],
          activities: ["Practical analysis"],
          studentLearningActivities: [
            {
              id: "activity-1",
              title: "Analyse a real dataset",
              description: "",
              lloIds: [],
            },
          ],
          lectureHours: 1,
          practiceHours: 2,
          selfStudyHours: 2,
        },
      },
      assessmentItems: {
        create: {
          id: assessmentId,
          order: 0,
          name: "Time Series Project",
          type: "Project",
          status: "Active",
          cloCodes: ["CLO1"],
          weight: 40,
        },
      },
    },
  });

  return {
    user,
    programme,
    curriculum,
    course,
    placement,
    framework,
    competency,
    spec,
    cloId,
  };
}

describeDb("CourseSpec competency evidence", () => {
  test("links CLOs, derives T/U/A source coverage, and blocks locked edits", async () => {
    const base = await createBase();

    await expect(
      courseSpecCompetencyEvidenceService.save(
        base.course.id,
        crypto.randomUUID(),
        { cloIds: [base.cloId] },
      ),
    ).rejects.toThrow(
      "Competency is not mapped to this course in the authoritative curriculum context",
    );

    await expect(
      courseSpecCompetencyEvidenceService.save(
        base.course.id,
        base.competency.id,
        { cloIds: [crypto.randomUUID()] },
      ),
    ).rejects.toThrow("CLO evidence must belong to this Course Specification");

    const saved = await courseSpecCompetencyEvidenceService.save(
      base.course.id,
      base.competency.id,
      { cloIds: [base.cloId] },
    );

    expect(saved.summary).toEqual({
      expectedCompetencies: 1,
      evidencedCompetencies: 1,
      needsAttention: 0,
    });
    expect(saved.items[0]).toMatchObject({
      teachStatus: "evidenced",
      useStatus: "evidenced",
      assessStatus: "evidenced",
    });
    expect(saved.items[0]?.evidence?.linkedCloCodes).toEqual(["CLO1"]);
    expect(saved.items[0]?.teachingWeeks).toHaveLength(1);
    expect(saved.items[0]?.applicationWeeks).toHaveLength(1);
    expect(saved.items[0]?.assessments).toHaveLength(1);

    await prisma.courseSpecCompetencyEvidence.updateMany({
      where: { courseSpecId: base.spec.id },
      data: { teachLevel: "Basic" },
    });
    const stale = await courseSpecCompetencyEvidenceService.get(base.course.id);
    expect(stale.items[0]?.evidence?.stale).toBe(true);

    await prisma.courseSpec.update({
      where: { id: base.spec.id },
      data: {
        reviewStatus: "Approved",
        approvedAt: new Date(),
      },
    });

    await expect(
      courseSpecCompetencyEvidenceService.save(
        base.course.id,
        base.competency.id,
        { cloIds: [] },
      ),
    ).rejects.toBeInstanceOf(CourseSpecLockedError);

    await expect(
      Promise.resolve(
        prisma.courseSpecCompetencyEvidence.updateMany({
          where: { courseSpecId: base.spec.id },
          data: { competencyName: "Should not change" },
        }),
      ),
    ).rejects.toThrow();
  });

  test("carries evidence to an academic revision and remaps cloned CLO ids", async () => {
    const base = await createBase();
    await courseSpecCompetencyEvidenceService.save(
      base.course.id,
      base.competency.id,
      { cloIds: [base.cloId] },
    );
    await prisma.courseSpec.update({
      where: { id: base.spec.id },
      data: {
        reviewStatus: "Approved",
        approvedAt: new Date(),
      },
    });

    const revision = await courseSpecRevisionService.createCourseSpecRevision({
      courseId: base.course.id,
      revisionType: "Minor",
      triggers: ["ScheduledReview"],
      reason: "Periodic review",
      changeSummary: "Carry competency evidence forward for review",
      initiatedById: base.user.id,
    });

    const cloned = await prisma.courseSpecCompetencyEvidence.findFirstOrThrow({
      where: { courseSpecId: revision.id },
      include: { cloLinks: true },
    });

    expect(cloned.competencyId).toBe(base.competency.id);
    expect(cloned.sourceCurriculumVersionId).toBe(
      base.curriculum.selectedVersion.id,
    );
    expect(cloned.cloLinks).toHaveLength(1);
    expect(cloned.cloLinks[0]?.cloId).not.toBe(base.cloId);

    const clonedClo = await prisma.courseSpecClo.findUniqueOrThrow({
      where: {
        courseSpecId_id: {
          courseSpecId: revision.id,
          id: cloned.cloLinks[0]!.cloId,
        },
      },
    });
    expect(clonedClo.description).toContain("Analyse temporal data");

    await prisma.courseSpec.delete({ where: { id: revision.id } });
    expect(
      await prisma.courseSpecCompetencyEvidence.count({
        where: { courseSpecId: revision.id },
      }),
    ).toBe(0);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
