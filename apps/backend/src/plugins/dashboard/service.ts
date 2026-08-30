import {
  OFFERING_STATUSES,
  STUDENT_STATUSES,
  type CoursesServiceContract,
  type DashboardCoursesSummary,
  type DashboardLecturersSummary,
  type DashboardOfferingsSummary,
  type DashboardSourceResult,
  type DashboardStudentsSummary,
  type DashboardSummary,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

export interface DashboardSummarySources {
  students(): Promise<DashboardStudentsSummary>;
  courses(): Promise<DashboardCoursesSummary>;
  offerings(): Promise<DashboardOfferingsSummary>;
  lecturers(): Promise<DashboardLecturersSummary>;
}

function coursesService(): CoursesServiceContract {
  return registry.get<CoursesServiceContract>("courses").service;
}

async function studentsSummary(): Promise<DashboardStudentsSummary> {
  const rows = await prisma.student.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts = new Map(rows.map((row) => [row.status, row._count._all]));
  const byStatus = STUDENT_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
  return {
    total: byStatus.reduce((sum, row) => sum + row.count, 0),
    byStatus,
  };
}

async function coursesSummary(): Promise<DashboardCoursesSummary> {
  // Reuse the Courses plugin's established narrow progress projection through
  // the registry contract. The Dashboard strips lecturer-review detail that it
  // does not render instead of loading the full Course list.
  const progress = await coursesService().listSpecProgress();
  return {
    total: progress.length,
    specProgress: progress.map((row) => ({
      courseId: row.courseId,
      code: row.code,
      title: row.title,
      completed: row.completed,
      total: row.total,
      curriculumPlacement: row.curriculumPlacement ?? null,
    })),
  };
}

async function offeringsSummary(): Promise<DashboardOfferingsSummary> {
  const [rows, totalEnrolled] = await Promise.all([
    prisma.offering.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { capacity: true },
    }),
    prisma.enrollment.count(),
  ]);
  const counts = new Map(rows.map((row) => [row.status, row._count._all]));
  const capacity = new Map(
    rows.map((row) => [row.status, row._sum.capacity ?? 0]),
  );
  const byStatus = OFFERING_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
  return {
    total: byStatus.reduce((sum, row) => sum + row.count, 0),
    byStatus,
    totalEnrolled,
    totalCapacity: OFFERING_STATUSES.reduce(
      (sum, status) => sum + (capacity.get(status) ?? 0),
      0,
    ),
  };
}

async function lecturersSummary(): Promise<DashboardLecturersSummary> {
  return {
    total: await prisma.user.count({
      where: {
        roleAssignments: { some: { role: { slug: "lecturer" } } },
      },
    }),
  };
}

const databaseSources: DashboardSummarySources = {
  students: studentsSummary,
  courses: coursesSummary,
  offerings: offeringsSummary,
  lecturers: lecturersSummary,
};

const SOURCE_FAILURE_MESSAGES = {
  students: "Student data is temporarily unavailable",
  courses: "Course data is temporarily unavailable",
  offerings: "Offering data is temporarily unavailable",
  lecturers: "Lecturer data is temporarily unavailable",
} as const;

function settledSource<T>(
  result: PromiseSettledResult<T>,
  message: string,
): DashboardSourceResult<T> {
  return result.status === "fulfilled"
    ? { status: "ok", data: result.value }
    : { status: "error", message };
}

/**
 * Purpose-built read model for the programme Dashboard. Every source is
 * independent and read-only, so one failed aggregate is reported explicitly
 * without fabricating zero values for that source or discarding the others.
 */
export function createDashboardService(
  sources: DashboardSummarySources = databaseSources,
) {
  return {
    async summary(): Promise<DashboardSummary> {
      const [students, courses, offerings, lecturers] = await Promise.allSettled([
        sources.students(),
        sources.courses(),
        sources.offerings(),
        sources.lecturers(),
      ]);

      return {
        generatedAt: new Date().toISOString(),
        students: settledSource(
          students,
          SOURCE_FAILURE_MESSAGES.students,
        ),
        courses: settledSource(courses, SOURCE_FAILURE_MESSAGES.courses),
        offerings: settledSource(
          offerings,
          SOURCE_FAILURE_MESSAGES.offerings,
        ),
        lecturers: settledSource(
          lecturers,
          SOURCE_FAILURE_MESSAGES.lecturers,
        ),
      };
    },
  };
}

export const dashboardService = createDashboardService();
export type DashboardService = typeof dashboardService;
