import { describe, expect, test } from "bun:test";
import {
  openTeachingSlotClaimantText,
  openTeachingSlotStudentText,
} from "./open-teaching-slot-notification-service.ts";

const assignment = {
  occurrenceId: "11111111-1111-4111-8111-111111111111",
  slotId: "22222222-2222-4222-8222-222222222222",
  offeringId: "33333333-3333-4333-8333-333333333333",
  courseCode: "DSS301",
  courseTitle: "Data Science for Smart Agriculture",
  sectionCode: "M1",
  lecturerName: "Lecturer B",
  sessionDate: "2026-09-21",
  startTime: "07:00",
  endTime: "11:00",
  room: "306",
  activityType: "Lecture",
  kind: "reused-slot" as const,
};

describe("open teaching slot Telegram notifications", () => {
  test("student message contains only confirmed operational assignment information", () => {
    const text = openTeachingSlotStudentText(assignment);
    expect(text).toContain("Additional class confirmed");
    expect(text).toContain("DSS301 · Data Science for Smart Agriculture · Class M1");
    expect(text).toContain("Lecturer: Lecturer B");
    expect(text).toContain("2026-09-21 · 07:00–11:00");
    expect(text).toContain("Room: 306");
    expect(text.toLowerCase()).not.toContain("leave reason");
    expect(text.toLowerCase()).not.toContain("attachment");
    expect(text.toLowerCase()).not.toContain("review comment");
  });

  test("claimant decision message excludes reviewer guidance and confidential leave data", () => {
    const text = openTeachingSlotClaimantText({
      claimId: "44444444-4444-4444-8444-444444444444",
      userId: "55555555-5555-4555-8555-555555555555",
      status: "APPROVED",
      courseCode: assignment.courseCode,
      courseTitle: assignment.courseTitle,
      sectionCode: assignment.sectionCode,
      sessionDate: assignment.sessionDate,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      room: assignment.room,
    });
    expect(text).toContain("Open teaching slot claim approved");
    expect(text).toContain("The class is now confirmed in DSE PMS.");
    expect(text.toLowerCase()).not.toContain("reason");
    expect(text.toLowerCase()).not.toContain("attachment");
    expect(text.toLowerCase()).not.toContain("review comment");
  });
});
