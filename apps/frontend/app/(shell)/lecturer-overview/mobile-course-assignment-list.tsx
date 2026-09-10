import Link from "next/link";
import { CalendarDays, Clock3, MapPin, UsersRound } from "lucide-react";
import type { OfferingMeetingView, OfferingView } from "@dse-pms/shared-types";
import {
  compactAcademicPeriodLabel,
  compactScheduleLabel,
  groupLecturerOfferings,
  lecturerOfferingRole,
  type LecturerCourseOfferingGroup,
} from "./mobile-course-groups";

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function teachingPeriodLabel(startDate: string | null, endDate: string | null): string {
  if (!startDate || !endDate) return "Dates not set";
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function roomsLabel(meetings: OfferingMeetingView[]): string {
  const rooms = [
    ...new Set(meetings.map((meeting) => meeting.room).filter(Boolean)),
  ];
  return rooms.length > 0 ? rooms.join(", ") : "Room not set";
}

export function MobileCourseAssignmentList({
  offerings,
  lecturerId,
}: {
  offerings: OfferingView[];
  lecturerId: string | null | undefined;
}) {
  const groups = groupLecturerOfferings(offerings, lecturerId);

  return (
    <div className="divide-y divide-border md:hidden">
      {groups.map((group) => (
        <MobileCourseAssignmentCard
          key={group.key}
          group={group}
          lecturerId={lecturerId}
        />
      ))}
    </div>
  );
}

function MobileCourseAssignmentCard({
  group,
  lecturerId,
}: {
  group: LecturerCourseOfferingGroup;
  lecturerId: string | null | undefined;
}) {
  const first = group.offerings[0];
  const course = first.course;
  const showPerClassRole = group.commonRole === null;
  const showPerClassStatus = group.commonStatus === null;
  const showPerClassDates = group.commonTeachingPeriod === null;

  return (
    <article className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {course ? (
            <Link
              href={`/courses/${course.id}/spec`}
              className="block rounded-lg py-0.5 font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block text-base leading-5">{course.code}</span>
              <span className="mt-1 block text-sm font-normal leading-5 text-muted-foreground">
                {course.title}
              </span>
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">Course unavailable</span>
          )}
        </div>
        {group.commonStatus ? (
          <CompactOfferingStatus status={group.commonStatus} />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
          {group.offerings.length} {group.offerings.length === 1 ? "class" : "classes"}
        </span>
        {group.commonRole ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {group.commonRole}
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
        <p className="font-medium text-foreground/80">
          {compactAcademicPeriodLabel(first)}
        </p>
        {group.commonTeachingPeriod ? (
          <p className="flex min-w-0 items-start gap-1.5">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">
              {teachingPeriodLabel(
                group.commonTeachingPeriod.startDate,
                group.commonTeachingPeriod.endDate,
              )}
            </span>
          </p>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-muted/15">
        <div className="divide-y divide-border/70">
          {group.offerings.map((offering) => (
            <CompactClassRow
              key={offering.id}
              offering={offering}
              lecturerId={lecturerId}
              showRole={showPerClassRole}
              showStatus={showPerClassStatus}
              showDates={showPerClassDates}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function CompactClassRow({
  offering,
  lecturerId,
  showRole,
  showStatus,
  showDates,
}: {
  offering: OfferingView;
  lecturerId: string | null | undefined;
  showRole: boolean;
  showStatus: boolean;
  showDates: boolean;
}) {
  return (
    <div className="px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex min-w-10 shrink-0 items-center justify-center rounded-xl bg-background px-2 py-1.5 text-sm font-semibold text-foreground ring-1 ring-border/70">
          {offering.sectionCode}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-start gap-1.5 text-sm font-medium leading-5 text-foreground">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words">
              {compactScheduleLabel(offering.meetings)}
            </span>
          </p>
          <p className="mt-1 flex min-w-0 items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{roomsLabel(offering.meetings)}</span>
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
          <UsersRound className="h-3.5 w-3.5" />
          {offering.enrolledCount}/{offering.capacity}
        </span>
      </div>

      {showRole || showStatus || showDates ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-[3.125rem] text-[11px] text-muted-foreground">
          {showRole ? (
            <span className="rounded-full bg-muted px-2 py-0.5">
              {lecturerOfferingRole(offering, lecturerId)}
            </span>
          ) : null}
          {showStatus ? <CompactOfferingStatus status={offering.status} compact /> : null}
          {showDates ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {teachingPeriodLabel(offering.startDate, offering.endDate)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CompactOfferingStatus({
  status,
  compact = false,
}: {
  status: OfferingView["status"];
  compact?: boolean;
}) {
  const className =
    status === "Active"
      ? "border-status-live/30 bg-status-live-bg text-status-live"
      : status === "Planned"
        ? "border-status-upcoming/30 bg-status-upcoming-bg text-status-upcoming"
        : "border-border bg-muted/40 text-muted-foreground";

  return (
    <span
      className={`inline-flex shrink-0 rounded-full border font-medium ${
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      } ${className}`}
    >
      {status}
    </span>
  );
}
