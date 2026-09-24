"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatLecturerDisplayName, type Lecturer } from "@dse-pms/shared-types";
import { Button, DataTable, StatusBadge, TableToolbar, type DataTableColumn } from "@dse-pms/ui";
import { lecturersApi } from "@/lib/lecturers";
import { authApi, useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { LecturerAvatar } from "@/components/lecturer-avatar";
import { LecturerForm, type LecturerFormValues } from "./lecturer-form";

interface TemporaryCredential {
  lecturerName: string;
  email: string;
  password: string;
}

export function LecturersClient() {
  const [rows, setRows] = useState<Lecturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lecturer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [temporaryCredential, setTemporaryCredential] = useState<TemporaryCredential | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Creating/editing/deleting a lecturer record needs `lecturers:write`
  // (admin, program_coordinator); account provisioning/recovery needs
  // `accounts:create` (admin only).
  const { me } = useMe();
  const canWrite = me?.permissions.includes("lecturers:write") ?? false;
  const canCreateAccount = me?.permissions.includes("accounts:create") ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await lecturersApi.list(search));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load lecturers");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const handleSubmit = async (values: LecturerFormValues, giveDseAccess: boolean) => {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (editing) {
        await lecturersApi.update(editing.id, values);
        setNotice(`${values.name} updated.`);
      } else if (giveDseAccess) {
        const account = await authApi.createAccount({
          name: values.name,
          email: values.email,
          role: "lecturer",
        });
        await lecturersApi.update(account.id, values);
        setNotice(`Lecturer added and invitation sent to ${values.email}.`);
      } else {
        await lecturersApi.create(values);
        setNotice(`${values.name} added without DSE access.`);
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save lecturer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvite = async (lecturer: Lecturer) => {
    setInvitingId(lecturer.id);
    setError(null);
    setNotice(null);
    try {
      await authApi.createAccount({ name: lecturer.name, email: lecturer.email, role: "lecturer" });
      setNotice(`Invitation sent to ${lecturer.email}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite lecturer");
    } finally {
      setInvitingId(null);
    }
  };

  const handleSetTemporaryPassword = async (lecturer: Lecturer) => {
    const confirmed = window.confirm(
      `Set a new temporary password for ${lecturer.name}? Their current password will stop working immediately and they must choose a new password at the next login.`,
    );
    if (!confirmed) return;

    setResettingId(lecturer.id);
    setError(null);
    setNotice(null);
    setTemporaryCredential(null);
    try {
      const result = await authApi.setTemporaryPassword(lecturer.id);
      setTemporaryCredential({
        lecturerName: lecturer.name,
        email: result.email,
        password: result.temporaryPassword,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set temporary password");
    } finally {
      setResettingId(null);
    }
  };

  const handleCopyTemporaryPassword = async () => {
    if (!temporaryCredential) return;
    try {
      await navigator.clipboard.writeText(temporaryCredential.password);
      setNotice("Temporary password copied. Share it with the lecturer through a secure channel.");
    } catch {
      setNotice("Copy was not available. Select the temporary password and copy it manually.");
    }
  };

  const handleDelete = async (lecturer: Lecturer) => {
    if (!confirm(`Delete ${lecturer.name}?`)) return;
    setError(null);
    setNotice(null);
    try {
      await lecturersApi.remove(lecturer.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete lecturer");
    }
  };

  const columns: DataTableColumn<Lecturer>[] = [
    {
      key: "name",
      header: "Name",
      render: (l) => (
        <div className="flex items-center gap-3">
          <LecturerAvatar name={l.name} imageUrl={l.profileImageUrl} size="sm" />
          <div>
            <span className="font-medium">{formatLecturerDisplayName(l.name, l.honorific)}</span>
            {canWrite ? (
              <div>
                <Link href={`/lecturers/${l.id}/portfolio`} className="text-xs font-medium text-primary hover:underline">
                  Review portfolio evidence
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "title",
      header: "Academic position",
      render: (l) => (l.title ? l.title : <span className="text-muted-foreground">—</span>),
    },
    { key: "email", header: "Email", render: (l) => l.email },
    {
      key: "qualification",
      header: "Qualification",
      render: (l) =>
        l.qualification ? l.qualification : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "phone",
      header: "Telephone",
      render: (l) => (l.phone ? l.phone : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "accountAccess",
      header: "Account",
      render: (l) =>
        l.accountAccess === "has_access" ? (
          <div className="flex items-center gap-2">
            <StatusBadge tone="live" label="Has access" icon={false} />
            {canCreateAccount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resettingId === l.id}
                onClick={() => handleSetTemporaryPassword(l)}
              >
                {resettingId === l.id ? "Setting…" : "Set temporary password"}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <StatusBadge tone="upcoming" label="No access" icon={false} />
            {canCreateAccount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={invitingId === l.id}
                onClick={() => handleInvite(l)}
              >
                {invitingId === l.id ? "Inviting…" : "Invite to DSE"}
              </Button>
            ) : null}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add each lecturer once. Admins can grant or recover DSE access; program coordinators can maintain the academic profile and review professional portfolio evidence without controlling login credentials.
      </p>

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search lecturers…"
        addLabel={canWrite ? "Add Lecturer" : undefined}
        onAdd={
          canWrite
            ? () => {
                setEditing(null);
                setFormOpen(true);
              }
            : undefined
        }
      />

      {error ? (
        <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-status-live bg-status-live-bg px-4 py-2 text-sm text-status-live">
          {notice}
        </div>
      ) : null}

      {temporaryCredential ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4" role="status">
          <div>
            <p className="font-medium text-foreground">Temporary password created</p>
            <p className="text-sm text-muted-foreground">
              {temporaryCredential.lecturerName} ({temporaryCredential.email}) must use this once, then DSE PMS will require a new personal password.
            </p>
          </div>
          <code className="block select-all break-all rounded-md bg-muted px-3 py-2 text-sm text-foreground">
            {temporaryCredential.password}
          </code>
          <p className="text-xs text-muted-foreground">
            This password is shown only in this browser state. It is not stored by DSE PMS. Share it securely, then dismiss it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={handleCopyTemporaryPassword}>
              Copy password
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTemporaryCredential(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(l) => l.id}
        onEdit={
          canWrite
            ? (l) => {
                setEditing(l);
                setFormOpen(true);
              }
            : undefined
        }
        onDelete={canWrite ? handleDelete : undefined}
        loading={loading}
        emptyMessage="No lecturers yet. Add your first lecturer."
      />

      <LecturerForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        onSubmit={handleSubmit}
        submitting={submitting}
        canGrantAccess={canCreateAccount}
      />
    </div>
  );
}
