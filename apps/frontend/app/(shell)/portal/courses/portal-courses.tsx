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

  return (
    <Link
      href={`/portal/courses/${course.offeringId}`}
      className={MOBILE_STUDENT_PORTAL_LAYOUT.courseCard}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary ring-1 ring-primary/15">
              {course.code}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {course.term}
            </span>
          </div>
          <h3 className="mt-2 break-words text-[1.05rem] font-semibold leading-snug tracking-tight text-foreground">
            {course.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-muted/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground ring-1 ring-border/60">
          {course.sectionCode}
        </span>
      </div>

      <CourseAchievementBadges summary={achievement} />
      <CourseAttendanceProgress
        summary={achievement}
        calendar={calendar}
        term={course.term}
      />

      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="flex min-w-0 items-center gap-2">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-primary/75" aria-hidden="true" />
          <span className="truncate">
            {course.lecturer?.name ?? "Lecturer TBA"}
          </span>
        </p>
        {meeting ? (
          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1.5">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary/75" aria-hidden="true" />
              <span className="break-words">{meetingLabel(meeting)}</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/75" aria-hidden="true" />
              <span className="break-words">{meeting.room || "Room TBA"}</span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-2.5 text-xs">
        <span
          className={
            course.specAvailable
              ? "font-medium text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }
        >
          {course.specAvailable
            ? "Learning details available"
            : "Learning details pending"}
        </span>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:translate-x-0.5 group-hover:bg-primary group-hover:text-primary-foreground">
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
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
  return (
    <section className="space-y-3.5">
      <div className="px-0.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {courses.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
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
    <div className="mx-auto max-w-7xl space-y-7 md:space-y-9">
      <CourseSection
        title="Current courses"
        description="Active offerings for your current teaching period."
        courses={currentCourses}
        achievementsByOffering={achievementsByOffering}
        calendar={calendar}
        emptyMessage="You do not have any active course offerings right now."
      />
      {plannedCourses.length ? (
        <CourseSection
          title="Upcoming courses"
          description="Planned offerings you are already enrolled in."
          courses={plannedCourses}
          achievementsByOffering={achievementsByOffering}
          calendar={calendar}
        />
      ) : null}
      {historicalCourses.length ? (
        <CourseSection
          title="Course archive"
          description="Completed offerings remain available for published learning information and academic records."
          courses={historicalCourses}
          achievementsByOffering={achievementsByOffering}
          calendar={calendar}
        />
      ) : null}
    </div>
  );
}
