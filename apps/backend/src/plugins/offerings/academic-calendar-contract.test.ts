import { describe, expect, test } from "bun:test";
import { CreateOfferingInput, UpdateOfferingInput } from "@dse-pms/shared-types";

const base = {
  courseId: "00000000-0000-4000-8000-000000000001",
  courseSpecId: "00000000-0000-4000-8000-000000000002",
  term: "2026-2027-S1",
  sectionCode: "A",
  lecturerId: "00000000-0000-4000-8000-000000000003",
  coLecturerIds: [],
  capacity: 30,
  status: "Planned" as const,
  meetings: [{ dayOfWeek: "Monday" as const, startTime: "08:00", endTime: "10:00", room: "A101", activityType: "Lecture" as const }],
  semester: "First" as const,
  programmeYear: 3,
  academicCalendarPeriodId: "00000000-0000-4000-8000-000000000004",
};

describe("Course Offering Academic Calendar contract", () => {
  test("new offerings require an Academic Calendar period", () => {
    const { academicCalendarPeriodId: _periodId, ...withoutPeriod } = base;
    const parsed = CreateOfferingInput.safeParse(withoutPeriod);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.path[0] === "academicCalendarPeriodId")).toBe(true);
  });

  test("new offerings reject duplicate manually entered teaching dates", () => {
    const parsed = CreateOfferingInput.safeParse({ ...base, startDate: "2026-09-16", endDate: "2027-01-16" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message.includes("Academic Calendar"))).toBe(true);
  });

  test("new offerings accept a complete canonical context without manual dates", () => {
    expect(CreateOfferingInput.safeParse(base).success).toBe(true);
  });

  test("legacy PATCH compatibility remains additive", () => {
    expect(UpdateOfferingInput.safeParse({ capacity: 40 }).success).toBe(true);
  });
});
