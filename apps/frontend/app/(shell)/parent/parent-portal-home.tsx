"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  GraduationCap,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type {
  GuardianLinkedStudentView,
  ParentAcademicProgressSummary,
  ParentAttendanceSummary,
} from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import {
  academicStatusLabel,
  guardianScopeLabel,
  parentPortalApi,
  relationshipLabel,
} from "@/lib/parent-portal";

function LoadingState() {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-5xl items-center justify-center p-6">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your parent portal…
      </p>
    </main>
  );
}

function MessageState({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-3xl items-center justify-center p-6">
      <section className="w-full rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
      </section>
    </main>
  );
}

function ProjectionLoading() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
      Loading the latest authorised summary…
    </div>
  );
}

export function ParentPortalHome() {
  const [students, setStudents] = useState<GuardianLinkedStudentView[] | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string>("");
  const [attendance, setAttendance] = useState<ParentAttendanceSummary | null>(null);
  const [academic, setAcademic] = useState<ParentAcademicProgressSummary | null>(null);
  const [projectionLoading, setProjectionLoading] = useState(false);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await parentPortalApi.linkedStudents();
      setStudents(next);
      setForbidden(false);
      setError(null);
      setSelectedRelationshipId((current) => {
        if (next.some((student) => student.relationshipId === current)) return current;
        return next[0]?.relationshipId ?? "";
      });
      setRefreshTick((value) => value + 1);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 403) {
        setForbidden(true);
        setStudents([]);
        setError(null);
        return;
      }
      setError(requestError instanceof Error ? requestError.message : "Could not load the parent portal.");
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const selected = useMemo(
    () => students?.find((student) => student.relationshipId === selectedRelationshipId) ?? null,
    [students, selectedRelationshipId],
  );

  useEffect(() => {
    if (!selected) {
      setAttendance(null);
      setAcademic(null);
      setProjectionError(null);
      setProjectionLoading(false);
      return;
    }

    let cancelled = false;
    const loadProjections = async () => {
      setProjectionLoading(true);
      setProjectionError(null);
      try {
        const [attendanceResult, academicResult] = await Promise.all([
          selected.accessScopes.includes("attendance")
            ? parentPortalApi.attendance(selected.relationshipId)
            : Promise.resolve(null),
          selected.accessScopes.includes("academic_status")
            ? parentPortalApi.academicProgress(selected.relationshipId)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setAttendance(attendanceResult);
        setAcademic(academicResult);
      } catch (requestError) {
        if (cancelled) return;
        setAttendance(null);
        setAcademic(null);
        setProjectionError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load the latest authorised summary.",
        );
      } finally {
        if (!cancelled) setProjectionLoading(false);
      }
    };
    void loadProjections();
    return () => {
      cancelled = true;
    };
  }, [selected, refreshTick]);

  if (students === null && !error) return <LoadingState />;
  if (forbidden) {
    return <MessageState title="Parent / Guardian access required" description="This area is available only to an authenticated parent or guardian account with a verified student relationship." />;
  }
  if (error) {
    return <MessageState title="We could not load your portal" description="Please refresh and try again. Protected information is not cached on this page." />;
  }
  if (!students?.length) {
    return <MessageState title="No active student relationship" description="There is no active verified student relationship available to this account. If you expected access, please contact the programme office." />;
  }
  if (!selected) return <LoadingState />;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 overflow-y-auto p-4 pb-10 sm:p-6">
      <header className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm sm:p-6">
        <p className="text-sm opacity-80">Parent / Guardian Portal</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{selected.studentName}</h1>
            <p className="mt-1 text-sm opacity-85">
              {relationshipLabel(selected.relationshipType)} · Programme {selected.programmeId}
            </p>
          </div>
          {students.length > 1 ? (
            <label className="text-sm font-medium" htmlFor="linked-student">
              Linked student
              <select
                id="linked-student"
                value={selectedRelationshipId}
                onChange={(event) => setSelectedRelationshipId(event.target.value)}
                className="mt-1 block min-w-60 rounded-lg border border-primary-foreground/25 bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {students.map((student) => (
                  <option key={student.relationshipId} value={student.relationshipId}>
                    {student.studentName}{students.some((other) => other !== student && other.studentId === student.studentId) ? ` · ${student.programmeId}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="student-summary" className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-2 text-primary"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h2 id="student-summary" className="font-semibold">Student summary</h2>
              <p className="text-sm text-muted-foreground">Verified relationship information</p>
            </div>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Student</dt><dd className="font-medium text-right">{selected.studentName}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Student ID</dt><dd className="font-medium text-right">{selected.studentInstitutionalId}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">Relationship</dt><dd className="font-medium text-right">{relationshipLabel(selected.relationshipType)}</dd></div>
          </dl>
        </article>

        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-2 text-primary"><UsersRound className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h2 className="font-semibold">Information available to you</h2>
              <p className="text-sm text-muted-foreground">Based on your current verified access scopes</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {selected.accessScopes.map((scope) => (
              <li key={scope} className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                {guardianScopeLabel(scope)}
              </li>
            ))}
          </ul>
        </article>
      </section>

      {projectionLoading ? <ProjectionLoading /> : null}
      {projectionError ? (
        <div role="alert" className="rounded-2xl border border-status-upcoming bg-status-upcoming-bg p-5 text-sm text-status-upcoming">
          {projectionError}
        </div>
      ) : null}

      {!projectionLoading && !projectionError ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {selected.accessScopes.includes("attendance") && attendance ? (
            <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-primary/10 p-2 text-primary"><BarChart3 className="h-5 w-5" aria-hidden="true" /></span>
                  <div>
                    <h2 className="font-semibold">Attendance summary</h2>
                    <p className="text-sm text-muted-foreground">Finalised attendance records only</p>
                  </div>
                </div>
                <span className="text-2xl font-bold">{attendance.attendanceRate === null ? "—" : `${attendance.attendanceRate}%`}</span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl bg-muted/40 p-3"><dt className="text-muted-foreground">Present</dt><dd className="mt-1 text-lg font-semibold">{attendance.counts.Present}</dd></div>
                <div className="rounded-xl bg-muted/40 p-3"><dt className="text-muted-foreground">Late</dt><dd className="mt-1 text-lg font-semibold">{attendance.counts.Late}</dd></div>
                <div className="rounded-xl bg-muted/40 p-3"><dt className="text-muted-foreground">Absent</dt><dd className="mt-1 text-lg font-semibold">{attendance.counts.Absent}</dd></div>
                <div className="rounded-xl bg-muted/40 p-3"><dt className="text-muted-foreground">Permission / excused</dt><dd className="mt-1 text-lg font-semibold">{attendance.counts.Excused}</dd></div>
                <div className="rounded-xl bg-muted/40 p-3"><dt className="text-muted-foreground">Permission pending</dt><dd className="mt-1 text-lg font-semibold">{attendance.counts.PermissionPending}</dd></div>
                <div className="rounded-xl bg-muted/40 p-3"><dt className="text-muted-foreground">Marked classes</dt><dd className="mt-1 text-lg font-semibold">{attendance.markedSessions}</dd></div>
              </dl>
              {attendance.warnings.length ? (
                <div className="mt-4 space-y-2">
                  {attendance.warnings.map((warning) => (
                    <div key={`${warning.offeringId}-${warning.kind}`} className="flex gap-3 rounded-xl border border-status-upcoming bg-status-upcoming-bg p-3 text-sm text-status-upcoming">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p><strong>{warning.courseCode}:</strong> {warning.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">No current attendance warning is recorded by the existing attendance rules.</p>
              )}
            </article>
          ) : null}

          {selected.accessScopes.includes("academic_status") && academic ? (
            <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-primary/10 p-2 text-primary"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span>
                <div>
                  <h2 className="font-semibold">Academic progress</h2>
                  <p className="text-sm text-muted-foreground">Based on recorded programme progression</p>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-muted/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current status</p>
                <p className="mt-1 text-xl font-semibold">{academicStatusLabel(academic.academicStatus)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {academic.progressionStatus ?? "No progression record available"}
                  {academic.programmeYear ? ` · Year ${academic.programmeYear}` : ""}
                  {academic.academicYear ? ` · ${academic.academicYear}` : ""}
                </p>
              </div>
              {selected.accessScopes.includes("official_results") ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Official completed course results</h3>
                  {academic.officialResults.length ? (
                    <div className="mt-3 space-y-2">
                      {academic.officialResults.map((result) => (
                        <div key={result.offeringId} className="flex items-center justify-between gap-4 rounded-xl border border-border p-3 text-sm">
                          <div>
                            <p className="font-medium">{result.courseCode} · {result.courseTitle}</p>
                            <p className="text-xs text-muted-foreground">{result.term} · Section {result.sectionCode}</p>
                          </div>
                          <span className="text-lg font-semibold">{result.totalGrade}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No fully finalised course result is available yet.</p>
                  )}
                </div>
              ) : null}
            </article>
          ) : null}

          {!selected.accessScopes.includes("attendance") && !selected.accessScopes.includes("academic_status") ? (
            <article className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm lg:col-span-2">
              Attendance and academic progress are not included in this guardian relationship's current access scopes.
            </article>
          ) : null}
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Access is checked again whenever this page loads or regains focus. Revoked, expired, or scope-restricted information is removed by the server and is not retained in a client cache. Draft grades and lecturer-private comments are never requested by this dashboard.
      </p>
    </main>
  );
}
