"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CourseSpecVersionComparisonView } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { courseSpecHistoryApi, exactVersionHref } from "@/lib/course-spec-history";

export function CompareClient({ courseId }: { courseId: string }) {
  const search = useSearchParams();
  const from = search.get("from");
  const to = search.get("to");
  const [comparison, setComparison] = useState<CourseSpecVersionComparisonView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to) {
      setError("Both from and to versions are required.");
      return;
    }
    courseSpecHistoryApi.compare(courseId, from, to).then(setComparison).catch(() => setError("Could not compare these course specification versions."));
  }, [courseId, from, to]);

  if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>;
  if (!comparison) return <p className="text-sm text-muted-foreground">Comparing versions…</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">v{comparison.fromVersion.academicVersion} → v{comparison.toVersion.academicVersion}</h1>
            <p className="text-sm text-muted-foreground">{comparison.changedSectionCount} changed section{comparison.changedSectionCount === 1 ? "" : "s"}. Comparison is deterministic and read-only.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href={exactVersionHref(courseId, comparison.fromVersion.id)} />}>View v{comparison.fromVersion.academicVersion}</Button>
            <Button variant="outline" render={<Link href={exactVersionHref(courseId, comparison.toVersion.id)} />}>View v{comparison.toVersion.academicVersion}</Button>
          </div>
        </div>
      </section>
      <div className="space-y-3">
        {comparison.sections.map((section, index) => (
          <section key={`${section.sectionId}-${section.label}-${index}`} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">{section.label}</h2>
              <span className={section.changed ? "text-sm font-medium text-amber-700 dark:text-amber-300" : "text-sm text-muted-foreground"}>{section.changed ? "Changed" : "No change"}</span>
            </div>
            {section.changedPaths.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {section.changedPaths.slice(0, 20).map((path) => <li key={path}>{path}</li>)}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
