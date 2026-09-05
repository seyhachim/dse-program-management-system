"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import {
  STUDENT_PORTAL_TIME_ZONE,
  portalAssessmentDeadlineState,
  type PortalAssessmentDeadlineState,
  type PortalAssessmentOverview,
} from "@dse-pms/shared-types";
import { assessmentDeadline, studentPortalApi } from "@/lib/student-portal";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "../mobile-student-portal-layout";
import {
  EmptyState,
  PortalError,
  PortalLoading,
  usePortalData,
} from "../portal-state";

const labels: Record<PortalAssessmentDeadlineState, string> = {
  overdue: "Overdue",
  upcoming: "Upcoming",
  "week-only": "Week scheduled",
  unscheduled: "Deadline pending",
};

export function PortalAssessments() {
  const load = useCallback(() => studentPortalApi.assessments(), []);
  const { data, loading, error } = usePortalData(load);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load assessments"} />;
  }
  if (!data.length) {
    return (
      <EmptyState
        title="No published assessments"
        description="Approved assessment plans from your enrolled courses will appear here."
      />
    );
  }

  const now = new Date();
  const groups: PortalAssessmentDeadlineState[] = [
    "overdue",
    "upcoming",
    "week-only",
    "unscheduled",
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Exact dates and times are shown in{" "}
        <strong className="text-foreground">
          Asia/Phnom_Penh (Cambodia time)
        </strong>
        . Week-only deadlines are shown separately until an exact date is
        published.
      </div>
      {groups.map((state) => {
        const items = data.filter(
          (item) => portalAssessmentDeadlineState(item, now) === state,
        );
        if (!items.length) return null;
        return <AssessmentGroup key={state} state={state} items={items} />;
      })}
      <p className="text-xs text-muted-foreground">
        Timezone: {STUDENT_PORTAL_TIME_ZONE}
      </p>
    </div>
  );
}

function AssessmentGroup({
  state,
  items,
}: {
  state: PortalAssessmentDeadlineState;
  items: PortalAssessmentOverview[];
}) {
  const Icon =
    state === "overdue"
      ? AlertTriangle
      : state === "upcoming"
        ? CalendarClock
        : state === "week-only"
          ? ClipboardList
          : CheckCircle2;

  return (
    <section aria-labelledby={`assessment-${state}`} className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <h2 id={`assessment-${state}`} className="text-lg font-semibold">
          {labels[state]}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="grid gap-3">
        {items.map((item) => (
          <AssessmentCard
            key={`${item.offeringId}:${item.assessmentId}`}
            item={item}
            state={state}
          />
        ))}
      </div>
    </section>
  );
}

function AssessmentCard({
  item,
  state,
}: {
  item: PortalAssessmentOverview;
  state: PortalAssessmentDeadlineState;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-primary/10 px-2 py-1 font-semibold text-primary">
              {item.courseCode}
            </span>
            <span className="rounded bg-muted px-2 py-1">
              Section {item.sectionCode}
            </span>
            <span className="rounded bg-muted px-2 py-1">{item.type}</span>
          </div>
          <h3 className="mt-2 break-words text-base font-semibold">
            {item.name}
          </h3>
          <p className="break-words text-sm text-muted-foreground">
            {item.courseTitle}
          </p>
        </div>
        <div className="min-w-0 sm:text-right">
          <p
            className={
              state === "overdue"
                ? "break-words text-sm font-semibold text-destructive"
                : "break-words text-sm font-semibold"
            }
          >
            {assessmentDeadline(item.dueAt, item.dueWeek)}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {item.weight === null
              ? "Weight TBA"
              : `${item.weight}% of course grade`}
          </p>
        </div>
      </div>

      {item.description ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {item.description}
        </p>
      ) : null}
      {item.instructions ? (
        <div className="mt-3 rounded-xl bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Instructions
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">
            {item.instructions}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1">
        {item.cloCodes.map((code) => (
          <span key={code} className="rounded bg-muted px-2 py-1 text-xs">
            {code}
          </span>
        ))}
      </div>

      {item.rubricName ? (
        <details className="mt-4 min-w-0 rounded-xl border border-border p-3">
          <summary className="cursor-pointer break-words text-sm font-semibold">
            Rubric · {item.rubricName}
          </summary>
          <div className="mt-3 space-y-2">
            {item.rubricCriteria.length ? (
              item.rubricCriteria.map((criterion) => (
                <div
                  key={criterion.id}
                  className="min-w-0 rounded-lg bg-muted/40 p-3"
                >
                  <p className="break-words text-sm font-medium">
                    {criterion.name}
                  </p>
                  {criterion.cloCodes.length ? (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {criterion.cloCodes.join(", ")}
                    </p>
                  ) : null}
                  {criterion.levels.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {criterion.levels.map((level) => (
                        <span
                          key={level.id}
                          className="max-w-full break-words rounded bg-background px-2 py-1 text-xs"
                        >
                          {level.label} · {level.points} pts
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Rubric criteria are not available yet.
              </p>
            )}
          </div>
        </details>
      ) : null}

      <div className="mt-4">
        <Link
          href={`/portal/courses/${item.offeringId}`}
          className={`${MOBILE_STUDENT_PORTAL_LAYOUT.touchAction} text-primary hover:bg-accent sm:px-3`}
        >
          View course details
        </Link>
      </div>
    </article>
  );
}
