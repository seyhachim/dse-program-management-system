import { describe, expect, test } from "bun:test";
import { DashboardSummarySchema } from "@dse-pms/shared-types";
import {
  createDashboardService,
  type DashboardSummarySources,
} from "./service.ts";

const COURSE_ID = "00000000-0000-4000-8000-000000000739";

function successfulSources(): DashboardSummarySources {
  return {
    students: async () => ({
      total: 3,
      byStatus: [
        { status: "Active", count: 2 },
        { status: "Inactive", count: 1 },
        { status: "Pending", count: 0 },
      ],
    }),
    courses: async () => ({
      total: 1,
      specProgress: [
        {
          courseId: COURSE_ID,
          code: "DSE739",
          title: "Dashboard Performance",
          completed: 4,
          total: 10,
          curriculumPlacement: {
            programmeYear: 1,
            semester: "First",
            sortOrder: 1,
          },
        },
      ],
    }),
    offerings: async () => ({
      total: 2,
      byStatus: [
        { status: "Planned", count: 0 },
        { status: "Active", count: 1 },
        { status: "Completed", count: 1 },
      ],
      totalEnrolled: 31,
      totalCapacity: 60,
    }),
    lecturers: async () => ({ total: 4 }),
  };
}

describe("dashboard summary service", () => {
  test("returns a strict compact contract when every source succeeds", async () => {
    const summary = await createDashboardService(successfulSources()).summary();
    expect(() => DashboardSummarySchema.parse(summary)).not.toThrow();
    expect(summary.students).toEqual({
      status: "ok",
      data: {
        total: 3,
        byStatus: [
          { status: "Active", count: 2 },
          { status: "Inactive", count: 1 },
          { status: "Pending", count: 0 },
        ],
      },
    });
    expect(summary.courses.status).toBe("ok");
  });

  test("reports a failed source explicitly without leaking the raw error or zeroing other sources", async () => {
    const sources = successfulSources();
    sources.offerings = async () => {
      throw new Error("postgres password=should-never-leak");
    };

    const summary = await createDashboardService(sources).summary();
    const parsed = DashboardSummarySchema.parse(summary);

    expect(parsed.offerings).toEqual({
      status: "error",
      message: "Offering data is temporarily unavailable",
    });
    expect(JSON.stringify(parsed)).not.toContain("should-never-leak");
    expect(parsed.students.status).toBe("ok");
    expect(parsed.courses.status).toBe("ok");
    expect(parsed.lecturers.status).toBe("ok");
  });
});
