"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarRange,
  GraduationCap,
  Users,
} from "lucide-react";
import {
  OFFERING_STATUSES,
  STUDENT_STATUSES,
  type CourseSpecProgress,
  type OfferingStatus,
  type OfferingView,
  type Student,
  type StudentStatus,
} from "@dse-pms/shared-types";
import { CompletionRing, Progress, Skeleton } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { offeringsApi } from "@/lib/offerings";
import { studentsApi } from "@/lib/students";
import { lecturersApi } from "@/lib/lecturers";

const OFFERING_STATUS_COLORS: Record<OfferingStatus, string> = {
  Planned: "#3b82f6",
  Active: "#22c55e",
  Completed: "#94a3b8",
};

const STUDENT_STATUS_COLORS: Record<StudentStatus, string> = {
  Active: "#22c55e",
  Pending: "#f59e0b",
  Inactive: "#94a3b8",
};

/** Programme overview for the "Dashboard" nav item — counts + spec-completion and
 * status-distribution visualizations, scoped the same way the underlying list
 * endpoints already scope for lecturers (own courses/offerings only). */
export function DashboardClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [offerings, setOfferings] = useState<OfferingView[]>([]);
  const [lecturerCount, setLecturerCount] = useState(0);
  const [specProgress, setSpecProgress] = useState<CourseSpecProgress[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [studentsRes, coursesRes, offeringsRes, lecturersRes, specRes] = await Promise.all([
          studentsApi.list({}),
          coursesApi.list(),
          offeringsApi.list(),
          lecturersApi.list(),
          coursesApi.specProgress(),
        ]);
        if (!active) return;
        setStudents(studentsRes);
        setCourses(coursesRes);
        setOfferings(offeringsRes);
        setLecturerCount(lecturersRes.length);
        setSpecProgress(specRes);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
      {error ? (
        <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Users}
          tint="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"
          value={students.length}
          label="Students"
        />
        <StatTile
          icon={BookOpen}
          tint="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"
          value={courses.length}
          label="Courses"
        />
        <StatTile
          icon={CalendarRange}
          tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"
          value={offerings.length}
          label="Course Offerings"
        />
        <StatTile
          icon={GraduationCap}
          tint="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300"
          value={lecturerCount}
          label="Lecturers"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Course Specification Progress */}
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Course Specification Progress</h3>
          {specProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses yet.</p>
          ) : (
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="flex shrink-0 justify-center sm:justify-start">
                <CompletionRing value={overallSpecPercent} size={120} label="Overall" />
              </div>
              <ul className="flex-1 space-y-3">
                {specProgress.map((c) => {
                  const percent = c.total ? Math.round((c.completed / c.total) * 100) : 0;
                  return (
                    <li key={c.courseId}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {c.code} – {c.title}
                        </span>
                        <span className="text-muted-foreground">
                          {c.completed}/{c.total} sections
                        </span>
                      </div>
                      <Progress value={percent} />
                    </li>
                  );
                })}
              </ul>
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
            color: OFFERING_STATUS_COLORS[status],
          }))}
        />

        {/* Students by Status */}
        <DistributionCard
          title="Students by Status"
          total={students.length}
          segments={studentsByStatus.map(({ status, count }) => ({
            name: status,
            count,
            color: STUDENT_STATUS_COLORS[status],
          }))}
        />
      </div>
    </div>
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
