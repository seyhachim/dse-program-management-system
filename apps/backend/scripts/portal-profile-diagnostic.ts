import { prisma } from "../src/core/db/prisma.ts";
import { studentPortalService } from "../src/plugins/student-portal/service.ts";

export async function runPortalProfileDiagnostic(): Promise<void> {
  const userId = "9331c306-2c02-4ede-8497-c8a98599ea00";
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true, status: true, email: true, userId: true },
  });
  console.log("[portal-profile-diagnostic] student", {
    found: Boolean(student),
    active: student?.status === "Active",
    hasEmail: Boolean(student?.email),
    linkedToExpectedUser: student?.userId === userId,
  });
  try {
    const home = await studentPortalService.home(userId);
    console.log("[portal-profile-diagnostic] home PASS", {
      studentReturned: Boolean(home.student?.id),
      courseCount: home.courses.length,
    });
  } catch (error) {
    console.error("[portal-profile-diagnostic] home FAIL", error instanceof Error ? error.message : "unknown");
  }
}
