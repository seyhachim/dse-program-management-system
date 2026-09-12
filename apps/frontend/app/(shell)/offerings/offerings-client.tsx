"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { BookOpen, Pencil, Trash2, Users } from "lucide-react";
import type { OfferingView, Student } from "@dse-pms/shared-types";
import { semesterLabel } from "@dse-pms/shared-types";
import {
  DataTable,
  StatusBadge,
  TableToolbar,
  type DataTableColumn,
} from "@dse-pms/ui";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { offeringsApi, offeringTone } from "@/lib/offerings";
import {
  groupOfferings,
  type OfferingGroup,
} from "@/lib/offering-groups";
import {
  filterOfferingGroups,
  offeringScheduleEntries,
  OFFERING_YEAR_FILTER_OPTIONS,
  type OfferingYearFilter,
} from "@/lib/offering-list-view";
import { studentsApi } from "@/lib/students";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { EnrollmentDialog } from "./enrollment-dialog";
import {
  groupTeachingTeam,
  isSupervisionOfferingGroup,
  offeringTeachingTeam,
} from "./offering-supervision";

const OFFERING_ROSTER_WIDE_ROLES = [
  "admin",
  "program_coordinator",
  "program_secretary",
];

function sortOfferings(offerings: OfferingView[]): OfferingView[] {
  return [...offerings].sort((a, b) => {
    const semesterCompare = String(a.semester ?? "").localeCompare(
      String(b.semester ?? ""),
      undefined,
      { numeric: true },
    );
    if (semesterCompare !== 0) return semesterCompare;

    const yearCompare = String(a.programmeYear ?? "").localeCompare(
      String(b.programmeYear ?? ""),
      undefined,
      { numeric: true },
    );
    if (yearCompare !== 0) return yearCompare;

    const courseCompare = String(a.course?.code ?? "").localeCompare(
      String(b.course?.code ?? ""),
    );
    return courseCompare || a.sectionCode.localeCompare(b.sectionCode);
  });
}

function totalEnrolled(group: OfferingGroup) {
  return group.offerings.reduce(
    (total, offering) => total + offering.enrolledCount,
    0,
  );
}

function totalCapacity(group: OfferingGroup) {
  return group.offerings.reduce(
    (total, offering) => total + offering.capacity,
    0,
  );
}

export function OfferingsClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<OfferingYearFilter>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [manage, setManage] = useState<OfferingView | null>(null);

  const { me } = useMe();
  const canManage = me?.permissions.includes("offerings:manage") ?? false;
  const canManageAnyRoster =
    me?.roles.some((role) => OFFERING_ROSTER_WIDE_ROLES.includes(role)) ?? false;
  const currentUserId = me?.id ?? null;
  const queryScope = { userId: me?.id ?? "pending" };
  const offeringsKey = protectedQueryKey(queryScope, "offerings", "list");

  const offeringsQuery = useQuery({
    queryKey: offeringsKey,
    queryFn: async () => sortOfferings(await offeringsApi.list()),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });

  const studentsQuery = useQuery({
    queryKey: protectedQueryKey(
      queryScope,
      "students",
      "list",
      "offering-roster-reference",
    ),
    queryFn: () => studentsApi.list({}),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.reference,
  });

  const rows = offeringsQuery.data ?? [];
  const students: Student[] = studentsQuery.data ?? [];
  const hasData = offeringsQuery.data !== undefined;
  const hardQueryError = !hasData && offeringsQuery.isError;

  const handleDelete = async (offering: OfferingView) => {
    if (
      !confirm(
        `Delete ${offering.course?.code} · ${offering.sectionCode} · ${offering.term}?`,
      )
    ) {
      return;
    }

    setActionError(null);
    try {
      await offeringsApi.remove(offering.id);
      await offeringsQuery.refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to delete offering",
      );
    }
  };

  const handleManage = (offering: OfferingView) => {
    const isAssigned = offeringTeachingTeam(offering).some(
      (lecturer) => lecturer.id === currentUserId,
    );

    if (!canManageAnyRoster && !isAssigned) {
      setActionError("You can only manage enrollment for offerings you teach.");
      return;
    }

    setActionError(null);
    setManage(offering);
  };

  const applyUpdate = (updated: OfferingView) => {
    queryClient.setQueryData<OfferingView[]>(offeringsKey, (current) =>
      current
        ? current.map((row) => (row.id === updated.id ? updated : row))
        : current,
    );
    setManage((current) =>
      current && current.id === updated.id ? updated : current,
    );
  };

  const groups = useMemo(() => groupOfferings(rows), [rows]);
  const visibleGroups = useMemo(
    () => filterOfferingGroups(groups, search, yearFilter),
    [groups, search, yearFilter],
  );

  const toggleGroup = (group: OfferingGroup) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(group.id)) next.delete(group.id);
      else next.add(group.id);
      return next;
    });
  };

  const columns: DataTableColumn<OfferingGroup>[] = [
    {
      key: "course",
      header: "Course",
      render: (group) =>
        group.course ? (
          <span>
            <span className="font-medium">{group.course.code}</span>{" "}
            <span className="text-muted-foreground">{group.course.title}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "term", header: "Term", render: (group) => group.term },
    {
      key: "section",
      header: "Classes / groups",
      render: (group) => {
        const supervision = isSupervisionOfferingGroup(group);
        const sectionCodes = group.offerings
          .map((offering) => offering.sectionCode)
          .join(", ");

        return (
          <div className="flex flex-col">
            <span className="font-medium">
              {supervision
                ? `${group.offerings.length} supervision ${
                    group.offerings.length === 1 ? "group" : "groups"
                  }`
                : `${group.offerings.length === 1 ? "Class" : "Classes"} ${sectionCodes}`}
            </span>
            {supervision ? (
              <span className="text-xs text-muted-foreground">{sectionCodes}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "schedule",
      header: "Room & Time",
      render: (group) => {
        const scheduleEntries = offeringScheduleEntries(group);
        if (scheduleEntries.length === 0) {
          return <span className="text-muted-foreground">Not scheduled</span>;
        }

        const showGroup = group.offerings.length > 1;
        return (
          <div className="space-y-0.5 text-xs">
            {scheduleEntries.map((entry) => (
              <div key={entry.key} className="whitespace-nowrap">
                {showGroup ? (
                  <>
                    <span className="font-semibold text-foreground">
                      {entry.sectionCode}
                    </span>{" "}
                    ·{" "}
                  </>
                ) : null}
                <span className="font-medium text-foreground">
                  {entry.dayOfWeek.slice(0, 3)}
                </span>{" "}
                {entry.startTime}–{entry.endTime}
                {entry.building ? ` · ${entry.building}` : ""}
                {entry.room ? ` · Room ${entry.room}` : ""}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: "availability",
      header: "Availability",
      render: (group) => {
        const labels = Array.from(
          new Set(
            group.offerings.map((offering) =>
              offering.semester || offering.programmeYear != null
                ? `${
                    offering.programmeYear != null
                      ? `Year ${offering.programmeYear}`
                      : ""
                  }${
                    offering.programmeYear != null && offering.semester
                      ? " · "
                      : ""
                  }${offering.semester ? semesterLabel(offering.semester) : ""}`
                : "",
            ),
          ),
        );

        if (labels.length === 1 && labels[0]) {
          return <span className="text-muted-foreground">{labels[0]}</span>;
        }
        if (labels.some(Boolean)) {
          return <span className="text-muted-foreground">Varies by group</span>;
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: "lecturer",
      header: "Teaching team",
      render: (group) => {
        const teachingTeam = groupTeachingTeam(group);
        const supervision = isSupervisionOfferingGroup(group);

        if (teachingTeam.length === 0) {
          return <span className="text-muted-foreground">Unassigned</span>;
        }

        if (!supervision && teachingTeam.length === 1) {
          return (
            <StatusBadge
              tone="tournament"
              label={teachingTeam[0]!.name}
              icon={false}
            />
          );
        }

        return (
          <div className="flex flex-col gap-1">
            <StatusBadge
              tone="tournament"
              label={`${teachingTeam.length} ${
                supervision
                  ? teachingTeam.length === 1
                    ? "supervisor"
                    : "supervisors"
                  : teachingTeam.length === 1
                    ? "lecturer"
                    : "lecturers"
              }`}
              icon={false}
            />
            <span className="text-xs text-muted-foreground">
              {teachingTeam.map((lecturer) => lecturer.name).join(", ")}
            </span>
          </div>
        );
      },
    },
    {
      key: "capacity",
      header: "Enrolled",
      render: (group) => {
        const enrolled = totalEnrolled(group);
        const capacity = totalCapacity(group);
        return (
          <span
            className={
              enrolled >= capacity ? "text-status-upcoming" : undefined
            }
          >
            {enrolled}/{capacity}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (group) => {
        const statuses = Array.from(
          new Set(group.offerings.map((offering) => offering.status)),
        );
        const status = statuses[0];
        return statuses.length === 1 && status ? (
          <StatusBadge tone={offeringTone(status)} label={status} />
        ) : (
          <StatusBadge tone="neutral" label="Mixed" />
        );
      },
    },
  ];

  const renderClassDetails = (group: OfferingGroup) => {
    const supervision = isSupervisionOfferingGroup(group);

    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {supervision && group.offerings.length === 1 && groupTeachingTeam(group).length > 1 ? (
          <div className="border-b border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Shared final-project offering detected. Create one supervision group per
            supervisor to give each lecturer an independent roster, weekly schedule,
            and session history while keeping the same course specification.
          </div>
        ) : null}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">{supervision ? "Group" : "Class"}</th>
              <th className="px-3 py-2.5">Room & time</th>
              <th className="px-3 py-2.5">
                {supervision ? "Supervisor" : "Primary lecturer"}
              </th>
              {!supervision ? (
                <th className="px-3 py-2.5">Co-lecturer</th>
              ) : null}
              <th className="px-3 py-2.5">Enrolled</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">
                {supervision ? "Group actions" : "Class actions"}
              </th>
            </tr>
          </thead>
          <tbody>
            {group.offerings.map((offering) => {
              const team = offeringTeachingTeam(offering);
              return (
                <tr
                  key={offering.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-3 py-3 font-semibold">
                    {supervision ? "Group" : "Class"} {offering.sectionCode}
                  </td>
                  <td className="px-3 py-3">
                    {offering.meetings.length ? (
                      <div className="space-y-0.5 text-xs">
                        {offering.meetings.map((meeting) => (
                          <div key={meeting.id}>
                            <span className="font-medium">
                              {meeting.dayOfWeek.slice(0, 3)}
                            </span>{" "}
                            {meeting.startTime}–{meeting.endTime}
                            {meeting.building ? ` · ${meeting.building}` : ""}
                            {meeting.room ? ` · Room ${meeting.room}` : ""}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not scheduled</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {supervision ? (
                      team.length ? (
                        team.map((member) => member.name).join(", ")
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )
                    ) : (
                      offering.lecturer?.name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )
                    )}
                  </td>
                  {!supervision ? (
                    <td className="px-3 py-3 text-muted-foreground">
                      {offering.coLecturers.length
                        ? offering.coLecturers
                            .map((lecturer) => lecturer.name)
                            .join(", ")
                        : "—"}
                    </td>
                  ) : null}
                  <td className="px-3 py-3 tabular-nums">
                    {offering.enrolledCount}/{offering.capacity}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge
                      tone={offeringTone(offering.status)}
                      label={offering.status}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleManage(offering)}
                        className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium hover:bg-muted"
                      >
                        <Users className="mr-1 h-3.5 w-3.5" />
                        Roster
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/offerings/${offering.id}/edit`)
                            }
                            aria-label={`Edit ${supervision ? "Group" : "Class"} ${offering.sectionCode}`}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(offering)}
                            aria-label={`Delete ${supervision ? "Group" : "Class"} ${offering.sectionCode}`}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-status-live-bg hover:text-status-live"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Offerings"
        filters={
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Study year</span>
            <select
              aria-label="Filter offerings by study year"
              value={yearFilter}
              onChange={(event) =>
                setYearFilter(event.target.value as OfferingYearFilter)
              }
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {OFFERING_YEAR_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
        addLabel={canManage ? "Add Offering" : undefined}
        onAdd={canManage ? () => router.push("/offerings/new") : undefined}
      />

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
          {offeringsQuery.error instanceof ApiError
            ? offeringsQuery.error.message
            : "Failed to load offerings"}
        </div>
      ) : null}

      <QueryRefreshStatus
        hasData={hasData}
        isPending={offeringsQuery.isPending}
        isFetching={offeringsQuery.isFetching}
        isError={offeringsQuery.isError}
        label="Offerings"
      />

      {!hardQueryError ? (
        <DataTable
          columns={columns}
          rows={visibleGroups}
          getRowId={(group) => group.id}
          isRowExpanded={(group) => expandedGroups.has(group.id)}
          onToggleRow={toggleGroup}
          renderExpandedRow={renderClassDetails}
          actions={[
            {
              key: "course-spec",
              label: "Course Spec",
              icon: <BookOpen className="mr-1 h-3.5 w-3.5" />,
              onClick: (group) => {
                if (group.course) {
                  router.push(`/courses/${group.course.id}/spec`);
                }
              },
            },
          ]}
          loading={!hasData && offeringsQuery.isPending}
          emptyMessage={
            search || yearFilter !== "all"
              ? "No course offerings match your filters."
              : "No offerings yet. Add one to link a course, lecturer and students for a term."
          }
        />
      ) : null}

      <EnrollmentDialog
        open={manage !== null}
        onOpenChange={(open) => {
          if (!open) setManage(null);
        }}
        offering={manage}
        students={students}
        onChanged={applyUpdate}
      />
    </div>
  );
}
