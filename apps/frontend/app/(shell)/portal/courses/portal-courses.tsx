"use client";

import { useCallback } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, ChevronRight, MapPin, UserRound } from "lucide-react";
import { meetingLabel, studentPortalApi } from "@/lib/student-portal";
import { EmptyState, PortalError, PortalLoading, usePortalData } from "../portal-state";

export function PortalCourses() {
  const load = useCallback(() => studentPortalApi.courses(), []);
  const { data, loading, error } = usePortalData(load);
  if (loading) return <PortalLoading />;
  if (error || !data) return <PortalError message={error ?? "Could not load courses"} />;
  if (!data.length) return <EmptyState title="No enrolled courses" description="Your active classes will appear here after enrollment." />;
  return <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-3">{data.map((course) => {
    const meeting = course.meetings[0];
    return <Link key={course.offeringId} href={`/portal/courses/${course.offeringId}`} className="group flex min-h-64 flex-col rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between"><span className="rounded-xl bg-primary/10 p-3 text-primary"><BookOpen className="h-6 w-6" /></span><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">Section {course.sectionCode}</span></div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary">{course.code} · {course.term}</p><h2 className="mt-1 text-lg font-semibold">{course.title}</h2>
      <div className="mt-4 space-y-2 text-sm text-muted-foreground"><p className="flex items-center gap-2"><UserRound className="h-4 w-4" />{course.lecturer?.name ?? "Lecturer TBA"}</p>{meeting ? <><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{meetingLabel(meeting)}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{meeting.room || "Room TBA"}</p></> : null}</div>
      <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-sm"><span className={course.specAvailable ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{course.specAvailable ? "Approved specification" : "Specification pending"}</span><ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" /></div>
    </Link>;
  })}</div>;
}
