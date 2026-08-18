"use client";

import type { PortalCourseSummary } from "@dse-pms/shared-types";
import { BookOpen, CalendarDays, ChevronRight, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { meetingLabel, studentPortalApi } from "@/lib/student-portal";
import { EmptyState, PortalError, PortalLoading, usePortalData } from "../portal-state";

function CourseCard({ course }: { course: PortalCourseSummary }) {
  const meeting = course.meetings[0];

  return (
    <Link
      href={`/portal/courses/${course.offeringId}`}
      className="group flex min-h-64 flex-col rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <span className="rounded-xl bg-primary/10 p-3 text-primary">
          <BookOpen className="h-6 w-6" />
        </span>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
          Section {course.sectionCode}
        </span>
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary">
        {course.code} · {course.term}
      </p>
      <h3 className="mt-1 text-lg font-semibold">{course.title}</h3>
      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <UserRound className="h-4 w-4" />
          {course.lecturer?.name ?? "Lecturer TBA"}
        </p>
        {meeting ? (
          <>
            <p className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {meetingLabel(meeting)}
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {meeting.room || "Room TBA"}
            </p>
          </>
        ) : null}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-sm">
        <span className={course.specAvailable ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
          {course.specAvailable ? "Approved specification" : "Specification pending"}
        </span>
        <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => <CourseCard key={course.offeringId} course={course} />)}
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
  if (error || !data) return <PortalError message={error ?? "Could not load courses"} />;
  if (!data.length) {
    return <EmptyState title="No enrolled courses" description="Your courses will appear here after enrollment." />;
  }

  const currentCourses = data.filter((course) => course.lifecycle === "current");
  const plannedCourses = data.filter((course) => course.lifecycle === "planned");
  const historicalCourses = data.filter((course) => course.lifecycle === "historical");

  return (
    <div className="mx-auto max-w-7xl space-y-10">
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
