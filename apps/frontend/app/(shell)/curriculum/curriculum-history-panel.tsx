"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurriculumComparison, CurriculumDiffKind, CurriculumVersionHistory } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { curriculumApi, curriculumVersionLabel, type ProgrammeCurriculumListItem } from "@/lib/curriculum";

export const CURRICULUM_DIFF_LABEL: Record<CurriculumDiffKind, string> = {
  Added: "Course added",
  Removed: "Course removed",
  YearChanged: "Year changed",
  SemesterChanged: "Semester changed",
  CreditsChanged: "Credits changed",
  TypeChanged: "Type/category changed",
  OrderChanged: "Order changed",
};

function valueLabel(value: CurriculumComparison["changes"][number]["before"]): string {
  if (!value) return "—";
  return `Year ${value.yearLevel}, Sem ${value.semester === "First" ? "1" : "2"}, ${value.credits} cr, ${value.courseType}, order ${value.sortOrder + 1}`;
}

export function CurriculumHistoryPanel() {
  const [curricula, setCurricula] = useState<ProgrammeCurriculumListItem[]>([]);
  const [curriculumId, setCurriculumId] = useState("");
  const [fromVersionId, setFromVersionId] = useState("");
  const [toVersionId, setToVersionId] = useState("");
  const [history, setHistory] = useState<CurriculumVersionHistory | null>(null);
  const [comparison, setComparison] = useState<CurriculumComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => curricula.find((curriculum) => curriculum.id === curriculumId) ?? null,
    [curricula, curriculumId],
  );

  const loadCurriculum = useCallback(async (id: string, list: ProgrammeCurriculumListItem[]) => {
    setError(null);
    setComparison(null);
    const item = list.find((curriculum) => curriculum.id === id);
    if (!item) return;
    const latest = item.versions[0];
    const previous = item.versions[1] ?? latest;
    setToVersionId(latest?.id ?? "");
    setFromVersionId(previous?.id ?? "");
    try {
      setHistory(await curriculumApi.history(id));
      if (latest && previous) setComparison(await curriculumApi.compare(id, previous.id, latest.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load curriculum history");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await curriculumApi.list();
        setCurricula(list);
        if (list[0]) {
          setCurriculumId(list[0].id);
          await loadCurriculum(list[0].id, list);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load curriculum history");
      }
    })();
  }, [loadCurriculum]);

  const compare = async () => {
    if (!curriculumId || !fromVersionId || !toVersionId) return;
    setBusy(true);
    setError(null);
    try {
      setComparison(await curriculumApi.compare(curriculumId, fromVersionId, toVersionId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not compare curriculum versions");
    } finally {
      setBusy(false);
    }
  };

  if (!selected || !history) return error ? <p className="mb-6 text-sm text-destructive">{error}</p> : null;

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm" aria-label="Curriculum revision history">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Revision history & comparison</p>
          <h2 className="mt-1 font-semibold text-foreground">Explain what changed between curriculum versions</h2>
          <p className="mt-1 text-sm text-muted-foreground">Diff classification uses versioned placement snapshots. Current course code/title are labels only and do not drive change detection.</p>
        </div>
        {curricula.length > 1 && (
          <select value={curriculumId} onChange={(event) => { const id = event.target.value; setCurriculumId(id); void loadCurriculum(id, curricula); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {curricula.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        )}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto] lg:items-end">
        <label className="text-sm font-medium">From
          <select value={fromVersionId} onChange={(event) => setFromVersionId(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {selected.versions.map((version) => <option key={version.id} value={version.id}>{curriculumVersionLabel(version)} · {version.status}</option>)}
          </select>
        </label>
        <span className="hidden pb-2 text-muted-foreground lg:block">→</span>
        <label className="text-sm font-medium">To
          <select value={toVersionId} onChange={(event) => setToVersionId(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {selected.versions.map((version) => <option key={version.id} value={version.id}>{curriculumVersionLabel(version)} · {version.status}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !fromVersionId || !toVersionId} onClick={() => void compare()} className="h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent disabled:opacity-50">Compare</button>
      </div>

      {comparison && (
        <div className="mt-5 space-y-4 border-t border-border pt-5">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Changed courses</p><p className="text-xl font-semibold">{comparison.counts.coursesChanged}</p></div>
            <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Added</p><p className="text-xl font-semibold">{comparison.counts.added}</p></div>
            <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Removed</p><p className="text-xl font-semibold">{comparison.counts.removed}</p></div>
            <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Moved</p><p className="text-xl font-semibold">{comparison.counts.moved}</p></div>
            <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Credit changes</p><p className="text-xl font-semibold">{comparison.counts.creditsChanged}</p></div>
            <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Type changes</p><p className="text-xl font-semibold">{comparison.counts.typeChanged}</p></div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Revision rationale</p>
            <p className="mt-1 text-sm text-muted-foreground">{comparison.toVersion.revisionReason || "No revision reason recorded."}</p>
            <p className="mt-2 text-sm">{comparison.toVersion.changeSummary || "No change summary recorded."}</p>
          </div>
          {comparison.changes.length === 0 ? (
            <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No material placement changes between these versions.</p>
          ) : (
            <div className="space-y-2">
              {comparison.changes.map((change) => (
                <article key={change.courseId} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><p className="text-xs font-semibold text-muted-foreground">{change.code ?? change.courseId}</p><h3 className="text-sm font-semibold">{change.title ?? "Course"}</h3></div>
                    <div className="flex flex-wrap gap-1">{change.changes.map((kind) => <span key={kind} className="rounded-full border border-border bg-muted px-2 py-1 text-xs">{CURRICULUM_DIFF_LABEL[kind]}</span>)}</div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Old</p><p>{valueLabel(change.before)}</p></div><div><p className="text-xs text-muted-foreground">New</p><p>{valueLabel(change.after)}</p></div></div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">Revision timeline</h3>
        <ol className="mt-3 space-y-4">
          {history.versions.map(({ version, auditActions }) => (
            <li key={version.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{curriculumVersionLabel(version)} · {version.status}</span><span className="text-xs text-muted-foreground">{version.revisionType}</span></div>
              <p className="mt-2 text-sm">{version.changeSummary || version.revisionReason || "Initial curriculum baseline"}</p>
              <div className="mt-3 space-y-2">{auditActions.map((action) => <div key={action.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{action.action}</span> · {action.actorName} · {new Date(action.createdAt).toLocaleString()}{action.note ? ` — ${action.note}` : ""}</div>)}</div>
            </li>
          ))}
        </ol>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
