import { describe, expect, test } from "bun:test";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "./mobile-student-portal-layout";

describe("mobile Student Portal layout", () => {
  test("home identity and quick actions stay compact and touch friendly", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.hero).toContain("p-4");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.hero).toContain("sm:p-5");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.quickAction).toContain("min-h-14");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.quickAction).toContain("min-w-0");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homePrimaryCard).toContain("min-w-0");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeProgressCard).toContain("min-w-0");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.calendarLink).toContain("min-h-11");
  });

  test("course cards are compact on phones and restore desktop card height at md", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.courseCard).toContain("min-h-0");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.courseCard).toContain("md:min-h-64");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.courseCard).toContain("p-4");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.courseCard).toContain("md:p-5");
  });

  test("schedule uses a five-day touch strip and viewport-safe meeting cards", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.scheduleDateStrip).toContain("grid-cols-5");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.scheduleDateButton).toContain("min-h-16");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.scheduleMeeting).toContain("min-w-0");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.scheduleMeetingCurrent).toContain(
      "ring-primary/20",
    );
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.resultMetrics).toContain("grid-cols-2");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.resultMetricCard).toContain("min-w-0");
  });

  test("academic timeline stacks on phones and restores a date column at sm", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.timelineRow).toContain("grid-cols-1");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.timelineRow).toContain(
      "sm:grid-cols-[7rem_minmax(0,1fr)]",
    );
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.timelineDot).toContain("hidden");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.timelineDot).toContain("sm:block");
  });

  test("phone primary links keep a comfortable touch target", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.touchAction).toContain("min-h-11");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.touchAction).toContain("w-full");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.touchAction).toContain("sm:w-auto");
  });

  test("announcement content wraps long text instead of widening the viewport", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.announcementBody).toContain("break-words");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.announcementBody).toContain(
      "whitespace-pre-wrap",
    );
  });
});
