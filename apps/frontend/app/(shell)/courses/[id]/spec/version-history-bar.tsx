"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CreateCourseSpecPeriodicReviewSchema } from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dse-pms/ui";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { useMe } from "@/lib/auth";
import { courseSpecGovernanceActionDecision } from "@/lib/course-spec-governance-actions";
import { courseSpecHistoryApi, comparisonHref, exactVersionHref } from "@/lib/course-spec-history";
import { courseSpecPeriodicReviewApi } from "@/lib/course-spec-periodic-review";
import {
  COURSE_SPEC_QUERY_GC_MS,
  COURSE_SPEC_STALE_MS,
  courseSpecHistoryQueryKey,
} from "@/lib/course-spec-query";

function todayLocalIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function VersionHistoryBar({ courseId }: { courseId: string }) {
  const { me } = useMe();
  const userId = me?.id ?? "pending";
  const historyQuery = useQuery({
    queryKey: courseSpecHistoryQueryKey(userId, courseId),
    queryFn: () => courseSpecHistoryApi.list(courseId),
    enabled: Boolean(me?.id),
    staleTime: COURSE_SPEC_STALE_MS.history,
    gcTime: COURSE_SPEC_QUERY_GC_MS,
  });
  const history = historyQuery.data ?? null;
  const [error, setError] = useState<string | null>(null);
  const [reaffirmOpen, setReaffirmOpen] = useState(false);
  const [reviewedAt, setReviewedAt] = useState(todayLocalIsoDate);
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [reaffirming, setReaffirming] = useState(false);

  const current = history?.versions.find((version) => version.isCurrent) ?? null;
  const previous = useMemo(() => {
    if (!history || !current) return null;
    const index = history.versions.findIndex((version) => version.id === current.id);
    return index >= 0 ? history.versions[index + 1] ?? null : null;
  }, [history, current]);
  const actionDecision = courseSpecGovernanceActionDecision(me?.roles, current);

  const reaffirm = async () => {
    if (!current || !actionDecision.canReaffirm) return;
    setError(null);
    const parsed = CreateCourseSpecPeriodicReviewSchema.safeParse({
      courseSpecId: current.id,
      reviewedAt,
      evidenceSummary,
      decisionReason,
      outcome: "Reaffirmed",
      changeSummary: "",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete the periodic review record.");
      return;
    }

    setReaffirming(true);
    try {
      await courseSpecPeriodicReviewApi.create(courseId, parsed.data);
      setReaffirmOpen(false);
      setEvidenceSummary("");
      setDecisionReason("");
      setReviewedAt(todayLocalIsoDate());
      await historyQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reaffirm this Course Specification.");
    } finally {
      setReaffirming(false);
    }
  };

  if (!history || history.versions.length === 0) {
    const loadError = historyQuery.isError
      ? historyQuery.error instanceof Error
        ? historyQuery.error.message
        : "Could not load version history."
      : null;
    return loadError ? (
      <div className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
        {loadError}
      </div>
    ) : null;
  }

  return (
    <>
      <QueryRefreshStatus
        hasData
        isPending={historyQuery.isPending}
        isFetching={historyQuery.isFetching}
        isError={historyQuery.isError}
        label="Course Specification history"
      />
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
              <Button key={version.id} variant={version.isCurrent ? "default" : "outline"} size="sm" nativeButton={false} render={<Link href={version.isCurrent ? `/courses/${courseId}/spec` : exactVersionHref(courseId, version.id)} />}>
                v{version.academicVersion} · {version.reviewStatus} · submission {version.submissionVersion}
              </Button>
            ))}
            {current && previous ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={comparisonHref(courseId, previous.id, current.id)} />}>
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

        {actionDecision.canCreateRevision || actionDecision.canReaffirm ? (
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Programme governance actions</p>
            <div className="flex flex-wrap gap-2">
              {actionDecision.canCreateRevision ? (
                <>
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/courses/${courseId}/spec/revision`} />}>
                    Create minor revision
                  </Button>
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/courses/${courseId}/spec/revision`} />}>
                    Create major revision
                  </Button>
                </>
              ) : null}
              {actionDecision.canReaffirm ? (
                <Button variant="outline" size="sm" onClick={() => setReaffirmOpen(true)}>
                  Reaffirm after review
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Minor/Major opens the existing impact-assessment workflow. Reaffirm records an append-only periodic review and does not create a new academic version.
            </p>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </section>

      <Dialog open={reaffirmOpen} onOpenChange={setReaffirmOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reaffirm Course Specification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirm that the current approved academic version remains suitable after periodic review. This creates an immutable governance record and schedules the next review without cloning or editing the approved version.
            </p>
            <label className="block space-y-1 text-sm font-medium">
              <span>Review date</span>
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 font-normal"
                value={reviewedAt}
                onChange={(event) => setReviewedAt(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Evidence summary</span>
              <textarea
                className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-normal"
                value={evidenceSummary}
                onChange={(event) => setEvidenceSummary(event.target.value)}
                placeholder="Summarize stakeholder feedback, monitoring evidence, QA findings, or other review evidence."
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Decision reason</span>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-normal"
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                placeholder="Explain why the approved version is being reaffirmed."
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReaffirmOpen(false)} disabled={reaffirming}>
              Cancel
            </Button>
            <Button onClick={reaffirm} disabled={reaffirming}>
              {reaffirming ? "Reaffirming…" : "Confirm reaffirmation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
