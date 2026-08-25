"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarRange, GraduationCap, Users } from "lucide-react";
import {
  OFFERING_STATUSES,
  STUDENT_STATUSES,
  type CourseSpecProgress,
  type OfferingView,
  type Student,
} from "@dse-pms/shared-types";
import { CompletionRing, Progress, Skeleton, type StatusTone } from "@dse-pms/ui";
import { coursesApi, type CourseView } from "@/lib/courses";
import { offeringsApi, offeringTone } from "@/lib/offerings";
import { statusTone, studentsApi } from "@/lib/students";
import { lecturersApi } from "@/lib/lecturers";
import { buildCourseSpecProgressGroups, visibleCourseSpecRows } from "./course-spec-progress-groups";

/** Maps the app's semantic status tones to their themed CSS variables (defined
 * in globals.css, adapt to light/dark) so distribution-bar colors stay in sync
 * with the same tones StatusBadge uses elsewhere, instead of a second
 * hardcoded hex palette. */
const TONE_COLORS: Record<StatusTone, string> = {
  live: "var(--status-live)",
  upcoming: "var(--status-upcoming)",
  tournament: "var(--status-tournament)",
  neutral: "var(--status-neutral)",
};

interface LoadState {
  students: Student[];
  courses: CourseView[];
  offerings: OfferingView[];
  lecturerCount: number;
  specProgress: CourseSpecProgress[];
}

const EMPTY_STATE: LoadState = { students: [], courses: [], offerings: [], lecturerCount: 0, specProgress: [] };

/** Programme-wide overview for the "Dashboard" nav item (admin, program_coordinator,
 * program_secretary — see `dashboardManifest` in packages/shared-types/src/plugins.ts)
 * — counts plus spec-completion and status-distribution visualizations across every
 * course, offering, student and lecturer. */
export function DashboardClient() {
  const [loading, setLoading] = useState(true);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [state, setState] = useState<LoadState>(EMPTY_STATE);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [studentsRes, coursesRes, offeringsRes, lecturersRes, specRes] = await Promise.allSettled([
        studentsApi.list({}),
        coursesApi.list(),
        offeringsApi.list(),
        lecturersApi.list(),
        coursesApi.specProgress(),
      ]);
      if (!active) return;

      // Apply whatever loaded successfully rather than discarding it all when
      // one source fails, so an outage in one endpoint doesn't render every
      // other (successfully fetched) panel as misleading zeros.
      const failed: string[] = [];
      const orElse = <T,>(label: string, result: PromiseSettledResult<T>, fallback: T): T => {
        if (result.status === "fulfilled") return result.value;
        failed.push(label);
        return fallback;
      };
      setState({
        students: orElse("students", studentsRes, EMPTY_STATE.students),
        courses: orElse("courses", coursesRes, EMPTY_STATE.courses),
        offerings: orElse("offerings", offeringsRes, EMPTY_STATE.offerings),
        lecturerCount: orElse("lecturers", lecturersRes, []).length,
        specProgress: orElse("spec progress", specRes, EMPTY_STATE.specProgress),
      });
      setFailedSources(failed);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const { students, courses, offerings, lecturerCount, specProgress } = state;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const totalCompleted = specProgress.reduce((s, c) => s + c.completed, 0);
  const totalReady = specProgress.reduce((s, c) => s + c.total, 0);
  const overallSpecPercent = totalReady ? Math.round((totalCompleted / totalReady) * 100) : 0;
  const groupedSpecProgress = buildCourseSpecProgressGroups(specProgress);

  const totalEnrolled = offerings.reduce((s, o) => s + o.enrolledCount, 0);
  const totalCapacity = offerings.reduce((s, o) => s + o.capacity, 0);

  const offeringsByStatus = OFFERING_STATUSES.map((status) => ({
    status,
    count: offerings.filter((o) => o.status === status).length,
  }));
  const studentsByStatus = STUDENT_STATUSES.map((status) => ({
    status,
    count: students.filter((s) => s.status === status).length,
  }));

  return (
    <div className="space-y-6">
      {failedSources.length > 0 ? (
        <div className="rounded-lg border border-warning/30 bg-warning-bg px-4 py-2 text-sm text-warning">
          Failed to load {failedSources.join(", ")} — showing the rest of the dashboard. Try refreshing.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Users}
          tint="bg-primary-light text-primary"
          value={students.length}
          label="Students"
        />
        <StatTile
          icon={BookOpen}
          tint="bg-info-bg text-info"
          value={courses.length}
          label="Courses"
        />
        <StatTile
          icon={CalendarRange}
          tint="bg-success-bg text-success"
          value={offerings.length}
          label="Course Offerings"
        />
        <StatTile
          icon={GraduationCap}
          tint="bg-warning-bg text-warning"
          value={lecturerCount}
          label="Lecturers"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Course Specification Progress */}
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Course Specification Progress</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Grouped by the active curriculum year and semester.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={incompleteOnly}
                onChange={(event) => setIncompleteOnly(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Incomplete only
            </label>
          </div>
          {specProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses yet.</p>
          ) : (
            <div className="flex flex-col gap-5 xl:flex-row">
              <div className="flex shrink-0 justify-center xl:justify-start">
                <CompletionRing value={overallSpecPercent} size={120} label="Overall" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {groupedSpecProgress.years.map((year, yearIndex) => {
                  const visibleSemesters = year.semesters
                    .map((semester) => ({
                      ...semester,
                      visibleCourses: visibleCourseSpecRows(semester.courses, incompleteOnly),
                    }))
                    .filter((semester) => semester.visibleCourses.length > 0);
                  if (visibleSemesters.length === 0) return null;
                  return (
                    <details
                      key={year.programmeYear}
                      open={yearIndex === 0}
                      className="rounded-lg border border-border bg-background"
                    >
                      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-foreground">
                        <span className="flex items-center justify-between gap-3">
                          <span>Year {year.programmeYear}</span>
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            {year.courseCount} {year.courseCount === 1 ? "course" : "courses"} · {year.percent}%
                          </span>
                        </span>
                      </summary>
                      <div className="space-y-2 border-t border-border p-2">
                        {visibleSemesters.map((semester, semesterIndex) => (
                          <details
                            key={semester.semester}
                            open={semesterIndex === 0}
                            className="rounded-md bg-muted/40"
                          >
                            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-foreground">
                              <span className="flex items-center justify-between gap-3">
                                <span>Semester {semester.semester === "First" ? "1" : "2"}</span>
                                <span className="shrink-0 font-normal text-muted-foreground">
                                  {semester.courseCount} {semester.courseCount === 1 ? "course" : "courses"} · {semester.percent}%
                                </span>
                              </span>
                            </summary>
                            <CourseProgressList courses={semester.visibleCourses} />
                          </details>
                        ))}
                      </div>
                    </details>
                  );
                })}

                {(() => {
                  const visibleUnassigned = visibleCourseSpecRows(
                    groupedSpecProgress.unassigned.courses,
                    incompleteOnly,
                  );
                  if (visibleUnassigned.length === 0) return null;
                  return (
                    <details className="rounded-lg border border-border bg-background">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-foreground">
                        <span className="flex items-center justify-between gap-3">
                          <span>Unassigned / other courses</span>
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            {groupedSpecProgress.unassigned.courseCount} courses · {groupedSpecProgress.unassigned.percent}%
                          </span>
                        </span>
                      </summary>
                      <div className="border-t border-border">
                        <p className="px-3 pt-2 text-xs text-muted-foreground">
                          No active curriculum placement. Programme year is not guessed from the course code.
                        </p>
                        <CourseProgressList courses={visibleUnassigned} />
                      </div>
                    </details>
                  );
                })()}

                {incompleteOnly &&
                groupedSpecProgress.years.every((year) =>
                  year.semesters.every((semester) =>
                    semester.courses.every((course) => course.completed >= course.total),
                  ),
                ) &&
                groupedSpecProgress.unassigned.courses.every((course) => course.completed >= course.total) ? (
                  <p className="rounded-lg border border-border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
                    All course specifications are complete.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {/* Enrollment */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Enrollment</h3>
          <div className="flex justify-center">
            <CompletionRing
              value={totalCapacity ? Math.round((totalEnrolled / totalCapacity) * 100) : 0}
              size={120}
              label="Capacity used"
            />
          </div>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {totalEnrolled} enrolled of {totalCapacity} seats across {offerings.length} offerings
          </p>
        </section>

        {/* Offerings by Status */}
        <DistributionCard
          title="Offerings by Status"
          total={offerings.length}
          segments={offeringsByStatus.map(({ status, count }) => ({
            name: status,
            count,
            color: TONE_COLORS[offeringTone(status)],
          }))}
        />

        {/* Students by Status */}
        <DistributionCard
          title="Students by Status"
          total={students.length}
          segments={studentsByStatus.map(({ status, count }) => ({
            name: status,
            count,
            color: TONE_COLORS[statusTone(status)],
          }))}
        />
      </div>
    </div>
  );
}

function CourseProgressList({ courses }: { courses: CourseSpecProgress[] }) {
  return (
    <ul className="space-y-3 px-3 pb-3">
      {courses.map((course) => {
        const percent = course.total
          ? Math.round((course.completed / course.total) * 100)
          : 0;
        return (
          <li key={course.courseId}>
            <div className="mb-1 flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0 font-medium text-foreground">
                {course.code} – {course.title}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {course.completed}/{course.total} sections
              </span>
            </div>
            <Progress value={percent} />
          </li>
        );
      })}
    </ul>
  );
}

function StatTile({
  icon: Icon,
  tint,
  value,
  label,
}: {
  icon: typeof Users;
  tint: string;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function DistributionCard({
  title,
  total,
  segments,
}: {
  title: string;
  total: number;
  segments: { name: string; count: number; color: string }[];
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {total === 0
          ? null
          : segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.name}
                  style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
                  title={`${s.name}: ${s.count}`}
                />
              ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {segments.map((s) => (
          <li key={s.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
            <span className="font-medium text-foreground">{s.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}