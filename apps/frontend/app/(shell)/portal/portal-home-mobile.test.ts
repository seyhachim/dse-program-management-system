import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const portalHomeSource = readFileSync(
  new URL("./portal-home.tsx", import.meta.url),
  "utf8",
);
const courseBadgeSource = readFileSync(
  new URL("./course-achievement-badges.tsx", import.meta.url),
  "utf8",
);
const mobileLayoutSource = readFileSync(
  new URL("./mobile-student-portal-layout.ts", import.meta.url),
  "utf8",
);

describe("Student Portal mobile home contract", () => {
  test("keeps internal curriculum terminology off the student home", () => {
    expect(portalHomeSource).not.toContain("CLO");
    expect(portalHomeSource).not.toContain("CourseSpec");
  });

  test("keeps official DSE branding and student identity in the hero", () => {
    expect(portalHomeSource).toContain('src="/dse-logo.svg"');
    expect(portalHomeSource).toContain('alt="DSE logo"');
    expect(portalHomeSource).toContain("DSE Student Portal");
    expect(portalHomeSource).toContain('aria-label="Student identity"');
    expect(portalHomeSource).toContain("Student ID · {data.student.studentId}");
  });

  test("shows active monitor responsibilities as non-blocking identity badges", () => {
    expect(portalHomeSource).toContain("monitorDeliveryApi");
    expect(portalHomeSource).toContain(".assignments()");
    expect(portalHomeSource).toContain("Class Monitor");
    expect(portalHomeSource).toContain("Sub-class Monitor");
    expect(portalHomeSource).toContain('aria-label="Student responsibilities"');
    expect(portalHomeSource).toContain("new Set(");
    expect(portalHomeSource).toContain("catch((): MonitorClassResponsibilityView[] => [])");
  });

  test("loads course achievements as optional home metadata and scopes the role to the exact offering", () => {
    expect(portalHomeSource).toContain(".courseAchievements()");
    expect(portalHomeSource).toContain("catch((): PortalCourseAchievementSummary[] => [])");
    expect(portalHomeSource).toContain("summary.offeringId === nextMeeting.course.offeringId");
    expect(portalHomeSource).toContain("assignment.offeringId === nextMeeting.course.offeringId");
    expect(portalHomeSource).toContain("<CourseAchievementBadges");
  });

  test("renders all five v1 achievement kinds with visible locked states", () => {
    expect(courseBadgeSource).toContain("great_start:");
    expect(courseBadgeSource).toContain("reliable_learner:");
    expect(courseBadgeSource).toContain("perfect_attendance:");
    expect(courseBadgeSource).toContain("strong_performance:");
    expect(courseBadgeSource).toContain("course_excellence:");
    expect(courseBadgeSource).toContain("{badge.title}");
    expect(courseBadgeSource).toContain("badge.achieved ? ACHIEVED_STYLES[badge.kind] : LOCKED_STYLE");
    expect(courseBadgeSource).toContain("<Lock");
    expect(courseBadgeSource).toContain('aria-label="Course achievement badges"');
  });

  test("keeps course role chips separate from achievement status", () => {
    expect(courseBadgeSource).toContain('role === "ClassMonitor"');
    expect(courseBadgeSource).toContain('"Class Monitor"');
    expect(courseBadgeSource).toContain('"Sub-class Monitor"');
    expect(courseBadgeSource).toContain("Course role:");
  });

  test("keeps the next-class card compact on phones", () => {
    expect(mobileLayoutSource).toContain("bg-card p-4 shadow-md");
    expect(mobileLayoutSource).toContain("sm:p-5");
    expect(portalHomeSource).toContain('className="mt-4 grid gap-2 sm:grid-cols-3"');
    expect(portalHomeSource).toContain('className="mt-4 flex min-h-11 items-center');
  });

  test("shows published-calendar teaching context without a CourseSpec dependency", () => {
    expect(portalHomeSource).toContain("resolveStudentTeachingContext(calendar, now)");
    expect(portalHomeSource).toContain('aria-label="Current teaching week"');
    expect(portalHomeSource).toContain("Week {teachingContext.week} of {teachingContext.totalWeeks}");
    expect(portalHomeSource).toContain("Semester break");
    expect(portalHomeSource).toContain("resumes");
    expect(portalHomeSource).not.toContain("CourseSpec");
  });

  test("removes the redundant four-box shortcut grid from home", () => {
    expect(portalHomeSource).not.toContain("QUICK_ACTIONS");
    expect(portalHomeSource).not.toContain('aria-label="Student shortcuts"');
    expect(portalHomeSource).not.toContain("homeQuickActions");
    expect(portalHomeSource).not.toContain("homeQuickAction");
  });

  test("keeps schedule context as the primary home action", () => {
    const returnIndex = portalHomeSource.indexOf("return (");
    const nextClassLinkIndex = portalHomeSource.indexOf(
      "href={nextMeetingHref}",
      returnIndex,
    );
    const assessmentsIndex = portalHomeSource.indexOf("Upcoming work", returnIndex);

    expect(nextClassLinkIndex).toBeGreaterThan(-1);
    expect(assessmentsIndex).toBeGreaterThan(-1);
    expect(nextClassLinkIndex).toBeLessThan(assessmentsIndex);
    expect(portalHomeSource).toContain("nextScheduledMeeting(data.courses, data.scheduleImpacts ?? [], now)");
    expect(portalHomeSource).toContain("nextMeeting.course.lecturer?.name");
    expect(portalHomeSource).toContain("View schedule");
    expect(portalHomeSource).toContain("Time");
    expect(portalHomeSource).toContain("Room");
    expect(portalHomeSource).toContain("Lecturer");
  });

  test("makes approved leave unmistakable and deep-links to the exact occurrence", () => {
    expect(portalHomeSource).toContain("studentScheduleApi.impacts()");
    expect(portalHomeSource).toContain('"Schedule changed"');
    expect(portalHomeSource).toContain("Class cancelled for this session");
    expect(portalHomeSource).toContain("This class will not take place at the scheduled time.");
    expect(portalHomeSource).toContain("View schedule update");
    expect(portalHomeSource).toContain("date=${encodeURIComponent(nextMeeting.impact.sessionDate)}");
    expect(portalHomeSource).toContain("focus=${encodeURIComponent(nextMeeting.impact.occurrenceId)}");
    expect(portalHomeSource).not.toContain("confidentialReason");
    expect(portalHomeSource).not.toContain("reviewComment");
    expect(portalHomeSource).not.toContain("attachmentRef");
  });

  test("omits lecturer-created sections when there is no data", () => {
    expect(portalHomeSource).toContain("data.upcomingAssessments.length > 0 ? (");
    expect(portalHomeSource).toContain("data.announcements.length > 0 ? (");
    expect(portalHomeSource).not.toContain("No upcoming assessments.");
    expect(portalHomeSource).not.toContain("No announcements yet.");
  });

  test("keeps optional feed ordering and academic calendar", () => {
    const assessmentsIndex = portalHomeSource.indexOf("Upcoming work");
    const announcementsIndex = portalHomeSource.indexOf("Latest announcements");
    const calendarIndex = portalHomeSource.indexOf("Academic calendar");

    expect(assessmentsIndex).toBeGreaterThan(-1);
    expect(announcementsIndex).toBeGreaterThan(-1);
    expect(calendarIndex).toBeGreaterThan(-1);
    expect(assessmentsIndex).toBeLessThan(announcementsIndex);
    expect(announcementsIndex).toBeLessThan(calendarIndex);
    expect(portalHomeSource).toContain("CalendarClock");
    expect(portalHomeSource).toContain("% weight");
  });

  test("keeps the home feed concise and long content viewport-safe", () => {
    expect(portalHomeSource).toContain("upcomingAssessments.slice(0, 3)");
    expect(portalHomeSource).toContain("announcements.slice(0, 2)");
    expect(portalHomeSource).toContain("min-w-0");
    expect(portalHomeSource).toContain("break-words");
    expect(portalHomeSource).not.toContain("My courses");
  });
});
