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
  projectionForRelationship,
  relationshipLabel,
} from "@/lib/parent-portal";
import { MOBILE_PARENT_PORTAL_LAYOUT as mobile } from "./mobile-parent-portal-layout";

function LoadingState() {
  return (
    <main className={mobile.statePage}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your parent portal…
      </p>
    </main>
  );
}

function MessageState({ title, description }: { title: string; description: string }) {
  return (
    <main className={mobile.statePage}>
      <section className={`${mobile.card} w-full max-w-3xl text-center`}>
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="mt-4 break-words text-xl font-semibold">{title}</h1>
        <p className="mx-auto mt-2 max-w-xl break-words text-sm text-muted-foreground">{description}</p>
      </section>
    </main>
  );
}

function ProjectionLoading() {
  return (
    <div className={`${mobile.card} text-sm text-muted-foreground`}>
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

  const selectedAttendance = projectionForRelationship(attendance, selected.relationshipId);
  const selectedAcademic = projectionForRelationship(academic, selected.relationshipId);

  return (
    <main className={mobile.page}>
      <header className={mobile.hero}>
        <p className="text-sm opacity-80">Parent / Guardian Portal</p>
        <div className={mobile.heroContent}>
          <div className={mobile.heroIdentity}>
            <h1 className={`${mobile.wrap} text-2xl font-bold sm:text-3xl`}>{selected.studentName}</h1>
            <p className={`${mobile.wrap} mt-1 text-sm opacity-85`}>
              {relationshipLabel(selected.relationshipType)} · Programme {selected.programmeId}
            </p>
          </div>
          {students.length > 1 ? (
            <label className={mobile.selectorLabel} htmlFor="linked-student">
              Linked student
              <select
                id="linked-student"
                value={selectedRelationshipId}
                onChange={(event) => setSelectedRelationshipId(event.target.value)}
                className={mobile.selector}
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

      <section aria-labelledby="student-summary" className="grid min-w-0 gap-3 md:grid-cols-2 md:gap-4">
        <article className={mobile.card}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 id="student-summary" className="break-words font-semibold">Student summary</h2>
              <p className="break-words text-sm text-muted-foreground">Verified relationship information</p>
            </div>
          </div>
          <dl className="mt-4 space-y-3 text-sm sm:mt-5">
            <div className={mobile.factRow}><dt className="text-muted-foreground">Student</dt><dd className={mobile.factValue}>{selected.studentName}</dd></div>
            <div className={mobile.factRow}><dt className="text-muted-foreground">Student ID</dt><dd className={mobile.factValue}>{selected.studentInstitutionalId}</dd></div>
            <div className={mobile.factRow}><dt className="text-muted-foreground">Relationship</dt><dd className={mobile.factValue}>{relationshipLabel(selected.relationshipType)}</dd></div>
          </dl>
        </article>

        <article className={mobile.card}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary"><UsersRound className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 className="break-words font-semibold">Information available to you</h2>
              <p className="break-words text-sm text-muted-foreground">Based on your current verified access scopes</p>
            </div>
          </div>
          <ul className="mt-4 grid min-w-0 gap-2 sm:mt-5 sm:grid-cols-2">
            {selected.accessScopes.map((scope) => (
              <li key={scope} className="min-w-0 break-words rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                {guardianScopeLabel(scope)}
              </li>
            ))}
          </ul>
        </article>
      </section>

      {projectionLoading ? <ProjectionLoading /> : null}
      {projectionError ? (
        <div role="alert" className={`${mobile.warning} break-words`}>
          {projectionError}
        </div>
      ) : null}

      {!projectionLoading && !projectionError ? (
        <section className="grid min-w-0 gap-3 lg:grid-cols-2 lg:gap-4">
          {selected.accessScopes.includes("attendance") && selectedAttendance ? (
            <article className={mobile.card}>
              <div className={mobile.attendanceHeader}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary"><BarChart3 className="h-5 w-5" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold">Attendance summary</h2>
                    <p className="break-words text-sm text-muted-foreground">Finalised attendance records only</p>
                  </div>
                </div>
                <span className="shrink-0 text-2xl font-bold">{selectedAttendance.attendanceRate === null ? "—" : `${selectedAttendance.attendanceRate}%`}</span>
              </div>
              <dl className={mobile.attendanceMetricGrid}>
                <div className={mobile.attendanceMetric}><dt className="break-words text-muted-foreground">Present</dt><dd className="mt-1 text-lg font-semibold">{selectedAttendance.counts.Present}</dd></div>
                <div className={mobile.attendanceMetric}><dt className="break-words text-muted-foreground">Late</dt><dd className="mt-1 text-lg font-semibold">{selectedAttendance.counts.Late}</dd></div>
                <div className={mobile.attendanceMetric}><dt className="break-words text-muted-foreground">Absent</dt><dd className="mt-1 text-lg font-semibold">{selectedAttendance.counts.Absent}</dd></div>
                <div className={mobile.attendanceMetric}><dt className="break-words text-muted-foreground">Permission / excused</dt><dd className="mt-1 text-lg font-semibold">{selectedAttendance.counts.Excused}</dd></div>
                <div className={mobile.attendanceMetric}><dt className="break-words text-muted-foreground">Permission pending</dt><dd className="mt-1 text-lg font-semibold">{selectedAttendance.counts.PermissionPending}</dd></div>
                <div className={mobile.attendanceMetric}><dt className="break-words text-muted-foreground">Marked classes</dt><dd className="mt-1 text-lg font-semibold">{selectedAttendance.markedSessions}</dd></div>
              </dl>
              {selectedAttendance.warnings.length ? (
                <div className="mt-4 space-y-2">
                  {selectedAttendance.warnings.map((warning) => (
                    <div key={`${warning.offeringId}-${warning.kind}`} className={mobile.warning}>
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p className="min-w-0 break-words"><strong>{warning.courseCode}:</strong> {warning.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 break-words text-sm text-muted-foreground">No current attendance warning is recorded by the existing attendance rules.</p>
              )}
            </article>
          ) : null}

          {selected.accessScopes.includes("academic_status") && selectedAcademic ? (
            <article className={mobile.card}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">Academic progress</h2>
                  <p className="break-words text-sm text-muted-foreground">Based on recorded programme progression</p>
                </div>
              </div>
              <div className="mt-4 min-w-0 rounded-xl bg-muted/40 p-4 sm:mt-5">
                <p className="break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">Current status</p>
                <p className="mt-1 break-words text-xl font-semibold">{academicStatusLabel(selectedAcademic.academicStatus)}</p>
                <p className="mt-2 break-words text-sm text-muted-foreground">
                  {selectedAcademic.progressionStatus ?? "No progression record available"}
                  {selectedAcademic.programmeYear ? ` · Year ${selectedAcademic.programmeYear}` : ""}
                  {selectedAcademic.academicYear ? ` · ${selectedAcademic.academicYear}` : ""}
                </p>
              </div>
              {selected.accessScopes.includes("official_results") ? (
                <div className="mt-5 min-w-0">
                  <h3 className="break-words text-sm font-semibold">Official completed course results</h3>
                  {selectedAcademic.officialResults.length ? (
                    <div className="mt-3 space-y-2">
                      {selectedAcademic.officialResults.map((result) => (
                        <div key={result.offeringId} className={mobile.resultRow}>
                          <div className={mobile.resultText}>
                            <p className="break-words font-medium">{result.courseCode} · {result.courseTitle}</p>
                            <p className="break-words text-xs text-muted-foreground">{result.term} · Section {result.sectionCode}</p>
                          </div>
                          <span className={mobile.resultGrade}>{result.totalGrade}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 break-words text-sm text-muted-foreground">No fully finalised course result is available yet.</p>
                  )}
                </div>
              ) : null}
            </article>
          ) : null}

          {!selected.accessScopes.includes("attendance") && !selected.accessScopes.includes("academic_status") ? (
            <article className={`${mobile.card} break-words text-sm text-muted-foreground lg:col-span-2`}>
              Attendance and academic progress are not included in this guardian relationship&apos;s current access scopes.
            </article>
          ) : null}
        </section>
      ) : null}

      <p className="min-w-0 break-words text-xs text-muted-foreground">
        Access is checked again whenever this page loads or regains focus. Revoked, expired, or scope-restricted information is removed by the server and is not retained in a client cache. Draft grades and lecturer-private comments are never requested by this dashboard.
      </p>
    </main>
  );
}
