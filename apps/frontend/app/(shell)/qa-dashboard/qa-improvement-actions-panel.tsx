"use client";

import { useMemo, useState } from "react";
import type { QaImprovementActionView } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";

const PROGRAMME_ID = "dse";

export function QaImprovementActionsPanel({
  actions,
  canWrite,
  onChanged,
}: {
  actions: QaImprovementActionView[];
  canWrite: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [closingId, setClosingId] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [effectiveness, setEffectiveness] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => ({
    open: actions.filter((action) => action.status === "open" || action.status === "inProgress").length,
    overdue: actions.filter((action) => action.overdue).length,
    completed: actions.filter((action) => action.status === "completed").length,
  }), [actions]);

  async function update(actionId: string, payload: Record<string, unknown>) {
    setSavingId(actionId);
    setError(null);
    try {
      await api.put(`/api/qa/actions/${actionId}`, { programmeId: PROGRAMME_ID, ...payload });
      setClosingId(null);
      setResult("");
      setEffectiveness("");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update CQI action");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">CQI improvement actions</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational actions created only from human-validated evidence-gap or expert-review findings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{counts.open} open</span>
          <span className={`rounded-full px-2.5 py-1 font-medium ${counts.overdue > 0 ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{counts.overdue} overdue</span>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-300">{counts.completed} completed</span>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {actions.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No CQI action has been created for this assessment cycle.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {actions.map((action) => (
            <div key={action.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-primary">{action.requirementCode}</span>
                    <ActionStatus action={action} />
                    {action.carriedFromActionId ? <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-800 dark:text-sky-300">Carried forward</span> : null}
                  </div>
                  <p className="mt-2 text-sm font-medium">{action.plannedAction}</p>
                  <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Indicator:</span> {action.indicator}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Owner: {action.ownerName ?? "Unassigned"}</span>
                    <span>Due: {action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "Not set"}</span>
                    <span>Analysis: {action.analysisId.slice(0, 8)}…</span>
                  </div>
                  {action.result ? <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Result:</span> {action.result}</p> : null}
                  {action.effectivenessReview ? <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Effectiveness:</span> {action.effectivenessReview}</p> : null}
                </div>

                {canWrite && (action.status === "open" || action.status === "inProgress") ? (
                  <div className="flex shrink-0 gap-2">
                    {action.status === "open" ? (
                      <Button size="sm" variant="outline" disabled={savingId === action.id} onClick={() => void update(action.id, { status: "inProgress" })}>Start</Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setClosingId(closingId === action.id ? null : action.id)}>Close action</Button>
                  </div>
                ) : null}
              </div>

              {closingId === action.id ? (
                <div className="mt-3 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    Result / closure explanation
                    <textarea value={result} onChange={(event) => setResult(event.target.value)} className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    Effectiveness review
                    <textarea value={effectiveness} onChange={(event) => setEffectiveness(event.target.value)} className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                  </label>
                  <div className="flex justify-end gap-2 md:col-span-2">
                    <Button size="sm" variant="outline" onClick={() => setClosingId(null)}>Cancel</Button>
                    <Button size="sm" disabled={savingId === action.id || result.trim().length < 10 || effectiveness.trim().length < 10} onClick={() => void update(action.id, { status: "completed", result, effectivenessReview: effectiveness })}>Complete action</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionStatus({ action }: { action: QaImprovementActionView }) {
  if (action.status === "completed") return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Completed</span>;
  if (action.status === "cancelled") return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Cancelled</span>;
  if (action.overdue) return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">Overdue</span>;
  if (action.status === "inProgress") return <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-800 dark:text-sky-300">In progress</span>;
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Open</span>;
}
