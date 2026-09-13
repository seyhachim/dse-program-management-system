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
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold">Weekly Notes</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No class notes have been recorded yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold">Weekly Notes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          What actually happened in class, based on the class delivery record.
        </p>
      </div>

      <div className="space-y-3">
        {data.entries.map((entry, index) => {
          const current = entry.week !== null && entry.week === data.currentWeek;
          return (
            <article
              key={`${entry.date}-${index}`}
              className={`rounded-xl border p-4 ${
                current ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {entry.week === null ? "Week unavailable" : `Week ${entry.week}`}
                </span>
                {current ? (
                  <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                    Current week
                  </span>
                ) : null}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(entry.date)}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Topic
                  </p>
                  <p className="mt-1 break-words font-medium">
                    {entry.topic || "No topic recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Class held
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                    {entry.classHeld ? (
                      <CheckCircle2 className="h-4 w-4 text-status-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                    {entry.classHeld ? "Yes" : "No"}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What we learned
                </p>
                <p className="mt-1 break-words text-sm">
                  {entry.learningSummary || "No learning summary recorded."}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                <UserRound className="h-4 w-4" />
                <span>Lecturer:</span>
                <span className="font-medium text-foreground">
                  {entry.lecturerName ?? "Not recorded"}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
