"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Clock3,
  MapPin,
  Presentation,
  UsersRound,
} from "lucide-react";
import { Skeleton } from "@dse-pms/ui";
import {
  semesterLabel,
  type LecturerWorkloadSummary,
  type OfferingView,
} from "@dse-pms/shared-types";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { offeringsApi } from "@/lib/offerings";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { Topbar } from "../topbar";
import { LECTURER_OVERVIEW_LAYOUT } from "./mobile-layout";

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function teachingPeriodLabel(offering: OfferingView): string {
  if (!offering.startDate || !offering.endDate) return "Dates not set";
  return `${formatDate(offering.startDate)} – ${formatDate(offering.endDate)}`;
}

function scheduleLabel(offering: OfferingView): string {
  if (offering.meetings.length === 0) return "Schedule not set";
  return offering.meetings
    .map(
      (meeting) =>
        `${meeting.dayOfWeek.slice(0, 3)} ${meeting.startTime}–${meeting.endTime}`,
    )
    .join(" · ");
}

function roomsLabel(offering: OfferingView): string {
  const rooms = [
    ...new Set(offering.meetings.map((meeting) => meeting.room).filter(Boolean)),
  ];
  return rooms.length > 0 ? rooms.join(", ") : "Room not set";
}

export function LecturerOverviewClient() {
  const { me, loading: meLoading } = useMe();
  const [term, setTerm] = useState("__all__");
  const queryScope = { userId: me?.id ?? "pending" };
  const offeringsQuery = useQuery({
    queryKey: protectedQueryKey(queryScope, "offerings", "list"),
    queryFn: () => offeringsApi.list(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });
  const workloadQuery = useQuery({
    queryKey: protectedQueryKey(queryScope, "offerings", "workload"),
    queryFn: () => offeringsApi.workload(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });
  const offerings = offeringsQuery.data ?? [];
  const workload: LecturerWorkloadSummary | null = workloadQuery.data ?? null;
  const hasOfferings = offeringsQuery.data !== undefined;
  const hasWorkload = workloadQuery.data !== undefined;
  const hasData = hasOfferings && hasWorkload;
  const loading =
    meLoading ||
    (!hasData && (offeringsQuery.isPending || workloadQuery.isPending));
  const hardQueryError =
    (!hasOfferings && offeringsQuery.isError) ||
    (!hasWorkload && workloadQuery.isError);
  const queryError = offeringsQuery.error ?? workloadQuery.error;
  const error = hardQueryError
    ? queryError instanceof ApiError
      ? queryError.message
      : "Failed to load lecturer overview"
    : null;
  const refreshing = offeringsQuery.isFetching || workloadQuery.isFetching;
  const refreshError = offeringsQuery.isError || workloadQuery.isError;

  const terms = useMemo(
    () =>
      [...new Set(offerings.map((offering) => offering.term))]
        .filter(Boolean)
        .sort()
        .reverse(),
    [offerings],
  );

  const visibleOfferings = useMemo(
    () =>
      offerings.filter(
        (offering) => term === "__all__" || offering.term === term,
      ),
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
    () =>
      new Set(
        visibleOfferings.map((offering) => offering.course?.id).filter(Boolean),
      ).size,
    [visibleOfferings],
  );

  const primarySections = visibleOfferings.filter(
    (offering) => offering.lecturer?.id === me?.id,
  ).length;
  const coLecturerSections = visibleOfferings.length - primarySections;
  const scheduledHours = visibleScheduleRows.reduce(
    (total, row) => total + row.durationHours,
    0,
  );
  const enrolledStudents = visibleOfferings.reduce(
    (sum, offering) => sum + offering.enrolledCount,
    0,
  );

  return (
    <>
      <Topbar
        title="Overview"
        subtitle="Your teaching assignments, delivery dates, classes, timetable, rooms, students, and current status."
      />

      <main className={LECTURER_OVERVIEW_LAYOUT.main}>
        <div className={LECTURER_OVERVIEW_LAYOUT.content}>
          <section className={LECTURER_OVERVIEW_LAYOUT.intro}>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">
                Lecturer teaching overview
              </h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Operational teaching information. Course-specification progress is
                managed separately under Curriculum.
              </p>
            </div>
            <label className={LECTURER_OVERVIEW_LAYOUT.periodField}>
              <span className="font-medium text-muted-foreground">
                Academic period
              </span>
              <select
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className={LECTURER_OVERVIEW_LAYOUT.periodSelect}
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

          <QueryRefreshStatus
            hasData={hasData}
            isPending={
              !hasData && (offeringsQuery.isPending || workloadQuery.isPending)
            }
            isFetching={refreshing}
            isError={refreshError}
            label="Lecturer overview"
          />

          {loading ? (
            <LecturerOverviewLoading />
          ) : error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <>
              <section className={LECTURER_OVERVIEW_LAYOUT.summaryGrid}>
                <SummaryCard
                  icon={<BookOpen className="h-4 w-4" />}
                  label="Courses"
                  value={String(uniqueCourses)}
                />
                <SummaryCard
                  icon={<Presentation className="h-4 w-4" />}
                  label="Sections"
                  value={String(visibleOfferings.length)}
                />
                <SummaryCard
                  icon={<Presentation className="h-4 w-4" />}
                  label="Primary / Co"
                  value={`${primarySections} / ${coLecturerSections}`}
                />
                <SummaryCard
                  icon={<Clock3 className="h-4 w-4" />}
                  label="Scheduled hours / week"
                  value={`${formatHours(scheduledHours)} h`}
                />
                <SummaryCard
                  icon={<UsersRound className="h-4 w-4" />}
                  label="Students"
                  value={String(enrolledStudents)}
                  className={LECTURER_OVERVIEW_LAYOUT.summaryFinalCard}
                />
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-4 py-4">
                  <h2 className="font-semibold text-foreground">
                    Teaching assignments
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Delivery dates, timetable, room, enrolment, and current status
                    for each class section.
                  </p>
                </div>

                {visibleOfferings.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground sm:p-10">
                    No teaching assignments are available for this period.
                  </div>
                ) : (
                  <>
                    <div className={LECTURER_OVERVIEW_LAYOUT.mobileAssignments}>
                      {visibleOfferings.map((offering) => (
                        <MobileOfferingCard
                          key={offering.id}
                          offering={offering}
                          isPrimary={offering.lecturer?.id === me?.id}
                        />
                      ))}
                    </div>

                    <div className={LECTURER_OVERVIEW_LAYOUT.desktopAssignments}>
                      <table className="w-full min-w-[1120px] text-sm">
                        <thead className="bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3">Course</th>
                            <th className="px-4 py-3">Class</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Academic Period</th>
                            <th className="px-4 py-3">Teaching Dates</th>
                            <th className="px-4 py-3">Schedule</th>
                            <th className="px-4 py-3">Room</th>
                            <th className="px-4 py-3">Students</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {visibleOfferings.map((offering) => {
                            const role =
                              offering.lecturer?.id === me?.id
                                ? "Primary Lecturer"
                                : "Co-Lecturer";
                            return (
                              <tr
                                key={offering.id}
                                className="align-top hover:bg-muted/20"
                              >
                                <td className="px-4 py-4">
                                  {offering.course ? (
                                    <Link
                                      href={`/courses/${offering.course.id}/spec`}
                                      className="font-medium text-foreground hover:underline"
                                    >
                                      {offering.course.code}
                                      <span className="block max-w-[220px] text-xs font-normal text-muted-foreground">
                                        {offering.course.title}
                                      </span>
                                    </Link>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      Course unavailable
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-4 font-medium text-foreground">
                                  {offering.sectionCode}
                                </td>
                                <td className="px-4 py-4">{role}</td>
                                <td className="px-4 py-4">
                                  <div className="text-foreground">
                                    {offering.term}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {offering.programmeYear
                                      ? `Year ${offering.programmeYear}`
                                      : "Year not set"}{" "}
                                    · {semesterLabel(offering.semester)}
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex max-w-[210px] gap-2 text-muted-foreground">
                                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{teachingPeriodLabel(offering)}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex max-w-[260px] gap-2 text-muted-foreground">
                                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
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
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function LecturerOverviewLoading() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-label="Loading lecturer overview">
      <div className={LECTURER_OVERVIEW_LAYOUT.summaryGrid}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton
            key={index}
            className={`${LECTURER_OVERVIEW_LAYOUT.summaryCard} ${
              index === 4 ? LECTURER_OVERVIEW_LAYOUT.summaryFinalCard : ""
            }`}
          />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`${LECTURER_OVERVIEW_LAYOUT.summaryCard} ${className}`}>
      <div className="mb-3 flex items-start gap-2 text-xs leading-4 text-muted-foreground">
        <span className="mt-px shrink-0">{icon}</span>
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

function MobileOfferingCard({
  offering,
  isPrimary,
}: {
  offering: OfferingView;
  isPrimary: boolean;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {offering.course ? (
            <Link
              href={`/courses/${offering.course.id}/spec`}
              className="block min-h-11 py-1 font-semibold text-foreground"
            >
              <span className="block">{offering.course.code}</span>
              <span className="mt-0.5 block text-sm font-normal leading-5 text-muted-foreground">
                {offering.course.title}
              </span>
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">
              Course unavailable
            </span>
          )}
        </div>
        <OfferingStatus status={offering.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
          Class {offering.sectionCode}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
          {isPrimary ? "Primary Lecturer" : "Co-Lecturer"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <MobileDetail
          label="Academic period"
          value={`${offering.term} · ${
            offering.programmeYear
              ? `Year ${offering.programmeYear}`
              : "Year not set"
          } · ${semesterLabel(offering.semester)}`}
        />
        <MobileDetail
          label="Students"
          value={`${offering.enrolledCount} / ${offering.capacity}`}
        />
        <MobileDetail
          className="col-span-2"
          icon={<CalendarDays className="h-4 w-4" />}
          label="Teaching dates"
          value={teachingPeriodLabel(offering)}
        />
        <MobileDetail
          className="col-span-2"
          icon={<Clock3 className="h-4 w-4" />}
          label="Schedule"
          value={scheduleLabel(offering)}
        />
        <MobileDetail
          className="col-span-2"
          icon={<MapPin className="h-4 w-4" />}
          label="Room"
          value={roomsLabel(offering)}
        />
      </dl>
    </article>
  );
}

function MobileDetail({
  label,
  value,
  icon,
  className = "",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 leading-5 text-foreground">{value}</dd>
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
    <span
      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
}
