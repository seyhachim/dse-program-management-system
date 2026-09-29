"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  MapPin,
  UserRound,
} from "lucide-react";
import type {
  PortalCourseAchievementSummary,
  PortalCourseSummary,
  StudentAcademicCalendarView,
} from "@dse-pms/shared-types";
import { meetingLabel, studentPortalApi } from "@/lib/student-portal";
import { CourseAchievementBadges } from "../course-achievement-badges";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "../mobile-student-portal-layout";
import {
  EmptyState,
  PortalError,
  PortalLoading,
  useCachedPortalData,
} from "../portal-state";
import { CourseAttendanceProgress } from "./course-attendance-progress";

const UNAVAILABLE_CALENDAR: StudentAcademicCalendarView = {
  status: "unavailable",
  academicYear: null,
  studyYear: null,
  reason: "calendar-unpublished",
  message: "Published teaching calendar unavailable.",
};

function CourseCard({
  course,
  achievement,
  calendar,
}: {
  course: PortalCourseSummary;
  achievement: PortalCourseAchievementSummary | null;
  calendar: StudentAcademicCalendarView;
}) {
  const meeting = course.meetings[0];
  const showProgress = course.lifecycle !== "planned";

  return (
    <Link
      href={`/portal/courses/${course.offeringId}`}
      className={MOBILE_STUDENT_PORTAL_LAYOUT.courseCard}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary ring-1 ring-primary/15">
              {course.code}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {course.term}
            </span>
          </div>
          <h3 className="mt-2.5 break-words text-lg font-semibold leading-snug tracking-tight text-foreground">
            {course.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-muted/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground ring-1 ring-border/60">
          Section {course.sectionCode}
        </span>
      </div>

      {showProgress ? (
        <>
          <CourseAchievementBadges summary={achievement} showLocked={false} />
          <CourseAttendanceProgress
            summary={achievement}
            calendar={calendar}
            term={course.term}
            compact
          />
        </>
      ) : null}

      <div className="mt-4 grid min-w-0 gap-2 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-x-4">
        <p className="flex min-w-0 items-center gap-2">
          <UserRound
            className="h-3.5 w-3.5 shrink-0 text-primary/75"
            aria-hidden="true"
          />
          <span className="truncate">
            {course.lecturer?.name ?? "Lecturer TBA"}
          </span>
        </p>
        {meeting ? (
          <p className="flex min-w-0 items-center gap-2">
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-primary/75"
              aria-hidden="true"
            />
            <span className="min-w-0 break-words">
              {meetingLabel(meeting)}
            </span>
          </p>
        ) : (
          <p className="flex min-w-0 items-center gap-2">
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-primary/75"
              aria-hidden="true"
            />
            <span>Schedule TBA</span>
          </p>
        )}
        <p className="flex min-w-0 items-center gap-2 sm:col-start-2">
          <MapPin
            className="h-3.5 w-3.5 shrink-0 text-primary/75"
            aria-hidden="true"
          />
          <span className="break-words">
            {meeting?.room || "Room TBA"}
          </span>
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs">
        <span
          className={
            course.specAvailable
              ? "font-medium text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }
        >
          {course.specAvailable
            ? "Learning details ready"
            : "Learning details pending"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary">
          Open course
          <ChevronRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}

function CourseSection({
  title,
  description,
  courses,
  achievementsByOffering,
  calendar,
  emptyMessage,
}: {
  title: string;
  description: string;
  courses: PortalCourseSummary[];
  achievementsByOffering: Map<string, PortalCourseAchievementSummary>;
  calendar: StudentAcademicCalendarView;
  emptyMessage?: string;
}) {
  const gridClassName =
    courses.length === 1
      ? "grid max-w-3xl gap-4"
      : "grid gap-4 lg:grid-cols-2";

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4 px-0.5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {courses.length ? (
          <span className="shrink-0 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {courses.length} {courses.length === 1 ? "course" : "courses"}
          </span>
        ) : null}
      </div>
      {courses.length ? (
        <div className={gridClassName}>
          {courses.map((course) => (
            <CourseCard
              key={course.offeringId}
              course={course}
              achievement={achievementsByOffering.get(course.offeringId) ?? null}
              calendar={calendar}
            />
          ))}
        </div>
      ) : emptyMessage ? (
        <div className="max-w-3xl rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : null}
    </section>
  );
}

export function PortalCourses() {
  const load = useCallback(() => studentPortalApi.courses(), []);
  const loadCourseAchievements = useCallback(
    () =>
      studentPortalApi
        .courseAchievements()
        .catch((): PortalCourseAchievementSummary[] => []),
    [],
  );
  const loadAcademicCalendar = useCallback(
    () => studentPortalApi.academicCalendar(),
    [],
  );
  const { data, loading, error } = useCachedPortalData("courses", load);
  const { data: courseAchievements } = useCachedPortalData(
    "course-achievements",
    loadCourseAchievements,
  );
  const { data: academicCalendar } = useCachedPortalData(
    "academic-calendar",
    loadAcademicCalendar,
  );

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load courses"} />;
  }
  if (!data.length) {
    return (
      <EmptyState
        title="No enrolled courses"
        description="Your courses will appear here after enrollment."
      />
    );
  }

  const achievementsByOffering = new Map(
    (courseAchievements ?? []).map((summary) => [summary.offeringId, summary]),
  );
  const calendar = academicCalendar ?? UNAVAILABLE_CALENDAR;
  const currentCourses = data.filter((course) => course.lifecycle === "current");
  const plannedCourses = data.filter((course) => course.lifecycle === "planned");
  const historicalCourses = data.filter(
    (course) => course.lifecycle === "historical",
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 md:space-y-10">
      <CourseSection
        title="Current courses"
        description="Courses you are enrolled in this term."
        courses={currentCourses}
        achievementsByOffering={achievementsByOffering}
        calendar={calendar}
        emptyMessage="You do not have any active courses right now."
      />
      {plannedCourses.length ? (
        <CourseSection
          title="Upcoming courses"
          description="Courses already scheduled for a future term."
          courses={plannedCourses}
          achievementsByOffering={achievementsByOffering}
          calendar={calendar}
        />
      ) : null}
      {historicalCourses.length ? (
        <CourseSection
          title="Course archive"
          description="Past courses with published learning information and academic records."
          courses={historicalCourses}
          achievementsByOffering={achievementsByOffering}
          calendar={calendar}
        />
      ) : null}
    </div>
  );
}
