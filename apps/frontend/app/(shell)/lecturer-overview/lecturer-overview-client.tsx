"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Clock3,
  MapPin,
  Presentation,
  UsersRound,
} from "lucide-react";
import {
  semesterLabel,
  type LecturerWorkloadSummary,
  type OfferingView,
} from "@dse-pms/shared-types";
import { offeringsApi } from "@/lib/offerings";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Topbar } from "../topbar";

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function scheduleLabel(offering: OfferingView): string {
  if (offering.meetings.length === 0) return "Schedule not set";
  return offering.meetings
    .map((meeting) => `${meeting.dayOfWeek.slice(0, 3)} ${meeting.startTime}–${meeting.endTime}`)
    .join(" · ");
}

function roomsLabel(offering: OfferingView): string {
  const rooms = [...new Set(offering.meetings.map((meeting) => meeting.room).filter(Boolean))];
  return rooms.length > 0 ? rooms.join(", ") : "Room not set";
}

export function LecturerOverviewClient() {
  const { me } = useMe();
  const [offerings, setOfferings] = useState<OfferingView[]>([]);
  const [workload, setWorkload] = useState<LecturerWorkloadSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("__all__");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([offeringsApi.list(), offeringsApi.workload()])
      .then(([offeringRows, workloadSummary]) => {
        if (cancelled) return;
        setOfferings(offeringRows);
        setWorkload(workloadSummary);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load lecturer overview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const terms = useMemo(
    () => [...new Set(offerings.map((offering) => offering.term))].filter(Boolean).sort().reverse(),
    [offerings],
  );

  const visibleOfferings = useMemo(
    () => offerings.filter((offering) => term === "__all__" || offering.term === term),
    [offerings, term],
  );

  const visibleScheduleRows = useMemo(
    () =>
      (workload?.scheduleRows ?? []).filter(
        (row) => term === "__all__" || row.term === term,
      ),
    [workload, term],
  );

  const uniqueCourses = useMemo(
    () => new Set(visibleOfferings.map((offering) => offering.course?.id).filter(Boolean)).size,
    [visibleOfferings],
  );

  const primarySections = visibleOfferings.filter((offering) => offering.lecturer?.id === me?.id).length;
  const coLecturerSections = visibleOfferings.length - primarySections;
  const scheduledHours = visibleScheduleRows.reduce((total, row) => total + row.durationHours, 0);

  return (
    <>
      <Topbar
        title="Overview"
        subtitle="Your teaching assignments, classes, timetable, rooms, students, and current delivery status."
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-foreground">Lecturer teaching overview</p>
              <p className="text-sm text-muted-foreground">
                Operational information only. Course-specification progress is managed separately under Curriculum.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Academic period</span>
              <select
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="__all__">All periods</option>
                {terms.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Loading your teaching overview…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <SummaryCard icon={<BookOpen className="h-4 w-4" />} label="Courses" value={String(uniqueCourses)} />
                <SummaryCard icon={<Presentation className="h-4 w-4" />} label="Sections" value={String(visibleOfferings.length)} />
                <SummaryCard icon={<Presentation className="h-4 w-4" />} label="Primary / Co" value={`${primarySections} / ${coLecturerSections}`} />
                <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Scheduled hours / week" value={`${formatHours(scheduledHours)} h`} />
                <SummaryCard
                  icon={<UsersRound className="h-4 w-4" />}
                  label="Students"
                  value={String(visibleOfferings.reduce((sum, offering) => sum + offering.enrolledCount, 0))}
                />
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-4">
                  <h2 className="font-semibold text-foreground">Teaching assignments</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    One row per class section so timetable, room, enrolment, and delivery status remain clear.
                  </p>
                </div>

                {visibleOfferings.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    No teaching assignments are available for this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead className="bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Course</th>
                          <th className="px-4 py-3">Class</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Period</th>
                          <th className="px-4 py-3">Schedule</th>
                          <th className="px-4 py-3">Room</th>
                          <th className="px-4 py-3">Students</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visibleOfferings.map((offering) => {
                          const role = offering.lecturer?.id === me?.id ? "Primary Lecturer" : "Co-Lecturer";
                          return (
                            <tr key={offering.id} className="align-top hover:bg-muted/20">
                              <td className="px-4 py-4">
                                {offering.course ? (
                                  <Link href={`/courses/${offering.course.id}/spec`} className="font-medium text-foreground hover:underline">
                                    {offering.course.code}
                                    <span className="block max-w-[220px] text-xs font-normal text-muted-foreground">
                                      {offering.course.title}
                                    </span>
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">Course unavailable</span>
                                )}
                              </td>
                              <td className="px-4 py-4 font-medium text-foreground">{offering.sectionCode}</td>
                              <td className="px-4 py-4">{role}</td>
                              <td className="px-4 py-4">
                                <div className="text-foreground">{offering.term}</div>
                                <div className="text-xs text-muted-foreground">
                                  {offering.programmeYear ? `Year ${offering.programmeYear}` : "Year not set"} · {semesterLabel(offering.semester)}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex max-w-[260px] gap-2 text-muted-foreground">
                                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>{scheduleLabel(offering)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex gap-2 text-muted-foreground">
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span>{roomsLabel(offering)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-4 tabular-nums">
                                {offering.enrolledCount} / {offering.capacity}
                              </td>
                              <td className="px-4 py-4">
                                <OfferingStatus status={offering.status} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                Teaching start/end dates are not yet stored in the offering model. This dashboard intentionally shows only verified academic-period and timetable data until those dates are modeled.
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function OfferingStatus({ status }: { status: OfferingView["status"] }) {
  const className =
    status === "Active"
      ? "border-status-live/30 bg-status-live-bg text-status-live"
      : status === "Planned"
        ? "border-status-upcoming/30 bg-status-upcoming-bg text-status-upcoming"
        : "border-border bg-muted/40 text-muted-foreground";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {status}
    </span>
  );
}
