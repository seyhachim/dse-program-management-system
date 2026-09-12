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
const attendanceProgressSource = readFileSync(
  new URL("./courses/course-attendance-progress.tsx", import.meta.url),
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

  test("right-aligns active monitor responsibilities beside the student name", () => {
    expect(portalHomeSource).toContain("monitorDeliveryApi");
    expect(portalHomeSource).toContain(".assignments()");
    expect(portalHomeSource).toContain("Class Monitor");
    expect(portalHomeSource).toContain("Sub-class Monitor");
    expect(portalHomeSource).toContain('aria-label="Student responsibilities"');
    expect(portalHomeSource).toContain("Crown");
    expect(portalHomeSource).toContain("ShieldCheck");
    expect(portalHomeSource).toContain(
      "mt-0.5 flex min-w-0 items-start justify-between gap-3",
    );
    expect(portalHomeSource).toContain(
      "ml-auto flex max-w-[52%] shrink-0 flex-wrap justify-end gap-1.5",
    );
    expect(portalHomeSource).toContain(
      "min-w-0 flex-1 break-words text-2xl font-semibold tracking-tight sm:text-3xl",
    );
    expect(portalHomeSource).toContain("new Set(");
    expect(portalHomeSource).toContain("catch((): MonitorClassResponsibilityView[] => [])");
  });

  test("loads course achievements as optional metadata but uses compact home variants", () => {
    expect(portalHomeSource).toContain(".courseAchievements()");
    expect(portalHomeSource).toContain("catch((): PortalCourseAchievementSummary[] => [])");
    expect(portalHomeSource).toContain("summary.offeringId === nextMeeting.course.offeringId");
    expect(portalHomeSource).toContain("showLocked={false}");
    expect(portalHomeSource).toContain("<CourseAttendanceProgress");
    expect(portalHomeSource).toContain("compact\n");
    expect(portalHomeSource).not.toContain("nextCourseMonitorRole");
  });

  test("keeps a compact 16-week attendance strip visible on Home", () => {
    expect(attendanceProgressSource).toContain("COURSE_ATTENDANCE_WEEK_COUNT = 16");
    expect(attendanceProgressSource).toContain("if (compact)");
    expect(attendanceProgressSource).toContain(
      "progress ? <AttendanceWeekStrip progress={progress} compact /> : null",
    );
    expect(attendanceProgressSource).toContain('compact ? "h-1.5" : "h-2.5"');
    expect(attendanceProgressSource).toContain('aria-label="Teaching-week attendance progress"');
  });

  test("preserves the full achievement and attendance treatments outside the home override", () => {
    expect(courseBadgeSource).toContain("showLocked = true");
    expect(courseBadgeSource).toContain("summary.badges.filter((badge) => badge.achieved)");
    expect(courseBadgeSource).toContain("badge.achieved ? ACHIEVED_STYLES[badge.kind] : LOCKED_STYLE");
    expect(courseBadgeSource).toContain("<Lock");
    expect(courseBadgeSource).toContain('aria-label="Course achievement badges"');
    expect(attendanceProgressSource).toContain("compact = false");
    expect(attendanceProgressSource).toContain("<AttendanceWeekStrip progress={progress} compact={false} />");
  });

  test("renders all five v1 achievement kinds", () => {
    expect(courseBadgeSource).toContain("great_start:");
    expect(courseBadgeSource).toContain("reliable_learner:");
    expect(courseBadgeSource).toContain("perfect_attendance:");
    expect(courseBadgeSource).toContain("strong_performance:");
    const hasCourseExcellence = courseBadgeSource.includes("course_excellence:");
    expect(hasCourseExcellence).toBe(true);
    expect(courseBadgeSource).toContain("{badge.title}");
    expect(courseBadgeSource).not.toContain("Course role:");
  });

  test("keeps the next-class card compact on phones", () => {
    expect(mobileLayoutSource).toContain("rounded-[1.75rem] bg-card p-3.5 shadow-md");
    expect(mobileLayoutSource).toContain("sm:p-4");
    expect(portalHomeSource).toContain("break-words text-xl font-semibold");
    expect(portalHomeSource).toContain('aria-label="Class details"');
    expect(portalHomeSource).toContain(
      "mt-3 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-muted/30 shadow-sm",
    );
    expect(portalHomeSource).toContain(
      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
    );
    expect(portalHomeSource).not.toContain("mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-1.5");
    expect(portalHomeSource).toContain("mt-3 flex min-h-10 items-center");
  });

  test("groups time, room, and lecturer into one semantic details panel", () => {
    const detailsStart = portalHomeSource.indexOf('aria-label="Class details"');
    const detailsEnd = portalHomeSource.indexOf("</dl>", detailsStart);
    const detailsSource = portalHomeSource.slice(detailsStart, detailsEnd);

    expect(detailsStart).toBeGreaterThan(-1);
    expect(detailsEnd).toBeGreaterThan(detailsStart);
    expect(detailsSource).toContain("<Clock3");
    expect(detailsSource).toContain("<MapPin");
    expect(detailsSource).toContain("<GraduationCap");
    expect(detailsSource).toContain('nextMeeting.impact ? "Original time" : "Time"');
    expect(detailsSource).toContain('nextMeeting.impact ? "Original room" : "Room"');
    expect(detailsSource).toContain('nextMeeting.meeting.room || "Room TBA"');
    expect(detailsSource).toContain('nextMeeting.course.lecturer?.name ?? "Lecturer TBA"');
  });

  test("shows active teaching context but hides the pre-semester starts-soon box", () => {
    expect(portalHomeSource).toContain("resolveStudentTeachingContext(calendar, now)");
    expect(portalHomeSource).toContain('aria-label="Current teaching week"');
    expect(portalHomeSource).toContain(
      'teachingContext && teachingContext.kind !== "upcoming"',
    );
    expect(portalHomeSource).toContain("Week {teachingContext.week} of {teachingContext.totalWeeks}");
    expect(portalHomeSource).toContain("Semester break");
    expect(portalHomeSource).toContain("Between semesters");
    expect(portalHomeSource).toContain("Teaching period complete");
    expect(portalHomeSource).toContain("resumes");
    expect(portalHomeSource).not.toContain("Teaching starts soon");
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
    expect(portalHomeSource).toContain("Make-up not scheduled yet.");
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
