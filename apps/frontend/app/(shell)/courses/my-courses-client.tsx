"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Search,
} from "lucide-react";
import {
  SEMESTERS,
  semesterLabel,
  specAttention,
  specCompletionLabel,
  specCompletionPercent,
  type CourseSectionPresence,
  type CourseSpecProgress,
  type CourseSpecTeamSummary,
  type OfferingView,
  type Semester,
} from "@dse-pms/shared-types";
import {
  DataTable,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type DataTableColumn,
} from "@dse-pms/ui";
import { coursesApi, type CourseView } from "@/lib/courses";
import { offeringsApi } from "@/lib/offerings";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { courseSectionEmptyPresentation } from "./course-section-empty-state";
import {
  ALL_COURSE_FILTER as ALL,
  buildCourseSpecRows,
  courseSpecRowGroupLabel,
  type CourseSpecRow,
} from "./my-course-spec-rows";
import { MOBILE_COURSES_LAYOUT } from "./mobile-course-layout";

export function MyCoursesClient() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const queryScope = { userId: me?.id ?? "pending" };

  const coursesQuery = useQuery({
    queryKey: protectedQueryKey(queryScope, "courses", "list"),
    queryFn: () => coursesApi.list(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.reference,
  });
  const offeringsQuery = useQuery({
    queryKey: protectedQueryKey(queryScope, "offerings", "list"),
    queryFn: () => offeringsApi.list(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });
  const specProgressQuery = useQuery({
    queryKey: protectedQueryKey(queryScope, "courses", "spec-progress"),
    queryFn: () => coursesApi.specProgress(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.review,
  });
  const sectionPresenceQuery = useQuery({
    queryKey: protectedQueryKey(queryScope, "courses", "section-presence"),
    queryFn: () => coursesApi.sectionPresence(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });

  const courses: CourseView[] = coursesQuery.data ?? [];
  const offerings: OfferingView[] = offeringsQuery.data ?? [];
  const specProgress: CourseSpecProgress[] = specProgressQuery.data ?? [];
  const sectionPresence: CourseSectionPresence[] = sectionPresenceQuery.data ?? [];
  const firstError = [
    coursesQuery.error,
    offeringsQuery.error,
    specProgressQuery.error,
    sectionPresenceQuery.error,
  ].find((value): value is Error => value instanceof Error);
  const error = firstError
    ? firstError instanceof ApiError
      ? firstError.message
      : "Failed to load course specifications"
    : null;
  const loading =
    meLoading ||
    coursesQuery.isPending ||
    offeringsQuery.isPending ||
    specProgressQuery.isPending ||
    sectionPresenceQuery.isPending;

  const [search, setSearch] = useState("");
  const [term, setTerm] = useState(ALL);
  const [semester, setSemester] = useState<Semester | typeof ALL>(ALL);
  const [studyYear, setStudyYear] = useState(ALL);

  const sectionPresenceByCourse = useMemo(
    () =>
      new Map(
        sectionPresence.map((presence) => [presence.courseId, presence.hasSections]),
      ),
    [sectionPresence],
  );

  const terms = useMemo(
    () =>
      [...new Set(offerings.map((offering) => offering.term))]
        .filter(Boolean)
        .sort()
        .reverse(),
    [offerings],
  );

  const studyYears = useMemo(
    () =>
      [
        ...new Set(
          offerings
            .map((offering) => offering.programmeYear)
            .filter((year): year is number => year != null),
        ),
      ].sort((a, b) => a - b),
    [offerings],
  );

  const rows = useMemo<CourseSpecRow[]>(
    () =>
      buildCourseSpecRows({
        courses,
        offerings,
        specProgress,
        lecturerId: me?.id ?? null,
        filters: { search, term, semester, studyYear },
      }),
    [courses, me?.id, offerings, search, semester, specProgress, studyYear, term],
  );

  const mobileGroups = useMemo(() => {
    const groups: Array<{ label: string; rows: CourseSpecRow[] }> = [];

    for (const row of rows) {
      const label = courseSpecRowGroupLabel(row);
      const current = groups.at(-1);
      if (current?.label === label) {
        current.rows.push(row);
      } else {
        groups.push({ label, rows: [row] });
      }
    }

    return groups;
  }, [rows]);

  const termItems: Record<string, string> = {
    [ALL]: "All",
    ...Object.fromEntries(terms.map((value) => [value, value])),
  };
  const semesterItems: Record<string, string> = {
    [ALL]: "All",
    ...Object.fromEntries(
      SEMESTERS.map((value) => [value, semesterLabel(value)]),
    ),
  };
  const studyYearItems: Record<string, string> = {
    [ALL]: "All",
    ...Object.fromEntries(
      studyYears.map((value) => [String(value), `Year ${value}`]),
    ),
  };

  const columns: DataTableColumn<CourseSpecRow>[] = [
    {
      key: "course",
      header: "Course",
      render: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.course.code}</div>
          <div className="text-xs text-muted-foreground">
            {row.course.title}
          </div>
        </div>
      ),
    },
    {
      key: "sections",
      header: "Sections",
      render: (row) => (
        <SectionSummary
          row={row}
          hasSections={sectionPresenceByCourse.get(row.course.id)}
        />
      ),
    },
    {
      key: "courseTeam",
      header: "Course Team",
      className: "w-56",
      render: (row) => (
        <CourseTeamCell
          team={row.course.courseTeam}
          currentUserId={me?.id ?? null}
        />
      ),
    },
    {
      key: "status",
      header: "Spec Status",
      className: "w-44",
      render: (row) => <SpecStatusCell progress={row.progress} />,
    },
    {
      key: "attention",
      header: "Attention",
      className: "w-64",
      render: (row) => <AttentionCell progress={row.progress} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3 md:hidden">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search course specifications…"
            aria-label="Search course specifications"
            className={MOBILE_COURSES_LAYOUT.search}
          />
        </div>

        <div className={MOBILE_COURSES_LAYOUT.filters}>
          <Field label="Academic Year">
            <Select
              items={termItems}
              value={term}
              onValueChange={(value) => setTerm(value ?? ALL)}
            >
              <SelectTrigger className={MOBILE_COURSES_LAYOUT.filterTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {terms.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Semester">
            <Select
              items={semesterItems}
              value={semester}
              onValueChange={(value) =>
                setSemester((value ?? ALL) as Semester | typeof ALL)
              }
            >
              <SelectTrigger className={MOBILE_COURSES_LAYOUT.filterTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {SEMESTERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {semesterLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="col-span-2">
            <Field label="Study Year">
              <Select
                items={studyYearItems}
                value={studyYear}
                onValueChange={(value) => setStudyYear(value ?? ALL)}
              >
                <SelectTrigger className={MOBILE_COURSES_LAYOUT.filterTrigger}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {studyYears.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      Year {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      </div>

      <div className={MOBILE_COURSES_LAYOUT.desktopFilters}>
        <Field label="Academic Year">
          <Select
            items={termItems}
            value={term}
            onValueChange={(value) => setTerm(value ?? ALL)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              {terms.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Semester">
          <Select
            items={semesterItems}
            value={semester}
            onValueChange={(value) =>
              setSemester((value ?? ALL) as Semester | typeof ALL)
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              {SEMESTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {semesterLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Study Year">
          <Select
            items={studyYearItems}
            value={studyYear}
            onValueChange={(value) => setStudyYear(value ?? ALL)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              {studyYears.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  Year {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search course specifications…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground md:text-sm">
        Each item represents one shared course specification. Course Team members
        can prepare a Course Spec before class sections are created; existing
        sections are grouped when they share that specification.
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming"
        >
          {error}
        </div>
      ) : null}

      <div className={MOBILE_COURSES_LAYOUT.cards}>
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading course specifications…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No course specifications are assigned to you yet.
          </div>
        ) : (
          mobileGroups.map((group) => (
            <section key={group.label} className="space-y-3">
              <div className={MOBILE_COURSES_LAYOUT.groupHeader}>
                <span>{group.label}</span>
                <span className="font-normal normal-case tracking-normal">
                  {group.rows.length} {group.rows.length === 1 ? "course" : "courses"}
                </span>
              </div>

              {group.rows.map((row) => (
                <article key={row.course.id} className={MOBILE_COURSES_LAYOUT.card}>
                  <div className="min-w-0">
                    <span className="inline-flex rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                      {row.course.code}
                    </span>
                    <h3 className="mt-2 break-words text-base font-semibold leading-snug text-foreground">
                      {row.course.title}
                    </h3>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl bg-muted/30 p-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        Sections
                      </div>
                      <div className="mt-1">
                        <SectionSummary
                          row={row}
                          hasSections={sectionPresenceByCourse.get(row.course.id)}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl bg-muted/30 p-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        Course Team
                      </div>
                      <div className="mt-1">
                        <CourseTeamCell
                          team={row.course.courseTeam}
                          currentUserId={me?.id ?? null}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl bg-muted/30 p-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        Specification status
                      </div>
                      <div className="mt-1.5">
                        <SpecStatusCell progress={row.progress} fullWidth />
                      </div>
                      <div className="mt-3 border-t border-border pt-3">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">
                          Attention
                        </div>
                        <AttentionCell progress={row.progress} />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(`/courses/${row.course.id}/spec`)}
                    className={`${MOBILE_COURSES_LAYOUT.primaryAction} mt-4`}
                  >
                    <FileText className="h-4 w-4" />
                    Open Specification
                  </button>
                </article>
              ))}
            </section>
          ))
        )}
      </div>

      <div className={MOBILE_COURSES_LAYOUT.desktop}>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.course.id}
          groupBy={(row) => courseSpecRowGroupLabel(row)}
          actions={[
            {
              key: "open-spec",
              label: "Open Spec",
              onClick: (row) => router.push(`/courses/${row.course.id}/spec`),
            },
          ]}
          loading={loading}
          emptyMessage="No course specifications are assigned to you yet."
        />
      </div>

      <AttentionLegend />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SectionSummary({
  row,
  hasSections,
}: {
  row: CourseSpecRow;
  hasSections: boolean | undefined;
}) {
  const emptyPresentation = courseSectionEmptyPresentation(
    row.offerings.length,
    hasSections,
  );

  if (emptyPresentation) {
    return (
      <div className="min-w-0 space-y-1">
        <span className="break-words text-sm font-medium text-muted-foreground">
          {emptyPresentation.title}
        </span>
        <div className="break-words text-xs text-muted-foreground">
          {emptyPresentation.detail}
        </div>
      </div>
    );
  }

  const sections = [
    ...new Set(row.offerings.map((offering) => offering.sectionCode)),
  ].sort();
  const periods = [...new Set(row.offerings.map((offering) => offering.term))]
    .sort()
    .reverse();

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {sections.map((section) => (
          <span
            key={section}
            className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {section}
          </span>
        ))}
      </div>
      <div className="break-words text-xs text-muted-foreground">
        {periods.join(" · ")}
      </div>
    </div>
  );
}

function CourseTeamCell({
  team,
  currentUserId,
}: {
  team: CourseSpecTeamSummary | undefined;
  currentUserId: string | null;
}) {
  if (!team || team.lecturers.length === 0) {
    return <span className="text-sm text-muted-foreground">Not assigned</span>;
  }

  if (team.responsibilityMode === "SHARED") {
    const visible = team.lecturers.slice(0, 2);
    const hidden = team.lecturers.length - visible.length;
    return (
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-medium text-foreground">
          {team.lecturers.length} {team.lecturers.length === 1 ? "lecturer" : "lecturers"}
        </div>
        <div className="text-xs font-medium text-primary">Shared responsibility</div>
        <div className="break-words text-xs text-muted-foreground">
          {visible
            .map((lecturer) =>
              lecturer.id === currentUserId ? `${lecturer.name} (You)` : lecturer.name,
            )
            .join(" · ")}
          {hidden > 0 ? ` · +${hidden}` : ""}
        </div>
      </div>
    );
  }

  const lead =
    team.lecturers.find((lecturer) => lecturer.role === "RESPONSIBLE") ??
    team.lecturers[0]!;
  const coCount = team.lecturers.filter(
    (lecturer) => lecturer.role === "CO_LECTURER",
  ).length;
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="break-words text-sm font-medium text-foreground">
        {lead.name}
        {lead.id === currentUserId ? " · You" : ""}
      </div>
      <div className="text-xs font-medium text-primary">Responsible Lecturer</div>
      {coCount > 0 ? (
        <div className="text-xs text-muted-foreground">
          +{coCount} {coCount === 1 ? "co-lecturer" : "co-lecturers"}
        </div>
      ) : null}
    </div>
  );
}

function SpecStatusCell({
  progress,
  fullWidth = false,
}: {
  progress: CourseSpecProgress;
  fullWidth?: boolean;
}) {
  const percent = specCompletionPercent(progress);
  const label = specCompletionLabel(progress);
  const indicatorClassName =
    label === "Complete"
      ? "!bg-[var(--success)]"
      : label === "In progress"
        ? "!bg-[var(--warning)]"
        : "!bg-[var(--inactive)]";

  return (
    <div className={fullWidth ? "w-full space-y-1" : "w-32 space-y-1"}>
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

function AttentionCell({ progress }: { progress: CourseSpecProgress }) {
  const attention = specAttention(progress);

  if (attention.level === "upToDate") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Ready
      </span>
    );
  }

  const critical = attention.level === "needsAttention";
  const Icon = critical ? AlertCircle : AlertTriangle;
  const tone = critical ? "text-error" : "text-warning";
  const count = attention.items.length;

  return (
    <div className={`${tone} min-w-0`}>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="h-4 w-4 shrink-0" />
        {critical ? "Needs attention" : `${count} incomplete`}
      </div>
      {count > 0 ? (
        <div className="mt-1 max-w-52 break-words text-xs text-muted-foreground">
          {attention.items
            .slice(0, 2)
            .map((item) => item.title)
            .join(" · ")}
          {count > 2 ? ` · +${count - 2} more` : ""}
        </div>
      ) : (
        <div className="mt-1 break-words text-xs text-muted-foreground">
          No specification content yet
        </div>
      )}
    </div>
  );
}

function AttentionLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      <span className="text-muted-foreground">Specification readiness:</span>
      <span className="inline-flex items-center gap-1.5 text-success">
        <CheckCircle2 className="h-4 w-4" /> Ready
      </span>
      <span className="inline-flex items-center gap-1.5 text-warning">
        <AlertTriangle className="h-4 w-4" /> Incomplete items
      </span>
      <span className="inline-flex items-center gap-1.5 text-error">
        <AlertCircle className="h-4 w-4" /> No content / critical gaps
      </span>
    </div>
  );
}
