"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import type { Student } from "@dse-pms/shared-types";
import {
  DataTable,
  Button,
  StatusBadge,
  Switch,
  TableToolbar,
  type DataTableColumn,
} from "@dse-pms/ui";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { statusTone, studentsApi } from "@/lib/students";
import { ApiError } from "@/lib/api";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { StudentForm, type StudentFormValues } from "./student-form";
import { authApi, useMe } from "@/lib/auth";

const PAGE_SIZE = 50;

export function StudentsClient() {
  const { me } = useMe();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [pageCursor, setPageCursor] = useState<string | undefined>(undefined);
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPageCursor(undefined);
      setPreviousCursors([]);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const queryScope = { userId: me?.id ?? "pending" };
  const studentsQuery = useQuery({
    queryKey: protectedQueryKey(
      queryScope,
      "students",
      "page",
      debouncedSearch,
      activeOnly,
      pageCursor ?? "first",
      PAGE_SIZE,
    ),
    queryFn: () =>
      studentsApi.listPage({
        search: debouncedSearch,
        activeOnly,
        cursor: pageCursor,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
    placeholderData: keepPreviousData,
  });
  const rows = studentsQuery.data?.items ?? [];
  const hasData = studentsQuery.data !== undefined;
  const coldLoading = !hasData && studentsQuery.isPending;
  const hardQueryError = !hasData && studentsQuery.isError;

  const handleSubmit = async (values: StudentFormValues) => {
    setSubmitting(true);
    setActionError(null);
    try {
      if (editing) await studentsApi.update(editing.id, values);
      else await studentsApi.create(values);
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to save student");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (student: Student) => {
    setActionError(null);
    try {
      // Phase 7 intentionally keeps list rows compact. Always load the
      // profile-aware detail record before populating the edit form so absent
      // profile fields can never be submitted back as accidental blanks.
      const detail = await studentsApi.get(student.id);
      setEditing(detail);
      setFormOpen(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to load student details");
    }
  };

  const handleToggleStatus = async (student: Student, active: boolean) => {
    setActionError(null);
    try {
      await studentsApi.setStatus(student.id, active ? "Active" : "Inactive");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to update student status");
    }
  };

  const handleDelete = async (student: Student) => {
    if (!confirm(`Delete ${student.name}?`)) return;
    setActionError(null);
    try {
      await studentsApi.remove(student.id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete student");
    }
  };

  const selectedStudent = selectedIds.length === 1
    ? rows.find((row) => row.id === selectedIds[0]) ?? null
    : null;

  const handleInvite = async () => {
    if (!selectedStudent) return;
    if (!selectedStudent.email) {
      setActionError("Add an official email to this student before sending a portal invitation.");
      return;
    }
    if (!confirm(`Send a student portal invitation to ${selectedStudent.email}?`)) return;
    setInviting(true);
    setActionError(null);
    setNotice(null);
    try {
      await authApi.createAccount({
        name: selectedStudent.name,
        email: selectedStudent.email,
        role: "student",
      });
      setNotice(`Portal invitation sent to ${selectedStudent.email}.`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to send portal invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleNextPage = () => {
    const nextCursor = studentsQuery.data?.nextCursor;
    if (!nextCursor || studentsQuery.isFetching) return;
    setSelectedIds([]);
    setPreviousCursors((current) => [...current, pageCursor]);
    setPageCursor(nextCursor);
  };

  const handlePreviousPage = () => {
    if (previousCursors.length === 0 || studentsQuery.isFetching) return;
    const previous = previousCursors[previousCursors.length - 1];
    setSelectedIds([]);
    setPreviousCursors((current) => current.slice(0, -1));
    setPageCursor(previous);
  };

  const columns: DataTableColumn<Student>[] = [
    { key: "name", header: "Name", render: (s) => <span className="font-medium">{s.name}</span> },
    { key: "studentId", header: "Student ID", render: (s) => s.studentId },
    {
      key: "email",
      header: "Email",
      render: (s) => s.email ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (s) => <StatusBadge tone={statusTone(s.status)} label={s.status} />,
    },
    {
      key: "active",
      header: "Active",
      render: (s) => (
        <Switch
          checked={s.status === "Active"}
          onCheckedChange={(checked) => handleToggleStatus(s, checked)}
          aria-label={`Toggle ${s.name} active`}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setSelectedIds([]);
        }}
        searchPlaceholder="Search students…"
        activeOnly={activeOnly}
        onActiveOnlyChange={(checked) => {
          setSelectedIds([]);
          setActiveOnly(checked);
          setPageCursor(undefined);
          setPreviousCursors([]);
        }}
        addLabel="Add Student"
        onAdd={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      />

      {me?.permissions.includes("accounts:create") ? (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {selectedStudent && !selectedStudent.email
              ? "This roster record has no official email yet. Add one before provisioning portal access."
              : "Select one student with an official email to provision their secure portal login."}
          </p>
          <Button
            variant="outline"
            disabled={!selectedStudent?.email || inviting}
            onClick={handleInvite}
          >
            <UserPlus />{inviting ? "Inviting…" : "Send portal invite"}
          </Button>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}

      {actionError ? (
        <div role="alert" className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
          {actionError}
        </div>
      ) : null}

      {hardQueryError ? (
        <div role="alert" className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
          {studentsQuery.error instanceof ApiError ? studentsQuery.error.message : "Failed to load students"}
        </div>
      ) : null}

      <QueryRefreshStatus
        hasData={hasData}
        isPending={studentsQuery.isPending}
        isFetching={studentsQuery.isFetching}
        isError={studentsQuery.isError}
        label="Students"
      />

      {!hardQueryError ? (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(s) => s.id}
            dragHandle
            selectable
            selectedIds={selectedIds}
            onSelectedChange={setSelectedIds}
            onEdit={(student) => {
              void handleEdit(student);
            }}
            onDelete={handleDelete}
            loading={coldLoading}
            emptyMessage="No students yet. Add your first student."
          />
          {hasData ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {previousCursors.length + 1} · up to {PAGE_SIZE} students per page
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={previousCursors.length === 0 || studentsQuery.isFetching}
                  onClick={handlePreviousPage}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!studentsQuery.data?.nextCursor || studentsQuery.isFetching}
                  onClick={handleNextPage}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <StudentForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  );
}
