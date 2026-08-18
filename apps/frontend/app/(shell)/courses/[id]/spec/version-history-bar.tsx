"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CourseSpecVersionHistoryView } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { courseSpecHistoryApi, comparisonHref, exactVersionHref } from "@/lib/course-spec-history";

export function VersionHistoryBar({ courseId }: { courseId: string }) {
  const [history, setHistory] = useState<CourseSpecVersionHistoryView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    courseSpecHistoryApi.list(courseId).then(setHistory).catch(() => setError("Could not load version history."));
  }, [courseId]);

  const current = history?.versions.find((version) => version.isCurrent) ?? null;
  const previous = useMemo(() => {
    if (!history || !current) return null;
    const index = history.versions.findIndex((version) => version.id === current.id);
    return index >= 0 ? history.versions[index + 1] ?? null : null;
  }, [history, current]);

  if (error) return <div className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">{error}</div>;
  if (!history || history.versions.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm" aria-label="Course specification version history">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold">Academic version history</p>
          <p className="text-xs text-muted-foreground">
            Academic version and submission attempt are tracked separately. Historical versions are read-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {history.versions.map((version) => (
            <Button key={version.id} variant={version.isCurrent ? "default" : "outline"} size="sm" render={<Link href={version.isCurrent ? `/courses/${courseId}/spec` : exactVersionHref(courseId, version.id)} />}>
              v{version.academicVersion} · {version.reviewStatus} · submission {version.submissionVersion}
            </Button>
          ))}
          {current && previous ? (
            <Button variant="outline" size="sm" render={<Link href={comparisonHref(courseId, previous.id, current.id)} />}>
              Compare v{previous.academicVersion} → v{current.academicVersion}
            </Button>
          ) : null}
        </div>
      </div>
      {current ? (
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <span>Effective: {current.effectiveFrom ?? "—"}</span>
          <span>Review due: {current.effectiveNextReviewDueAt ?? "—"}</span>
          <span>{current.editable ? "Editable active revision" : "Read-only review state"}</span>
        </div>
      ) : null}
    </section>
  );
}
