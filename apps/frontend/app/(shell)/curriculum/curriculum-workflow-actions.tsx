"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurriculumWorkflowAction, CurriculumWorkflowState } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { curriculumApi, curriculumStatusLabel, curriculumVersionLabel, type ProgrammeCurriculumListItem } from "@/lib/curriculum";

const ACTION_LABEL: Record<CurriculumWorkflowAction, string> = {
  submit: "Submit for review",
  requestChanges: "Request changes",
  approve: "Approve",
  activate: "Activate",
};

export function CurriculumWorkflowActions() {
  const [curricula, setCurricula] = useState<ProgrammeCurriculumListItem[]>([]);
  const [versionId, setVersionId] = useState("");
  const [workflow, setWorkflow] = useState<CurriculumWorkflowState | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versions = useMemo(() => curricula.flatMap((curriculum) => curriculum.versions), [curricula]);

  const loadState = useCallback(async (id: string) => {
    if (!id) return;
    setError(null);
    try {
      setWorkflow(await curriculumApi.workflow(id));
    } catch (err) {
      setWorkflow(null);
      setError(err instanceof ApiError ? err.message : "Could not load curriculum workflow");
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await curriculumApi.list();
      setCurricula(list);
      const firstVersion = list[0]?.versions[0];
      if (firstVersion) {
        setVersionId(firstVersion.id);
        await loadState(firstVersion.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load curriculum workflow");
    }
  }, [loadState]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: CurriculumWorkflowAction) => {
    if (!versionId) return;
    if (action === "requestChanges" && !comment.trim()) {
      setError("A reason is required when requesting changes.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next =
        action === "submit" ? await curriculumApi.submit(versionId, comment.trim()) :
        action === "requestChanges" ? await curriculumApi.requestChanges(versionId, comment.trim()) :
        action === "approve" ? await curriculumApi.approve(versionId, comment.trim()) :
        await curriculumApi.activate(versionId, comment.trim());
      setWorkflow(next);
      setComment("");
      setCurricula(await curriculumApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update curriculum workflow");
    } finally {
      setBusy(false);
    }
  };

  if (!versions.length) return null;

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm" aria-label="Curriculum workflow">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approval workflow</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-foreground">{workflow ? curriculumStatusLabel(workflow.status) : "Loading…"}</h2>
            {workflow?.status === "UnderReview" && <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800">Editing locked</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Actions are returned by the backend for the selected lifecycle state; the client does not invent approval rights.</p>
        </div>
        <label className="text-sm font-medium">Workflow version
          <select value={versionId} onChange={(event) => { setVersionId(event.target.value); void loadState(event.target.value); }} className="mt-1 block h-10 rounded-md border border-input bg-background px-3 text-sm">
            {versions.map((version) => <option key={version.id} value={version.id}>{curriculumVersionLabel(version)} · {curriculumStatusLabel(version.status)}</option>)}
          </select>
        </label>
      </div>

      {workflow && workflow.allowedActions.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <label className="block text-sm font-medium">Workflow comment
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} maxLength={2000} placeholder="Committee note, approval note, or reason for requested changes" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            {workflow.allowedActions.map((action) => (
              <button key={action} type="button" disabled={busy} onClick={() => void run(action)} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent disabled:opacity-50">
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        </div>
      )}
      {workflow?.lastComment && <p className="mt-3 text-xs text-muted-foreground">Latest review note: {workflow.lastComment}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
