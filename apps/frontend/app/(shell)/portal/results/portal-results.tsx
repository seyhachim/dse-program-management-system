"use client";

import { useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, GraduationCap, LockKeyhole, Target } from "lucide-react";
import type { PortalCourseDetail } from "@dse-pms/shared-types";
import { Progress } from "@dse-pms/ui";
import { studentPortalApi } from "@/lib/student-portal";
import { EmptyState, PortalError, PortalLoading, usePortalData } from "../portal-state";

type AccessAwareCourse = PortalCourseDetail & {
  provisionalResultAccess?: {
    requireSurveyBeforeResults: boolean;
    surveyCompleted: boolean;
    canViewProvisionalResults: boolean;
  };
};

export function PortalResults() {
  const load = useCallback(async () => {
    const courses = await studentPortalApi.courses();
    return Promise.all(courses.map((course) => studentPortalApi.course(course.offeringId)));
  }, []);
  const { data, loading, error } = usePortalData(load);
  if (loading) return <PortalLoading />;
  if (error || !data) return <PortalError message={error ?? "Could not load results"} />;
  if (!data.length) return <EmptyState title="No results yet" description="Published assessment results will appear here." />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {data.map((rawCourse) => {
        const course = rawCourse as AccessAwareCourse;
        const locked = course.provisionalResultAccess?.canViewProvisionalResults === false;

        return (
          <Link
            href={`/portal/courses/${course.offeringId}`}
            key={course.offeringId}
            className="block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
          >
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {course.code} · Section {course.sectionCode}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{course.title}</h2>
              </div>

              {locked ? (
                <div className="flex max-w-xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Final course survey required</p>
                    <p className="mt-1 text-sm">
                      Complete the anonymous final course survey to view your provisional marks, course grade, and CLO achievement.
                    </p>
                    <p className="mt-2 text-xs font-medium">Open course to complete survey →</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex min-w-48 items-center gap-3 rounded-xl border border-border px-3 py-2">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary"><GraduationCap className="h-5 w-5" /></span>
                    <div>
                      <p className="text-xs text-muted-foreground">Local course grade</p>
                      <p className="text-xl font-bold">{course.totalCourseGrade === null ? "—" : `${course.totalCourseGrade}%`}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {course.courseGradeComplete
                          ? "Complete"
                          : `${course.completedGradeWeight}% of ${course.configuredGradeWeight}% grade weight published`}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-48 items-center gap-3 rounded-xl border border-border px-3 py-2">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary"><Target className="h-5 w-5" /></span>
                    <div>
                      <p className="text-xs text-muted-foreground">CLO achievement</p>
                      <p className="text-xl font-bold">{course.overallAchievement === null ? "—" : `${course.overallAchievement}%`}</p>
                      <p className="text-[11px] text-muted-foreground">Based only on mapped published evidence</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!locked ? (
              <>
                <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {course.achievements.map((item) => (
                    <div key={item.code} className="rounded-xl bg-muted/40 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{item.code}</span>
                        {item.percentage === null
                          ? <CircleAlert className="h-4 w-4 text-muted-foreground" />
                          : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      </div>
                      <p className="mt-2 text-xl font-bold">{item.percentage === null ? "—" : `${item.percentage}%`}</p>
                      <Progress className="mt-2" value={item.percentage ?? 0} />
                      <p className="mt-2 text-xs capitalize text-muted-foreground">{item.status.replaceAll("-", " ")}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.evidenceCount} mapped assessment result{item.evidenceCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  Course grade and CLO achievement are separate calculations. {course.assessments.filter((item) => item.result).length} of {course.assessments.length} assessment results published.
                </p>
              </>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                This gate affects only provisional PMS visibility. Your survey response is anonymous and does not change your marks or the university's official grade process.
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
