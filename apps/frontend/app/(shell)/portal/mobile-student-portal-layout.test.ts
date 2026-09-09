import { describe, expect, test } from "bun:test";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "./mobile-student-portal-layout";

describe("mobile Student Portal layout", () => {
  test("student home uses a strong branded hero and phone-friendly quick actions", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.hero).toContain("rounded-[2rem]");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.hero).toContain("bg-primary");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.hero).toContain("overflow-hidden");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeQuickActions).toContain("grid-cols-2");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeQuickActions).toContain("sm:grid-cols-4");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeQuickAction).toContain("min-h-20");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeQuickAction).toContain("min-w-0");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeQuickAction).toContain("ring-border/60");
  });

  test("next class remains the strongest content card without a hard border", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeNextClass).toContain("min-h-11");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeNextClass).toContain("rounded-[2rem]");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeNextClass).toContain("shadow-md");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeNextClass).toContain("ring-primary/15");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeNextClass).not.toContain("border border");
  });

  test("secondary home surfaces stay visually lighter than the class card", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeSectionCard).toContain("shadow-sm");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeAnnouncementCard).toContain("ring-border/60");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeAnnouncementList).toContain("space-y-2");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeCalendar).toContain("bg-muted/40");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.homeCalendar).toContain("min-h-11");
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
