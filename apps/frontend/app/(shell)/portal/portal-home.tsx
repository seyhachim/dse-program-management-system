"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  MapPin,
  UserRound,
} from "lucide-react";
import {
  academicSemesterLabel,
  formatAcademicDate,
} from "@/lib/academic-calendar";
import {
  assessmentDeadline,
  meetingLabel,
  studentPortalApi,
} from "@/lib/student-portal";
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

const QUICK_ACTIONS = [
  { label: "Schedule", href: "/portal/schedule", icon: CalendarDays },
  { label: "Courses", href: "/portal/courses", icon: BookOpen },
  { label: "Assessments", href: "/portal/assessments", icon: ClipboardList },
  { label: "Results", href: "/portal/results", icon: FileText },
] as const;

const WEEKDAY_INDEX = new Map(
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
    (day, index) => [day, index],
  ),
);

function timeMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function nextScheduledMeeting<
  TCourse extends {
    meetings: Array<{
      dayOfWeek: string;
      startTime: string;
      endTime: string;
    }>;
  },
>(courses: TCourse[], now: Date) {
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

        return {
          course,
          meeting,
          dayOffset,
          sortMinutes: dayOffset * 24 * 60 + Math.max(start - nowMinutes, 0),
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
  const load = useCallback(() => studentPortalApi.home(), []);
  const { data, loading, error, refreshError, refreshing } = useCachedPortalData(
    "home",
    load,
  );
  usePortalPrefetch(HOME_PREFETCH);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load your portal"} />;
  }

  const nextMeeting = nextScheduledMeeting(data.courses, new Date());
  const calendar = data.academicCalendar;
  const firstCalendarPeriod =
    calendar.status === "available" ? (calendar.periods[0] ?? null) : null;
  const unavailableCalendarMessage =
    calendar.status === "unavailable"
      ? calendar.message
      : "No semester period is currently published.";

  return (
    <div
      className={`mx-auto max-w-5xl ${MOBILE_STUDENT_PORTAL_LAYOUT.homeStack}`}
    >
      {refreshError ? (
        <div className="rounded-xl border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">
          Could not refresh right now. Showing your last available portal data.
        </div>
      ) : refreshing ? (
        <p className="text-xs text-muted-foreground">Updating your portal…</p>
      ) : null}

      <section className={MOBILE_STUDENT_PORTAL_LAYOUT.hero}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Welcome back</p>
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {data.student.name}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {data.student.studentId}
            </p>
          </div>
        </div>
      </section>

      <Link
        href="/portal/schedule"
        className={MOBILE_STUDENT_PORTAL_LAYOUT.homeNextClass}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {nextMeeting
                ? relativeMeetingDay(nextMeeting.dayOffset, nextMeeting.meeting.dayOfWeek)
                : "Schedule"}
            </p>
            {nextMeeting ? (
              <>
                <p className="mt-1 break-words text-xl font-semibold leading-tight text-foreground">
                  {nextMeeting.course.title}
                </p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {nextMeeting.course.code} · Section {nextMeeting.course.sectionCode}
                </p>
                <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <span className="flex min-w-0 items-start gap-2">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="break-words">
                      {meetingLabel(nextMeeting.meeting)}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="break-words">
                      {nextMeeting.meeting.room || "Room TBA"}
                    </span>
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  {nextMeeting.course.lecturer?.name ?? "Lecturer TBA"}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  No class scheduled yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open your schedule to check published class times.
                </p>
              </>
            )}
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
        </div>
      </Link>

      <nav
        aria-label="Student shortcuts"
        className={MOBILE_STUDENT_PORTAL_LAYOUT.homeQuickActions}
      >
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={MOBILE_STUDENT_PORTAL_LAYOUT.homeQuickAction}
            >
              <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="max-w-full truncate">{action.label}</span>
            </Link>
          );
        })}
      </nav>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Coming up
            </p>
            <h3 className="text-lg font-semibold">Assessments</h3>
          </div>
          <Link
            className="flex min-h-11 shrink-0 items-center text-sm font-medium text-primary"
            href="/portal/assessments"
          >
            View all
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
          {data.upcomingAssessments.length ? (
            data.upcomingAssessments.slice(0, 3).map((item) => (
              <Link
                key={`${item.offeringId}-${item.assessmentId}`}
                href={`/portal/courses/${item.offeringId}`}
                className="flex min-h-14 min-w-0 items-start gap-3 rounded-xl p-3 transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ClipboardList className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">{item.name}</p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {item.courseCode} · {assessmentDeadline(item.dueAt, item.dueWeek)}
                    {item.weight ? ` · ${item.weight}%` : ""}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              No upcoming assessments.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <h3 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="break-words">Latest announcements</span>
          </h3>
          <Link
            className="flex min-h-11 shrink-0 items-center text-sm font-medium text-primary"
            href="/portal/announcements"
          >
            View all
          </Link>
        </div>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
          {data.announcements.length ? (
            data.announcements.slice(0, 2).map((item) => (
              <div key={item.id} className="min-w-0 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words text-xs font-semibold text-primary">
                    {item.courseCode} · {item.sectionCode}
                  </span>
                  {item.pinned ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      Pinned
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 break-words font-medium">{item.title}</p>
                <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              No announcements yet.
            </p>
          )}
        </div>
      </section>

      <Link
        href="/portal/academic-calendar"
        className="group block min-h-11 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <h3 className="font-semibold">Academic calendar</h3>
            </div>
            {calendar.status === "available" && firstCalendarPeriod ? (
              <>
                <p className="mt-2 break-words text-sm font-medium">
                  {calendar.nextEvent
                    ? `${calendar.nextEvent.title} · ${formatAcademicDate(calendar.nextEvent.startDate)}`
                    : `${academicSemesterLabel(firstCalendarPeriod.semester)} · ${formatAcademicDate(firstCalendarPeriod.teachingStart)} – ${formatAcademicDate(firstCalendarPeriod.teachingEnd)}`}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {academicSemesterLabel(firstCalendarPeriod.semester)} · Academic year {calendar.academicYear?.label ?? "current"}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm font-medium">
                  Calendar not available yet
                </p>
                <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                  {unavailableCalendarMessage}
                </p>
              </>
            )}
          </div>
          <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
        </div>
      </Link>
    </div>
  );
}
