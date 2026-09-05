"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  MapPin,
  Target,
} from "lucide-react";
import { Progress } from "@dse-pms/ui";
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
  usePortalData,
} from "./portal-state";

export function PortalHome() {
  const load = useCallback(() => studentPortalApi.home(), []);
  const { data, loading, error } = usePortalData(load);

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
      <section className={MOBILE_STUDENT_PORTAL_LAYOUT.hero}>
        <p className="text-sm opacity-80">Welcome back</p>
        <h2 className="mt-1 break-words text-2xl font-bold">
          {data.student.name}
        </h2>
        <p className="mt-1 break-words text-sm opacity-80">
          {data.student.studentId} · Stay focused on what comes next.
        </p>
      </section>

      <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
        <section
          className={`${MOBILE_STUDENT_PORTAL_LAYOUT.compactCard} min-w-0 lg:col-span-2`}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-semibold">Next class</h3>
            <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
          </div>
          {nextMeeting ? (
            <div className="min-w-0">
              <p className="break-words text-lg font-semibold">
                {nextMeeting.course.code} · {nextMeeting.course.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Section {nextMeeting.course.sectionCode}
              </p>
              <div className="mt-4 grid gap-2 text-sm sm:flex sm:flex-wrap sm:gap-4">
                <span className="flex min-w-0 items-start gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="break-words">
                    {meetingLabel(nextMeeting.meeting)}
                  </span>
                </span>
                <span className="flex min-w-0 items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="break-words">
                    {nextMeeting.meeting.room || "Room TBA"}
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No class schedule is available yet.
            </p>
          )}
        </section>

        <section className={MOBILE_STUDENT_PORTAL_LAYOUT.compactCard}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">CLO achievement</h3>
            <Target className="h-5 w-5 shrink-0 text-primary" />
          </div>
          <p className="mt-4 text-3xl font-bold sm:mt-5">
            {data.overallAchievement === null
              ? "—"
              : `${data.overallAchievement}%`}
          </p>
          <Progress className="mt-3" value={data.overallAchievement ?? 0} />
          <p className="mt-2 text-xs text-muted-foreground">
            Calculated from published assessment evidence.
          </p>
        </section>
      </div>

      <Link
        href="/portal/academic-calendar"
        className="group block min-h-11 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
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
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {unavailableCalendarMessage}
                </p>
              </>
            )}
          </div>
          <span className="flex min-h-11 shrink-0 items-center gap-1 self-start text-sm font-medium text-primary sm:self-auto">
            View full calendar
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </div>
      </Link>

      <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <section className="space-y-3 lg:col-span-3">
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
            <div className="grid gap-3 sm:grid-cols-2">
              {data.courses.slice(0, 4).map((course) => (
                <Link
                  key={course.offeringId}
                  href={`/portal/courses/${course.offeringId}`}
                  className="group min-w-0 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-md md:p-5 md:hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
                  </div>
                  <p className="mt-4 break-words text-xs font-semibold uppercase tracking-wide text-primary">
                    {course.code} · Section {course.sectionCode}
                  </p>
                  <h4 className="mt-1 break-words font-semibold">
                    {course.title}
                  </h4>
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

        <section className="space-y-3 lg:col-span-2">
          <h3 className="text-lg font-semibold">Upcoming assessments</h3>
          <div className="rounded-2xl border border-border bg-card p-2">
            {data.upcomingAssessments.length ? (
              data.upcomingAssessments.map((item) => (
                <Link
                  key={`${item.offeringId}-${item.assessmentId}`}
                  href={`/portal/courses/${item.offeringId}`}
                  className="flex min-h-11 min-w-0 items-start gap-3 rounded-xl p-3 hover:bg-accent"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {item.name}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {item.courseCode} ·{" "}
                      {assessmentDeadline(item.dueAt, item.dueWeek)}
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
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            <Bell className="h-5 w-5 shrink-0 text-primary" />
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
