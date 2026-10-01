"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  StudentCohortSummaryView,
  StudentCurrentStudyYearApplyResult,
  StudentCurrentStudyYearPreview,
  StudentProgrammeYear,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { studentCohortsApi } from "@/lib/student-cohorts";

const PROGRAMME_ID = "dse";
const PROGRAMME_YEARS: StudentProgrammeYear[] = [1, 2, 3, 4];

export function CohortCurrentStudyYearClient() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("programme:write") ?? false;
  const [cohorts, setCohorts] = useState<StudentCohortSummaryView[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [defaultProgrammeYear, setDefaultProgrammeYear] = useState<StudentProgrammeYear>(1);
  const [academicYear, setAcademicYear] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [preview, setPreview] = useState<StudentCurrentStudyYearPreview | null>(null);
  const [assignments, setAssignments] = useState<Record<string, StudentProgrammeYear>>({});
  const [result, setResult] = useState<StudentCurrentStudyYearApplyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentCohortsApi.list(PROGRAMME_ID)
      .then((rows) => {
        setCohorts(rows);
        setCohortId((current) => current || rows[0]?.id || "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load student cohorts"));
  }, []);

  const selectedCohort = useMemo(
    () => cohorts.find((cohort) => cohort.id === cohortId) ?? null,
    [cohorts, cohortId],
  );

  const resetPreview = () => {
    setPreview(null);
    setAssignments({});
    setResult(null);
  };

  const handlePreview = async () => {
    if (!cohortId || !academicYear || !periodStart || !periodEnd) {
      setError("Select a cohort and complete the academic-year period before previewing.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const next = await studentCohortsApi.previewCurrentStudyYear(cohortId, {
        defaultProgrammeYear,
        academicYear,
        periodStart,
        periodEnd,
      });
      setPreview(next);
      setAssignments(Object.fromEntries(
        next.members
          .filter((member) => member.eligible && member.proposedProgrammeYear !== null)
          .map((member) => [member.membershipId, member.proposedProgrammeYear as StudentProgrammeYear]),
      ));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to preview current study year initialization");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview?.canApply || !canWrite) return;
    const eligible = preview.members.filter((member) => member.eligible);
    if (eligible.some((member) => assignments[member.membershipId] === undefined)) {
      setError("Choose a programme year for every eligible student before confirming.");
      return;
    }
    if (!confirm(
      `Initialize current study year for ${eligible.length} student(s) in ${preview.cohortCode}? This appends permanent academic history and does not infer from intake year.`,
    )) return;

    setLoading(true);
    setError(null);
    try {
      const applied = await studentCohortsApi.applyCurrentStudyYear(cohortId, {
        defaultProgrammeYear,
        academicYear,
        periodStart,
        periodEnd,
        assignments: eligible.map((member) => ({
          membershipId: member.membershipId,
          programmeYear: assignments[member.membershipId]!,
          note: "",
        })),
      });
      setResult(applied);
      setPreview(null);
      setAssignments({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to initialize current study year");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Initialize current study year</h2>
          <p className="text-sm text-muted-foreground">
            Use this only when a cohort has no explicit study-year context for the selected academic year.
            PMS never derives programme year from cohort intake.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <CurrentYearField label="Cohort">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={cohortId}
              onChange={(event) => { setCohortId(event.target.value); resetPreview(); }}
            >
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>{cohort.code} — {cohort.name}</option>
              ))}
            </select>
          </CurrentYearField>
          <CurrentYearField label="Default study year">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={defaultProgrammeYear}
              onChange={(event) => {
                setDefaultProgrammeYear(Number(event.target.value) as StudentProgrammeYear);
                resetPreview();
              }}
            >
              {PROGRAMME_YEARS.map((year) => <option key={year} value={year}>Year {year}</option>)}
            </select>
          </CurrentYearField>
          <CurrentYearField label="Academic year">
            <Input
              placeholder="2026-2027"
              value={academicYear}
              onChange={(event) => { setAcademicYear(event.target.value); resetPreview(); }}
            />
          </CurrentYearField>
          <CurrentYearField label="Period start">
            <Input
              type="date"
              value={periodStart}
              onChange={(event) => { setPeriodStart(event.target.value); resetPreview(); }}
            />
          </CurrentYearField>
          <CurrentYearField label="Period end">
            <Input
              type="date"
              value={periodEnd}
              onChange={(event) => { setPeriodEnd(event.target.value); resetPreview(); }}
            />
          </CurrentYearField>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {selectedCohort
              ? `${selectedCohort.code}: intake ${selectedCohort.intakeYear}; ${selectedCohort._count.memberships} membership(s). Intake is context only, not a study-year rule.`
              : "Select a cohort to review its members."}
          </p>
          <Button disabled={loading || !cohortId} onClick={handlePreview}>
            {loading ? "Checking…" : "Preview current study year"}
          </Button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">
          {error}
        </div>
      ) : null}

      {result ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Current study year recorded</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.recordsCreated} append-only Continuing record(s) created for {result.academicYear} · {result.term}.
          </p>
        </section>
      ) : null}

      {preview ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Initialization preview — {preview.cohortCode}</h2>
              <p className="text-sm text-muted-foreground">
                {preview.eligibleCount} eligible · {preview.excludedCount} excluded · default Year {preview.defaultProgrammeYear}
              </p>
            </div>
            <Button disabled={!preview.canApply || !canWrite || loading} onClick={handleApply}>
              {!canWrite ? "Read-only" : loading ? "Recording…" : "Confirm current study year"}
            </Button>
          </div>

          {!preview.canApply ? (
            <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg p-3 text-sm text-status-upcoming">
              No students need initialization for this academic year.
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Latest history</th>
                  <th className="px-2 py-2">Current study year</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.members.map((member) => {
                  const latest = member.latestAcademicYear
                    ? [
                        member.latestAcademicYear,
                        member.latestProgrammeYear ? `Year ${member.latestProgrammeYear}` : "year unknown",
                        member.latestStatus,
                      ].filter(Boolean).join(" · ")
                    : "No progression history";
                  return (
                    <tr key={member.membershipId} className="border-b border-border/70">
                      <td className="px-2 py-3">
                        <div className="font-medium">{member.studentName}</div>
                        <div className="text-xs text-muted-foreground">{member.studentNumber ?? "No student number"}</div>
                      </td>
                      <td className="px-2 py-3">
                        <div>{latest}</div>
                        {member.latestTerm ? <div className="text-xs text-muted-foreground">{member.latestTerm}</div> : null}
                      </td>
                      <td className="px-2 py-3">
                        {member.eligible ? (
                          <select
                            className="h-9 rounded-md border border-input bg-background px-2"
                            value={assignments[member.membershipId] ?? member.proposedProgrammeYear ?? defaultProgrammeYear}
                            disabled={member.programmeYearLockedByHistory}
                            onChange={(event) => setAssignments((current) => ({
                              ...current,
                              [member.membershipId]: Number(event.target.value) as StudentProgrammeYear,
                            }))}
                          >
                            {PROGRAMME_YEARS.map((year) => <option key={year} value={year}>Year {year}</option>)}
                          </select>
                        ) : "—"}
                        {member.programmeYearLockedByHistory ? (
                          <div className="mt-1 text-xs text-muted-foreground">Constrained by prior progression outcome</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">{member.blocker ?? "Ready"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Confirmation appends neutral Continuing records only. It does not promote, retain, enroll, graduate, or rewrite any prior academic record.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function CurrentYearField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
