"use client";

import { useCallback, useEffect, useState } from "react";
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
import { statusTone, studentsApi } from "@/lib/students";
import { ApiError } from "@/lib/api";
import { StudentForm, type StudentFormValues } from "./student-form";
import { authApi, useMe } from "@/lib/auth";

export function StudentsClient() {
  const { me } = useMe();
  const [rows, setRows] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await studentsApi.list({ search, activeOnly }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [search, activeOnly]);

  // Debounce list reloads on filter changes.
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const handleSubmit = async (values: StudentFormValues) => {
    setSubmitting(true);
    try {
      if (editing) await studentsApi.update(editing.id, values);
      else await studentsApi.create(values);
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save student");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (student: Student, active: boolean) => {
    // Optimistic flip; revert on failure.
    const next = active ? "Active" : "Inactive";
    setRows((rs) => rs.map((r) => (r.id === student.id ? { ...r, status: next } : r)));
    try {
      await studentsApi.setStatus(student.id, next);
    } catch {
      await load();
    }
  };

  const handleDelete = async (student: Student) => {
    if (!confirm(`Delete ${student.name}?`)) return;
    try {
      await studentsApi.remove(student.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete student");
    }
  };

  const handleInvite = async () => {
    const student = rows.find((row) => row.id === selectedIds[0]);
    if (!student || selectedIds.length !== 1) return;
    if (!confirm(`Send a student portal invitation to ${student.email}?`)) return;
    setInviting(true);
    setError(null);
    setNotice(null);
    try {
      await authApi.createAccount({ name: student.name, email: student.email, role: "student" });
      setNotice(`Portal invitation sent to ${student.email}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send portal invitation");
    } finally {
      setInviting(false);
    }
  };

  const columns: DataTableColumn<Student>[] = [
    {
      key: "name",
      header: "Name",
      render: (s) => <span className="font-medium">{s.name}</span>,
    },
    { key: "studentId", header: "Student ID", render: (s) => s.studentId },
    { key: "email", header: "Email", render: (s) => s.email },
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
          onCheckedChange={(c) => handleToggleStatus(s, c)}
          aria-label={`Toggle ${s.name} active`}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search students…"
        activeOnly={activeOnly}
        onActiveOnlyChange={setActiveOnly}
        addLabel="Add Student"
        onAdd={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      />

      {me?.permissions.includes("accounts:create") ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Select one student to provision their secure portal login.
          </p>
          <Button variant="outline" disabled={selectedIds.length !== 1 || inviting} onClick={handleInvite}>
            <UserPlus />{inviting ? "Inviting…" : "Send portal invite"}
          </Button>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
          {error}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        dragHandle
        selectable
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
        onEdit={(s) => {
          setEditing(s);
          setFormOpen(true);
        }}
        onDelete={handleDelete}
        loading={loading}
        emptyMessage="No students yet. Add your first student."
      />

      <StudentForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  );
}
