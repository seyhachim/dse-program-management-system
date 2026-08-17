import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { courseService } from "./service.ts";
import { courseSpecRevisionRequestService } from "./revision-request-service.ts";

const runDbTests = process.env.COURSE_SPEC_REVISION_REQUEST_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("CourseSpec revision request metadata", () => {
  test("creates a draft through the revision service and freezes the impact decision", async () => {
    const suffix = randomUUID();
    const coordinatorRole = await prisma.role.findUniqueOrThrow({
      where: { slug: "program_coordinator" },
    });
    const coordinator = await prisma.user.create({
      data: {
        email: `issue208-${suffix}@dse.invalid`,
        name: "Issue 208 Coordinator",
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        userId: coordinator.id,
        roleId: coordinatorRole.id,
        programmeId: "dse",
      },
    });
    const course = await prisma.course.create({
      data: {
        code: `I208-${suffix.slice(0, 8)}`,
        title: "Revision Governance Fixture",
        description: "Initial approved description",
        credits: 3,
        courseType: "Core",
        totalSltHours: 120,
        programmeId: "dse",
      },
    });

    await courseService.saveSection(course.id, "courseInfo", {
      prerequisites: "None",
      description: "Initial approved description",
    });
    const source = await prisma.courseSpec.findFirstOrThrow({
      where: { courseId: course.id },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
    });
    await prisma.courseSpec.update({
      where: { id: source.id },
      data: { reviewStatus: "Approved", approvedAt: new Date() },
    });

    const created = await courseSpecRevisionRequestService.create(
      course.id,
      coordinator.id,
      {
        triggers: ["StudentFeedback", "ProgrammeCoordinator"],
        evidenceSummary:
          "Student feedback and programme review indicate the CLO wording requires a material clarification.",
        changeSummary:
          "Revise CLO wording and associated teaching narrative while retaining the approved course scope.",
        impact: {
          courseCodeOrTitle: false,
          creditsOrSlt: false,
          prerequisites: false,
          materialCloChanges: true,
          bloomOrCapLevels: false,
          cloPloAlignment: false,
          assessmentStructureOrWeighting: false,
          curriculumOrRegulatoryAlignment: false,
        },
        proposedRevisionType: "Minor",
        effectiveAcademicTerm: "2027-2028 Semester I",
        overrideJustification:
          "The wording changes are material for clarity but do not change scope, level, alignment, or assessment expectations.",
      },
    );

    expect(created.revision.reviewStatus).toBe("Draft");
    expect(created.revision.revisionType).toBe("Minor");
    expect(created.revision.basedOnVersionId).toBe(source.id);
    expect(created.request.proposedRevisionType).toBe("Minor");
    expect(created.request.recommendedRevisionType).toBe("Major");
    expect(created.request.impact.materialCloChanges).toBe(true);
    expect(created.request.effectiveAcademicTerm).toBe("2027-2028 Semester I");

    const persisted = await prisma.courseSpecRevisionRequest.findUniqueOrThrow({
      where: { courseSpecId: created.revision.id },
    });
    expect(persisted.requestedById).toBe(coordinator.id);
    expect(persisted.recommendedRevisionType).toBe("Major");

    let updateRejected = false;
    try {
      await prisma.courseSpecRevisionRequest.update({
        where: { id: persisted.id },
        data: { evidenceSummary: "Attempted rewrite" },
      });
    } catch {
      updateRejected = true;
    }
    expect(updateRejected).toBe(true);

    let deleteRejected = false;
    try {
      await prisma.courseSpecRevisionRequest.delete({ where: { id: persisted.id } });
    } catch {
      deleteRejected = true;
    }
    expect(deleteRejected).toBe(true);

    const sourceAfter = await prisma.courseSpec.findUniqueOrThrow({ where: { id: source.id } });
    expect(sourceAfter.reviewStatus).toBe("Approved");
  });
});
