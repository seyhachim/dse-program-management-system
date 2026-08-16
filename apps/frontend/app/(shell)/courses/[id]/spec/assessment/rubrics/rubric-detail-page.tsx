"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { rubricScaleSummary, rubricTotalPoints, type Rubric } from "@dse-pms/shared-types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  StatusBadge,
} from "@dse-pms/ui";
import { Topbar } from "../../../../../topbar";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { coursesApi, type CourseView } from "@/lib/courses";
import {
  canEditRubric,
  rubricLockLabel,
  rubricsApi,
  rubricStatusTone,
  typeChipClass,
} from "@/lib/rubrics";
import { RubricMatrix } from "./rubric-matrix";

export function RubricDetailPage({
  courseId,
  rubricId,
}: {
  courseId: string;
  rubricId: string;
}) {
  const [course, setCourse] = useState<CourseView | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { me } = useMe();

  const libraryHref = `/courses/${courseId}/spec/assessment/rubrics`;
  const assessmentHref = `/courses/${courseId}/spec?tab=assessmentPlan`;
  const editable = rubric ? canEditRubric(me, rubric) : false;
  const lockLabel = rubric ? rubricLockLabel(rubric) : null;

  useEffect(() => {
    coursesApi.get(courseId).then(setCourse).catch(() => setCourse(null));
  }, [courseId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    rubricsApi
      .get(rubricId)
      .then((value) => {
        if (active) setRubric(value);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load rubric");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [rubricId]);

  const breadcrumbLabel = course ? `${course.code} – ${course.title}` : "Course Specification";

  return (
    <>
      <Topbar
        title={rubric?.name ?? "Rubric"}
        subtitle="Read-only rubric view for students, QA reviewers and other stakeholders."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/courses">Course Management</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={assessmentHref}>Assessment</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={libraryHref}>Rubric Bank</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{rubric?.name ?? "Rubric"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" render={<Link href={libraryHref}><ArrowLeft className="h-4 w-4" />Back to Rubric Bank</Link>} />
            {editable && rubric ? (
              <Button render={<Link href={`${libraryHref}/${rubric.id}/edit`}><Pencil className="h-4 w-4" />Edit Rubric</Link>} />
            ) : null}
          </div>

          {loading ? (
            <div className="rounded-xl border border-border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
              Loading rubric…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-status-live/40 bg-status-live/10 px-4 py-3 text-sm text-status-live">
              {error}
            </div>
          ) : rubric ? (
            <>
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold text-foreground">{rubric.name}</h1>
                      <StatusBadge tone={rubricStatusTone(rubric.status)} label={rubric.status} />
                    </div>
                    {rubric.description ? (
                      <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                        {rubric.description}
                      </p>
                    ) : null}
                    {lockLabel ? (
                      <p className="mt-2 text-xs font-medium text-muted-foreground">
                        {lockLabel}. Create a new rubric for revised scoring content.
                      </p>
                    ) : null}
                  </div>
                  <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${typeChipClass(rubric.type)}`}>
                    {rubric.type}
                  </span>
                </div>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Meta label="Rating scale" value={rubricScaleSummary(rubric.levels)} />
                  <Meta label="Criteria" value={String(rubric.criteria.length)} />
                  <Meta label="Maximum score" value={String(rubricTotalPoints(rubric))} />
                  <Meta label="Last updated" value={formatDate(rubric.updatedAt)} />
                </dl>
              </section>

              <RubricMatrix rubric={rubric} />
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/35 px-3 py-2.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
