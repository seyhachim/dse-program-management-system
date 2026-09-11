"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  MapPin,
} from "lucide-react";
import {
  academicSemesterLabel,
  formatAcademicDate,
  formatAcademicShortDateRange,
  resolveStudentTeachingContext,
} from "@/lib/academic-calendar";
import { monitorDeliveryApi } from "@/lib/monitor-delivery";
import { studentPortalApi } from "@/lib/student-portal";
import { studentScheduleApi } from "@/lib/student-schedule";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "../mobile-student-portal-layout";
import {
  EmptyState,
  PortalError,
  PortalLoading,
  usePortalData,
} from "../portal-state";
import {
  buildTeachingWeekDateOptions,
  formatMeetingTime,
  formatTeachingWeekRange,
  isMeetingInProgress,
  normalizeTeachingDate,
  parseLocalDateKey,
  toLocalDateKey,
} from "./portal-schedule-utils";

function lecturerInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "L";
}

function impactKey(offeringId: string, meetingId: string, sessionDate: string): string {
  return `${offeringId}:${meetingId}:${sessionDate}`;
}

export function PortalSchedule() {
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date")?.trim() ?? "";
  const requestedFocus = searchParams.get("focus")?.trim() ?? "";
  const load = useCallback(async () => {
    const [courses, monitorAssignments, academicCalendar, scheduleImpacts] = await Promise.all([
      studentPortalApi.courses(),
      monitorDeliveryApi.assignments(),
      studentPortalApi.academicCalendar(),
      studentScheduleApi.impacts(),
    ]);
    return { courses, monitorAssignments, academicCalendar, scheduleImpacts };
  }, []);
  const { data, loading, error } = usePortalData(load);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [view, setView] = useState<"day" | "week">("day");
  const [now, setNow] = useState<Date | null>(null);
  const [expandedImpactId, setExpandedImpactId] = useState<string | null>(null);

  useEffect(() => {
    const current = new Date();
    const linkedDate = requestedDate ? parseLocalDateKey(requestedDate) : null;
    setSelectedDate(normalizeTeachingDate(linkedDate ?? current));
    setExpandedImpactId(requestedFocus || null);
    if (linkedDate || requestedFocus) setView("day");
    setNow(current);

    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [requestedDate, requestedFocus]);

  useEffect(() => {
    if (!requestedFocus || loading || !selectedDate) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`schedule-impact-${requestedFocus}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, requestedFocus, selectedDate]);

  const dateOptions = useMemo(
    () => (selectedDate ? buildTeachingWeekDateOptions(selectedDate) : []),
    [selectedDate],
  );

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load schedule"} />;
  }

  const monitorOfferingIds = new Set(
    data.monitorAssignments.map((assignment) => assignment.offeringId),
  );
  const impactsByKey = new Map(
    data.scheduleImpacts.map((impact) => [
      impactKey(impact.offeringId, impact.meetingId, impact.sessionDate),
      impact,
    ]),
  );
  const entries = data.courses.flatMap((course) =>
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

  if (!selectedDate) return <PortalLoading />;

  const selectedDateKey = toLocalDateKey(selectedDate);
  const selectedWeekday = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
  });
  const dayEntries = entries
    .filter((item) => item.meeting.dayOfWeek === selectedWeekday)
    .sort((a, b) => a.meeting.startTime.localeCompare(b.meeting.startTime));
  const selectedDateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const teachingContext = resolveStudentTeachingContext(
    data.academicCalendar,
    selectedDate,
  );
  const scheduleWeekLabel =
    teachingContext?.kind === "teaching"
      ? `Week ${teachingContext.week} of ${teachingContext.totalWeeks} · ${formatAcademicShortDateRange(teachingContext.startDate, teachingContext.endDate)}`
      : teachingContext?.kind === "break"
        ? teachingContext.resumeDate
          ? `Semester break · Week ${teachingContext.nextWeek} resumes ${formatAcademicDate(teachingContext.resumeDate)}`
          : "Semester break"
        : teachingContext?.kind === "upcoming"
          ? `${academicSemesterLabel(teachingContext.semester)} starts ${formatAcademicDate(teachingContext.startDate)}`
          : teachingContext?.kind === "between"
            ? `${academicSemesterLabel(teachingContext.nextSemester)} starts ${formatAcademicDate(teachingContext.resumeDate)}`
            : formatTeachingWeekRange(dateOptions) ?? "Teaching week";
  const weekGroups = dateOptions
    .map((option) => ({
      option,
      entries: entries
        .filter((item) => item.meeting.dayOfWeek === option.weekdayLong)
        .sort((a, b) => a.meeting.startTime.localeCompare(b.meeting.startTime)),
    }))
    .filter((group) => group.entries.length > 0);

  type ScheduleEntry = (typeof entries)[number];

  const renderMeetingCard = (
    { course, meeting }: ScheduleEntry,
    occurrenceDate: Date,
  ) => {
    const occurrenceDateKey = toLocalDateKey(occurrenceDate);
    const impact = impactsByKey.get(
      impactKey(course.offeringId, meeting.id, occurrenceDateKey),
    ) ?? null;
    const displayStartTime = impact?.originalStartTime ?? meeting.startTime;
    const displayEndTime = impact?.originalEndTime ?? meeting.endTime;
    const current = !impact && now
      ? isMeetingInProgress(
          occurrenceDate,
          now,
          displayStartTime,
          displayEndTime,
        )
      : false;
    const lecturerName = course.lecturer?.name ?? "Lecturer TBA";
    const canRecordDelivery = monitorOfferingIds.has(course.offeringId) && !impact;
    const isImpactExpanded = impact?.occurrenceId === expandedImpactId;
    const courseLabel = `${course.code} ${course.title}, ${formatMeetingTime(
      displayStartTime,
    )} to ${formatMeetingTime(displayEndTime)}${
      impact ? ", schedule changed" : current ? ", happening now" : ""
    }`;
    const originalDateLabel = occurrenceDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    return (
      <article
        id={impact ? `schedule-impact-${impact.occurrenceId}` : undefined}
        key={`${meeting.id}-${occurrenceDateKey}`}
        className={`${MOBILE_STUDENT_PORTAL_LAYOUT.scheduleMeeting} ${
          current ? MOBILE_STUDENT_PORTAL_LAYOUT.scheduleMeetingCurrent : ""
        }`}
      >
        {impact ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-status-upcoming/30 bg-status-upcoming-bg p-3.5 text-status-upcoming">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Schedule changed</p>
              <p className="mt-0.5 text-xs leading-5">
                This class will not take place at the scheduled time.
              </p>
            </div>
          </div>
        ) : null}

        <Link
          href={`/portal/courses/${course.offeringId}`}
          aria-label={courseLabel}
          className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {current ? (
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-primary">
              <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
              <span>Now</span>
            </div>
          ) : null}

          <div className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4">
            <div className="relative min-w-0 border-r border-border/80 pr-3 sm:pr-4">
              <Clock3 className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatMeetingTime(displayStartTime)}
              </p>
              <div className="my-2 h-5 border-l border-dashed border-border" />
              <p className="text-xs font-medium tabular-nums text-muted-foreground">
                {formatMeetingTime(displayEndTime)}
              </p>
            </div>

            <div className="min-w-0">
              <p className="break-words text-base font-semibold leading-snug text-foreground sm:text-lg">
                {course.title}
              </p>
              <p className="mt-1 break-words text-xs font-medium text-muted-foreground">
                {course.code} · Section {course.sectionCode} · {meeting.activityType}
              </p>

              <div className="mt-4 flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="break-words">
                  {[
                    meeting.building,
                    (impact?.originalRoom ?? meeting.room)
                      ? `Room ${impact?.originalRoom ?? meeting.room}`
                      : null,
                  ].filter(Boolean).join(" · ") || "Location TBA"}
                </span>
              </div>

              <div className="mt-3 flex min-w-0 items-center gap-2.5">
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground"
                  aria-hidden="true"
                >
                  {lecturerInitials(lecturerName)}
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {lecturerName}
                </span>
              </div>
            </div>
          </div>
        </Link>

        {impact ? (
          <div className="mt-4 border-t border-border/80 pt-3">
            <button
              type="button"
              aria-expanded={isImpactExpanded}
              aria-controls={`schedule-impact-details-${impact.occurrenceId}`}
              onClick={() =>
                setExpandedImpactId(isImpactExpanded ? null : impact.occurrenceId)
              }
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{isImpactExpanded ? "Hide schedule update" : "View schedule update"}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${isImpactExpanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {isImpactExpanded ? (
              <div
                id={`schedule-impact-details-${impact.occurrenceId}`}
                className="mt-3 space-y-4 rounded-2xl border border-border bg-muted/35 p-4"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-status-upcoming">
                    Class cancelled for this session
                  </p>
                  <p className="mt-1 text-sm leading-6 text-foreground">
                    This class will not take place at the scheduled time.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-background p-3 ring-1 ring-border/70">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Original class
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {originalDateLabel} · {formatMeetingTime(impact.originalStartTime)}–{formatMeetingTime(impact.originalEndTime)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {impact.originalRoom ? `Room ${impact.originalRoom}` : "Room not set"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-background p-3 ring-1 ring-border/70">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Make-up or replacement class
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Not scheduled yet</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      We’ll update this schedule when a new session is confirmed.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : canRecordDelivery ? (
          <div className="mt-4 border-t border-border/80 pt-3">
            <Link
              href={`/portal/schedule/delivery?offeringId=${encodeURIComponent(
                course.offeringId,
              )}&meetingId=${encodeURIComponent(meeting.id)}&date=${encodeURIComponent(
                occurrenceDateKey,
              )}`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm"
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Record class delivery
            </Link>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <div className={MOBILE_STUDENT_PORTAL_LAYOUT.scheduleSurface}>
      <section
        className={MOBILE_STUDENT_PORTAL_LAYOUT.scheduleToolbar}
        aria-label="Choose schedule date"
      >
        <div className="mb-3 flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">My schedule</p>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              {scheduleWeekLabel}
            </p>
          </div>

          <label className="relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-card text-foreground shadow-sm transition hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Choose another date</span>
            <input
              type="date"
              aria-label="Choose another schedule date"
              value={selectedDateKey}
              onChange={(event) => {
                const nextDate = parseLocalDateKey(event.target.value);
                if (!nextDate) return;
                setSelectedDate(normalizeTeachingDate(nextDate));
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>

        <div
          className="mb-3 grid grid-cols-2 rounded-2xl bg-background/70 p-1 ring-1 ring-border/70"
          role="group"
          aria-label="Schedule view"
        >
          {(["day", "week"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                view === mode
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>

        <div
          className={MOBILE_STUDENT_PORTAL_LAYOUT.scheduleDateStrip}
          role="group"
          aria-label="Monday to Saturday"
        >
          {dateOptions.map((option) => {
            const selected = option.key === selectedDateKey;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                aria-label={`${option.weekdayLong}, ${option.key}`}
                onClick={() => {
                  setSelectedDate(option.date);
                  setView("day");
                }}
                className={`${MOBILE_STUDENT_PORTAL_LAYOUT.scheduleDateButton} ${
                  selected
                    ? MOBILE_STUDENT_PORTAL_LAYOUT.scheduleDateButtonSelected
                    : ""
                }`}
              >
                <span className="truncate text-[10px] font-medium sm:text-xs">
                  {option.weekdayShort}
                </span>
                <span className="mt-0.5 text-base font-semibold leading-none tabular-nums sm:text-lg">
                  {option.dayOfMonth}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {view === "day" ? (
        <section aria-labelledby="selected-schedule-date" className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Day schedule
              </p>
              <h2
                id="selected-schedule-date"
                className="truncate text-lg font-semibold tracking-tight text-foreground"
              >
                {selectedDateLabel}
              </h2>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {dayEntries.length} {dayEntries.length === 1 ? "class" : "classes"}
            </span>
          </div>

          {dayEntries.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-border bg-card px-5 py-8 text-center shadow-sm">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-semibold text-foreground">No classes this day</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose another day from Monday to Saturday.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayEntries.map((entry) => renderMeetingCard(entry, selectedDate))}
            </div>
          )}
        </section>
      ) : (
        <section aria-labelledby="week-schedule" className="space-y-4">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Week schedule
              </p>
              <h2
                id="week-schedule"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                Monday–Saturday
              </h2>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {entries.length} {entries.length === 1 ? "class" : "classes"}
            </span>
          </div>

          {weekGroups.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-border bg-card px-5 py-8 text-center shadow-sm">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-semibold text-foreground">No classes this week</p>
            </div>
          ) : (
            <div className="space-y-5">
              {weekGroups.map(({ option, entries: groupEntries }) => (
                <div key={option.key} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h3 className="font-semibold text-foreground">
                      {option.weekdayLong}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {option.date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupEntries.map((entry) =>
                      renderMeetingCard(entry, option.date),
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
