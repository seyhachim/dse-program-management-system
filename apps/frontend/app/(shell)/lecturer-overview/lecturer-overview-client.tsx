"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
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
import {
  compactScheduleLabel,
  groupOfferingsForMobile,
  upcomingTeachingLabel,
  type MobileOfferingGroup,
} from "./lecturer-overview-ordering";
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

  // Keep this calculation cheap and render-time based instead of memoizing the
  // clock. Any normal refresh/re-render then advances the next-class ordering.
  const mobileNow = new Date();
  const mobileOfferingGroups = groupOfferingsForMobile(
    visibleOfferings,
    mobileNow,
  );
  const nextOfferingId =
    mobileOfferingGroups.find((group) => group.next)?.next?.offering.id ?? null;

  return (
    <>
      <Topbar
        title="Overview"
        subtitle="Your teaching assignments, delivery dates, classes, timetable, rooms, students, and current status."
      />

      <main className={LECTURER_OVERVIEW_LAYOUT.main}>
        <div className={LECTURER_OVERVIEW_LAYOUT.content}>
          <section
            className={LECTURER_OVERVIEW_LAYOUT.mobileHero}
            aria-label="Lecturer identity"
          >
            <span
              className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-primary-foreground/10"
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute -bottom-16 right-16 h-28 w-28 rounded-full bg-primary-foreground/5"
              aria-hidden="true"
            />
            <div className="relative z-10 space-y-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <Image
                  src="/dse-logo.svg"
                  alt="DSE logo"
                  width={92}
                  height={30}
                  priority
                  className="h-auto w-[5.75rem] shrink-0 sm:w-[6.25rem]"
                />
                <span className="shrink-0 rounded-full bg-primary-foreground/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/80 ring-1 ring-primary-foreground/15">
                  DSE Lecturer
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-sm font-medium text-primary-foreground/75">
                  Welcome back
                </p>
                <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                  {me?.name || "Lecturer"}
                </h1>
                <p className="mt-1 text-xs font-medium text-primary-foreground/70">
                  Teaching workspace
                </p>
              </div>
            </div>
          </section>

          <label className={LECTURER_OVERVIEW_LAYOUT.mobileTermField}>
            <span className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
              <span>Teaching term</span>
              <span className="tabular-nums">
                {visibleOfferings.length}{" "}
                {visibleOfferings.length === 1 ? "class" : "classes"}
              </span>
            </span>
            <select
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              className={LECTURER_OVERVIEW_LAYOUT.mobileTermSelect}
              aria-label="Teaching term"
            >
              <option value="__all__">All terms</option>
              {terms.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

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
                Teaching term
              </span>
              <select
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className={LECTURER_OVERVIEW_LAYOUT.periodSelect}
                aria-label="Teaching term"
              >
                <option value="__all__">All terms</option>
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
              <section
                className={LECTURER_OVERVIEW_LAYOUT.mobileSummaryGrid}
                aria-label="Teaching summary"
              >
                <CompactSummaryCard
                  icon={<BookOpen className="h-4 w-4" />}
                  title="Teaching"
                  metrics={[
                    { label: "Courses", value: String(uniqueCourses) },
                    { label: "Classes", value: String(visibleOfferings.length) },
                    { label: "Students", value: String(enrolledStudents) },
                  ]}
                />
                <CompactSummaryCard
                  icon={<Clock3 className="h-4 w-4" />}
                  title="Role & load"
                  metrics={[
                    {
                      label: "Primary / Co",
                      value: `${primarySections} / ${coLecturerSections}`,
                    },
                    {
                      label: "Hours / week",
                      value: `${formatHours(scheduledHours)} h`,
                    },
                  ]}
                />
              </section>

              <section className={LECTURER_OVERVIEW_LAYOUT.summaryGrid}>
                <SummaryCard
                  icon={<BookOpen className="h-4 w-4" />}
                  label="Courses"
                  value={String(uniqueCourses)}
                />
                <SummaryCard
                  icon={<Presentation className="h-4 w-4" />}
                  label="Classes"
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

              <section className={LECTURER_OVERVIEW_LAYOUT.assignmentSurface}>
                <div className={LECTURER_OVERVIEW_LAYOUT.assignmentHeader}>
                  <h2 className="font-semibold text-foreground">
                    Teaching assignments
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground md:hidden">
                    Next class first · classes grouped by course.
                  </p>
                  <p className="mt-1 hidden text-sm leading-5 text-muted-foreground md:block">
                    Delivery dates, timetable, room, enrolment, and current status
                    for each class.
                  </p>
                </div>

                {visibleOfferings.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground sm:p-10">
                    No teaching assignments are available for this term.
                  </div>
                ) : (
                  <>
                    <div className={LECTURER_OVERVIEW_LAYOUT.mobileAssignments}>
                      {mobileOfferingGroups.map((group) => (
                        <MobileCourseGroupCard
                          key={group.key}
                          group={group}
                          lecturerId={me?.id}
                          nextOfferingId={nextOfferingId}
                          now={mobileNow}
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
                            <th className="px-4 py-3">Teaching Term</th>
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
    <div className="space-y-3 sm:space-y-6" aria-label="Loading lecturer overview">
      <div className={LECTURER_OVERVIEW_LAYOUT.mobileSummaryGrid}>
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton
            key={index}
            className={`${LECTURER_OVERVIEW_LAYOUT.mobileSummaryCard} h-32`}
          />
        ))}
      </div>
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

function CompactSummaryCard({
  icon,
  title,
  metrics,
}: {
  icon: React.ReactNode;
  title: string;
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <article className={LECTURER_OVERVIEW_LAYOUT.mobileSummaryCard}>
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <span className="rounded-lg bg-primary/8 p-1.5 text-primary">{icon}</span>
        <span>{title}</span>
      </div>
      <dl className="mt-2.5 space-y-1.5">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            <dt className="min-w-0 text-muted-foreground">{metric.label}</dt>
            <dd className="shrink-0 font-semibold tabular-nums text-foreground">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
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
        <span className="mt-px shrink-0 text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

function MobileCourseGroupCard({
  group,
  lecturerId,
  nextOfferingId,
  now,
}: {
  group: MobileOfferingGroup<OfferingView>;
  lecturerId: string | undefined;
  nextOfferingId: string | null;
  now: Date;
}) {
  const firstOffering = group.sections[0]?.offering;
  if (!firstOffering) return null;

  const statuses = [...new Set(group.sections.map(({ offering }) => offering.status))];
  const sharedStatus = statuses.length === 1 ? statuses[0] : null;
  const teachingWindows = new Set(
    group.sections.map(
      ({ offering }) => `${offering.startDate ?? ""}:${offering.endDate ?? ""}`,
    ),
  );
  const teachingDates =
    teachingWindows.size === 1
      ? teachingPeriodLabel(firstOffering)
      : "Teaching dates vary by class";

  return (
    <article className="p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {group.course ? (
            <Link
              href={`/courses/${group.course.id}/spec`}
              className="block min-h-11 py-0.5 font-semibold text-foreground"
            >
              <span className="block text-lg leading-6">{group.course.code}</span>
              <span className="mt-0.5 block break-words text-sm font-normal leading-5 text-muted-foreground">
                {group.course.title}
              </span>
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">
              Course unavailable
            </span>
          )}
        </div>
        {sharedStatus ? <OfferingStatus status={sharedStatus} /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{group.term}</span>
        <span aria-hidden="true">·</span>
        <span>
          {group.programmeYear ? `Year ${group.programmeYear}` : "Year not set"}
        </span>
        <span aria-hidden="true">·</span>
        <span>{semesterLabel(group.semester)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{teachingDates}</span>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border/70 bg-muted/15">
        {group.sections.map(({ offering, next }, index) => {
          const isNextClass = nextOfferingId === offering.id && Boolean(next);
          const isPrimary = offering.lecturer?.id === lecturerId;
          return (
            <div
              key={offering.id}
              className={`${index > 0 ? "border-t border-border/70" : ""} ${
                isNextClass ? "bg-primary/5" : ""
              } p-3`}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                    Class {offering.sectionCode}
                  </span>
                  <span className="rounded-full bg-muted/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                    {isPrimary ? "Primary" : "Co-Lecturer"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isNextClass ? (
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Next class
                    </span>
                  ) : null}
                  {!sharedStatus ? <OfferingStatus status={offering.status} /> : null}
                </div>
              </div>

              <div className="mt-2.5 flex items-start gap-2 text-sm">
                <Clock3
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span
                  className={
                    next ? "font-medium text-foreground" : "text-muted-foreground"
                  }
                >
                  {next ? upcomingTeachingLabel(next, now) : "No upcoming class"}
                </span>
              </div>

              {offering.meetings.length > 1 || !next ? (
                <p className="mt-1.5 break-words pl-6 text-xs leading-5 text-muted-foreground">
                  Weekly · {compactScheduleLabel(offering)}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="break-words">{roomsLabel(offering)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {offering.enrolledCount} / {offering.capacity}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
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
