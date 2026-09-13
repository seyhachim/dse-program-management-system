"use client";

import { useCallback } from "react";
import { CalendarDays, CheckCircle2, UserRound, XCircle } from "lucide-react";
import { studentPortalApi } from "@/lib/student-portal";
import { PortalError, PortalLoading, usePortalData } from "../../portal-state";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function PortalCourseWeeklyNotes({ offeringId }: { offeringId: string }) {
  const load = useCallback(
    () => studentPortalApi.weeklyNotes(offeringId),
    [offeringId],
  );
  const { data, loading, error } = usePortalData(load);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load weekly notes"} />;
  }

  if (!data.entries.length) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Weekly Notes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No class notes have been recorded yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Weekly Notes</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          What actually happened in class.
        </p>
      </div>

      <div className="space-y-2.5">
        {data.entries.map((entry, index) => {
          const current = entry.week !== null && entry.week === data.currentWeek;
          return (
            <article
              key={`${entry.date}-${index}`}
              className={`rounded-xl border px-3 py-3 ${
                current ? "border-primary/50 bg-primary/5" : "border-border bg-muted/15"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {entry.week === null ? "Week unavailable" : `Week ${entry.week}`}
                  </span>
                  {current ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                      Current
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(entry.date)}
                  </span>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {entry.classHeld ? (
                    <CheckCircle2 className="h-3 w-3 text-status-success" />
                  ) : (
                    <XCircle className="h-3 w-3 text-muted-foreground" />
                  )}
                  {entry.classHeld ? "Held" : "Not held"}
                </span>
              </div>

              <div className="mt-2 space-y-1.5 text-sm">
                <p className="min-w-0 break-words">
                  <span className="mr-1.5 text-xs font-medium text-muted-foreground">
                    Topic
                  </span>
                  <span className="font-medium">
                    {entry.topic || "No topic recorded"}
                  </span>
                </p>
                <p className="min-w-0 break-words">
                  <span className="mr-1.5 text-xs font-medium text-muted-foreground">
                    Learned
                  </span>
                  {entry.learningSummary || "No learning summary recorded."}
                </p>
              </div>

              <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <UserRound className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  Lecturer · {entry.lecturerName ?? "Not recorded"}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
