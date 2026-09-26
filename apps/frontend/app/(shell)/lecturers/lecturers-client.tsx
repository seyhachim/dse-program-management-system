"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatLecturerDisplayName,
  type Lecturer,
  type LecturerAccessState,
} from "@dse-pms/shared-types";
import {
  Button,
  DataTable,
  StatusBadge,
  TableToolbar,
  type DataTableColumn,
} from "@dse-pms/ui";
import { lecturersApi } from "@/lib/lecturers";
import { authApi, useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { lecturerAccessPresentation } from "./lecturer-access-status";
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [accountStatuses, setAccountStatuses] = useState<Map<string, LecturerAccessState>>(
    new Map(),
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lecturer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [selectedInviting, setSelectedInviting] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [temporaryCredential, setTemporaryCredential] = useState<TemporaryCredential | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Creating/editing/deleting a lecturer record needs `lecturers:write`
  // (admin, program_coordinator); live Auth status and account provisioning need
  // `accounts:create` (admin only).
  const { me } = useMe();
  const canWrite = me?.permissions.includes("lecturers:write") ?? false;
  const canCreateAccount = me?.permissions.includes("accounts:create") ?? false;

  const loadAccountStatuses = useCallback(
    async (lecturers: Lecturer[]) => {
      if (!canCreateAccount || lecturers.length === 0) {
        setAccountStatuses(new Map());
        return;
      }

      try {
        const result = await authApi.lecturerAccessStatuses(lecturers.map((lecturer) => lecturer.id));
        setAccountStatuses(
          new Map(result.items.map((item) => [item.lecturerId, item.status])),
        );
      } catch {
        setAccountStatuses(
          new Map(lecturers.map((lecturer) => [lecturer.id, "status-unavailable" as const])),
        );
      }
    },
    [canCreateAccount],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lecturers = await lecturersApi.list(search);
      setRows(lecturers);
      await loadAccountStatuses(lecturers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load lecturers");
    } finally {
      setLoading(false);
    }
  }, [loadAccountStatuses, search]);

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

  const handleResendInvite = async (lecturer: Lecturer) => {
    if (!confirm(`Resend the pending DSE invitation to ${lecturer.email}?`)) return;

    setResendingId(lecturer.id);
    setError(null);
    setNotice(null);
    try {
      const result = await authApi.resendInvitation(lecturer.id);
      setNotice(`Fresh invitation sent to ${result.email}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resend lecturer invitation");
    } finally {
      setResendingId(null);
    }
  };

  const handleSendSelected = async () => {
    if (selectedIds.length === 0) return;
    if (selectedIds.length > 20) {
      setError("Select at most 20 lecturers for one invitation batch.");
      return;
    }

    const confirmed = confirm(
      `Send DSE access to the ${selectedIds.length} selected lecturer${selectedIds.length === 1 ? "" : "s"}?\n\n` +
        "Only checked rows will be processed. No-access lecturers receive a first invitation, pending invitations are refreshed, and active accounts are left unchanged.",
    );
    if (!confirmed) return;

    setSelectedInviting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await authApi.sendLecturerInvitationsToSelected(selectedIds);
      setNotice(
        `Selected lecturer delivery complete. Checked ${result.totalLecturers}: ${result.newlyInvited} new invitation${result.newlyInvited === 1 ? "" : "s"}, ${result.resent} refreshed pending invitation${result.resent === 1 ? "" : "s"}, ${result.existingAccountSkipped} active account${result.existingAccountSkipped === 1 ? "" : "s"} unchanged, and ${result.missingLecturerSkipped} missing/wrong-role selection${result.missingLecturerSkipped === 1 ? "" : "s"} skipped.`,
      );
      if (result.failed > 0) {
        setError(
          `${result.failed} selected lecturer${result.failed === 1 ? "" : "s"} failed safely. Retry after resolving the provider or account-data error; successful and active accounts will not be reprovisioned.`,
        );
      }
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to send selected lecturer invitations",
      );
    } finally {
      setSelectedInviting(false);
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
      setSelectedIds((current) => current.filter((id) => id !== lecturer.id));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete lecturer");
    }
  };

  const accountCell = (lecturer: Lecturer) => {
    if (!canCreateAccount) {
      return lecturer.accountAccess === "has_access" ? (
        <StatusBadge tone="live" label="Has access" icon={false} />
      ) : (
        <StatusBadge tone="upcoming" label="No access" icon={false} />
      );
    }

    const status = accountStatuses.get(lecturer.id);
    if (!status) {
      return <StatusBadge tone="neutral" label={loading ? "Checking…" : "Status unavailable"} />;
    }

    const presentation = lecturerAccessPresentation(status);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span title={presentation.description}>
          <StatusBadge tone={presentation.tone} label={presentation.label} />
        </span>
        {status === "no-access" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={invitingId === lecturer.id || selectedInviting}
            onClick={() => handleInvite(lecturer)}
          >
            {invitingId === lecturer.id ? "Inviting…" : "Invite to DSE"}
          </Button>
        ) : null}
        {status === "invitation-pending" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resendingId === lecturer.id || selectedInviting}
            onClick={() => handleResendInvite(lecturer)}
          >
            {resendingId === lecturer.id ? "Resending…" : "Resend invitation"}
          </Button>
        ) : null}
        {status === "active-account" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resettingId === lecturer.id || selectedInviting}
            onClick={() => handleSetTemporaryPassword(lecturer)}
          >
            {resettingId === lecturer.id ? "Setting…" : "Set temporary password"}
          </Button>
        ) : null}
      </div>
    );
  };

  const columns: DataTableColumn<Lecturer>[] = [
    {
      key: "name",
      header: "Name",
      render: (lecturer) => (
        <div>
          <span className="font-medium">
            {formatLecturerDisplayName(lecturer.name, lecturer.honorific)}
          </span>
          {canWrite ? (
            <div>
              <Link
                href={`/lecturers/${lecturer.id}/portfolio`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Review portfolio evidence
              </Link>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "title",
      header: "Academic position",
      render: (lecturer) =>
        lecturer.title ? lecturer.title : <span className="text-muted-foreground">—</span>,
    },
    { key: "email", header: "Email", render: (lecturer) => lecturer.email },
    {
      key: "qualification",
      header: "Qualification",
      render: (lecturer) =>
        lecturer.qualification
          ? lecturer.qualification
          : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "phone",
      header: "Telephone",
      render: (lecturer) =>
        lecturer.phone ? lecturer.phone : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "accountAccess",
      header: "Account",
      render: accountCell,
    },
  ];

  const invitationBusy = Boolean(invitingId || resendingId || selectedInviting);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add each lecturer once. Admins can grant or recover DSE access; program coordinators can
        maintain the academic profile and review professional portfolio evidence without controlling
        login credentials.
      </p>

      <TableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setSelectedIds([]);
        }}
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

      {canCreateAccount ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {selectedIds.length > 20
              ? "Select at most 20 lecturers for one invitation batch."
              : selectedIds.length > 0
                ? `${selectedIds.length} lecturer${selectedIds.length === 1 ? "" : "s"} selected. No-access lecturers will be invited, pending invitations refreshed, and active accounts left unchanged.`
                : "Select up to 20 lecturers for a controlled invitation batch. Account status is verified against Supabase before actions are offered."}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={
              selectedIds.length === 0 ||
              selectedIds.length > 20 ||
              invitationBusy
            }
            onClick={handleSendSelected}
          >
            {selectedInviting ? "Sending selected…" : `Send selected (${selectedIds.length})`}
          </Button>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming"
        >
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
              {temporaryCredential.lecturerName} ({temporaryCredential.email}) must use this once,
              then DSE PMS will require a new personal password.
            </p>
          </div>
          <code className="block select-all break-all rounded-md bg-muted px-3 py-2 text-sm text-foreground">
            {temporaryCredential.password}
          </code>
          <p className="text-xs text-muted-foreground">
            This password is shown only in this browser state. It is not stored by DSE PMS. Share it
            securely, then dismiss it.
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
        getRowId={(lecturer) => lecturer.id}
        selectable={canCreateAccount}
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
        onEdit={
          canWrite
            ? (lecturer) => {
                setEditing(lecturer);
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
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
        onSubmit={handleSubmit}
        submitting={submitting}
        canGrantAccess={canCreateAccount}
      />
    </div>
  );
}
