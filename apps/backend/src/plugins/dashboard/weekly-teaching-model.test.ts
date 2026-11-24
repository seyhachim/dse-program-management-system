import { describe, expect, test } from "bun:test";
import { WeeklyTeachingReportSchema, WeeklyTeachingWeekQuerySchema, type WeeklyTeachingSession } from "@dse-pms/shared-types";
import { deriveWeeklyTeachingStatus, summarizeWeeklyTeaching } from "./weekly-teaching-model.ts";

const evidence = {
  classOccurred: null, coverage: null, explicitSessionStatus: null,
  officialHoliday: false, approvedLeave: false, ended: true,
} as const;

function session(status: WeeklyTeachingSession["status"], minutes = 120): WeeklyTeachingSession {
  return {
    meetingId: "meeting-a",
    offeringId: "00000000-0000-4000-8000-000000000431",
    occurrenceId: null,
    date: "2026-11-23", dayOfWeek: "Monday",
    startTime: "07:00", endTime: "09:00", room: null,
    courseCode: "DSE101", courseTitle: "Example", sectionCode: "M1",
    programmeYear: 1, term: "2026-27",
    lecturerIds: [], lecturerNames: [],
    plannedWeek: null, plannedTopic: null, actualTopic: null, coverage: null,
    status, scheduledMinutes: 120, deliveredMinutes: minutes,
    arrivalRecorded: false, approvedLeave: false, classSessionStatus: null,
    holidayName: null, evidenceRecordedAt: null,
  };
}

describe("programme weekly teaching derived evidence", () => {
  test("rejects bad dates and requires an exact Monday", () => {
    expect(WeeklyTeachingWeekQuerySchema.safeParse({ weekStart: "2026-11-23" }).success).toBe(true);
    expect(WeeklyTeachingWeekQuerySchema.safeParse({ weekStart: "2026-11-24" }).success).toBe(false);
    expect(WeeklyTeachingWeekQuerySchema.safeParse({ weekStart: "2026-02-30" }).success).toBe(false);
  });

  test("missing monitor evidence never becomes lecturer absence or cancellation", () => {
    expect(deriveWeeklyTeachingStatus(evidence)).toBe("missing_evidence");
    expect(deriveWeeklyTeachingStatus({ ...evidence, ended: false })).toBe("upcoming");
    expect(deriveWeeklyTeachingStatus({ ...evidence, classOccurred: false })).toBe("not_held");
  });

  test("planned exception precedence and recorded delivery remain distinct", () => {
    expect(deriveWeeklyTeachingStatus({ ...evidence, approvedLeave: true })).toBe("approved_leave");
    expect(deriveWeeklyTeachingStatus({ ...evidence, explicitSessionStatus: "Cancelled" })).toBe("cancelled");
    expect(deriveWeeklyTeachingStatus({ ...evidence, officialHoliday: true })).toBe("holiday");
    expect(deriveWeeklyTeachingStatus({ ...evidence, classOccurred: true, coverage: "TAUGHT_AS_PLANNED", approvedLeave: true })).toBe("held_as_planned");
    expect(deriveWeeklyTeachingStatus({ ...evidence, classOccurred: true, coverage: "DIFFERENT_TOPIC" })).toBe("held_with_changes");
  });

  test("does not count holidays as planned; no false recovery accounting", () => {
    const rows = [
      session("held_as_planned", 110), session("held_with_changes", 75),
      session("holiday"), session("approved_leave"), session("missing_evidence"),
      session("upcoming"),
    ];
    const actual = summarizeWeeklyTeaching(rows);
    expect(actual.scheduledSessions).toBe(5);
    expect(actual.deliveredSessions).toBe(2);
    expect(actual.scheduledMinutes).toBe(600);
    expect(actual.deliveredMinutes).toBe(185);
    expect(actual.reviewMinutes).toBe(240);
    expect(actual.holidays).toBe(1);
    expect(actual.missingEvidence).toBe(1);
    expect(WeeklyTeachingReportSchema.safeParse({
      programmeId: "dse", weekStart: "2026-11-23", weekEnd: "2026-11-29",
      generatedAt: new Date().toISOString(),
      unboundedActiveOfferings: 0, summary: actual, sessions: rows,
    }).success).toBe(true);
  });
});
