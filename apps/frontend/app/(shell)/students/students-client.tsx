"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MailPlus, UserPlus } from "lucide-react";
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
import { portalAccessPresentation } from "./student-portal-access-status";

const PAGE_SIZE = 50;

type InviteEligibleStudent = Student & { email: string; status: "Active" };

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
  const [bulkInviting, setBulkInviting] = useState(false);
  const [resending, setResending] = useState(false);
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
  const canAdvancePage =
    !studentsQuery.isFetching &&
    !studentsQuery.isPlaceholderData &&
    !studentsQuery.isError &&
    Boolean(studentsQuery.data?.nextCursor);
  const canManagePortalAccess = Boolean(me?.permissions.includes("accounts:create"));
  const portalStudentIds = rows.map((student) => student.id);
  const portalAccessQuery = useQuery({
    queryKey: protectedQueryKey(
      queryScope,
      "students",
      "portal-access-status",
      portalStudentIds.join(","),
    ),
    queryFn: () => authApi.studentPortalAccessStatuses(portalStudentIds),
    enabled: Boolean(me?.id && canManagePortalAccess && portalStudentIds.length > 0),
    staleTime: QUERY_STALE_MS.operational,
  });
  const portalAccessByStudentId = new Map(
    (portalAccessQuery.data?.items ?? []).map((item) => [item.studentId, item.status]),
  );

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
      if (canManagePortalAccess) await portalAccessQuery.refetch();
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

  const validateSelectedInviteStudent = (
    student: Student | null,
  ): student is InviteEligibleStudent => {
    if (!student) return false;
    if (student.status !== "Active") {
      setActionError("Only Active students can receive Student Portal invitations.");
      return false;
    }
    if (!student.email) {
      setActionError("Add an official email to this student before sending a portal invitation.");
      return false;
    }
    return true;
  };

  const handleInvite = async () => {
    if (!validateSelectedInviteStudent(selectedStudent)) return;
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
      await portalAccessQuery.refetch();
      setNotice(`Portal invitation sent to ${selectedStudent.email}.`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to send portal invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleSendPortalAccessToAll = async () => {
    const confirmed = confirm(
      "Send Student Portal access to all students who still need an invitation?\n\n" +
      "This checks the full Student database, not only this page or filter.\n\n" +
      "• Active students with an email and no portal account receive their first invitation.\n" +
      "• Pending invitations are replaced with a fresh email; the old pending link becomes invalid.\n" +
      "• Existing/activated accounts are not changed.\n" +
      "• Inactive students or students without email are skipped.",
    );
    if (!confirmed) return;

    setBulkInviting(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await authApi.sendStudentPortalAccessToAll();
      await portalAccessQuery.refetch();
      // #1103 keeps the old #1101 aggregate fields during rolling deploys. These
      // fallbacks also keep a newly deployed frontend useful against an older
      // backend for the short Vercel/Render deploy-skew window.
      const compatible = result as Partial<typeof result>;
      const newlyInvited = compatible.newlyInvited ?? compatible.invited ?? 0;
      const resent = compatible.resent ?? 0;
      const existingAccountSkipped = compatible.existingAccountSkipped ?? 0;
      const ineligibleSkipped = compatible.ineligibleSkipped ?? compatible.skipped ?? 0;

      setNotice(
        `Portal access delivery complete. Checked ${result.totalStudents} students: ${newlyInvited} new invitation${newlyInvited === 1 ? "" : "s"}, ${resent} refreshed pending invitation${resent === 1 ? "" : "s"}, ${existingAccountSkipped} existing account${existingAccountSkipped === 1 ? "" : "s"} unchanged, and ${ineligibleSkipped} inactive/no-email record${ineligibleSkipped === 1 ? "" : "s"} skipped.`,
      );
      if (result.failed > 0) {
        setActionError(
          `${result.failed} student${result.failed === 1 ? "" : "s"} failed safely. Run “Send portal access to all” again after resolving provider or student-account data errors; successful and activated accounts will not be reprovisioned.`,
        );
      }
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to send Student Portal access emails",
      );
    } finally {
      setBulkInviting(false);
    }
  };

  const handleResendInvite = async () => {
    if (!validateSelectedInviteStudent(selectedStudent)) return;
    if (!confirm(`Resend the pending Student Portal invitation to ${selectedStudent.email}?`)) return;
    setResending(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await authApi.resendStudentInvitation(selectedStudent.id);
      await portalAccessQuery.refetch();
      setNotice(`Fresh portal invitation sent to ${result.email}.`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to resend the student portal invitation",
      );
    } finally {
      setResending(false);
    }
  };

  const handleNextPage = () => {
    const nextCursor = studentsQuery.data?.nextCursor;
    if (!nextCursor || !canAdvancePage) return;
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
    {
      key: "studentId",
      header: "Student ID",
      render: (s) => s.studentId ?? <span className="text-muted-foreground">Pending ID</span>,
    },
    { key: "category", header: "Category", render: (s) => s.category },
    {
      key: "email",
      header: "Email",
      render: (s) => s.email ?? <span className="text-muted-foreground">—</span>,
    },
    ...(canManagePortalAccess
      ? [{
          key: "portalAccess",
          header: "Portal Access",
          render: (student: Student) => {
            const status = portalAccessByStudentId.get(student.id);
            if (!status) {
              return (
                <StatusBadge
                  tone={portalAccessQuery.isError ? "danger" : "neutral"}
                  label={portalAccessQuery.isError ? "Status unavailable" : "Checking…"}
                />
              );
            }
            const presentation = portalAccessPresentation(status);
            return (
              <span title={presentation.description}>
                <StatusBadge tone={presentation.tone} label={presentation.label} />
              </span>
            );
          },
        } satisfies DataTableColumn<Student>]
      : []),
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

  const inviteBusy = inviting || bulkInviting || resending;
  const selectedInviteEligible = Boolean(
    selectedStudent?.email && selectedStudent.status === "Active",
  );

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

      {canManagePortalAccess ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {selectedStudent && selectedStudent.status !== "Active"
              ? "Portal invitations are available only after the student is Active."
              : selectedStudent && !selectedStudent.email
                ? "This roster record has no official email yet. Add one before provisioning portal access."
                : selectedStudent
                  ? "Send the first portal invitation, or resend only when a previous pending invitation expired. Activated accounts are never rotated by resend."
                  : "Select one Active student with an official email, or send portal access across the full PMS roster. The Portal Access column shows who is pending, active, not invited, or needs attention."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={inviteBusy}
              onClick={handleSendPortalAccessToAll}
            >
              <MailPlus />{bulkInviting ? "Sending to all…" : "Send portal access to all"}
            </Button>
            <Button
              variant="outline"
              disabled={!selectedInviteEligible || inviteBusy}
              onClick={handleInvite}
            >
              <UserPlus />{inviting ? "Inviting…" : "Send portal invite"}
            </Button>
            <Button
              variant="outline"
              disabled={!selectedInviteEligible || inviteBusy}
              onClick={handleResendInvite}
            >
              {resending ? "Resending…" : "Resend expired invite"}
            </Button>
          </div>
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
                  disabled={!canAdvancePage}
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
