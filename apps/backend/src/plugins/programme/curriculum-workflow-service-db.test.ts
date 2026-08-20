import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient } from "@prisma/client";
import { curriculumCourseSpecService } from "./curriculum-course-spec-service.ts";
import { curriculumDraftService, CurriculumDraftMutationError } from "./curriculum-draft-service.ts";
import { gradingScaleService } from "./grading-scale-service.ts";
import { curriculumService } from "./curriculum-service.ts";
import {
  CurriculumWorkflowTransitionError,
  CurriculumWorkflowValidationError,
  curriculumWorkflowService,
} from "./curriculum-workflow-service.ts";

const describeDb = process.env.CURRICULUM_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

async function createFixtureGradingScale(programmeId: string, userId: string) {
  const draft = await gradingScaleService.create(userId, {
    programmeId,
    code: "standard",
    name: "Workflow Test Grading Scale",
    description: "Minimal complete grading scale for curriculum workflow tests",
    effectiveFrom: "2026-01-01",
    changeSummary: "Test fixture policy",
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
  await gradingScaleService.approve(draft.id, userId, {
    note: "Approved fixture grading policy",
  });
}

async function fixture(complete = true) {
  const token = crypto.randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { email: `workflow-${token}@example.test`, name: `Workflow ${token}` } });
  const programme = await prisma.programme.create({ data: { id: `workflow-${token}`, code: `W${token}`, name: `Workflow Programme ${token}` } });
  await createFixtureGradingScale(programme.id, user.id);
  const initial = await curriculumService.createInitial(programme.id, user.id, {
    code: `CURR-${token}`,
    name: `Curriculum ${token}`,
    cohortLabel: complete ? "2026 intake" : "",
    intakeYear: 2026,
    academicYear: complete ? "2026-2027" : "",
    effectiveFrom: "2026-09-01",
  });
  const course = await prisma.course.create({ data: { programmeId: programme.id, code: `C-${token}`, title: `Course ${token}`, credits: 3, courseType: CourseType.Core } });
  if (complete) {
    const spec = await prisma.courseSpec.create({
      data: {
        courseId: course.id,
        reviewStatus: "Approved",
        approvedAt: new Date(),
      },
    });
    const read = await curriculumDraftService.addCourse(initial.selectedVersion.id, user.id, { courseId: course.id, yearLevel: 1, semester: "First", sortOrder: 0 });
    const placementId = read.years[0]!.semesters[0]!.courses[0]!.placementId;
    await curriculumCourseSpecService.bind(initial.selectedVersion.id, placementId, user.id, {
      courseSpecVersionId: spec.id,
    });
  }
  return { user, programme, course, curriculumId: initial.curriculum.id, versionId: initial.selectedVersion.id };
}

describeDb("curriculum workflow service", () => {
  test("supports Draft → UnderReview → Draft → UnderReview → Approved → Active with append-only history", async () => {
    const f = await fixture();
    let state = await curriculumWorkflowService.submit(f.versionId, f.user.id, "Ready for review");
    expect(state.status).toBe("UnderReview");

    await expect(
      curriculumDraftService.addCourse(f.versionId, f.user.id, {
        courseId: (await prisma.course.create({ data: { programmeId: f.programme.id, code: `LOCK-${crypto.randomUUID().slice(0, 5)}`, title: "Locked", credits: 2, courseType: CourseType.Basic } })).id,
        yearLevel: 1,
        semester: "First",
        sortOrder: 1,
      }),
    ).rejects.toBeInstanceOf(CurriculumDraftMutationError);

    state = await curriculumWorkflowService.requestChanges(f.versionId, f.user.id, "Add committee clarification");
    expect(state.status).toBe("Draft");
    state = await curriculumWorkflowService.submit(f.versionId, f.user.id, "Clarification completed");
    expect(state.status).toBe("UnderReview");
    state = await curriculumWorkflowService.approve(f.versionId, f.user.id, "Approved by programme committee");
    expect(state.status).toBe("Approved");
    state = await curriculumWorkflowService.activate(f.versionId, f.user.id, "Effective for current intake");
    expect(state.status).toBe("Active");

    const actions = await prisma.programmeCurriculumAuditAction.findMany({ where: { curriculumVersionId: f.versionId }, orderBy: { createdAt: "asc" } });
    expect(actions.some((a) => a.action === "Approved")).toBe(true);
    expect(actions.some((a) => a.action === "Activated")).toBe(true);
    expect(actions.filter((a) => a.action === "MetadataUpdated").length).toBeGreaterThanOrEqual(3);
  });

  test("blocks incomplete submission and invalid transitions", async () => {
    const f = await fixture(false);
    await expect(curriculumWorkflowService.submit(f.versionId, f.user.id, "Review")).rejects.toBeInstanceOf(CurriculumWorkflowValidationError);
    await expect(curriculumWorkflowService.approve(f.versionId, f.user.id, "Skip review")).rejects.toBeInstanceOf(CurriculumWorkflowTransitionError);
  });

  test("activation atomically supersedes the prior active version", async () => {
    const f = await fixture();
    await curriculumWorkflowService.submit(f.versionId, f.user.id, "Review v1");
    await curriculumWorkflowService.approve(f.versionId, f.user.id, "Approve v1");
    await curriculumWorkflowService.activate(f.versionId, f.user.id, "Activate v1");

    const revision = await curriculumService.createRevision(f.curriculumId, f.versionId, f.user.id, {
      revisionType: "Minor",
      revisionTriggers: ["ProgrammeCoordinator"],
      revisionReason: "Annual curriculum improvement",
      changeSummary: "Minor sequencing update",
      cohortLabel: "2027 intake",
      academicYear: "2027-2028",
      effectiveFrom: "2027-09-01",
    });
    const revisionId = revision.selectedVersion.id;
    await curriculumWorkflowService.submit(revisionId, f.user.id, "Review v1.1");
    await curriculumWorkflowService.approve(revisionId, f.user.id, "Approve v1.1");
    await curriculumWorkflowService.activate(revisionId, f.user.id, "Activate v1.1");

    const statuses = await prisma.programmeCurriculumVersion.findMany({ where: { curriculumId: f.curriculumId }, select: { id: true, status: true } });
    expect(statuses.find((v) => v.id === f.versionId)?.status).toBe("Superseded");
    expect(statuses.find((v) => v.id === revisionId)?.status).toBe("Active");
    expect(statuses.filter((v) => v.status === "Active")).toHaveLength(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
