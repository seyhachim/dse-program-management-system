import { describe, expect, test } from "bun:test";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "./mobile-student-portal-layout";

describe("mobile Student Portal layout", () => {
  test("course cards are compact on phones and restore desktop card height at md", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.courseCard).toContain("min-h-0");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.courseCard).toContain("md:min-h-64");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.courseCard).toContain("p-4");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.courseCard).toContain("md:p-5");
  });

  test("schedule and result layouts do not require fixed phone widths", () => {
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.scheduleMeeting).toContain("min-w-0");
    expect(MOBILE_STUDENT_PORTAL_LAYOUT.scheduleMeeting).toContain(
      "minmax(0,1fr)",
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
