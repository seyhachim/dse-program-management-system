"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  courseTypeLabel,
  type CourseSpecTeamSummary,
} from "@dse-pms/shared-types";
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
} from "./course-curriculum-groups";
import { courseReviewStatusLabel } from "./course-review-status";
import {
  courseSpecHref,
  MOBILE_COURSES_LAYOUT,
} from "./mobile-course-layout";

type CourseListRow = CourseWithCurriculumPlacement<CourseView>;

export function CoursesClient() {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);

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
  const hardQueryError = !hasData && coursesQuery.isError;

  // Curriculum placement is reference data. Keep it in the shared React Query
  // cache instead of rebuilding local component state on every route mount.
  // Stale cached data stays rendered while React Query refreshes in the background,
  // so year/semester cluster bars do not disappear and reappear during navigation.
  const curriculumQuery = useQuery({
    queryKey: protectedQueryKey(
      { userId: me?.id ?? "pending", programmeId: "dse" },
      "curriculum",
      "course-placement",
    ),
    queryFn: async () => {
      const curricula = await curriculumApi.list();
      const current =
        curricula.find((curriculum) =>
          curriculum.versions.some((version) => version.status === "Active"),
        ) ??
        curricula.find((curriculum) =>
          curriculum.versions.some((version) => version.status === "Approved"),
        ) ??
        curricula[0];

      return current ? curriculumApi.get(current.id) : null;
    },
    enabled: Boolean(me?.id && canReadCurriculum),
    staleTime: QUERY_STALE_MS.reference,
    gcTime: 60 * 60_000,
  });

  const curriculumReady =
    canReadCurriculum && curriculumQuery.data !== undefined;
  const placementByCourseId = useMemo(
    () =>
      curriculumQuery.data
        ? buildCoursePlacementMap(curriculumQuery.data.years)
        : new Map(),
    [curriculumQuery.data],
  );
  const groupingError =
    curriculumQuery.isError && curriculumQuery.data === undefined
      ? curriculumQuery.error instanceof ApiError
        ? `Year/semester grouping unavailable: ${curriculumQuery.error.message}`
        : "Year/semester grouping is temporarily unavailable."
      : null;

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

  const openSpecification = (course: CourseListRow) => {
    router.push(courseSpecHref(course.id, canReview));
  };

  const columns: DataTableColumn<CourseListRow>[] = [
    {
      key: "code",
      header: "Code",
      render: (c) => <span className="font-medium">{c.code}</span>,
    },
    { key: "title", header: "Title", render: (c) => c.title },
    {
      key: "credits",
      header: "Credits",
      render: (c) =>
        c.credits != null ? (
          c.credits
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
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
    {
      key: "courseTeam",
      header: "Course Team",
      className: "w-56",
      render: (c) => <CourseTeamCell team={c.courseTeam} />,
    },
    ...(canReview
      ? [
          {
            key: "reviewStatus",
            header: "Review",
            render: (c: CourseListRow) => (
              <ReviewStatusBadge status={c.reviewStatus} />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className={MOBILE_COURSES_LAYOUT.toolbar}>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search courses…"
            aria-label="Search courses"
            className={MOBILE_COURSES_LAYOUT.search}
          />
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => router.push("/courses/new")}
            className={MOBILE_COURSES_LAYOUT.addButton}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Course
          </button>
        ) : null}
      </div>

      <div className={MOBILE_COURSES_LAYOUT.desktop}>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search courses…"
          addLabel={canManage ? "Add Course" : undefined}
          onAdd={canManage ? () => router.push("/courses/new") : undefined}
        />
      </div>

      {actionError ? (
        <div
          role="alert"
          className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming"
        >
          {actionError}
        </div>
      ) : null}

      {hardQueryError ? (
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

      {!hardQueryError ? (
        <>
          <div className={MOBILE_COURSES_LAYOUT.cards}>
            {!hasData && coursesQuery.isPending ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Loading courses…
              </div>
            ) : displayRows.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                {canManage
                  ? "No courses yet. Add your first course."
                  : "No courses are assigned to you yet."}
              </div>
            ) : (
              displayRows.map((course) => (
                <article key={course.id} className={MOBILE_COURSES_LAYOUT.card}>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                          {course.code}
                        </span>
                        {curriculumReady ? (
                          <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                            {curriculumGroupLabel(course.curriculumPlacement)}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 break-words text-base font-semibold leading-snug text-foreground">
                        {course.title}
                      </h3>
                    </div>
                    {canReview ? (
                      <ReviewStatusBadge status={course.reviewStatus} />
                    ) : null}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Credits</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {course.credits ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Type</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {course.courseType
                          ? courseTypeLabel(course.courseType)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Total SLT</dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {course.totalSltHours != null
                          ? `${course.totalSltHours} h`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Course Team</dt>
                      <dd className="mt-0.5">
                        <CourseTeamCell team={course.courseTeam} compact />
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      onClick={() => openSpecification(course)}
                      className={MOBILE_COURSES_LAYOUT.primaryAction}
                    >
                      <FileText className="h-4 w-4" />
                      {canReview ? "Open Review & Submit" : "Open Specification"}
                    </button>

                    {canManage ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/courses/${course.id}/spec/responsible-lecturers`,
                            )
                          }
                          className={MOBILE_COURSES_LAYOUT.secondaryAction}
                        >
                          <Users className="h-4 w-4" />
                          Course Team
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/courses/${course.id}/edit`)}
                          className={MOBILE_COURSES_LAYOUT.secondaryAction}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(course)}
                          className={`${MOBILE_COURSES_LAYOUT.secondaryAction} col-span-2 text-destructive`}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete Course
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>

          <div className={MOBILE_COURSES_LAYOUT.desktop}>
            <DataTable
              columns={columns}
              rows={displayRows}
              getRowId={(c) => c.id}
              dragHandle
              groupBy={
                curriculumReady
                  ? (course) =>
                      curriculumGroupLabel(course.curriculumPlacement)
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
                  onClick: openSpecification,
                },
                ...(canManage
                  ? [
                      {
                        key: "course-team",
                        label: "Manage Course Team",
                        icon: <Users className="mr-1 h-3.5 w-3.5" />,
                        onClick: (c: CourseListRow) =>
                          router.push(
                            `/courses/${c.id}/spec/responsible-lecturers`,
                          ),
                      },
                    ]
                  : []),
              ]}
              onEdit={
                canManage
                  ? (c) => router.push(`/courses/${c.id}/edit`)
                  : undefined
              }
              onDelete={canManage ? handleDelete : undefined}
              loading={!hasData && coursesQuery.isPending}
              emptyMessage={
                canManage
                  ? "No courses yet. Add your first course."
                  : "No courses are assigned to you yet."
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReviewStatusBadge({
  status,
}: {
  status: CourseListRow["reviewStatus"];
}) {
  const pending =
    status === "Submitted" ||
    status === "Resubmitted" ||
    status === "UnderReview";
  const label = courseReviewStatusLabel(status);
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
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
}

function CourseTeamCell({
  team,
  compact = false,
}: {
  team: CourseSpecTeamSummary | undefined;
  compact?: boolean;
}) {
  if (!team || team.lecturers.length === 0) {
    return (
      <span className="text-sm font-medium text-amber-700">Not assigned</span>
    );
  }

  if (team.responsibilityMode === "SHARED") {
    const visible = team.lecturers.slice(0, compact ? 1 : 2);
    const hidden = team.lecturers.length - visible.length;
    return (
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-foreground">
          {team.lecturers.length} {team.lecturers.length === 1 ? "lecturer" : "lecturers"}
        </div>
        <div className="text-xs font-medium text-primary">Shared responsibility</div>
        {!compact ? (
          <div className="text-xs text-muted-foreground">
            {visible.map((lecturer) => lecturer.name).join(" · ")}
            {hidden > 0 ? ` · +${hidden}` : ""}
          </div>
        ) : null}
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
    <div className="space-y-0.5">
      <div className="text-sm font-medium text-foreground">{lead.name}</div>
      {!compact ? (
        <div className="text-xs font-medium text-primary">Responsible Lecturer</div>
      ) : null}
      {coCount > 0 ? (
        <div className="text-xs text-muted-foreground">
          +{coCount} {coCount === 1 ? "co-lecturer" : "co-lecturers"}
        </div>
      ) : null}
    </div>
  );
}
