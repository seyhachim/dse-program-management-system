"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  GraduationCap,
  RefreshCw,
  Scale,
  UsersRound,
} from "lucide-react";
import type {
  CourseDeliveryOffering,
  CourseDeliveryResultReview,
  CourseDeliveryStudentResultReview,
  PortalCloAchievement,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { courseDeliveryApi } from "@/lib/course-delivery";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { Topbar } from "../topbar";
import { FinalizedResultCorrections } from "./finalized-result-corrections";

export function ResultsReviewClient() {
  const { me, loading: meLoading } = useMe();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const queryScope = { userId: me?.id ?? "pending" };
  const offeringsKey = protectedQueryKey(queryScope, "course-delivery", "offerings");
  const offeringsQuery = useQuery({
    queryKey: offeringsKey,
    queryFn: () => courseDeliveryApi.offerings(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.review,
  });
  const offerings: CourseDeliveryOffering[] = offeringsQuery.data ?? [];

  useEffect(() => {
    setSelectedId((current) =>
      offerings.some((item) => item.offeringId === current)
        ? current
        : (offerings[0]?.offeringId ?? ""),
    );
  }, [offerings]);

  const reviewKey = protectedQueryKey(queryScope, "course-delivery", "result-review", selectedId || "none");
  const reviewQuery = useQuery({
    queryKey: reviewKey,
    queryFn: () => courseDeliveryApi.resultReview(selectedId),
    enabled: Boolean(me?.id && selectedId),
    staleTime: QUERY_STALE_MS.review,
  });
  const review: CourseDeliveryResultReview | null = reviewQuery.data ?? null;
  const selected = offerings.find((item) => item.offeringId === selectedId) ?? null;
  const hasOfferings = offeringsQuery.data !== undefined;
  const hasReview = !selectedId || reviewQuery.data !== undefined;
  const loadingOfferings = meLoading || (!hasOfferings && offeringsQuery.isPending);
  const loadingReview = Boolean(selectedId) && !hasReview && reviewQuery.isPending;
  const queryError = offeringsQuery.error ?? reviewQuery.error;
  const hardQueryError = (!hasOfferings && offeringsQuery.isError) || (!hasReview && reviewQuery.isError);
  const error = hardQueryError
    ? queryError instanceof ApiError
      ? queryError.message
      : "Could not load result review"
    : null;

  const refreshReviewAfterCorrection = async () => {
    if (!selectedId) return;
    await queryClient.invalidateQueries({ queryKey: reviewKey, exact: true });
  };

  const configuredWeight = review?.rows[0]?.configuredGradeWeight ?? 0;
  const completeCount = review?.rows.filter((row) => row.courseGradeComplete).length ?? 0;
  const incompleteCount = (review?.rows.length ?? 0) - completeCount;
  const evidenceGapCount = review?.rows.reduce(
    (total, row) => total + row.achievements.filter((item) => item.evidenceCount === 0).length,
    0,
  ) ?? 0;
  const averageGrade = useMemo(() => {
    const grades = review?.rows.flatMap((row) =>
      row.totalCourseGrade === null ? [] : [row.totalCourseGrade],
    ) ?? [];
    return grades.length
      ? Math.round((grades.reduce((sum, value) => sum + value, 0) / grades.length) * 100) / 100
      : null;
  }, [review]);

  return (
    <>
      <Topbar
        title="Assessments / Results"
        subtitle="Review draft and published marks, weighted course grades, CLO evidence, and controlled corrections."
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Lecturer Results Review</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  This review includes your private draft marks so you can verify course-grade completion and CLO evidence before students see results.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="text-sm font-medium">
                  Course section
                  <select
                    className="mt-1 block h-10 min-w-72 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    disabled={loadingOfferings || !offerings.length}
                  >
                    {offerings.map((offering) => (
                      <option key={offering.offeringId} value={offering.offeringId}>
                        {offering.code} · Section {offering.sectionCode} · {offering.term}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void reviewQuery.refetch()}
                  disabled={!selectedId || reviewQuery.isFetching}
                >
                  <RefreshCw />{reviewQuery.isFetching ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
            </div>
          </section>

          <QueryRefreshStatus
            hasData={hasOfferings && hasReview}
            isPending={!hasOfferings || !hasReview}
            isFetching={offeringsQuery.isFetching || reviewQuery.isFetching}
            isError={offeringsQuery.isError || reviewQuery.isError}
            label="Results review"
          />
          {error ? <ErrorBanner message={error} /> : null}
          {loadingOfferings ? <LoadingCard message="Loading assigned course sections…" /> : null}
          {!loadingOfferings && !offerings.length ? (
            <EmptyCard message="No assigned course sections are available for result review." />
          ) : null}
          {selected && selected.specificationStatus !== "Approved" ? (
            <WarningBanner>
              This section does not currently have an approved course specification. Grade and CLO review requires an approved specification.
            </WarningBanner>
          ) : null}
          {loadingReview ? <LoadingCard message="Calculating weighted grades and CLO evidence…" /> : null}

          {!loadingReview && review ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Metric icon={UsersRound} label="Students" value={String(review.rows.length)} />
                <Metric icon={Scale} label="Configured grade weight" value={`${configuredWeight}%`} />
                <Metric icon={CheckCircle2} label="Complete grade rows" value={`${completeCount}/${review.rows.length}`} />
                <Metric icon={GraduationCap} label="Average complete grade" value={averageGrade === null ? "—" : `${averageGrade}%`} />
                <Metric icon={FileSearch} label="CLO evidence gaps" value={String(evidenceGapCount)} />
              </section>

              {configuredWeight !== 100 ? (
                <WarningBanner>
                  Course-grade weights total {configuredWeight}%, not 100%. Final weighted totals stay incomplete until the approved assessment design totals 100%.
                </WarningBanner>
              ) : null}
              {incompleteCount > 0 ? (
                <WarningBanner>
                  {incompleteCount} student{incompleteCount === 1 ? " has" : "s have"} incomplete course-grade coverage. Missing marks are not treated as zero.
                </WarningBanner>
              ) : null}
              {evidenceGapCount > 0 ? (
                <WarningBanner>
                  {evidenceGapCount} CLO/student combination{evidenceGapCount === 1 ? " has" : "s have"} no explicit assessment evidence yet. Grade weight is never reused as CLO evidence.
                </WarningBanner>
              ) : null}

              <section className="rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{review.courseCode} · Section {review.sectionCode}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{review.courseTitle}</p>
                    </div>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      CourseSpec {review.courseSpecId.slice(0, 8)}…
                    </span>
                  </div>
                </div>
                {!review.rows.length ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No enrolled students in this section.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Student</th>
                          <th className="px-4 py-3">Completed weight</th>
                          <th className="px-4 py-3">Weighted total</th>
                          <th className="px-4 py-3">CLO attainment</th>
                          <th className="px-4 py-3">Evidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {review.rows.map((row) => <ReviewRow key={row.enrollmentId} row={row} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {selectedId ? (
                <FinalizedResultCorrections
                  offeringId={selectedId}
                  onCorrectionApplied={refreshReviewAfterCorrection}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

function ReviewRow({ row }: { row: CourseDeliveryStudentResultReview }) {
  const missingWeight = Math.max(row.configuredGradeWeight - row.completedGradeWeight, 0);
  const evidenceTotal = row.achievements.reduce((sum, item) => sum + item.evidenceCount, 0);
  const evidenceGaps = row.achievements.filter((item) => item.evidenceCount === 0).length;
  return (
    <tr className="align-top">
      <td className="px-4 py-4">
        <p className="font-semibold">{row.studentName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{row.studentCode}</p>
        {!row.courseGradeComplete ? (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {row.configuredGradeWeight !== 100
              ? `Configured weight is ${row.configuredGradeWeight}%`
              : `${missingWeight}% grade weight still missing`}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-4">
        <div className="min-w-36">
          <div className="mb-1 flex justify-between text-xs">
            <span>{row.completedGradeWeight}%</span>
            <span className="text-muted-foreground">of {row.configuredGradeWeight}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(row.configuredGradeWeight ? (row.completedGradeWeight / row.configuredGradeWeight) * 100 : 0, 100)}%` }}
            />
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        {row.totalCourseGrade === null ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">Incomplete</span>
        ) : (
          <span className="text-lg font-bold">{row.totalCourseGrade}%</span>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex min-w-56 flex-wrap gap-1.5">
          {row.achievements.map((achievement) => (
            <CloBadge key={achievement.code} achievement={achievement} />
          ))}
          {!row.achievements.length ? <span className="text-xs text-muted-foreground">No active CLOs</span> : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Overall: {row.overallAchievement === null ? "Not enough evidence" : `${row.overallAchievement}%`}
        </p>
      </td>
      <td className="px-4 py-4">
        <details className="min-w-72">
          <summary className="cursor-pointer font-medium">
            {evidenceTotal} evidence trace{evidenceTotal === 1 ? "" : "s"}
            {evidenceGaps ? ` · ${evidenceGaps} gap${evidenceGaps === 1 ? "" : "s"}` : ""}
          </summary>
          <div className="mt-3 space-y-3">
            {row.achievements.map((achievement) => (
              <CloEvidence key={achievement.code} achievement={achievement} />
            ))}
          </div>
        </details>
      </td>
    </tr>
  );
}

function CloBadge({ achievement }: { achievement: PortalCloAchievement }) {
  const className = achievement.status === "achieved"
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : achievement.status === "developing"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
      : achievement.status === "needs-attention"
        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`} title={achievement.description}>
      {achievement.code} · {achievement.percentage === null ? "No evidence" : `${achievement.percentage}%`}
    </span>
  );
}

function CloEvidence({ achievement }: { achievement: PortalCloAchievement }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{achievement.code}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{achievement.description}</p>
        </div>
        <span className="text-xs font-semibold">
          {achievement.percentage === null ? "No evidence" : `${achievement.percentage}%`}
        </span>
      </div>
      {achievement.evidence.length ? (
        <ul className="mt-2 space-y-1 text-xs">
          {achievement.evidence.map((evidence) => (
            <li key={evidence.assessmentItemId} className="flex justify-between gap-3 rounded bg-muted/40 px-2 py-1.5">
              <span>{evidence.assessmentName}</span>
              <span className="font-semibold">{evidence.rawPercentage}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          No explicit assessment evidence mapped to this CLO for this student yet.
        </p>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof ClipboardCheck; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function LoadingCard({ message }: { message: string }) {
  return <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">{message}</div>;
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <ClipboardCheck className="mx-auto h-9 w-9 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}