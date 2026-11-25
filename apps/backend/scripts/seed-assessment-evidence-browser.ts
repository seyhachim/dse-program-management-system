import { prisma } from "../src/core/db/prisma.ts";
import { groupAssessmentService } from "../src/plugins/student-portal/group-assessment-results.ts";
import { resultsLifecycleService } from "../src/plugins/student-portal/results-lifecycle.ts";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "postgresql://invalid@remote.invalid/invalid");
  if (!["127.0.0.1","localhost"].includes(db.hostname) || db.pathname !== "/dse_browser" || process.env.CI !== "true")
    throw new Error("Synthetic evidence pilot requires disposable CI browser database");
  const lecturer = await prisma.user.findUniqueOrThrow({ where: { email: "lecturer@dse.dev" } });
  const course = await prisma.course.create({ data: { code: "TSA301-CI", title: "Synthetic Time Series Analysis Pilot", programmeId: "dse" } });
  const spec = await prisma.courseSpec.create({ data: {
    courseId: course.id, versionMajor: 1, versionMinor: 0, revisionType: "Major", revisionTriggers: ["ProgrammeCoordinator"],
    revisionReason: "Synthetic browser fixture", changeSummary: "Not an official TSA301 specification",
    reviewStatus: "Approved", approvedAt: new Date(),
    assessmentItems: { create: [
      { id: "pilot-lab", name: "Synthetic forecasting lab", type: "Assignment", mode: "Individual", status: "Active", weight: 50, order: 0 },
      { id: "pilot-project", name: "Synthetic group project and defence", type: "Project + Defense", mode: "GroupIndividual", groupWeight: 70, individualWeight: 30, status: "Active", weight: 50, order: 1 },
    ] },
  } });
  for (const sectionCode of ["M1","M2"]) {
    const offering = await prisma.offering.create({ data: { courseId: course.id, courseSpecId: spec.id, lecturerId: lecturer.id, term: "Evidence pilot CI only", sectionCode, status: "Active" } });
    const enrollmentIds: string[] = [];
    for (const index of [0,1,2]) {
      const code = "TSA-CI-" + sectionCode + "-" + (index + 1);
      const student = await prisma.student.create({ data: { name: "Synthetic " + sectionCode + " Learner " + (index + 1), email: code.toLowerCase() + "@example.invalid", studentId: code, status: "Active" } });
      const enrollment = await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });
      enrollmentIds.push(enrollment.id);
    }
    // Enroll the entire roster before finalizing any result; the roster lock is intentional.
    for (const [index, score] of [40,70,90].entries()) {
      const enrollmentId = enrollmentIds[index]!;
      const result = await prisma.assessmentResult.create({ data: { enrollmentId, courseSpecId: spec.id, assessmentItemId: "pilot-lab", score, maxScore: 100, feedback: "Synthetic marked work", publishedAt: new Date(), publishedById: lecturer.id } });
      await prisma.assessmentResult.update({ where: { id: result.id }, data: { finalizedAt: new Date(), finalizedById: lecturer.id } });
    }
    const groups = await groupAssessmentService.replaceGroups(lecturer.id, false, offering.id, "pilot-project", { groups: [{ name: "Synthetic " + sectionCode + " Group", enrollmentIds }] });
    await groupAssessmentService.saveGroupScore(lecturer.id, false, offering.id, "pilot-project", groups.groups[0]!.id, { score: 80, maxScore: 100, feedback: "Synthetic shared score" });
    for (const [i, id] of enrollmentIds.entries()) await groupAssessmentService.saveIndividualComponent(lecturer.id, false, offering.id, "pilot-project", id, { score: 60 + i * 10, maxScore: 100, feedback: "Synthetic individual defence", adjustmentPoints: 0, adjustmentReason: "" });
    await resultsLifecycleService.publishAssessment(lecturer.id, false, { offeringId: offering.id, assessmentItemId: "pilot-project" });
    await resultsLifecycleService.finalizeAssessment(lecturer.id, false, { offeringId: offering.id, assessmentItemId: "pilot-project" });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
