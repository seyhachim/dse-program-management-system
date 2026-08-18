"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { offeringsApi, offeringTone } from "@/lib/offerings";
import {
  groupOfferings,
  type OfferingGroup,
} from "@/lib/offering-groups";
import { studentsApi } from "@/lib/students";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { EnrollmentDialog } from "./enrollment-dialog";

/**
 * Roles that may manage any offering's roster without being its assigned
 * lecturer — mirrors the backend's `OFFERING_ROSTER_WIDE_ROLES`
 * (apps/backend/src/plugins/offerings/router.ts). Roster access also needs an
 * ownership check (assigned lecturer/co-lecturer), which a coarse permission
 * string can't express, so this stays role-based rather than permission-based.
 */
const OFFERING_ROSTER_WIDE_ROLES = ["admin", "program_coordinator", "program_secretary"];

export function OfferingsClient() {
  const router = useRouter();
  const [rows, setRows] = useState<OfferingView[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [manage, setManage] = useState<OfferingView | null>(null);

  // Scheduling an offering (create/edit/delete) needs `offerings:manage`
  // (admin, program_coordinator, program_secretary); managing the roster
  // ("Manage") is either one of those same roles, or the offering's assigned
  // lecturer/co-lecturer.
  const { me } = useMe();
  const canManage = me?.permissions.includes("offerings:manage") ?? false;
  const canManageAnyRoster = me?.roles.some((r) => OFFERING_ROSTER_WIDE_ROLES.includes(r)) ?? false;
  const currentUserId = me?.id ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offerings = await offeringsApi.list();

      offerings.sort((a, b) => {
        // 1. Semester
        const semesterCompare = String(a.semester ?? "").localeCompare(
          String(b.semester ?? ""),
          undefined,
          { numeric: true },
        );

        if (semesterCompare !== 0) return semesterCompare;

        // 2. Study year
        const yearCompare = String(a.programmeYear ?? "").localeCompare(
          String(b.programmeYear ?? ""),
          undefined,
          { numeric: true },
        );

        if (yearCompare !== 0) return yearCompare;

        // 3. Course code, then class/section.
        const courseCompare = String(a.course?.code ?? "").localeCompare(
          String(b.course?.code ?? ""),
        );
        return courseCompare || a.sectionCode.localeCompare(b.sectionCode);
      });

      setRows(offerings);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load offerings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reference data for the enrollment dialog.
  useEffect(() => {
    studentsApi
      .list({})
      .then(setStudents)
      .catch(() => setStudents([]));
  }, []);

  const handleDelete = async (offering: OfferingView) => {
    if (!confirm(`Delete ${offering.course?.code} · Class ${offering.sectionCode} · ${offering.term}?`)) return;
    try {
      await offeringsApi.remove(offering.id);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to delete offering",
      );
    }
  };

  const handleManage = (offering: OfferingView) => {
    const isAssigned =
      offering.lecturer?.id === currentUserId ||
      offering.coLecturers.some((l) => l.id === currentUserId);
    if (!canManageAnyRoster && !isAssigned) {
      setError("You can only manage enrollment for offerings you teach.");
      return;
    }
    setError(null);
    setManage(offering);
  };

  // When enrollment changes, patch the row in place and keep the dialog in sync.
  const applyUpdate = (updated: OfferingView) => {
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    setManage((m) => (m && m.id === updated.id ? updated : m));
  };

  const groups = useMemo(() => groupOfferings(rows), [rows]);
  const visibleGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return groups;

    return groups.filter((group) =>
      [
        group.course?.code,
        group.course?.title,
        group.term,
        ...group.offerings.flatMap((offering) => [
          offering.sectionCode,
          offering.lecturer?.name,
          ...offering.coLecturers.map((lecturer) => lecturer.name),
        ]),
      ].some((value) => value?.toLocaleLowerCase().includes(query)),
    );
  }, [groups, search]);

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
      header: "Classes",
      render: (group) => (
        <span className="font-medium">
          {group.offerings.length === 1 ? "Class " : "Classes "}
          {group.offerings.map((offering) => offering.sectionCode).join(", ")}
        </span>
      ),
    },
    {
      key: "schedule",
      header: "Room & Time",
      render: (group) => {
        const scheduled = group.offerings.filter(
          (offering) => offering.meetings.length > 0,
        ).length;
        if (group.offerings.length === 1) {
          const offering = group.offerings[0];
          return offering && offering.meetings.length ? (
            <div className="space-y-0.5 text-xs">
              {offering.meetings.map((meeting) => (
                <div key={meeting.id}>
                  <span className="font-medium text-foreground">
                    {meeting.dayOfWeek.slice(0, 3)}
                  </span>{" "}
                  {meeting.startTime}–{meeting.endTime}
                  {meeting.room ? ` · ${meeting.room}` : ""}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">Not scheduled</span>
          );
        }
        return (
          <span className="text-muted-foreground">
            {scheduled}/{group.offerings.length} classes scheduled
          </span>
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
                ? `${offering.programmeYear != null ? `Year ${offering.programmeYear}` : ""}${
                    offering.programmeYear != null && offering.semester ? " · " : ""
                  }${offering.semester ? semesterLabel(offering.semester) : ""}`
                : "",
            ),
          ),
        );
        return labels.length === 1 && labels[0] ? (
          <span className="text-muted-foreground">
            {labels[0]}
          </span>
        ) : labels.some(Boolean) ? (
          <span className="text-muted-foreground">Varies by class</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      key: "lecturer",
      header: "Lecturer",
      render: (group) => {
        const lecturers = Array.from(
          new Map(
            group.offerings
              .filter((offering) => offering.lecturer)
              .map((offering) => [offering.lecturer!.id, offering.lecturer!]),
          ).values(),
        );
        const primaryLecturer = lecturers[0];
        return (
          <div className="flex flex-col gap-1">
            {lecturers.length === 1 && primaryLecturer ? (
              <StatusBadge
                tone="tournament"
                label={primaryLecturer.name}
                icon={false}
              />
            ) : lecturers.length > 1 ? (
              <>
                <StatusBadge
                  tone="tournament"
                  label={`${lecturers.length} primary lecturers`}
                  icon={false}
                />
                <span className="text-xs text-muted-foreground">
                  {lecturers.map((lecturer) => lecturer.name).join(", ")}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
            {group.offerings.some(
              (offering) => offering.coLecturers.length > 0,
            ) ? (
              <span className="text-xs text-muted-foreground">
                Co-lecturers assigned — view classes
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "capacity",
      header: "Enrolled",
      render: (group) => {
        const enrolled = group.offerings.reduce(
          (total, offering) => total + offering.enrolledCount,
          0,
        );
        const capacity = group.offerings.reduce(
          (total, offering) => total + offering.capacity,
          0,
        );
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
          <StatusBadge
            tone={offeringTone(status)}
            label={status}
          />
        ) : (
          <StatusBadge
            tone="neutral"
            label="Mixed"
          />
        );
      },
    },
  ];

  const renderClassDetails = (group: OfferingGroup) => (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">Class</th>
            <th className="px-3 py-2.5">Room & time</th>
            <th className="px-3 py-2.5">Primary lecturer</th>
            <th className="px-3 py-2.5">Co-lecturer</th>
            <th className="px-3 py-2.5">Enrolled</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5 text-right">Class actions</th>
          </tr>
        </thead>
        <tbody>
          {group.offerings.map((offering) => (
            <tr key={offering.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-3 font-semibold">Class {offering.sectionCode}</td>
              <td className="px-3 py-3">
                {offering.meetings.length ? (
                  <div className="space-y-0.5 text-xs">
                    {offering.meetings.map((meeting) => (
                      <div key={meeting.id}>
                        <span className="font-medium">
                          {meeting.dayOfWeek.slice(0, 3)}
                        </span>{" "}
                        {meeting.startTime}–{meeting.endTime}
                        {meeting.room ? ` · ${meeting.room}` : ""}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Not scheduled</span>
                )}
              </td>
              <td className="px-3 py-3">
                {offering.lecturer?.name ?? (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {offering.coLecturers.length
                  ? offering.coLecturers.map((lecturer) => lecturer.name).join(", ")
                  : "—"}
              </td>
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
                        onClick={() => router.push(`/offerings/${offering.id}/edit`)}
                        aria-label={`Edit Class ${offering.sectionCode}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(offering)}
                        aria-label={`Delete Class ${offering.sectionCode}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-status-live-bg hover:text-status-live"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Offerings"
        addLabel={canManage ? "Add Offering" : undefined}
        onAdd={canManage ? () => router.push("/offerings/new") : undefined}
      />

      {error ? (
        <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
          {error}
        </div>
      ) : null}

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
              if (group.course) router.push(`/courses/${group.course.id}/spec`);
            },
          },
        ]}
        loading={loading}
        emptyMessage={
          search
            ? "No course offerings match your search."
            : "No offerings yet. Add one to link a course, lecturer and students for a term."
        }
      />

      <EnrollmentDialog
        open={manage !== null}
        onOpenChange={(o) => {
          if (!o) setManage(null);
        }}
        offering={manage}
        students={students}
        onChanged={applyUpdate}
      />
    </div>
  );
}
