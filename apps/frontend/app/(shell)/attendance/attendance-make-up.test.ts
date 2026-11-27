import { describe, expect, test } from "bun:test";
import type { ApprovedMakeUpAttendanceDate, OfferingView } from "@dse-pms/shared-types";
import { attendanceOfferingsOnDate } from "./attendance-make-up.ts";

const mondayCourse = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "Active", startDate: "2026-09-01", endDate: "2026-12-31",
  meetings: [{ dayOfWeek: "Monday" }],
} as OfferingView;
const approved: ApprovedMakeUpAttendanceDate = {
  id: "22222222-2222-4222-8222-222222222222",
  offeringId: mondayCourse.id,
  originalDate: "2026-11-23",
  replacementDate: "2026-11-28",
  startTime: "08:00", endTime: "12:00", room: "STEM 306",
};

describe("approved make-up attendance choices", () => {
  test("includes a class on its confirmed non-recurring replacement date", () => {
    expect(attendanceOfferingsOnDate([mondayCourse], "2026-11-28", [approved]).map((o) => o.id))
      .toEqual([mondayCourse.id]);
  });
  test("does not leak approval to a different day", () => {
    expect(attendanceOfferingsOnDate([mondayCourse], "2026-11-27", [approved])).toEqual([]);
  });
  test("does not duplicate a recurring class", () => {
    expect(attendanceOfferingsOnDate([mondayCourse], "2026-11-23", [{
      ...approved, replacementDate: "2026-11-23",
    }])).toHaveLength(1);
  });
  test("does not surface an offering the lecturer cannot access", () => {
    expect(attendanceOfferingsOnDate([], "2026-11-28", [approved])).toEqual([]);
  });
});
