// Synthetic browser acceptance fixture. Never run against a hosted database.
import { randomUUID } from "node:crypto";
import { prisma } from "../src/core/db/prisma.ts";
import { signToken } from "../src/core/auth/token.ts";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/dse_browser" ||
      process.env.AUTH_MODE !== "dev" || !process.env.JWT_SECRET) {
    throw new Error("Project Groups browser fixture requires isolated local dse_browser and dev auth");
  }
  const suffix = randomUUID().slice(0, 8);
  const lecturer = await prisma.user.findUniqueOrThrow({ where: { email: "lecturer@dse.dev" } });
  const studentRole = await prisma.role.findUniqueOrThrow({ where: { slug: "student" } });
  const course = await prisma.course.create({ data: {
    code: "SYN1352-" + suffix, title: "Synthetic Project Group Browser UAT",
    programmeId: "dse", lecturerId: lecturer.id,
  } });
  const spec = await prisma.courseSpec.create({ data: { courseId: course.id } });
  const item = await prisma.courseSpecAssessmentItem.create({ data: {
    courseSpecId: spec.id, order: 0, name: "Forecasting team project",
    type: "Project", mode: "Group", status: "Active", weight: 100,
  } });
  await prisma.courseSpec.update({ where: { id: spec.id }, data: {
    reviewStatus: "Approved", submissionVersion: 1, approvedAt: new Date(),
  } });
  async function offering(sectionCode: string) {
    return prisma.offering.create({ data: {
      courseId: course.id, courseSpecId: spec.id, lecturerId: lecturer.id,
      term: "1352-browser-" + suffix, sectionCode, status: "Active", capacity: 10,
    } });
  }
  const first = await offering("M1");
  const second = await offering("M2");
  async function student(label: string, offeringId: string) {
    const name = "Synthetic 1352 " + label + " " + suffix;
    const email = "synthetic-1352-" + label.toLowerCase() + "-" + suffix + "@dse.invalid";
    const user = await prisma.user.create({ data: { name, email } });
    await prisma.userRoleAssignment.create({ data: {
      userId: user.id, roleId: studentRole.id, programmeId: "dse",
    } });
    const profile = await prisma.student.create({ data: {
      name, email, studentId: "SYN1352-" + label + "-" + suffix, userId: user.id, status: "Active",
    } });
    const enrollment = await prisma.enrollment.create({ data: { offeringId, studentId: profile.id } });
    const token = signToken({ id: user.id, email, roles: ["student"],
      programmeRoles: [{ role: "student", programmeId: "dse" }] }, "1h");
    return { name, email, token, enrollmentId: enrollment.id };
  }
  const a = await student("A", first.id);
  const b = await student("B", first.id);
  const outsider = await student("Outsider", second.id);
  console.log(JSON.stringify({ offeringId: first.id, otherOfferingId: second.id,
    assessmentId: item.id, a, b, outsider }));
}
main().finally(() => prisma.$disconnect());
