import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient } from "@prisma/client";
import { curriculumCourseSpecService } from "./curriculum-course-spec-service.ts";
import { curriculumDraftService } from "./curriculum-draft-service.ts";
import { curriculumService } from "./curriculum-service.ts";
import {
  CurriculumWorkflowValidationError,
  curriculumWorkflowService,
} from "./curriculum-workflow-service.ts";

const describeDb = process.env.CURRICULUM_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb("curriculum CourseSpec binding", () => {
  test("binds only exact approved same-course specs and keeps history stable", async () => {
    const token = crypto.randomUUID().slice(0, 8);
    const actor = await prisma.user.create({
      data: { email: `curriculum-spec-${token}@example.test`, name: `Curriculum Spec ${token}` },
    });
    const programme = await prisma.programme.create({
      data: { id: `curriculum-spec-${token}`, code: `CS${token}`, name: `Curriculum Spec ${token}` },
    });
    const course = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `A-${token}`,
        title: "Course A",
        credits: 3,
        courseType: CourseType.Core,
      },
    });
    const otherCourse = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `B-${token}`,
        title: "Course B",
        credits: 3,
        courseType: CourseType.Core,
      },
    });

    const draftSpec = await prisma.courseSpec.create({
      data: { courseId: course.id, versionMajor: 1, versionMinor: 0 },
    });
    const approvedV11 = await prisma.courseSpec.create({
      data: {
        courseId: course.id,
        versionMajor: 1,
        versionMinor: 1,
        reviewStatus: "Approved",
        approvedAt: new Date(),
      },
    });
    const otherApproved = await prisma.courseSpec.create({
      data: {
        courseId: otherCourse.id,
        versionMajor: 1,
        versionMinor: 0,
        reviewStatus: "Approved",
        approvedAt: new Date(),
      },
    });

    const initial = await curriculumService.createInitial(programme.id, actor.id, {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "2026 intake",
      academicYear: "2026-2027",
      intakeYear: 2026,
    });
    const afterAdd = await curriculumDraftService.addCourse(initial.selectedVersion.id, actor.id, {
      courseId: course.id,
      yearLevel: 1,
      semester: "First",
      sortOrder: 0,
    });
    const placementId = afterAdd.years[0]!.semesters[0]!.courses[0]!.placementId;

    const unbound = await curriculumCourseSpecService.list(initial.selectedVersion.id);
    expect(unbound.activationReady).toBe(false);
    expect(unbound.missingBindingCount).toBe(1);
    expect(unbound.bindings[0]!.linkedVersion).toBeNull();
    expect(unbound.bindings[0]!.eligibleVersions.map((version) => version.id)).toContain(approvedV11.id);
    expect(unbound.bindings[0]!.eligibleVersions.map((version) => version.id)).not.toContain(draftSpec.id);

    await expect(
      curriculumCourseSpecService.bind(initial.selectedVersion.id, placementId, actor.id, {
        courseSpecVersionId: draftSpec.id,
      }),
    ).rejects.toThrow("Only an Approved CourseSpec");
    await expect(
      curriculumCourseSpecService.bind(initial.selectedVersion.id, placementId, actor.id, {
        courseSpecVersionId: otherApproved.id,
      }),
    ).rejects.toThrow("another course");

    const bound = await curriculumCourseSpecService.bind(initial.selectedVersion.id, placementId, actor.id, {
      courseSpecVersionId: approvedV11.id,
    });
    expect(bound.activationReady).toBe(true);
    expect(bound.bindings[0]!.linkedVersion?.id).toBe(approvedV11.id);

    await curriculumWorkflowService.submit(initial.selectedVersion.id, actor.id, "Review initial");
    await curriculumWorkflowService.approve(initial.selectedVersion.id, actor.id, "Approve initial");
    await curriculumWorkflowService.activate(initial.selectedVersion.id, actor.id, "Activate initial");

    const approvedV12 = await prisma.courseSpec.create({
      data: {
        courseId: course.id,
        versionMajor: 1,
        versionMinor: 2,
        basedOnVersionId: approvedV11.id,
        revisionType: "Minor",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "Updated specification",
        changeSummary: "New approved version",
        reviewStatus: "Approved",
        approvedAt: new Date(),
      },
    });

    const historical = await curriculumCourseSpecService.list(initial.selectedVersion.id);
    expect(historical.bindings[0]!.linkedVersion?.id).toBe(approvedV11.id);
    expect(historical.bindings[0]!.eligibleVersions.map((version) => version.id)).toContain(approvedV12.id);

    const revision = await curriculumService.createRevision(
      initial.curriculum.id,
      initial.selectedVersion.id,
      actor.id,
      {
        revisionType: "Minor",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "Adopt newer approved course specification",
        changeSummary: "Update exact CourseSpec evidence binding",
      },
    );
    const inherited = await curriculumCourseSpecService.list(revision.selectedVersion.id);
    expect(inherited.bindings[0]!.linkedVersion?.id).toBe(approvedV11.id);

    const revised = await curriculumCourseSpecService.bind(
      revision.selectedVersion.id,
      inherited.bindings[0]!.placementId,
      actor.id,
      { courseSpecVersionId: approvedV12.id },
    );
    expect(revised.bindings[0]!.linkedVersion?.id).toBe(approvedV12.id);
    expect((await curriculumCourseSpecService.list(initial.selectedVersion.id)).bindings[0]!.linkedVersion?.id).toBe(approvedV11.id);
  });

  test("activation fails closed when a placement has no approved CourseSpec binding", async () => {
    const token = crypto.randomUUID().slice(0, 8);
    const actor = await prisma.user.create({
      data: { email: `curriculum-missing-${token}@example.test`, name: `Curriculum Missing ${token}` },
    });
    const programme = await prisma.programme.create({
      data: { id: `curriculum-missing-${token}`, code: `CM${token}`, name: `Curriculum Missing ${token}` },
    });
    const course = await prisma.course.create({
      data: {
        programmeId: programme.id,
        code: `M-${token}`,
        title: "Missing Spec Course",
        credits: 3,
        courseType: CourseType.Core,
      },
    });
    const initial = await curriculumService.createInitial(programme.id, actor.id, {
      code: `MISS-${token}`,
      name: `Missing ${token}`,
      cohortLabel: "2026 intake",
      academicYear: "2026-2027",
    });
    await curriculumDraftService.addCourse(initial.selectedVersion.id, actor.id, {
      courseId: course.id,
      yearLevel: 1,
      semester: "First",
    });
    await curriculumWorkflowService.submit(initial.selectedVersion.id, actor.id, "Review");
    await curriculumWorkflowService.approve(initial.selectedVersion.id, actor.id, "Approve");

    await expect(
      curriculumWorkflowService.activate(initial.selectedVersion.id, actor.id, "Activate"),
    ).rejects.toBeInstanceOf(CurriculumWorkflowValidationError);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
