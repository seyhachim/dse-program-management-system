"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FileText, Users } from "lucide-react";
import { courseTypeLabel } from "@dse-pms/shared-types";
import { DataTable, TableToolbar, type DataTableColumn } from "@dse-pms/ui";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { coursesApi, type CourseView } from "@/lib/courses";
import { curriculumApi } from "@/lib/curriculum";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import {
  buildCoursePlacementMap,
  curriculumGroupLabel,
  orderCoursesByCurriculum,
  type CourseWithCurriculumPlacement,
  type CurriculumPlacement,
} from "./course-curriculum-groups";
import { courseReviewStatusLabel } from "./course-review-status";

type CourseListRow = CourseWithCurriculumPlacement<CourseView>;

export function CoursesClient() {
  const router = useRouter();
  const [groupingError, setGroupingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [curriculumReady, setCurriculumReady] = useState(false);
  const [placementByCourseId, setPlacementByCourseId] = useState<
    Map<string, CurriculumPlacement>
  >(new Map());

  // Creating/editing/deleting a course record needs `courses:manage`
  // (admin, program_coordinator); lecturers hold `courses:write` for editing
  // the spec of their assigned courses via the lecturer-only course workspace.
  const { me } = useMe();
  const canManage = me?.permissions.includes("courses:manage") ?? false;
  const canReview = me?.permissions.includes("courses:review") ?? false;
  const canReadCurriculum = me?.permissions.includes("programme:read") ?? false;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const coursesQuery = useQuery({
    queryKey: protectedQueryKey(
      { userId: me?.id ?? "pending" },
      "courses",
      "list",
      debouncedSearch,
    ),
    queryFn: () => coursesApi.list(debouncedSearch),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
    placeholderData: keepPreviousData,
  });
  const rows = coursesQuery.data ?? [];
  const hasData = coursesQuery.data !== undefined;

  useEffect(() => {
    if (!me || !canReadCurriculum) return;
    let cancelled = false;

    (async () => {
      setGroupingError(null);
      try {
        const curricula = await curriculumApi.list();
        const current =
          curricula.find((curriculum) =>
            curriculum.versions.some((version) => version.status === "Active"),
          ) ??
          curricula.find((curriculum) =>
            curriculum.versions.some((version) => version.status === "Approved"),
          ) ??
          curricula[0];

        if (!current) {
          if (!cancelled) {
            setPlacementByCourseId(new Map());
            setCurriculumReady(true);
          }
          return;
        }

        const curriculum = await curriculumApi.get(current.id);
        if (!cancelled) {
          setPlacementByCourseId(buildCoursePlacementMap(curriculum.years));
          setCurriculumReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setCurriculumReady(false);
          setGroupingError(
            err instanceof ApiError
              ? `Year/semester grouping unavailable: ${err.message}`
              : "Year/semester grouping is temporarily unavailable.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canReadCurriculum, me]);

  const displayRows: CourseListRow[] = useMemo(
    () =>
      curriculumReady
        ? orderCoursesByCurriculum(rows, placementByCourseId)
        : rows.map((course) => ({ ...course, curriculumPlacement: null })),
    [curriculumReady, placementByCourseId, rows],
  );

  const handleDelete = async (course: CourseView) => {
    if (!confirm(`Delete ${course.code}?`)) return;
    setActionError(null);
    try {
      await coursesApi.remove(course.id);
      await coursesQuery.refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to delete course",
      );
    }
  };

  const columns: DataTableColumn<CourseListRow>[] = [
    { key: "code", header: "Code", render: (c) => <span className="font-medium">{c.code}</span> },
    { key: "title", header: "Title", render: (c) => c.title },
    {
      key: "credits",
      header: "Credits",
      render: (c) =>
        c.credits != null ? c.credits : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "totalSltHours",
      header: "Total SLT",
      render: (c) =>
        c.totalSltHours != null ? (
          `${c.totalSltHours} h`
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "courseType",
      header: "Type",
      render: (c) =>
        c.courseType ? (
          courseTypeLabel(c.courseType)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(canReview
      ? [{
          key: "reviewStatus",
          header: "Review",
          render: (c: CourseListRow) => {
            const status = c.reviewStatus;
            const pending = status === "Submitted" || status === "Resubmitted" || status === "UnderReview";
            const label = courseReviewStatusLabel(status);
            return (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  pending
                    ? "bg-blue-50 text-blue-700"
                    : status === "Approved"
                      ? "bg-emerald-50 text-emerald-700"
                      : status === "ChangesRequested"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
              </span>
            );
          },
        }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search courses…"
        addLabel={canManage ? "Add Course" : undefined}
        onAdd={canManage ? () => router.push("/courses/new") : undefined}
      />

      {actionError ? (
        <div
          role="alert"
          className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming"
        >
          {actionError}
        </div>
      ) : null}

      {!hasData && coursesQuery.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming"
        >
          {coursesQuery.error instanceof ApiError
            ? coursesQuery.error.message
            : "Failed to load courses"}
        </div>
      ) : null}

      <QueryRefreshStatus
        hasData={hasData}
        isPending={coursesQuery.isPending}
        isFetching={coursesQuery.isFetching}
        isError={coursesQuery.isError}
        label="Courses"
      />

      {groupingError ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          {groupingError} Courses are still shown in code order.
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={displayRows}
        getRowId={(c) => c.id}
        dragHandle
        groupBy={
          curriculumReady
            ? (course) => curriculumGroupLabel(course.curriculumPlacement)
            : undefined
        }
        renderGroupHeader={(group, groupRows) => (
          <div className="flex items-center gap-2">
            <span>{group}</span>
            <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
              {groupRows.length} {groupRows.length === 1 ? "course" : "courses"}
            </span>
          </div>
        )}
        actions={[
          {
            key: "syllabus",
            label: canReview ? "Open Specification" : "Syllabus",
            icon: <FileText className="mr-1 h-3.5 w-3.5" />,
            onClick: (c) => router.push(canReview ? `/courses/${c.id}/spec?tab=reviewSubmit` : `/courses/${c.id}/spec`),
          },
          ...(canManage
            ? [{
                key: "responsible-lecturers",
                label: "Responsible Lecturers",
                icon: <Users className="mr-1 h-3.5 w-3.5" />,
                onClick: (c: CourseListRow) =>
                  router.push(`/courses/${c.id}/spec/responsible-lecturers`),
              }]
            : []),
        ]}
        onEdit={canManage ? (c) => router.push(`/courses/${c.id}/edit`) : undefined}
        onDelete={canManage ? handleDelete : undefined}
        loading={!hasData && coursesQuery.isPending}
        emptyMessage={
          canManage ? "No courses yet. Add your first course." : "No courses are assigned to you yet."
        }
      />
    </div>
  );
}
