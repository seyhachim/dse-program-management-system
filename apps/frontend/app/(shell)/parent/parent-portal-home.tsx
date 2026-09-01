"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, UserRound, UsersRound } from "lucide-react";
import type { GuardianLinkedStudentView } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import {
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

export function ParentPortalHome() {
  const [students, setStudents] = useState<GuardianLinkedStudentView[] | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string>("");
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

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Your dashboard</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This first portal shell intentionally shows only verified relationship data and the access categories granted to you. Attendance, academic progress, official results, notices, calendar items, support cases, and meeting details will appear here only through their canonical PMS services and only when the corresponding access scope allows them.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Access is checked again whenever this page loads or regains focus. Revoked or expired relationships are removed by the server and are not retained in a client cache.
      </p>
    </main>
  );
}
