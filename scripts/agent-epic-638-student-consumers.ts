import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path: string, before: string, after: string): void {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Pattern not found in ${path}: ${before.slice(0, 120)}`);
  }
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  "packages/shared-types/src/student-portal.ts",
  'import { z } from "zod";\n',
  'import { z } from "zod";\nimport type { StudentAcademicCalendarView } from "./academic-calendar.ts";\n',
);
replaceOnce(
  "packages/shared-types/src/student-portal.ts",
  "  announcements: PortalAnnouncement[];\n  overallAchievement: number | null;\n}",
  "  announcements: PortalAnnouncement[];\n  academicCalendar: StudentAcademicCalendarView;\n  overallAchievement: number | null;\n}",
);

replaceOnce(
  "apps/backend/src/plugins/student-portal/service.ts",
  '  SetAssessmentDeadlineInput,\n  StudentPortalHome,\n} from "@dse-pms/shared-types";',
  '  SetAssessmentDeadlineInput,\n  StudentAcademicCalendarView,\n  StudentPortalHome,\n} from "@dse-pms/shared-types";',
);
replaceOnce(
  "apps/backend/src/plugins/student-portal/service.ts",
  'import { prisma } from "../../core/db/prisma.ts";\n',
  'import { prisma } from "../../core/db/prisma.ts";\nimport { registry } from "../../core/plugins/registry.ts";\n',
);
replaceOnce(
  "apps/backend/src/plugins/student-portal/service.ts",
  "async function enrolledRows(userId: string) {\n",
  `async function studentAcademicCalendarForId(studentId: string): Promise<StudentAcademicCalendarView> {
  const membership = await prisma.studentCohortMembership.findFirst({
    where: { studentId, exitedAt: null },
    include: { cohort: { select: { programmeId: true } } },
    orderBy: { joinedAt: "desc" },
  });
  if (!membership) {
    return {
      status: "unavailable",
      academicYear: null,
      studyYear: null,
      reason: "student-context-unavailable",
      message: "Your programme cohort and study-year progression have not yet been confirmed.",
    };
  }

  const academicYear = await prisma.academicYear.findFirst({
    where: { programmeId: membership.cohort.programmeId, isCurrent: true },
  });
  if (!academicYear) {
    return {
      status: "unavailable",
      academicYear: null,
      studyYear: null,
      reason: "academic-year-unavailable",
      message: "No current academic year is configured for your programme.",
    };
  }
  const academicYearView = {
    ...academicYear,
    createdAt: academicYear.createdAt.toISOString(),
    updatedAt: academicYear.updatedAt.toISOString(),
  };

  const progression = await prisma.studentProgressionRecord.findFirst({
    where: {
      membershipId: membership.id,
      academicYear: academicYear.label,
      programmeYear: { not: null },
    },
    orderBy: [{ periodStart: "desc" }, { recordedAt: "desc" }],
  });
  const studyYear = progression?.programmeYear ?? null;
  if (!studyYear || studyYear < 1 || studyYear > 4) {
    return {
      status: "unavailable",
      academicYear: academicYearView,
      studyYear: null,
      reason: "student-context-unavailable",
      message: "Your study year for the current academic year has not yet been confirmed.",
    };
  }

  const calendarService = registry.get<{
    academicCalendar: {
      publishedProjection(
        programmeId: string,
        studyYear: number,
        academicYearLabel?: string,
      ): Promise<import("@dse-pms/shared-types").PublishedAcademicCalendarProjection>;
    };
  }>("programme").service.academicCalendar;
  const projection = await calendarService.publishedProjection(
    membership.cohort.programmeId,
    studyYear,
    academicYear.label,
  );
  if (projection.status === "unavailable") {
    return {
      status: "unavailable",
      academicYear: projection.academicYear,
      studyYear,
      reason: projection.reason,
      message: projection.message,
    };
  }
  return {
    status: "available",
    academicYear: projection.academicYear,
    studyYear,
    periods: projection.periods,
    events: projection.events,
    nextEvent: projection.nextEvent,
  };
}

async function enrolledRows(userId: string) {
`,
);
replaceOnce(
  "apps/backend/src/plugins/student-portal/service.ts",
  "  async courses(userId: string): Promise<PortalCourseSummary[]> {\n",
  `  async academicCalendar(userId: string): Promise<StudentAcademicCalendarView> {
    const student = await studentForUser(userId);
    return studentAcademicCalendarForId(student.id);
  },

  async courses(userId: string): Promise<PortalCourseSummary[]> {
`,
);
replaceOnce(
  "apps/backend/src/plugins/student-portal/service.ts",
  "      announcements: announcementsFrom(rows).slice(0, 5),\n      overallAchievement:",
  "      announcements: announcementsFrom(rows).slice(0, 5),\n      academicCalendar: await studentAcademicCalendarForId(rows.student.id),\n      overallAchievement:",
);

replaceOnce(
  "apps/backend/src/plugins/student-portal/router.ts",
  '  router.get("/courses", requirePermission("student-portal:read"), async (req, res) => {',
  `  router.get("/academic-calendar", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await studentPortalService.academicCalendar(req.user!.id)); } catch (error) { handleError(error, res); }
  });
  router.get("/courses", requirePermission("student-portal:read"), async (req, res) => {`,
);

replaceOnce(
  "apps/frontend/app/(shell)/portal/academic-calendar/portal-academic-calendar.tsx",
  "        const isNext = event.id === nextEventKey;",
  "        const isNext = nextEventKey === `event:${event.id}`;",
);
