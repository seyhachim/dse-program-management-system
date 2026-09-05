"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, UsersRound } from "lucide-react";
import {
  MEETING_DAYS,
  type LecturerScheduleRow,
  type LecturerWorkloadSummary,
} from "@dse-pms/shared-types";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { offeringsApi, workloadForTerm } from "@/lib/offerings";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { Topbar } from "../topbar";

const ALL_TERMS = "__all__";

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function TeachingScheduleClient() {
  const { me, loading: meLoading } = useMe();
  const [term, setTerm] = useState(ALL_TERMS);
  const queryScope = { userId: me?.id ?? "pending" };
  const workloadQuery = useQuery({
    queryKey: protectedQueryKey(queryScope, "offerings", "workload"),
    queryFn: () => offeringsApi.workload(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });
  const summary: LecturerWorkloadSummary | null = workloadQuery.data ?? null;
  const hasData = workloadQuery.data !== undefined;
  const loading = meLoading || (!hasData && workloadQuery.isPending);
  const hardQueryError = !hasData && workloadQuery.isError;
  const error = hardQueryError
    ? workloadQuery.error instanceof ApiError
      ? workloadQuery.error.message
      : "Failed to load your teaching schedule"
    : null;

  const terms = useMemo(() => {
    if (!summary) return [];
    return [...new Set(summary.scheduleRows.map((row) => row.term))]
      .filter(Boolean)
      .sort()
      .reverse();
  }, [summary]);

  const filteredSummary = useMemo(() => {
    if (!summary) return null;
    return workloadForTerm(summary, term === ALL_TERMS ? null : term);
  }, [summary, term]);

  const rowsByDay = useMemo(() => {
    const rows = filteredSummary?.scheduleRows ?? [];
    const grouped = new Map<string, LecturerScheduleRow[]>();

    for (const day of MEETING_DAYS) {
      grouped.set(day, []);
    }

    for (const row of rows) {
      grouped.get(row.dayOfWeek)?.push(row);
    }

    for (const dayRows of grouped.values()) {
      dayRows.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return grouped;
  }, [filteredSummary]);

  const activeDays = MEETING_DAYS.filter(
    (day) => (rowsByDay.get(day)?.length ?? 0) > 0,
  );

  return (
    <>
      <Topbar
        title="Teaching Schedule"
        subtitle="Your recurring weekly classes across all assigned course offerings."
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Weekly timetable</p>
              <p className="text-sm text-muted-foreground">
                Includes classes where you are the primary lecturer or co-lecturer.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Term</span>
              <select
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={ALL_TERMS}>All terms</option>
                {terms.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <QueryRefreshStatus
            hasData={hasData}
            isPending={workloadQuery.isPending}
            isFetching={workloadQuery.isFetching}
            isError={workloadQuery.isError}
            label="Teaching schedule"
          />

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Loading your teaching schedule…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : !filteredSummary || filteredSummary.scheduleRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <CalendarDays className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">No scheduled classes yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                When meeting times are added to your assigned offerings, they will appear here.
              </p>
            </div>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                  icon={<Clock3 className="h-4 w-4" />}
                  label="Scheduled weekly hours"
                  value={`${formatHours(filteredSummary.scheduledWeeklyHours)} h`}
                />
                <SummaryCard
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="Teaching days"
                  value={String(activeDays.length)}
                />
                <SummaryCard
                  icon={<UsersRound className="h-4 w-4" />}
                  label="Weekly meetings"
                  value={String(filteredSummary.scheduleRows.length)}
                />
                <SummaryCard
                  icon={<Clock3 className="h-4 w-4" />}
                  label="Peak planned week"
                  value={`${formatHours(filteredSummary.peakWeeklyHours)} h`}
                />
              </section>

              <section className="space-y-4">
                {activeDays.map((day) => {
                  const dayRows = rowsByDay.get(day) ?? [];
                  return (
                    <div
                      key={day}
                      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                    >
                      <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="font-semibold text-foreground">{day}</h2>
                          <span className="text-xs text-muted-foreground">
                            {dayRows.length} {dayRows.length === 1 ? "class" : "classes"}
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-border">
                        {dayRows.map((row) => (
                          <div
                            key={row.meetingId}
                            className="grid gap-3 px-4 py-4 md:grid-cols-[120px_minmax(0,1fr)_180px_120px] md:items-center"
                          >
                            <div>
                              <p className="font-semibold text-foreground">
                                {row.startTime}–{row.endTime}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatHours(row.durationHours)} h
                              </p>
                            </div>

                            <div className="min-w-0">
                              <Link
                                href={`/courses/${row.course.id}/spec`}
                                className="font-medium text-foreground hover:underline"
                              >
                                {row.course.code} — {row.course.title}
                              </Link>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>Class {row.sectionCode}</span>
                                <span>{row.term}</span>
                                <span>{row.activityType}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4 shrink-0" />
                              <span>{row.room || "Room not set"}</span>
                            </div>

                            <div className="md:text-right">
                              <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">
                                {row.role}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>

              {filteredSummary.coLecturerAssumption === "full" ? (
                <p className="text-xs text-muted-foreground">
                  Co-lecturer schedule entries are shown in full until workload-sharing rules are configured.
                </p>
              ) : null}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
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