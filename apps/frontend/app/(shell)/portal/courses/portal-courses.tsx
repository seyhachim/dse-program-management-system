"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  MapPin,
  UserRound,
} from "lucide-react";
import type { PortalCourseSummary } from "@dse-pms/shared-types";
import { meetingLabel, studentPortalApi } from "@/lib/student-portal";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "../mobile-student-portal-layout";
import {
  EmptyState,
  PortalError,
  PortalLoading,
  usePortalData,
} from "../portal-state";

function CourseCard({ course }: { course: PortalCourseSummary }) {
  const meeting = course.meetings[0];

  return (
    <Link
      href={`/portal/courses/${course.offeringId}`}
      className={MOBILE_STUDENT_PORTAL_LAYOUT.courseCard}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-xl bg-primary/10 p-2.5 text-primary md:p-3">
          <BookOpen className="h-5 w-5 md:h-6 md:w-6" />
        </span>
        <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium">
          Section {course.sectionCode}
        </span>
      </div>
      <p className="mt-4 break-words text-xs font-semibold uppercase tracking-wide text-primary md:mt-5">
        {course.code} · {course.term}
      </p>
      <h3 className="mt-1 break-words text-lg font-semibold">{course.title}</h3>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground md:mt-4">
        <p className="flex min-w-0 items-start gap-2">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words">
            {course.lecturer?.name ?? "Lecturer TBA"}
          </span>
        </p>
        {meeting ? (
          <>
            <p className="flex min-w-0 items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-words">{meetingLabel(meeting)}</span>
            </p>
            <p className="flex min-w-0 items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-words">{meeting.room || "Room TBA"}</span>
            </p>
          </>
        ) : null}
      </div>
      <div className="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-border pt-3 text-sm md:mt-auto md:pt-4">
        <span
          className={
            course.specAvailable
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }
        >
          {course.specAvailable
            ? "Approved specification"
            : "Specification pending"}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function CourseSection({
  title,
  description,
  courses,
  emptyMessage,
}: {
  title: string;
  description: string;
  courses: PortalCourseSummary[];
  emptyMessage?: string;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {courses.length ? (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.offeringId} course={course} />
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
  const { data, loading, error } = usePortalData(load);

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

  const currentCourses = data.filter((course) => course.lifecycle === "current");
  const plannedCourses = data.filter((course) => course.lifecycle === "planned");
  const historicalCourses = data.filter(
    (course) => course.lifecycle === "historical",
  );

  return (
    <div className="mx-auto max-w-7xl space-y-7 md:space-y-10">
      <CourseSection
        title="Current courses"
        description="Active offerings for your current teaching period."
        courses={currentCourses}
        emptyMessage="You do not have any active course offerings right now."
      />
      {plannedCourses.length ? (
        <CourseSection
          title="Upcoming courses"
          description="Planned offerings you are already enrolled in."
          courses={plannedCourses}
        />
      ) : null}
      {historicalCourses.length ? (
        <CourseSection
          title="Course archive"
          description="Completed offerings remain available for approved specifications and published academic records."
          courses={historicalCourses}
        />
      ) : null}
    </div>
  );
}
