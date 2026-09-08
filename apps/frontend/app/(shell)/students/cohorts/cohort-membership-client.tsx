"use client";

import { useEffect, useMemo, useState } from "react";
import type { Student, StudentCohortSummaryView } from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  studentCohortsApi,
  type StudentCohortDetailView,
} from "@/lib/student-cohorts";
import { studentsApi } from "@/lib/students";

const PROGRAMME_ID = "dse";

export function CohortMembershipClient() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("students:write") ?? false;
  const [cohorts, setCohorts] = useState<StudentCohortSummaryView[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [detail, setDetail] = useState<StudentCohortDetailView | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [joinedAt, setJoinedAt] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCohort = useMemo(
    () => cohorts.find((cohort) => cohort.id === cohortId) ?? null,
    [cohorts, cohortId],
  );
  const assignedStudentIds = useMemo(
    () => new Set(detail?.memberships.map((membership) => membership.student.id) ?? []),
    [detail],
  );
  const activeMemberships = useMemo(
    () => detail?.memberships.filter((membership) => !membership.exitedAt) ?? [],
    [detail],
  );

  const loadCohorts = async (preferredId?: string) => {
    const rows = await studentCohortsApi.list(PROGRAMME_ID);
    setCohorts(rows);
    const nextId = preferredId || cohortId || rows[0]?.id || "";
    setCohortId(nextId);
    return nextId;
  };

  const loadDetail = async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetail(await studentCohortsApi.get(id));
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadCohorts()
      .then((id) => loadDetail(id))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load cohort membership data"))
      .finally(() => setLoading(false));
    // Initial load only; cohort changes are handled explicitly below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeCohort = async (id: string) => {
    setCohortId(id);
    setSelected(new Set());
    setNotice(null);
    setError(null);
    setLoading(true);
    try {
      await loadDetail(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load cohort members");
    } finally {
      setLoading(false);
    }
  };

  const searchStudents = async () => {
    const value = query.trim();
    if (!value) {
      setError("Enter a student name or student ID to search.");
      return;
    }
    setSearching(true);
    setError(null);
    setNotice(null);
    try {
      setResults(await studentsApi.list({ search: value, activeOnly: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to search students");
    } finally {
      setSearching(false);
    }
  };

  const toggleStudent = (studentId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const assignStudents = async () => {
    if (!canWrite || !cohortId) return;
    if (!joinedAt) {
      setError("Enter the official cohort joining date before assigning students.");
      return;
    }
    const studentIds = [...selected].filter((studentId) => !assignedStudentIds.has(studentId));
    if (!studentIds.length) {
      setError("Select at least one unassigned student.");
      return;
    }
    if (!confirm(`Assign ${studentIds.length} student(s) to ${selectedCohort?.name ?? "this cohort"} using ${joinedAt} as the official joining date?`)) return;

    setLoading(true);
    setError(null);
    setNotice(null);
    let assigned = 0;
    const failures: string[] = [];
    try {
      for (const studentId of studentIds) {
        const student = results.find((row) => row.id === studentId);
        try {
          await studentCohortsApi.addMembership(cohortId, {
            studentId,
            joinedAt,
            note: note.trim(),
          });
          assigned += 1;
        } catch (err) {
          const message = err instanceof ApiError ? err.message : "Could not assign student";
          failures.push(`${student?.studentId ?? studentId}: ${message}`);
        }
      }

      setSelected(new Set());
      await loadDetail(cohortId);
      await loadCohorts(cohortId);
      setNotice(`${assigned} student${assigned === 1 ? "" : "s"} assigned to ${selectedCohort?.name ?? "the cohort"}.`);
      if (failures.length) {
        setError(`${failures.length} assignment(s) were not applied: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "; …" : ""}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Cohort membership</h2>
        <p className="text-sm text-muted-foreground">
          Assign students only from official intake records. Membership is permanent academic history and is not inferred from attendance or enrolment.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Cohort">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={cohortId}
            disabled={loading || !cohorts.length}
            onChange={(event) => void changeCohort(event.target.value)}
          >
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>{cohort.code} — {cohort.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Official joining date">
          <Input type="date" value={joinedAt} onChange={(event) => setJoinedAt(event.target.value)} />
        </Field>
        <Field label="Membership note (optional)">
          <Input
            placeholder="e.g. Verified from 2025 intake list"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>

      {selectedCohort ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <strong>{selectedCohort.name}</strong> · intake {selectedCohort.intakeYear} · expected graduation {selectedCohort.expectedGraduationYear} · {activeMemberships.length} active member(s)
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Search by student ID or name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void searchStudents(); }}
        />
        <Button disabled={searching} onClick={() => void searchStudents()}>
          {searching ? "Searching…" : "Search students"}
        </Button>
      </div>

      {results.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                <th className="w-12 px-3 py-2">Add</th>
                <th className="px-3 py-2">Student ID</th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((student) => {
                const alreadyAssigned = assignedStudentIds.has(student.id);
                return (
                  <tr key={student.id} className="border-b border-border/70 last:border-b-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Assign ${student.name}`}
                        checked={selected.has(student.id)}
                        disabled={alreadyAssigned || !canWrite}
                        onChange={() => toggleStudent(student.id)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{student.studentId}</td>
                    <td className="px-3 py-2">{student.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{alreadyAssigned ? "Already in cohort" : student.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : query.trim() && !searching ? (
        <p className="text-sm text-muted-foreground">Search for students to assign them to the selected cohort.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!canWrite || loading || selected.size === 0 || !joinedAt} onClick={() => void assignStudents()}>
          {!canWrite ? "Read-only" : loading ? "Assigning…" : `Assign selected (${selected.size})`}
        </Button>
        <span className="text-xs text-muted-foreground">
          A joining date is required; the PMS will not guess it from the intake year.
        </span>
      </div>

      {notice ? <div className="rounded-lg border border-status-live bg-status-live-bg px-4 py-3 text-sm text-status-live">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">{error}</div> : null}

      {detail && detail.memberships.length ? (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">View {detail.memberships.length} membership record(s)</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2">Student ID</th>
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Joined</th>
                  <th className="px-2 py-2">Membership</th>
                </tr>
              </thead>
              <tbody>
                {detail.memberships.map((membership) => (
                  <tr key={membership.id} className="border-b border-border/70 last:border-b-0">
                    <td className="px-2 py-2 font-medium">{membership.student.studentId}</td>
                    <td className="px-2 py-2">{membership.student.name}</td>
                    <td className="px-2 py-2">{membership.joinedAt.slice(0, 10)}</td>
                    <td className="px-2 py-2 text-muted-foreground">{membership.exitedAt ? `Closed ${membership.exitedAt.slice(0, 10)}` : "Active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}
