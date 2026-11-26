import { randomUUID } from "node:crypto";
import { prisma } from "../src/core/db/prisma.ts";
import { ensureCourseSpecThemeSnapshot } from "../src/plugins/courses/document-theme-service.ts";
import { gradingScaleService } from "../src/plugins/programme/grading-scale-service.ts";

/**
 * Local browser smoke only. Do not backfill an Approved version's style or
 * grading policy from current defaults; create and lock a fresh fixture instead.
 */
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/dse_browser") {
    throw new Error("Refusing fixture creation outside the local disposable dse_browser database");
  }
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (rows[0]?.name !== "dse_browser") throw new Error("Unexpected browser database identity");

  const token = randomUUID().slice(0, 8);
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: "admin@dse.dev" } });
  const programme = await prisma.programme.findUniqueOrThrow({ where: { id: "dse" } });
  const course = await prisma.course.create({
    data: { programmeId: programme.id, code: `BROWSER-DOC-${token}`,
      title: "Synthetic contextual document course", credits: 3, courseType: "Core", totalSltHours: 120 },
  });
  const scale = await gradingScaleService.create(actor.id, {
    programmeId: programme.id, code: `BROWSER-DOC-${token}`, name: "Synthetic browser document scale",
    description: "Disposable contextual PDF and Word verification", effectiveFrom: "2020-01-01",
    changeSummary: "Browser smoke fixture",
    grades: [
      { sortOrder: 1, letterGrade: "P", gradePoint: 1, minScore: 50, maxScore: 100, minInclusive: true, maxInclusive: true, explanation: "Pass", isPassing: true },
      { sortOrder: 2, letterGrade: "F", gradePoint: 0, minScore: 0, maxScore: 50, minInclusive: true, maxInclusive: false, explanation: "Fail", isPassing: false },
    ],
  });
  const approvedScale = await gradingScaleService.approve(scale.id, actor.id, { note: "Disposable browser smoke grading policy" });
  const spec = await prisma.courseSpec.create({
    data: { courseId: course.id, gradingScaleVersionId: approvedScale.id, reviewStatus: "Draft" },
  });
  await prisma.courseSpecCourseInfo.create({
    data: { courseSpecId: spec.id, programmeTitle: programme.name, courseTitle: course.title,
      courseCode: course.code, credits: 3, courseType: "Core", totalSltHours: 120,
      description: "Synthetic fixture for contextual document exports", semester: "First", programmeYear: 1 },
  });
  const theme = await ensureCourseSpecThemeSnapshot(course.id, spec.id);
  if (!theme) throw new Error("Could not prepare synthetic document theme");
  // This is a deliberately minimal disposable DB fixture, not an academic
  // workflow override exposed to the application or used on existing records.
  await prisma.courseSpec.update({
    where: { id: spec.id },
    data: { reviewStatus: "Approved", approvedAt: new Date(), submissionVersion: 1 },
  });
  console.log(JSON.stringify({ courseId: course.id, specId: spec.id }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Browser fixture preparation failed");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
