"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, CheckCircle2, Search } from "lucide-react";
import {
  SEMESTERS,
  semesterLabel,
  specAttention,
  specCompletionLabel,
  specCompletionPercent,
  type CourseSpecProgress,
  type OfferingView,
  type Semester,
} from "@dse-pms/shared-types";
import {
  DataTable,
  Progress,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type DataTableColumn,
} from "@dse-pms/ui";
import { coursesApi } from "@/lib/courses";
import { offeringsApi } from "@/lib/offerings";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";

/** Sentinel for the Select "All"/unfiltered option — base-ui reserves "" for no selection. */
const ALL = "__all__";

interface MyCourseRow {
  offering: OfferingView;
  role: "Primary" | "Co-Lecturer";
  progress: CourseSpecProgress;
}

/** Fallback progress when a course has no spec-progress entry yet (shouldn't happen — every
 * course in scope gets one from listSpecProgress — but keeps the join total). */
function emptyProgress(
  courseId: string,
  code: string,
  title: string,
): CourseSpecProgress {
  return {
    courseId,
    code,
    title,
    completed: 0,
    total: 0,
    incompleteSections: [],
  };
}

/**
 * Lecturer-facing "My Courses" (issue #104): one row per offering the caller
 * teaches (primary or co-lecturer — the offerings API is already scoped to the
 * caller server-side), joined against course-spec progress so status/attention
 * is evidence-based rather than invented client-side.
 */
export function MyCoursesClient() {
  const router = useRouter();
  const { me } = useMe();

  const [offerings, setOfferings] = useState<OfferingView[]>([]);
  const [specProgress, setSpecProgress] = useState<CourseSpecProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [term, setTerm] = useState(ALL);
  const [semester, setSemester] = useState<Semester | typeof ALL>(ALL);
  const [studyYear, setStudyYear] = useState(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [offeringsRes, progressRes] = await Promise.all([
        offeringsApi.list(),
        coursesApi.specProgress(),
      ]);
      setOfferings(offeringsRes);
      setSpecProgress(progressRes);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load your courses",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const progressByCourse = useMemo(
    () => new Map(specProgress.map((p) => [p.courseId, p])),
    [specProgress],
  );

  const rows: MyCourseRow[] = useMemo(() => {
    if (!me) return [];
    return offerings
      .filter((o) => o.course != null)
      .map((o) => {
        const course = o.course!;
        const role: MyCourseRow["role"] =
          o.lecturer?.id === me.id ? "Primary" : "Co-Lecturer";
        const progress =
          progressByCourse.get(course.id) ??
          emptyProgress(course.id, course.code, course.title);
        return { offering: o, role, progress };
      });
  }, [offerings, progressByCourse, me]);

  // Terms populate from the caller's own offerings — no separate "academic year"
  // field exists in the schema, so `term` (the existing period field) doubles as
  // the Academic Year filter, per issue #104's "use existing academic-period/term
  // fields" constraint.
  const terms = useMemo(
    () => [...new Set(offerings.map((o) => o.term))].sort().reverse(),
    [offerings],
  );
  const studyYears = useMemo(
    () =>
      [
        ...new Set(
          offerings
            .map((o) => o.programmeYear)
            .filter((y): y is number => y != null),
        ),
      ].sort((a, b) => a - b),
    [offerings],
  );

  // base-ui's <Select.Value> renders the raw `value` unless the Root gets an
  // `items` map (value -> label) — without it the trigger shows the ALL
  // sentinel literally instead of "All".
  const termItems: Record<string, string> = {
    [ALL]: "All",
    ...Object.fromEntries(terms.map((t) => [t, t])),
  };
  const semesterItems: Record<string, string> = {
    [ALL]: "All",
    ...Object.fromEntries(SEMESTERS.map((s) => [s, semesterLabel(s)])),
  };
  const studyYearItems: Record<string, string> = {
    [ALL]: "All",
    ...Object.fromEntries(studyYears.map((y) => [String(y), `Year ${y}`])),
  };

  const filtered = rows.filter((r) => {
    if (term !== ALL && r.offering.term !== term) return false;
    if (semester !== ALL && r.offering.semester !== semester) return false;
    if (
      studyYear !== ALL &&
      String(r.offering.programmeYear ?? "") !== studyYear
    )
      return false;
    if (search) {
      const q = search.trim().toLowerCase();
      const haystack =
        `${r.offering.course?.code ?? ""} ${r.offering.course?.title ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Keep the existing course rows, but order them by study year so DataTable's
  // group headers produce stable Year 1 → Year 6 clusters. Offerings without a
  // programme year are kept at the end rather than being assigned to a year.
  const groupedRows = [...filtered].sort((a, b) => {
    // 1. Study Year
    const yearA = a.offering.programmeYear;
    const yearB = b.offering.programmeYear;

    if (yearA == null && yearB == null) {
      // 2. Semester for courses without a study year
      const semesterOrder: Record<string, number> = {
        First: 1,
        Second: 2,
      };

      const semesterA = semesterOrder[a.offering.semester ?? ""] ?? 99;
      const semesterB = semesterOrder[b.offering.semester ?? ""] ?? 99;

      if (semesterA !== semesterB) return semesterA - semesterB;

      return a.offering.course!.code.localeCompare(b.offering.course!.code);
    }

    if (yearA == null) return 1;
    if (yearB == null) return -1;

    if (yearA !== yearB) return yearA - yearB;

    // 2. Semester
    const semesterOrder: Record<string, number> = {
      First: 1,
      Second: 2,
    };

    const semesterA = semesterOrder[a.offering.semester ?? ""] ?? 99;
    const semesterB = semesterOrder[b.offering.semester ?? ""] ?? 99;

    if (semesterA !== semesterB) return semesterA - semesterB;

    // 3. Course Code
    return a.offering.course!.code.localeCompare(b.offering.course!.code);
  });

  const columns: DataTableColumn<MyCourseRow>[] = [
    {
      key: "course",
      header: "Course",
      render: (r) => (
        <div>
          <div className="font-medium text-foreground">
            {r.offering.course?.code}
          </div>
          <div className="text-xs text-muted-foreground">
            {r.offering.course?.title}
          </div>
        </div>
      ),
    },
    {
      key: "period",
      header: "Period",
      render: (r) => (
        <div>
          <div className="text-foreground">{r.offering.term}</div>
          {r.offering.programmeYear != null || r.offering.semester ? (
            <div className="text-xs text-muted-foreground">
              {r.offering.programmeYear != null
                ? `Year ${r.offering.programmeYear}`
                : ""}
              {r.offering.programmeYear != null && r.offering.semester
                ? " · "
                : ""}
              {r.offering.semester ? semesterLabel(r.offering.semester) : ""}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <div>
          <div
            className={
              r.role === "Primary"
                ? "font-medium text-status-tournament"
                : "font-medium text-primary"
            }
          >
            {r.role}
          </div>
          <div className="text-xs text-muted-foreground">Lecturer</div>
        </div>
      ),
    },
    {
      key: "students",
      header: "Students",
      render: (r) => (
        <span
          className={
            r.offering.enrolledCount >= r.offering.capacity
              ? "font-medium text-warning"
              : undefined
          }
        >
          {r.offering.enrolledCount} / {r.offering.capacity}
        </span>
      ),
    },
    {
      key: "spec",
      header: "Course Spec",
      align: "center",
      render: (r) => <SpecStatusCell progress={r.progress} />,
    },
    {
      key: "attention",
      header: "Attention",
      render: (r) => <AttentionCell progress={r.progress} />,
    },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Academic Year">
            <Select
              items={termItems}
              value={term}
              onValueChange={(v) => setTerm(v ?? ALL)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {terms.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Semester">
            <Select
              items={semesterItems}
              value={semester}
              onValueChange={(v) =>
                setSemester((v ?? ALL) as Semester | typeof ALL)
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {SEMESTERS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {semesterLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Study Year">
            <Select
              items={studyYearItems}
              value={studyYear}
              onValueChange={(v) => setStudyYear(v ?? ALL)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {studyYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    Year {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search my courses…"
              className="pl-9"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
            {error}
          </div>
        ) : null}

        <DataTable
          columns={columns}
          rows={groupedRows}
          getRowId={(r) => r.offering.id}
          groupBy={(r) =>
            r.offering.programmeYear != null
              ? `Year ${r.offering.programmeYear}`
              : "Study year not set"
          }
          actions={[
            {
              key: "manage",
              label: "Manage",
              onClick: (r) =>
                router.push(`/courses/${r.offering.course!.id}/spec`),
            },
          ]}
          loading={loading}
          emptyMessage="No courses are assigned to you yet."
        />

        <AttentionLegend />
      </div>
    </TooltipProvider>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Compact per-row completion ring + Complete/In progress/Not started label — both
 * derived by the shared `specCompletionPercent`/`specCompletionLabel` helpers
 * (packages/shared-types/src/course-spec.ts), the same ones the unit tests cover. */
function SpecStatusCell({ progress }: { progress: CourseSpecProgress }) {
  const percent = specCompletionPercent(progress);
  const label = specCompletionLabel(progress);

  const indicatorClassName =
    label === "Complete"
      ? "!bg-[var(--success)]"
      : label === "In progress"
        ? "!bg-[var(--warning)]"
        : "!bg-[var(--inactive)]";

  return (
    <div className="mx-auto flex w-24 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">
          {percent}%
        </span>
      </div>
      <Progress
        value={percent}
        className="w-full"
        indicatorClassName={indicatorClassName}
      />
    </div>
  );
}

/** Deterministic Attention status from the shared `specAttention` helper — up to
 * date (all complete), N items (some incomplete, some done), or needs attention
 * (nothing saved yet). Hover/focus explains which sections are outstanding. */
function AttentionCell({ progress }: { progress: CourseSpecProgress }) {
  const attention = specAttention(progress);

  if (attention.level === "upToDate") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="flex flex-col leading-tight">
          <span>Up to date</span>
          <span className="text-xs font-normal text-muted-foreground">
            All good
          </span>
        </span>
      </span>
    );
  }

  const critical = attention.level === "needsAttention";
  const count = attention.items.length;
  const label = critical
    ? "Needs attention"
    : `${count} item${count === 1 ? "" : "s"}`;
  const sub = critical ? "No content yet" : "Need attention";
  const Icon = critical ? AlertCircle : AlertTriangle;
  const tone = critical ? "text-error" : "text-warning";

  return (
    <Tooltip>
      <TooltipTrigger
        className={`inline-flex items-center gap-1.5 text-sm font-medium ${tone}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex flex-col items-start leading-tight">
          <span>{label}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {sub}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="inline-block w-max">
        {count === 0 ? (
          "No course specification content saved yet"
        ) : (
          <div className="space-y-1 text-left">
            <p className="font-medium">
              {count} item{count === 1 ? "" : "s"} need attention
            </p>
            <ul className="list-disc pl-4">
              {attention.items.map((s) => (
                <li key={s.id}>{s.title} incomplete</li>
              ))}
            </ul>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function AttentionLegend() {
  return (
    <div className="flex flex-wrap items-start gap-6 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex items-start gap-2 text-muted-foreground">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
          i
        </span>
        <span>
          Course Spec shows the completion of required Course Specification
          sections. Attention highlights items that require your action.
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-success">
        <CheckCircle2 className="h-4 w-4" />
        <span className="font-medium">Up to date</span>
        <span className="text-muted-foreground">
          — All required items are complete
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-warning">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-medium">Need attention</span>
        <span className="text-muted-foreground">
          — Some items are incomplete
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-error">
        <AlertCircle className="h-4 w-4" />
        <span className="font-medium">Needs attention</span>
        <span className="text-muted-foreground">
          — Critical items are missing
        </span>
      </div>
    </div>
  );
}
