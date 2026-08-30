import { describe, expect, test } from "bun:test";
import type { DashboardSummary } from "@dse-pms/shared-types";
import {
  dashboardFailedSources,
  dashboardSourceData,
} from "./dashboard-summary-view";

const summary: DashboardSummary = {
  generatedAt: "2026-08-30T00:00:00.000Z",
  students: {
    status: "ok",
    data: {
      total: 2,
      byStatus: [
        { status: "Active", count: 2 },
        { status: "Inactive", count: 0 },
        { status: "Pending", count: 0 },
      ],
    },
  },
  courses: {
    status: "error",
    message: "Course data is temporarily unavailable",
  },
  offerings: {
    status: "ok",
    data: {
      total: 1,
      byStatus: [
        { status: "Planned", count: 0 },
        { status: "Active", count: 1 },
        { status: "Completed", count: 0 },
      ],
      totalEnrolled: 20,
      totalCapacity: 30,
    },
  },
  lecturers: {
    status: "error",
    message: "Lecturer data is temporarily unavailable",
  },
};

describe("dashboard partial-source view", () => {
  test("returns null rather than fabricating zero for an unavailable source", () => {
    expect(dashboardSourceData(summary.courses)).toBeNull();
    expect(dashboardSourceData(summary.students)?.total).toBe(2);
  });

  test("lists failed sources with stable user-facing labels", () => {
    expect(dashboardFailedSources(summary)).toEqual(["courses", "lecturers"]);
  });
});
