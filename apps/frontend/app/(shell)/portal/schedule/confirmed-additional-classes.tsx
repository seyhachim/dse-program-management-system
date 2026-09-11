"use client";

import type { OpenTeachingSlotStudentAssignment } from "@dse-pms/shared-types";
import { CalendarPlus2, Clock3, GraduationCap, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { openTeachingSlotApi } from "@/lib/open-teaching-slots";

function formatDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Phnom_Penh",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

function formatTime(value: string): string {
  const [hours = "0", minutes = "0"] = value.split(":");
  const date = new Date(2000, 0, 1, Number(hours), Number(minutes));
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ConfirmedAdditionalClasses() {
  const [assignments, setAssignments] = useState<OpenTeachingSlotStudentAssignment[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void openTeachingSlotApi.studentAssignments()
      .then((value) => {
        if (!cancelled) setAssignments(value);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load additional confirmed classes");
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <section className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </section>
    );
  }
  if (assignments.length === 0) return null;

  return (
    <section className="mt-6 space-y-3" aria-labelledby="additional-confirmed-classes">
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Confirmed schedule additions</p>
          <h2 id="additional-confirmed-classes" className="text-lg font-semibold tracking-tight">
            Additional classes
          </h2>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {assignments.length} {assignments.length === 1 ? "class" : "classes"}
        </span>
      </div>

      <div className="space-y-3">
        {assignments.map((assignment) => (
          <article key={assignment.occurrenceId} className="rounded-[1.75rem] border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarPlus2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Additional confirmed class
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(assignment.sessionDate)}</span>
                </div>
                <h3 className="mt-2 break-words text-base font-semibold text-foreground sm:text-lg">
                  {assignment.courseTitle}
                </h3>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {assignment.courseCode} · Section {assignment.sectionCode} · {assignment.activityType}
                </p>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                  <div className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Time</p>
                      <p className="mt-0.5 text-sm font-medium text-foreground">
                        {formatTime(assignment.startTime)}–{formatTime(assignment.endTime)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Room</p>
                      <p className="mt-0.5 text-sm font-medium text-foreground">{assignment.room ? `Room ${assignment.room}` : "Room not set"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-3">
                    <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Lecturer</p>
                      <p className="mt-0.5 break-words text-sm font-medium text-foreground">{assignment.lecturerName}</p>
                    </div>
                  </div>
                </div>

                <p className="mt-4 rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                  This is a separate confirmed class scheduled in released teaching time. It does not change the original course&apos;s cancelled session.
                </p>

                <Link
                  href={`/portal/courses/${assignment.offeringId}`}
                  className="mt-3 inline-flex min-h-10 items-center rounded-xl px-2 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open course
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
