"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleAlert,
  GraduationCap,
  LockKeyhole,
  Target,
} from "lucide-react";
import { Progress } from "@dse-pms/ui";
import { studentPortalApi } from "@/lib/student-portal";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "../mobile-student-portal-layout";
import {
  EmptyState,
  PortalError,
  PortalLoading,
  usePortalData,
} from "../portal-state";

export function PortalResults() {
  const load = useCallback(async () => {
    const courses = await studentPortalApi.courses();
    return Promise.all(
      courses.map((course) => studentPortalApi.course(course.offeringId)),
    );
  }, []);
  const { data, loading, error } = usePortalData(load);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load results"} />;
  }
  if (!data.length) {
    return (
      <EmptyState
        title="No results yet"
        description="Published assessment results will appear here."
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 md:space-y-4">
      {data.map((course) => {
        const hiddenProvisionalCount =
          course.provisionalResultAccess?.hiddenProvisionalAssessmentCount ?? 0;
        return (
          <Link
            href={`/portal/courses/${course.offeringId}`}
            key={course.offeringId}
            className="block min-w-0 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 md:p-5"
          >
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0">
                <p className="break-words text-xs font-semibold uppercase tracking-wide text-primary">
                  {course.code} · Section {course.sectionCode}
                </p>
                <h2 className="mt-1 break-words text-lg font-semibold">
                  {course.title}
                </h2>
              </div>
              <div className={MOBILE_STUDENT_PORTAL_LAYOUT.resultMetrics}>
                <div
                  className={MOBILE_STUDENT_PORTAL_LAYOUT.resultMetricCard}
                >
                  <span className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] leading-tight text-muted-foreground sm:text-xs">
                      Local course grade
                    </p>
                    <p className="mt-0.5 text-xl font-bold">
                      {course.totalCourseGrade === null
                        ? "—"
                        : `${course.totalCourseGrade}%`}
                    </p>
                    <p className="break-words text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
                      {course.courseGradeComplete
                        ? "Complete"
                        : `${course.completedGradeWeight}% of ${course.configuredGradeWeight}% visible`}
                    </p>
                  </div>
                </div>
                <div
                  className={MOBILE_STUDENT_PORTAL_LAYOUT.resultMetricCard}
                >
                  <span className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
                    <Target className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] leading-tight text-muted-foreground sm:text-xs">
                      CLO achievement
                    </p>
                    <p className="mt-0.5 text-xl font-bold">
                      {course.overallAchievement === null
                        ? "—"
                        : `${course.overallAchievement}%`}
                    </p>
                    <p className="break-words text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
                      Visible mapped evidence only
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {hiddenProvisionalCount > 0 ? (
              <div className="mt-4 flex min-w-0 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:px-4">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <p className="break-words font-semibold">
                    Final course survey required for provisional results
                  </p>
                  <p className="mt-1 break-words text-sm">
                    {hiddenProvisionalCount} provisional assessment result
                    {hiddenProvisionalCount === 1 ? " is" : "s are"} temporarily
                    hidden. Finalized results remain visible and unchanged.
                  </p>
                  <p className="mt-2 text-xs font-medium">
                    Open course to complete the anonymous survey →
                  </p>
                </div>
              </div>
            ) : null}

            <div
              className={MOBILE_STUDENT_PORTAL_LAYOUT.resultAchievementGrid}
            >
              {course.achievements.map((item) => (
                <div
                  key={item.code}
                  className="min-w-0 rounded-xl bg-muted/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{item.code}</span>
                    {item.percentage === null ? (
                      <CircleAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    )}
                  </div>
                  <p className="mt-2 text-xl font-bold">
                    {item.percentage === null ? "—" : `${item.percentage}%`}
                  </p>
                  <Progress className="mt-2" value={item.percentage ?? 0} />
                  <p className="mt-2 break-words text-xs capitalize text-muted-foreground">
                    {item.status.replaceAll("-", " ")}
                  </p>
                  <p className="mt-1 break-words text-[11px] text-muted-foreground">
                    {item.evidenceCount} visible mapped assessment result
                    {item.evidenceCount === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-4 break-words text-xs text-muted-foreground">
              Course grade and CLO achievement are separate calculations. {" "}
              {course.assessments.filter((item) => item.result).length} of{" "}
              {course.assessments.length} assessment results are currently visible.
            </p>
          </Link>
        );
      })}
    </div>
  );
}
