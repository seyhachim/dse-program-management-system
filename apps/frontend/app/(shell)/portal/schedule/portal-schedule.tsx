"use client";

import { useCallback } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { MEETING_DAYS } from "@dse-pms/shared-types";
import { studentPortalApi } from "@/lib/student-portal";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "../mobile-student-portal-layout";
import {
  EmptyState,
  PortalError,
  PortalLoading,
  usePortalData,
} from "../portal-state";

export function PortalSchedule() {
  const load = useCallback(() => studentPortalApi.courses(), []);
  const { data, loading, error } = usePortalData(load);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load schedule"} />;
  }

  const entries = data.flatMap((course) =>
    course.meetings.map((meeting) => ({ course, meeting })),
  );
  if (!entries.length) {
    return (
      <EmptyState
        title="No schedule available"
        description="Class meetings will appear after your section timetable is published."
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 md:space-y-4">
      {MEETING_DAYS.map((day) => {
        const dayEntries = entries
          .filter((item) => item.meeting.dayOfWeek === day)
          .sort((a, b) =>
            a.meeting.startTime.localeCompare(b.meeting.startTime),
          );
        if (!dayEntries.length) return null;

        return (
          <section
            key={day}
            className={MOBILE_STUDENT_PORTAL_LAYOUT.scheduleSection}
          >
            <h2 className="pt-1 text-sm font-semibold uppercase tracking-wide text-primary md:pt-4">
              {day}
            </h2>
            <div className="space-y-3">
              {dayEntries.map(({ course, meeting }) => (
                <Link
                  key={meeting.id}
                  href={`/portal/courses/${course.offeringId}`}
                  className={MOBILE_STUDENT_PORTAL_LAYOUT.scheduleMeeting}
                >
                  <div className="flex items-baseline gap-2 sm:block">
                    <p className="font-semibold tabular-nums">
                      {meeting.startTime}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      to {meeting.endTime}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {course.code} · {course.title}
                    </p>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      Section {course.sectionCode} · {meeting.activityType} ·{" "}
                      {course.lecturer?.name ?? "Lecturer TBA"}
                    </p>
                  </div>
                  <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground sm:justify-self-end">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="break-words text-left sm:max-w-44 sm:text-right">
                      {meeting.room || "Room TBA"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
