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
  type CourseSectionPresence,
  type CourseSpecProgress,
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
import { courseSectionEmptyPresentation } from "./course-section-empty-state";
import {
  ALL_COURSE_FILTER as ALL,
  buildCourseSpecRows,
  courseSpecRowGroupLabel,
  type CourseSpecRow,
} from "./my-course-spec-rows";

export function MyCoursesClient() {
  const router = useRouter();
  const { me } = useMe();
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [offerings, setOfferings] = useState<OfferingView[]>([]);
  const [specProgress, setSpecProgress] = useState<CourseSpecProgress[]>([]);
  const [sectionPresence, setSectionPresence] = useState<CourseSectionPresence[]>([]);
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
      const [coursesRes, offeringsRes, progressRes, sectionPresenceRes] =
        await Promise.all([
          coursesApi.list(),
          offeringsApi.list(),
          coursesApi.specProgress(),
          coursesApi.sectionPresence(),
        ]);
      setCourses(coursesRes);
      setOfferings(offeringsRes);
      setSpecProgress(progressRes);
      setSectionPresence(sectionPresenceRes);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load course specifications",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      render: (row) => {
        const emptyPresentation = courseSectionEmptyPresentation(
          row.offerings.length,
          sectionPresenceByCourse.get(row.course.id),
        );

        if (emptyPresentation) {
          return (
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted-foreground">
                {emptyPresentation.title}
              </span>
              <div className="text-xs text-muted-foreground">
                {emptyPresentation.detail}
              </div>
            </div>
          );
        }

        const sections = [
          ...new Set(row.offerings.map((offering) => offering.sectionCode)),
        ].sort();
        const periods = [
          ...new Set(row.offerings.map((offering) => offering.term)),
        ]
          .sort()
          .reverse();
        return (
          <div className="space-y-1.5">
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
            <div className="text-xs text-muted-foreground">
              {periods.join(" · ")}
            </div>
          </div>
        );
      },
    },
    {
      key: "role",
      header: "My Role",
      render: (row) => {
        if (row.role === "Responsible") {
          return (
            <span className="font-medium text-primary">
              Responsible Lecturer
            </span>
          );
        }

        return (
          <span
            className={
              row.role === "Primary"
                ? "font-medium text-status-tournament"
                : "font-medium text-primary"
            }
          >
            {row.role === "Primary" ? "Primary Lecturer" : "Co-Lecturer"}
          </span>
        );
      },
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
      <div className="flex flex-wrap items-end gap-3">
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

      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        One row represents one shared course specification. Responsible Lecturers
        can prepare a Course Spec before class sections are created; existing
        sections are grouped when they share that specification.
      </div>

      {error ? (
        <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
          {error}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.course.id}
        groupBy={(row) =>
          courseSectionEmptyPresentation(
            row.offerings.length,
            sectionPresenceByCourse.get(row.course.id),
          )?.groupLabel ?? courseSpecRowGroupLabel(row)
        }
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

      <AttentionLegend />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

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
    <div className="w-32 space-y-1">
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
        <CheckCircle2 className="h-4 w-4" />
        Ready
      </span>
    );
  }

  const critical = attention.level === "needsAttention";
  const Icon = critical ? AlertCircle : AlertTriangle;
  const tone = critical ? "text-error" : "text-warning";
  const count = attention.items.length;

  return (
    <div className={tone}>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="h-4 w-4" />
        {critical ? "Needs attention" : `${count} incomplete`}
      </div>
      {count > 0 ? (
        <div className="mt-1 max-w-52 text-xs text-muted-foreground">
          {attention.items
            .slice(0, 2)
            .map((item) => item.title)
            .join(" · ")}
          {count > 2 ? ` · +${count - 2} more` : ""}
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted-foreground">
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
