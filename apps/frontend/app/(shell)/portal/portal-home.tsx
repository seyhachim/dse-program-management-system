"use client";

import type {
  MonitorClassResponsibilityView,
  PortalCourseAchievementSummary,
  PortalScheduleImpact,
} from "@dse-pms/shared-types";
import { useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock3,
  Crown,
  GraduationCap,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import {
  academicSemesterLabel,
  formatAcademicDate,
  formatAcademicShortDateRange,
  resolveStudentTeachingContext,
} from "@/lib/academic-calendar";
import { monitorDeliveryApi } from "@/lib/monitor-delivery";
import {
  assessmentDeadline,
  meetingLabel,
  studentPortalApi,
} from "@/lib/student-portal";
import { studentScheduleApi } from "@/lib/student-schedule";
import { CourseAchievementBadges } from "./course-achievement-badges";
import { CourseAttendanceProgress } from "./courses/course-attendance-progress";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "./mobile-student-portal-layout";
import {
  PortalError,
  PortalLoading,
  useCachedPortalData,
  usePortalPrefetch,
} from "./portal-state";

const HOME_PREFETCH = [
  { resource: "courses", loader: studentPortalApi.courses },
  { resource: "announcements", loader: studentPortalApi.announcements },
  { resource: "assessments", loader: studentPortalApi.assessments },
  { resource: "academic-calendar", loader: studentPortalApi.academicCalendar },
] as const;

const MONITOR_ROLE_LABELS = {
  ClassMonitor: "Class Monitor",
  SubClassMonitor: "Sub-class Monitor",
} as const;

const WEEKDAY_INDEX = new Map(
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
    (day, index) => [day, index],
  ),
);

type HomeMeeting = Parameters<typeof meetingLabel>[0];

function timeMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function localDateKeyAfterDays(now: Date, dayOffset: number): string {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextScheduledMeeting<
  TCourse extends { offeringId: string; meetings: HomeMeeting[] },
>(
  courses: TCourse[],
  impacts: PortalScheduleImpact[],
  now: Date,
) {
  const nowDay = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return courses
    .flatMap((course) =>
      course.meetings.map((meeting) => {
        const meetingDay = WEEKDAY_INDEX.get(meeting.dayOfWeek);
        if (meetingDay === undefined) return null;

        let dayOffset = (meetingDay - nowDay + 7) % 7;
        const start = timeMinutes(meeting.startTime);
        const end = timeMinutes(meeting.endTime);
        if (dayOffset === 0 && nowMinutes >= end) dayOffset = 7;
        const sessionDate = localDateKeyAfterDays(now, dayOffset);
        const impact = impacts.find((item) =>
          item.offeringId === course.offeringId &&
          item.meetingId === meeting.id &&
          item.sessionDate === sessionDate,
        ) ?? null;

        return {
          course,
          meeting,
          impact,
          dayOffset,
          sortMinutes: dayOffset * 24 * 60 + start - nowMinutes,
        };
      }),
    )
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.sortMinutes - b.sortMinutes)[0] ?? null;
}

function relativeMeetingDay(dayOffset: number, dayOfWeek: string): string {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  return dayOfWeek;
}

export function PortalHome() {
  const load = useCallback(async () => {
    const [home, scheduleImpacts, monitorAssignments, courseAchievements] = await Promise.all([
      studentPortalApi.home(),
      studentScheduleApi.impacts(),
      monitorDeliveryApi
        .assignments()
        .catch((): MonitorClassResponsibilityView[] => []),
      studentPortalApi
        .courseAchievements()
        .catch((): PortalCourseAchievementSummary[] => []),
    ]);
    return { ...home, scheduleImpacts, monitorAssignments, courseAchievements };
  }, []);
  const { data, loading, error, refreshError, refreshing } = useCachedPortalData(
    "home",
    load,
  );
  usePortalPrefetch(HOME_PREFETCH);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load your portal"} />;
  }

  const now = new Date();
  const nextMeeting = nextScheduledMeeting(data.courses, data.scheduleImpacts ?? [], now);
  const nextMeetingHref = nextMeeting?.impact
    ? `/portal/schedule?date=${encodeURIComponent(nextMeeting.impact.sessionDate)}&focus=${encodeURIComponent(nextMeeting.impact.occurrenceId)}`
    : "/portal/schedule";
  const monitorRoleBadges = [...new Set(data.monitorAssignments.map((item) => item.role))].map(
    (role) => ({ role, label: MONITOR_ROLE_LABELS[role] }),
  );
  const nextCourseAchievement = nextMeeting
    ? data.courseAchievements.find(
        (summary) => summary.offeringId === nextMeeting.course.offeringId,
      ) ?? null
    : null;
  const calendar = data.academicCalendar;
  const teachingContext = resolveStudentTeachingContext(calendar, now);
  const contextSemester =
    teachingContext?.kind === "teaching" ||
    teachingContext?.kind === "break" ||
    teachingContext?.kind === "upcoming"
      ? teachingContext.semester
      : teachingContext?.kind === "between"
        ? teachingContext.nextSemester
        : null;
  const calendarPeriod =
    calendar.status === "available"
      ? (calendar.periods.find((period) => period.semester === contextSemester) ??
        calendar.periods[0] ??
        null)
      : null;
  const unavailableCalendarMessage =
    calendar.status === "unavailable"
      ? calendar.message
      : "No semester period is currently published.";

  return (
    <div
      className={`mx-auto max-w-5xl ${MOBILE_STUDENT_PORTAL_LAYOUT.homeStack}`}
    >
      {refreshError ? (
        <div className="rounded-2xl border border-status-upcoming/30 bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming shadow-sm">
          Could not refresh right now. Showing your last available portal data.
        </div>
      ) : refreshing ? (
        <p className="px-1 text-xs text-muted-foreground">Updating your portal…</p>
      ) : null}

      <section
        className={MOBILE_STUDENT_PORTAL_LAYOUT.hero}
        aria-label="Student identity"
      >
        <span
          className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-primary-foreground/10"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute -bottom-16 right-16 h-28 w-28 rounded-full bg-primary-foreground/5"
          aria-hidden="true"
        />
        <div className="relative z-10 space-y-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Image
              src="/dse-logo.svg"
              alt="DSE logo"
              width={92}
              height={30}
              priority
              className="h-auto w-[5.75rem] shrink-0 sm:w-[6.25rem]"
            />
            <span className="shrink-0 rounded-full bg-primary-foreground/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/80 ring-1 ring-primary-foreground/15">
              DSE Student Portal
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary-foreground/75">
              Welcome back
            </p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
              <h2 className="min-w-0 max-w-full break-words text-2xl font-semibold tracking-tight sm:text-3xl">
                {data.student.name}
              </h2>
              {monitorRoleBadges.length > 0 ? (
                <div
                  className="flex flex-wrap gap-1.5"
                  aria-label="Student responsibilities"
                >
                  {monitorRoleBadges.map((badge) => {
                    const RoleIcon =
                      badge.role === "ClassMonitor" ? Crown : ShieldCheck;
                    return (
                      <span
                        key={badge.role}
                        className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2 py-1 text-[10px] font-semibold text-primary-foreground ring-1 ring-primary-foreground/20 sm:text-[11px]"
                      >
                        <RoleIcon className="h-3 w-3" aria-hidden="true" />
                        {badge.label}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs font-medium text-primary-foreground/70">
              Student ID · {data.student.studentId}
            </p>
          </div>

          {teachingContext ? (
            <div
              aria-label="Current teaching week"
              className="inline-flex max-w-full flex-col rounded-2xl bg-primary-foreground/10 px-3.5 py-2.5 ring-1 ring-primary-foreground/15"
            >
              {teachingContext.kind === "teaching" ? (
                <>
                  <span className="text-sm font-semibold">
                    Week {teachingContext.week} of {teachingContext.totalWeeks}
                  </span>
                  <span className="mt-0.5 text-xs text-primary-foreground/75">
                    {academicSemesterLabel(teachingContext.semester)} · {formatAcademicShortDateRange(teachingContext.startDate, teachingContext.endDate)}
                  </span>
                </>
              ) : teachingContext.kind === "break" ? (
                <>
                  <span className="text-sm font-semibold">Semester break</span>
                  <span className="mt-0.5 text-xs text-primary-foreground/75">
                    {teachingContext.resumeDate
                      ? `Week ${teachingContext.nextWeek} resumes ${formatAcademicDate(teachingContext.resumeDate)}`
                      : `${academicSemesterLabel(teachingContext.semester)} teaching is complete`}
                  </span>
                </>
              ) : teachingContext.kind === "upcoming" ? (
                <>
                  <span className="text-sm font-semibold">Teaching starts soon</span>
                  <span className="mt-0.5 text-xs text-primary-foreground/75">
                    {academicSemesterLabel(teachingContext.semester)} · {formatAcademicDate(teachingContext.startDate)}
                  </span>
                </>
              ) : teachingContext.kind === "between" ? (
                <>
                  <span className="text-sm font-semibold">Between semesters</span>
                  <span className="mt-0.5 text-xs text-primary-foreground/75">
                    {academicSemesterLabel(teachingContext.nextSemester)} starts {formatAcademicDate(teachingContext.resumeDate)}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold">Teaching period complete</span>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <Link
        href={nextMeetingHref}
        className={MOBILE_STUDENT_PORTAL_LAYOUT.homeNextClass}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                {nextMeeting
                  ? relativeMeetingDay(
                      nextMeeting.dayOffset,
                      nextMeeting.meeting.dayOfWeek,
                    )
                  : "Schedule"}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {nextMeeting?.impact
                  ? "Schedule changed"
                  : nextMeeting
                    ? "Next class"
                    : "Class schedule"}
              </span>
            </div>

            {nextMeeting ? (
              <>
                <p className="mt-2 break-words text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
                  {nextMeeting.course.title}
                </p>
                <p className="mt-1 break-words text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {nextMeeting.course.code} · Section {nextMeeting.course.sectionCode}
                </p>

                <CourseAchievementBadges
                  summary={nextCourseAchievement}
                  showLocked={false}
                />
                <CourseAttendanceProgress
                  summary={nextCourseAchievement}
                  calendar={calendar}
                  term={nextMeeting.course.term}
                  compact
                />

                {nextMeeting.impact ? (
                  <div className="mt-2.5 flex min-w-0 items-center gap-2 rounded-xl border border-status-upcoming/30 bg-status-upcoming-bg px-3 py-2 text-sm text-status-upcoming">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <p className="min-w-0 break-words leading-5">
                      <span className="font-semibold">Class cancelled for this session</span>
                      <span className="text-status-upcoming/80"> · Make-up not scheduled yet.</span>
                    </p>
                  </div>
                ) : null}

                <div className="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="break-words">
                      <span className="font-semibold text-foreground">
                        {nextMeeting.impact ? "Original time" : "Time"}:
                      </span>{" "}
                      {meetingLabel(nextMeeting.meeting)}
                    </span>
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="break-words">
                      <span className="font-semibold text-foreground">
                        {nextMeeting.impact ? "Original room" : "Room"}:
                      </span>{" "}
                      {nextMeeting.meeting.room || "Room TBA"}
                    </span>
                  </span>
                  <span className="inline-flex min-w-0 basis-full items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      <span className="font-semibold text-foreground">Lecturer:</span>{" "}
                      {nextMeeting.course.lecturer?.name ?? "Lecturer TBA"}
                    </span>
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-xl font-semibold tracking-tight text-foreground">
                  No class scheduled yet
                </p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  Open your schedule to check published class times.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex min-h-10 items-center justify-between gap-3 border-t border-border/60 pt-2.5">
          <span className="text-sm font-semibold text-primary">
            {nextMeeting?.impact ? "View schedule update" : "View schedule"}
          </span>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition group-hover:translate-x-0.5">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </Link>

      {data.upcomingAssessments.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Upcoming work</p>
              <h3 className="mt-0.5 text-xl font-semibold tracking-tight">Assessments</h3>
            </div>
            <Link
              className="flex min-h-11 shrink-0 items-center rounded-full px-2 text-sm font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="/portal/assessments"
            >
              View all
            </Link>
          </div>
          <div className={MOBILE_STUDENT_PORTAL_LAYOUT.homeSectionCard}>
            {data.upcomingAssessments.slice(0, 3).map((item) => (
              <Link
                key={`${item.offeringId}-${item.assessmentId}`}
                href={`/portal/courses/${item.offeringId}`}
                className="group flex min-h-16 min-w-0 items-start gap-3 rounded-[1.35rem] p-3 transition duration-200 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ClipboardList className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold leading-5 text-foreground">{item.name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{item.courseCode}</span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="break-words">{assessmentDeadline(item.dueAt, item.dueWeek)}</span>
                    </span>
                    {item.weight != null ? <span className="font-medium">{item.weight}% weight</span> : null}
                  </div>
                </div>
                <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {data.announcements.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Course updates</p>
              <h3 className="mt-0.5 flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight">
                <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="break-words">Latest announcements</span>
              </h3>
            </div>
            <Link
              className="flex min-h-11 shrink-0 items-center rounded-full px-2 text-sm font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="/portal/announcements"
            >
              View all
            </Link>
          </div>
          <div className={MOBILE_STUDENT_PORTAL_LAYOUT.homeAnnouncementList}>
            {data.announcements.slice(0, 2).map((item) => (
              <article key={item.id} className={MOBILE_STUDENT_PORTAL_LAYOUT.homeAnnouncementCard}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-words text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {item.courseCode} · {item.sectionCode}
                  </span>
                  {item.pinned ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Pinned</span>
                  ) : null}
                </div>
                <p className="mt-2 break-words text-sm font-semibold leading-5 text-foreground">{item.title}</p>
                <p className="mt-1.5 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <Link
        href="/portal/academic-calendar"
        className={MOBILE_STUDENT_PORTAL_LAYOUT.homeCalendar}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background text-primary shadow-sm ring-1 ring-border/60">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dates & semester</p>
                <h3 className="mt-0.5 font-semibold text-foreground">Academic calendar</h3>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
            {calendar.status === "available" && calendarPeriod ? (
              <>
                <p className="mt-2 break-words text-sm font-medium text-foreground">
                  {teachingContext?.kind === "teaching"
                    ? `Week ${teachingContext.week} of ${teachingContext.totalWeeks} · ${formatAcademicShortDateRange(teachingContext.startDate, teachingContext.endDate)}`
                    : teachingContext?.kind === "break"
                      ? "Semester break"
                      : calendar.nextEvent
                        ? `${calendar.nextEvent.title} · ${formatAcademicDate(calendar.nextEvent.startDate)}`
                        : `${academicSemesterLabel(calendarPeriod.semester)} · ${formatAcademicDate(calendarPeriod.teachingStart)} – ${formatAcademicDate(calendarPeriod.teachingEnd)}`}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {academicSemesterLabel(calendarPeriod.semester)} · Academic year {calendar.academicYear.label}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm font-medium text-foreground">Calendar not available yet</p>
                <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{unavailableCalendarMessage}</p>
              </>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
