"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, ClipboardCheck } from "lucide-react";
import {
  specAttention,
  specCompletionPercent,
  type CourseSpecProgress,
  type SpecSectionId,
} from "@dse-pms/shared-types";
import { coursesApi } from "@/lib/courses";
import { Topbar } from "../topbar";

const TAB_FOR_SECTION: Partial<Record<SpecSectionId, string>> = {
  clos: "clos",
  assessmentPlan: "assessmentPlan",
  slt: "slt",
  mapping: "mapping",
  resources: "resources",
  responsibility: "responsibility",
  policy: "policy",
};

function sectionHref(courseId: string, sectionId: SpecSectionId): string {
  const tab = TAB_FOR_SECTION[sectionId];
  return tab
    ? `/courses/${courseId}/spec?tab=${encodeURIComponent(tab)}`
    : `/courses/${courseId}/spec`;
}

export function MyTasksClient() {
  const [progress, setProgress] = useState<CourseSpecProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    coursesApi
      .specProgress()
      .then((rows) => {
        if (!cancelled) setProgress(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your tasks");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const openTasks = progress.reduce(
      (sum, course) => sum + course.incompleteSections.length,
      0,
    );
    const coursesNeedingAttention = progress.filter(
      (course) => specAttention(course).level !== "upToDate",
    ).length;
    const completeCourses = progress.length - coursesNeedingAttention;
    return { openTasks, coursesNeedingAttention, completeCourses };
  }, [progress]);

  return (
    <>
      <Topbar
        title="My Tasks"
        subtitle="What needs your attention across the courses you teach."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Open tasks"
              value={summary.openTasks}
              hint="Incomplete course-spec sections"
              icon={<ClipboardCheck className="h-5 w-5" />}
            />
            <SummaryCard
              label="Courses needing attention"
              value={summary.coursesNeedingAttention}
              hint="Courses with work remaining"
              icon={<CircleAlert className="h-5 w-5" />}
            />
            <SummaryCard
              label="Up to date"
              value={summary.completeCourses}
              hint="Courses with all tracked sections complete"
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
          </section>

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Loading your tasks…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-card p-6 text-sm text-destructive">
              {error}
            </div>
          ) : progress.length === 0 ? (
            <EmptyState
              title="No assigned courses"
              description="Tasks will appear here when you are assigned to a course offering."
            />
          ) : summary.openTasks === 0 ? (
            <EmptyState
              title="You’re up to date"
              description="All tracked course-specification sections for your assigned courses are complete."
            />
          ) : (
            <section className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Needs attention</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open a task to continue directly in that course specification.
                </p>
              </div>

              {progress
                .filter((course) => course.incompleteSections.length > 0)
                .map((course) => {
                  const percent = specCompletionPercent(course);
                  const attention = specAttention(course);
                  return (
                    <article
                      key={course.courseId}
                      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                    >
                      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-foreground">
                              {course.code} — {course.title}
                            </h3>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              {course.incompleteSections.length} remaining
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {course.completed} of {course.total} sections complete · {percent}%
                          </p>
                        </div>
                        <Link
                          href={`/courses/${course.courseId}/spec`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          Open course <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>

                      <div className="divide-y divide-border">
                        {attention.items.map((section) => (
                          <Link
                            key={section.id}
                            href={sectionHref(course.courseId, section.id)}
                            className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/50"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <CircleAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {section.title}
                                </p>
                                <p className="text-xs text-muted-foreground">Incomplete</p>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </Link>
                        ))}
                      </div>
                    </article>
                  );
                })}
            </section>
          )}
        </div>
      </main>
    </>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">{icon}</div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <CheckCircle2 className="mx-auto h-9 w-9 text-muted-foreground" />
      <h2 className="mt-3 font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
