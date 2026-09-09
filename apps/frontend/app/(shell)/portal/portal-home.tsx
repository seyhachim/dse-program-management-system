"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  MapPin,
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
  EmptyState,
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
  { label: "Courses", href: "/portal/courses", icon: BookOpen },
  { label: "Schedule", href: "/portal/schedule", icon: CalendarDays },
  { label: "Results", href: "/portal/results", icon: FileText },
] as const;

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

  const nextMeeting = data.courses.flatMap((course) =>
    course.meetings.map((meeting) => ({ course, meeting })),
  )[0];
  const calendar = data.academicCalendar;
  const firstCalendarPeriod =
    calendar.status === "available" ? (calendar.periods[0] ?? null) : null;
  const unavailableCalendarMessage =
    calendar.status === "unavailable"
      ? calendar.message
      : "No semester period is currently published.";

  return (
    <div
      className={`mx-auto max-w-7xl ${MOBILE_STUDENT_PORTAL_LAYOUT.homeStack}`}
    >
      {refreshError ? (
        <div className="rounded-xl border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">
          Could not refresh right now. Showing your last available portal data.
        </div>
      ) : refreshing ? (
        <p className="text-xs text-muted-foreground">Updating your portal…</p>
      ) : null}

      <section className={MOBILE_STUDENT_PORTAL_LAYOUT.hero}>
        <p className="text-xs font-medium text-muted-foreground">Welcome back</p>
        <h2 className="mt-1 break-words text-xl font-semibold tracking-tight text-foreground">
          {data.student.name}
        </h2>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">
          {data.student.studentId}
        </p>
      </section>

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

      <Link
        href="/portal/schedule"
        className={MOBILE_STUDENT_PORTAL_LAYOUT.homeNextClass}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Next class
            </p>
            {nextMeeting ? (
              <>
                <p className="mt-1 break-words text-lg font-semibold text-foreground">
                  {nextMeeting.course.code} · {nextMeeting.course.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Section {nextMeeting.course.sectionCode}
                </p>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:gap-4">
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
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                No class schedule is available yet.
              </p>
            )}
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
        </div>
      </Link>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Upcoming assessments</h3>
          <Link
            className="flex min-h-11 shrink-0 items-center text-sm font-medium text-primary"
            href="/portal/assessments"
          >
            View all
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
          {data.upcomingAssessments.length ? (
            data.upcomingAssessments.map((item) => (
              <Link
                key={`${item.offeringId}-${item.assessmentId}`}
                href={`/portal/courses/${item.offeringId}`}
                className="flex min-h-11 min-w-0 items-start gap-3 rounded-xl p-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{item.name}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {item.courseCode} · {assessmentDeadline(item.dueAt, item.dueWeek)}
                    {item.weight ? ` · ${item.weight}%` : ""}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              No upcoming assessments.
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
              <h3 className="font-semibold">Academic Calendar</h3>
            </div>
            {calendar.status === "available" && firstCalendarPeriod ? (
              <>
                <p className="mt-2 break-words text-sm font-medium">
                  {academicSemesterLabel(firstCalendarPeriod.semester)} ·{" "}
                  {formatAcademicDate(firstCalendarPeriod.teachingStart)} –{" "}
                  {formatAcademicDate(firstCalendarPeriod.teachingEnd)}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {calendar.nextEvent
                    ? `Next: ${calendar.nextEvent.title} · ${formatAcademicDate(calendar.nextEvent.startDate)}`
                    : "No upcoming event is currently published."}
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

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">My courses</h3>
          <Link
            className="flex min-h-11 items-center text-sm font-medium text-primary"
            href="/portal/courses"
          >
            View all
          </Link>
        </div>
        {data.courses.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.courses.slice(0, 4).map((course) => (
              <Link
                key={course.offeringId}
                href={`/portal/courses/${course.offeringId}`}
                className="group min-w-0 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-md md:p-5 md:hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
                </div>
                <p className="mt-4 break-words text-xs font-semibold uppercase tracking-wide text-primary">
                  {course.code} · Section {course.sectionCode}
                </p>
                <h4 className="mt-1 break-words font-semibold">{course.title}</h4>
                <p className="mt-2 break-words text-sm text-muted-foreground">
                  {course.lecturer?.name ?? "Lecturer TBA"}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No enrolled courses"
            description="Your courses will appear after enrollment."
          />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="break-words">Recent announcements</span>
          </h3>
          <Link
            className="flex min-h-11 shrink-0 items-center text-sm font-medium text-primary"
            href="/portal/announcements"
          >
            View all
          </Link>
        </div>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {data.announcements.length ? (
            data.announcements.map((item) => (
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
    </div>
  );
}
