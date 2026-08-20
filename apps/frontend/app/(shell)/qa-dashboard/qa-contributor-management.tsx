"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lecturer, ProgrammeRoleAssignmentView } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const PROGRAMME_ID = "dse";

export function QaContributorManagement() {
  const { me } = useMe();
  const canManage = me?.permissions.includes("qa:manage") ?? false;
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [assignments, setAssignments] = useState<ProgrammeRoleAssignmentView[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) return;
    try {
      setError(null);
      const [lecturerRows, roleRows] = await Promise.all([
        api.get<Lecturer[]>("/api/lecturers"),
        api.get<ProgrammeRoleAssignmentView[]>(`/api/auth/programme-roles?programmeId=${PROGRAMME_ID}`),
      ]);
      setLecturers(lecturerRows);
      setAssignments(roleRows);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load QA contributors");
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignedIds = useMemo(() => new Set(assignments.map((item) => item.userId)), [assignments]);
  const availableLecturers = lecturers.filter((lecturer) => !assignedIds.has(lecturer.id));

  async function assign() {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      setError(null);
      await api.post("/api/auth/programme-roles", {
        userId: selectedUserId,
        programmeId: PROGRAMME_ID,
        role: "qa_contributor",
      });
      setSelectedUserId("");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not assign QA contributor");
    } finally {
      setSaving(false);
    }
  }

  async function remove(userId: string) {
    setSaving(true);
    try {
      setError(null);
      await api.delete(`/api/auth/programme-roles/${userId}?programmeId=${PROGRAMME_ID}&role=qa_contributor`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not remove QA contributor");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) return null;

  return (
    <section className="mx-auto mb-5 max-w-7xl rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-semibold text-foreground">QA Contributors</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add AUN-QA/SAR access to an existing lecturer without changing their lecturer role.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="min-w-64 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select lecturer…</option>
            {availableLecturers.map((lecturer) => (
              <option key={lecturer.id} value={lecturer.id}>{lecturer.name} · {lecturer.email}</option>
            ))}
          </select>
          <Button disabled={!selectedUserId || saving} onClick={() => void assign()}>
            Add contributor
          </Button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 divide-y divide-border rounded-xl border border-border">
        {assignments.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No QA contributors assigned yet.</p>
        ) : assignments.map((assignment) => (
          <div key={assignment.userId} className="flex items-center justify-between gap-4 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{assignment.userName}</p>
              <p className="truncate text-xs text-muted-foreground">{assignment.userEmail} · Lecturer + QA Contributor</p>
            </div>
            <Button variant="outline" size="sm" disabled={saving} onClick={() => void remove(assignment.userId)}>
              Remove QA role
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
