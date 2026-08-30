import type {
  DashboardSourceResult,
  DashboardSummary,
} from "@dse-pms/shared-types";

export const DASHBOARD_SOURCE_LABELS = {
  students: "students",
  courses: "courses",
  offerings: "offerings",
  lecturers: "lecturers",
} as const;

export function dashboardSourceData<T>(
  result: DashboardSourceResult<T>,
): T | null {
  return result.status === "ok" ? result.data : null;
}

export function dashboardFailedSources(summary: DashboardSummary): string[] {
  return (Object.keys(DASHBOARD_SOURCE_LABELS) as Array<
    keyof typeof DASHBOARD_SOURCE_LABELS
  >)
    .filter((key) => summary[key].status === "error")
    .map((key) => DASHBOARD_SOURCE_LABELS[key]);
}
