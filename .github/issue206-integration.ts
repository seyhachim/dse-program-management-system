import { prisma } from "../apps/backend/src/core/db/prisma.ts";
import { courseSpecRevisionService } from "../apps/backend/src/plugins/courses/revision-service.ts";

const courseId = "00000000-0000-0000-0000-000000206001";
const userId = "00000000-0000-0000-0000-000000206002";
const sourceId = "00000000-0000-0000-0000-000000206003";
const oldWeekId = "00000000-0000-0000-0000-000000206004";
const oldAssessmentId = "00000000-0000-0000-0000-000000206005";

await prisma.programme.upsert({
  where: { id: "dse" },
  update: {},
  create: { id: "dse", code: "DSE", name: "Data Science and Engineering" },
});
await prisma.user.create({ data: { id: userId, email: "revision206@example.test", name: "Revision Initiator" } });
await prisma.course.create({ data: { id: courseId, code: "REV206", title: "Revision Clone Test", programmeId: "dse" } });
await prisma.courseSpec.create({
  data: {
    id: sourceId,
    courseId,
    versionMajor: 1,
    versionMinor: 4,
    reviewStatus: "Approved",
    submissionVersion: 3,
    approvedAt: new Date("2026-01-15T00:00:00Z"),
    sections: { create: [{ sectionKey: "slt", status: "Complete" }, { sectionKey: "assessmentPlan", status: "Complete" }] },
    weeks: { create: [{ id: oldWeekId, order: 0, week: 1, topic: "Original week", cloCodes: ["CLO1"] }] },
    assessmentItems: { create: [{ id: oldAssessmentId, order: 0, name: "Original assessment", type: "Quiz", cloCodes: ["CLO1"] }] },
    mappingCells: { create: [
      { cloCode: "CLO1", kind: "Week", ref: oldWeekId, strength: 2 },
      { cloCode: "CLO1", kind: "Assessment", ref: oldAssessmentId, strength: 3 },
    ] },
    resources: { create: [{ id: "00000000-0000-0000-0000-000000206006", order: 0, resourceType: "slides", title: "Slides", weekId: oldWeekId, evidenceWeekIds: [oldWeekId] }] },
    studentResponsibilities: { create: [{ id: "00000000-0000-0000-0000-000000206007", order: 0, text: "Prepare" }] },
    policy: { create: { attendancePreparation: "Attend" } },
    teachingLearning: { create: { philosophyTags: ["active"], teachingMethodIds: ["tm-test"] } },
    weekProjectProgress: { create: [{ weekId: oldWeekId, milestone: "M1" }] },
  },
});

const revision = await courseSpecRevisionService.createCourseSpecRevision({
  courseId,
  revisionType: "Minor",
  triggers: ["StudentFeedback"],
  reason: "Feedback",
  changeSummary: "Improve delivery",
  initiatedById: userId,
});
if (`${revision.versionMajor}.${revision.versionMinor}` !== "1.5") throw new Error("Expected 1.5");
if (revision.submissionVersion !== 0 || revision.reviewStatus !== "Draft") throw new Error("New revision workflow was not reset");
if (revision.basedOnVersionId !== sourceId) throw new Error("Revision provenance missing");

const cloned = await prisma.courseSpec.findUniqueOrThrow({
  where: { id: revision.id },
  include: { weeks: true, assessmentItems: true, mappingCells: true, resources: true, policy: true, teachingLearning: true, weekProjectProgress: true },
});
const clonedWeek = cloned.weeks[0]!;
const clonedAssessment = cloned.assessmentItems[0]!;
if (clonedWeek.id === oldWeekId || clonedAssessment.id === oldAssessmentId) throw new Error("Child IDs were not regenerated");
if (cloned.mappingCells.find((c) => c.kind === "Week")?.ref !== clonedWeek.id) throw new Error("Week mapping ref was not remapped");
if (cloned.mappingCells.find((c) => c.kind === "Assessment")?.ref !== clonedAssessment.id) throw new Error("Assessment mapping ref was not remapped");
if (cloned.resources[0]?.weekId !== clonedWeek.id || cloned.resources[0]?.evidenceWeekIds[0] !== clonedWeek.id) throw new Error("Resource week evidence was not remapped");
if (cloned.weekProjectProgress[0]?.weekId !== clonedWeek.id) throw new Error("Project progress week was not remapped");
if (!cloned.policy || !cloned.teachingLearning) throw new Error("Normalized one-to-one content was not cloned");

const source = await prisma.courseSpec.findUniqueOrThrow({ where: { id: sourceId }, include: { weeks: true } });
if (source.reviewStatus !== "Approved" || source.weeks[0]?.id !== oldWeekId || source.submissionVersion !== 3) throw new Error("Approved source was mutated");

let conflict = false;
try {
  await courseSpecRevisionService.createCourseSpecRevision({
    courseId,
    revisionType: "Major",
    triggers: ["ProgrammeCoordinator"],
    reason: "Second open revision",
    changeSummary: "Should fail",
    initiatedById: userId,
  });
} catch (error: any) {
  conflict = error?.code === "OPEN_REVISION_EXISTS";
}
if (!conflict) throw new Error("Expected one-open-revision protection");

console.log("revision clone integration passed");
await prisma.$disconnect();
