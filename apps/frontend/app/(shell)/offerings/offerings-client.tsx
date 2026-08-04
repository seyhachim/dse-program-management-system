"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import type { OfferingView, Student } from "@dse-pms/shared-types";
import { semesterLabel } from "@dse-pms/shared-types";
import {
  DataTable,
  StatusBadge,
  TableToolbar,
  type DataTableColumn,
} from "@dse-pms/ui";
import { offeringsApi, offeringTone } from "@/lib/offerings";
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

        // 3. Course code
        return String(a.course?.code ?? "").localeCompare(
          String(b.course?.code ?? ""),
        );
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
    if (!confirm(`Delete ${offering.course?.code} · ${offering.term}?`)) return;
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

  const columns: DataTableColumn<OfferingView>[] = [
    {
      key: "course",
      header: "Course",
      render: (o) =>
        o.course ? (
          <span>
            <span className="font-medium">{o.course.code}</span>{" "}
            <span className="text-muted-foreground">{o.course.title}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "term", header: "Term", render: (o) => o.term },
    {
      key: "availability",
      header: "Availability",
      render: (o) =>
        o.semester || o.programmeYear != null ? (
          <span className="text-muted-foreground">
            {o.programmeYear != null ? `Year ${o.programmeYear}` : ""}
            {o.programmeYear != null && o.semester ? " · " : ""}
            {o.semester ? semesterLabel(o.semester) : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "lecturer",
      header: "Lecturer",
      render: (o) => (
        <div className="flex flex-col gap-1">
          {o.lecturer ? (
            <StatusBadge
              tone="tournament"
              label={o.lecturer.name}
              icon={false}
            />
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
          {o.coLecturers.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              +{o.coLecturers.length} co-lecturer
              {o.coLecturers.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "capacity",
      header: "Enrolled",
      render: (o) => (
        <span
          className={
            o.enrolledCount >= o.capacity ? "text-status-upcoming" : undefined
          }
        >
          {o.enrolledCount}/{o.capacity}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (o) => (
        <StatusBadge tone={offeringTone(o.status)} label={o.status} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <TableToolbar
        search=""
        onSearchChange={() => {}}
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
        rows={rows}
        getRowId={(o) => o.id}
        dragHandle
        actions={[
          {
            key: "manage",
            label: "Manage",
            icon: <Users className="mr-1 h-3.5 w-3.5" />,
            onClick: handleManage,
          },
        ]}
        onEdit={
          canManage ? (o) => router.push(`/offerings/${o.id}/edit`) : undefined
        }
        onDelete={canManage ? handleDelete : undefined}
        loading={loading}
        emptyMessage="No offerings yet. Add one to link a course, lecturer and students for a term."
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
