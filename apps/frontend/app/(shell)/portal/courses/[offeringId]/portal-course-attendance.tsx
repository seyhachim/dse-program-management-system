"use client";

import { useCallback } from "react";
import type { AttendanceStatus } from "@dse-pms/shared-types";
import { studentPortalApi } from "@/lib/student-portal";
import { PortalError, PortalLoading, usePortalData } from "../../portal-state";

const STATUS_ORDER: AttendanceStatus[] = ["Present", "Late", "Absent", "Excused"];

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

  return (
    <div className="space-y-3" data-testid="student-own-attendance">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your attendance
            </p>
            <p className="mt-1 text-3xl font-bold">
              {data.attendanceRate === null ? "—" : `${data.attendanceRate}%`}
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            {data.markedSessions} marked of {data.totalSessions} sessions
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {STATUS_ORDER.map((status) => (
            <AttendanceCount key={status} label={status} value={data.counts[status]} />
          ))}
          <AttendanceCount label="Pending" value={data.counts.PermissionPending} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Attendance history</h3>
        {data.history.length ? (
          <div className="mt-2 divide-y divide-border">
            {data.history.map((row) => (
              <div
                key={`${row.date}-${row.updatedAt}`}
                className="flex min-w-0 items-center justify-between gap-3 py-2.5"
              >
                <time className="min-w-0 text-sm font-medium" dateTime={row.date}>
                  {new Intl.DateTimeFormat(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${row.date}T00:00:00.000Z`))}
                </time>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  {row.permissionPending ? "Permission pending" : row.status ?? "Not marked"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No attendance sessions have been recorded for this course yet.
          </p>
        )}
      </section>

      <p className="px-1 text-xs text-muted-foreground">
        Attendance is read-only and shows only your record for this course.
      </p>
    </div>
  );
}

function AttendanceCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2.5 py-2">
      <p className="text-base font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
