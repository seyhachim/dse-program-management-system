import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient } from "@prisma/client";
import { curriculumDraftService } from "./curriculum-draft-service.ts";
import { curriculumHistoryService } from "./curriculum-history-service.ts";
import { curriculumService } from "./curriculum-service.ts";
import { curriculumWorkflowService } from "./curriculum-workflow-service.ts";

const describeDb = process.env.CURRICULUM_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb("curriculum history service", () => {
  test("orders versions newest-first and audit actions append-only oldest-first", async () => {
    const token = crypto.randomUUID().slice(0, 8);
    const user = await prisma.user.create({ data: { email: `history-${token}@example.test`, name: `History ${token}` } });
    const programme = await prisma.programme.create({ data: { id: `history-${token}`, code: `H${token}`, name: `History ${token}` } });
    const initial = await curriculumService.createInitial(programme.id, user.id, {
      code: `CURR-${token}`,
      name: `Curriculum ${token}`,
      cohortLabel: "2026 intake",
      academicYear: "2026-2027",
      intakeYear: 2026,
    });
    const course = await prisma.course.create({ data: { programmeId: programme.id, code: `C-${token}`, title: "History Course", credits: 3, courseType: CourseType.Core } });
    await curriculumDraftService.addCourse(initial.selectedVersion.id, user.id, { courseId: course.id, yearLevel: 1, semester: "First", sortOrder: 0 });
    await curriculumWorkflowService.submit(initial.selectedVersion.id, user.id, "Review initial");
    await curriculumWorkflowService.approve(initial.selectedVersion.id, user.id, "Approve initial");
    await curriculumWorkflowService.activate(initial.selectedVersion.id, user.id, "Activate initial");

    const revision = await curriculumService.createRevision(initial.curriculum.id, initial.selectedVersion.id, user.id, {
      revisionType: "Minor",
      revisionTriggers: ["ProgrammeCoordinator"],
      revisionReason: "Annual improvement",
      changeSummary: "Sequencing review",
    });

    const history = await curriculumHistoryService.history(initial.curriculum.id);
    expect(history.versions.map((item) => item.version.id).slice(0, 2)).toEqual([
      revision.selectedVersion.id,
      initial.selectedVersion.id,
    ]);
    const initialActions = history.versions.find((item) => item.version.id === initial.selectedVersion.id)!.auditActions;
    expect(initialActions.length).toBeGreaterThanOrEqual(5);
    for (let index = 1; index < initialActions.length; index += 1) {
      expect(new Date(initialActions[index - 1]!.createdAt).getTime()).toBeLessThanOrEqual(
        new Date(initialActions[index]!.createdAt).getTime(),
      );
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
