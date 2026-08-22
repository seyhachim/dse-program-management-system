"use client";

import { useEffect, useMemo, useState } from "react";
import {
  STUDENT_PROMOTION_DECISIONS,
  type StudentProgrammeYear,
  type StudentPromotionApplyResult,
  type StudentPromotionDecision,
  type StudentPromotionPreview,
  type StudentCohortSummaryView,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { studentCohortsApi } from "@/lib/student-cohorts";

const PROGRAMME_ID = "dse";

export function CohortPromotionClient() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("programme:write") ?? false;
  const [cohorts, setCohorts] = useState<StudentCohortSummaryView[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [sourceProgrammeYear, setSourceProgrammeYear] = useState<StudentProgrammeYear>(1);
  const targetProgrammeYear = (sourceProgrammeYear + 1) as StudentProgrammeYear;
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("Year end");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [preview, setPreview] = useState<StudentPromotionPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, StudentPromotionDecision>>({});
  const [result, setResult] = useState<StudentPromotionApplyResult | null>(null);
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
    setDecisions({});
    setResult(null);
  };

  const handlePreview = async () => {
    if (!cohortId || !academicYear || !term || !periodStart || !periodEnd) {
      setError("Select a cohort and complete the academic period before previewing promotion.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const next = await studentCohortsApi.previewPromotion(cohortId, {
        sourceProgrammeYear,
        targetProgrammeYear,
        academicYear,
        term,
        periodStart,
        periodEnd,
      });
      setPreview(next);
      setDecisions(Object.fromEntries(
        next.members.filter((member) => member.eligible).map((member) => [member.membershipId, "Progressed"]),
      ));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to preview cohort promotion");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || !preview.canApply || !canWrite) return;
    if (!confirm(`Record progression for ${preview.eligibleCount} eligible students in ${preview.cohortCode}? This appends permanent academic history.`)) return;
    setLoading(true);
    setError(null);
    try {
      const applied = await studentCohortsApi.applyPromotion(cohortId, {
        sourceProgrammeYear,
        targetProgrammeYear,
        academicYear,
        term,
        periodStart,
        periodEnd,
        decisions: preview.members
          .filter((member) => member.eligible)
          .map((member) => ({
            membershipId: member.membershipId,
            status: decisions[member.membershipId] ?? "Progressed",
            note: "",
          })),
      });
      setResult(applied);
      setPreview(null);
      setDecisions({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to apply cohort promotion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Promote students</h2>
          <p className="text-sm text-muted-foreground">
            Cohort identity never changes. This records an append-only programme-year decision for the selected academic period.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Cohort">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={cohortId}
              onChange={(event) => { setCohortId(event.target.value); resetPreview(); }}
            >
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>{cohort.code} — {cohort.name}</option>
              ))}
            </select>
          </Field>
          <Field label="From programme year">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={sourceProgrammeYear}
              onChange={(event) => { setSourceProgrammeYear(Number(event.target.value) as StudentProgrammeYear); resetPreview(); }}
            >
              <option value={1}>Year 1</option>
              <option value={2}>Year 2</option>
              <option value={3}>Year 3</option>
            </select>
          </Field>
          <Field label="To programme year">
            <Input value={`Year ${targetProgrammeYear}`} disabled />
          </Field>
          <Field label="Academic year">
            <Input placeholder="2026-2027" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); resetPreview(); }} />
          </Field>
          <Field label="Decision period">
            <Input placeholder="Year end" value={term} onChange={(event) => { setTerm(event.target.value); resetPreview(); }} />
          </Field>
          <Field label="Period start">
            <Input type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); resetPreview(); }} />
          </Field>
          <Field label="Period end">
            <Input type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); resetPreview(); }} />
          </Field>
          <div className="flex items-end">
            <Button className="w-full" disabled={loading || !cohortId} onClick={handlePreview}>
              {loading ? "Checking…" : "Preview promotion"}
            </Button>
          </div>
        </div>

        {selectedCohort ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {selectedCohort.code}: intake {selectedCohort.intakeYear}, expected graduation {selectedCohort.expectedGraduationYear}, {selectedCohort._count.memberships} membership(s).
          </p>
        ) : null}
      </section>

      {error ? <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">{error}</div> : null}

      {result ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Promotion recorded</h2>
          <p className="mt-1 text-sm text-muted-foreground">{result.recordsCreated} append-only progression record(s) created for {result.academicYear} / {result.term}.</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {Object.entries(result.summary).map(([status, count]) => <span key={status}>{status}: <strong>{count}</strong></span>)}
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Promotion preview — {preview.cohortCode}</h2>
              <p className="text-sm text-muted-foreground">
                {preview.eligibleCount} eligible · {preview.excludedCount} excluded · Year {preview.sourceProgrammeYear} → Year {preview.targetProgrammeYear}
              </p>
            </div>
            <Button disabled={!preview.canApply || !canWrite || loading} onClick={handleApply}>
              {!canWrite ? "Read-only" : loading ? "Recording…" : "Confirm promotion"}
            </Button>
          </div>

          {preview.blockers.length ? (
            <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg p-3 text-sm text-status-upcoming">
              <strong>Resolve before applying:</strong>
              <ul className="mt-1 list-disc pl-5">{preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Current</th>
                  <th className="px-2 py-2">Decision</th>
                  <th className="px-2 py-2">After decision</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.members.map((member) => {
                  const decision = decisions[member.membershipId] ?? "Progressed";
                  const after = decision === "Progressed"
                    ? `Year ${preview.targetProgrammeYear}`
                    : decision === "Retained"
                      ? `Year ${preview.sourceProgrammeYear}`
                      : "No advancement";
                  return (
                    <tr key={member.membershipId} className="border-b border-border/70">
                      <td className="px-2 py-3"><div className="font-medium">{member.studentName}</div><div className="text-xs text-muted-foreground">{member.studentNumber}</div></td>
                      <td className="px-2 py-3">{member.currentProgrammeYear ? `Year ${member.currentProgrammeYear}` : "—"}</td>
                      <td className="px-2 py-3">
                        {member.eligible ? (
                          <select
                            className="h-9 rounded-md border border-input bg-background px-2"
                            value={decision}
                            onChange={(event) => setDecisions((current) => ({ ...current, [member.membershipId]: event.target.value as StudentPromotionDecision }))}
                          >
                            {STUDENT_PROMOTION_DECISIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        ) : "—"}
                      </td>
                      <td className="px-2 py-3">{member.eligible ? after : "—"}</td>
                      <td className="px-2 py-3 text-muted-foreground">{member.blocker ?? "Ready"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Programme Year 4 is intentionally not promoted here. Programme completion and graduation remain separate official outcomes.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}
