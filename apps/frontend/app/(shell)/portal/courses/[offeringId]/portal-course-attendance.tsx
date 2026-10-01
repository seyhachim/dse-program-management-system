"use client";

import { useCallback } from "react";
import type { AttendanceStatus } from "@dse-pms/shared-types";
import {
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Hourglass,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { studentPortalApi } from "@/lib/student-portal";
import { PortalError, PortalLoading, usePortalData } from "../../portal-state";

const STATUS_ORDER: AttendanceStatus[] = ["Present", "Late", "Absent", "Excused"];

type AttendanceDisplayStatus = AttendanceStatus | "Pending" | "Not marked";

const STATUS_META: Record<
  AttendanceDisplayStatus,
  {
    label: string;
    Icon: LucideIcon;
    countClassName: string;
    iconClassName: string;
    pillClassName: string;
  }
> = {
  Present: {
    label: "Present",
    Icon: CheckCircle2,
    countClassName: "border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/25",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    pillClassName: "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-950/35 dark:text-emerald-300 dark:ring-emerald-900/70",
  },
  Late: {
    label: "Late",
    Icon: Clock3,
    countClassName: "border-amber-200/70 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/25",
    iconClassName: "text-amber-600 dark:text-amber-400",
    pillClassName: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-950/35 dark:text-amber-300 dark:ring-amber-900/70",
  },
  Absent: {
    label: "Absent",
    Icon: XCircle,
    countClassName: "border-rose-200/70 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/25",
    iconClassName: "text-rose-600 dark:text-rose-400",
    pillClassName: "bg-rose-50 text-rose-700 ring-rose-200/80 dark:bg-rose-950/35 dark:text-rose-300 dark:ring-rose-900/70",
  },
  Excused: {
    label: "Excused",
    Icon: ShieldCheck,
    countClassName: "border-sky-200/70 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/25",
    iconClassName: "text-sky-600 dark:text-sky-400",
    pillClassName: "bg-sky-50 text-sky-700 ring-sky-200/80 dark:bg-sky-950/35 dark:text-sky-300 dark:ring-sky-900/70",
  },
  Pending: {
    label: "Pending",
    Icon: Hourglass,
    countClassName: "border-violet-200/70 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-950/25",
    iconClassName: "text-violet-600 dark:text-violet-400",
    pillClassName: "bg-violet-50 text-violet-700 ring-violet-200/80 dark:bg-violet-950/35 dark:text-violet-300 dark:ring-violet-900/70",
  },
  "Not marked": {
    label: "Not marked",
    Icon: CircleHelp,
    countClassName: "border-border bg-muted/35",
    iconClassName: "text-muted-foreground",
    pillClassName: "bg-muted text-muted-foreground ring-border",
  },
};

function formatAttendanceDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function PortalCourseAttendance({ offeringId }: { offeringId: string }) {
  const load = useCallback(
    () => studentPortalApi.courseAttendance(offeringId),
    [offeringId],
  );
  const { data, loading, error } = usePortalData(load);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load attendance"} />;
  }

  const attendedSessions = data.counts.Present + data.counts.Late;
  const rate = data.attendanceRate === null
    ? null
    : Math.max(0, Math.min(100, data.attendanceRate));

  return (
    <div className="space-y-4" data-testid="student-own-attendance">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.6fr]">
          <div className="border-b border-border/70 p-5 lg:border-b-0 lg:border-r">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Your attendance
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-4xl font-bold tracking-tight text-foreground">
                {rate === null ? "—" : `${data.attendanceRate}%`}
              </p>
              <p className="pb-1 text-sm text-muted-foreground">
                {data.markedSessions} marked of {data.totalSessions} sessions
              </p>
            </div>

            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Attendance rate"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={rate ?? undefined}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${rate ?? 0}%` }}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <strong className="font-semibold text-foreground">{attendedSessions}</strong>{" "}
                attended
              </span>
              <span>
                <strong className="font-semibold text-foreground">{data.counts.Absent}</strong>{" "}
                absent
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Session breakdown
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {STATUS_ORDER.map((status) => (
                <AttendanceCount
                  key={status}
                  status={status}
                  value={data.counts[status]}
                />
              ))}
              <AttendanceCount status="Pending" value={data.counts.PermissionPending} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Attendance history</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your recorded status for each class session.
            </p>
          </div>
          <span className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {data.history.length} {data.history.length === 1 ? "session" : "sessions"}
          </span>
        </div>

        {data.history.length ? (
          <div className="divide-y divide-border/70">
            {data.history.map((row) => {
              const status: AttendanceDisplayStatus = row.permissionPending
                ? "Pending"
                : row.status ?? "Not marked";
              return (
                <div
                  key={`${row.date}-${row.updatedAt}`}
                  className="flex min-w-0 items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/55 text-muted-foreground">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <time
                        className="block truncate text-sm font-semibold text-foreground"
                        dateTime={row.date}
                      >
                        {formatAttendanceDate(row.date)}
                      </time>
                      <p className="mt-0.5 text-xs text-muted-foreground">Class session</p>
                    </div>
                  </div>
                  <AttendanceStatusPill status={status} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">No attendance recorded yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your attendance history will appear here after a class register is saved.
            </p>
          </div>
        )}
      </section>

      <p className="px-1 text-xs leading-5 text-muted-foreground">
        Attendance is read-only and shows only your record for this course.
      </p>
    </div>
  );
}

function AttendanceCount({
  status,
  value,
}: {
  status: Exclude<AttendanceDisplayStatus, "Not marked">;
  value: number;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;

  return (
    <div className={`rounded-xl border px-3 py-3 ${meta.countClassName}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xl font-bold leading-none text-foreground">{value}</p>
        <Icon className={`h-4 w-4 shrink-0 ${meta.iconClassName}`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-[11px] font-medium text-muted-foreground">{meta.label}</p>
    </div>
  );
}

function AttendanceStatusPill({ status }: { status: AttendanceDisplayStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.pillClassName}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
